type UiDiagnosticLevel = 'info' | 'warn' | 'error';

export type UiDiagnosticEntry = {
  seq: number;
  timestamp: string;
  scope: string;
  event: string;
  detail: Record<string, unknown>;
};

declare global {
  interface Window {
    __ASSET_ALLOCATION_UI_DIAGNOSTICS__?: UiDiagnosticEntry[];
    __dumpAssetAllocationUiDiagnostics?: () => UiDiagnosticEntry[];
    __clearAssetAllocationUiDiagnostics?: () => void;
  }
}

const MAX_DIAGNOSTIC_ENTRIES = 500;
const MAX_STRING_LENGTH = 500;
const MAX_STACK_LENGTH = 1600;
const MAX_COLLECTION_ITEMS = 20;
const MAX_SERIALIZATION_DEPTH = 4;

let nextDiagnosticSequence = 1;

function truncateText(value: string, maxLength = MAX_STRING_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function clipTextForLogs(value: unknown, maxLength = MAX_STRING_LENGTH): string {
  return truncateText(String(value ?? '').trim(), maxLength);
}

export function summarizeHeadersForLogs(
  headersInput?: HeadersInit | Headers | null
): Record<string, string> {
  if (!headersInput) {
    return {};
  }

  const headers = headersInput instanceof Headers ? headersInput : new Headers(headersInput);
  const summary: Record<string, string> = {};

  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    summary[key] =
      normalizedKey === 'authorization' ? '<redacted>' : clipTextForLogs(value, 240);
  });

  return summary;
}

export function summarizeUrlForLogs(url: string): Record<string, unknown> {
  const raw = clipTextForLogs(url, 800);

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
    const parsed = baseOrigin ? new URL(url, baseOrigin) : new URL(url);

    return {
      raw,
      resolved: parsed.toString(),
      origin: parsed.origin,
      pathname: parsed.pathname,
      search: parsed.search || '',
      hash: parsed.hash || '',
      sameOrigin:
        typeof window !== 'undefined' ? parsed.origin === window.location.origin : undefined
    };
  } catch {
    return { raw };
  }
}

function serializeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateText(value);
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (value instanceof Headers) {
    return summarizeHeadersForLogs(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateText(value.message),
      stack: value.stack ? truncateText(value.stack, MAX_STACK_LENGTH) : undefined,
      cause:
        'cause' in value && value.cause !== undefined
          ? serializeValue(value.cause, depth + 1)
          : undefined
    };
  }

  if (depth >= MAX_SERIALIZATION_DEPTH) {
    return truncateText(String(value));
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((entry) => serializeValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_COLLECTION_ITEMS);
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, serializeValue(entryValue, depth + 1)])
    );
  }

  return truncateText(String(value));
}

function ensureDiagnosticBuffer(): UiDiagnosticEntry[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!window.__ASSET_ALLOCATION_UI_DIAGNOSTICS__) {
    window.__ASSET_ALLOCATION_UI_DIAGNOSTICS__ = [];
  }
  if (!window.__dumpAssetAllocationUiDiagnostics) {
    window.__dumpAssetAllocationUiDiagnostics = () => [
      ...(window.__ASSET_ALLOCATION_UI_DIAGNOSTICS__ || [])
    ];
  }
  if (!window.__clearAssetAllocationUiDiagnostics) {
    window.__clearAssetAllocationUiDiagnostics = () => {
      window.__ASSET_ALLOCATION_UI_DIAGNOSTICS__ = [];
    };
  }

  return window.__ASSET_ALLOCATION_UI_DIAGNOSTICS__;
}

export function logUiDiagnostic(
  scope: string,
  event: string,
  detail: Record<string, unknown> = {},
  level: UiDiagnosticLevel = 'info'
): UiDiagnosticEntry {
  const entry: UiDiagnosticEntry = {
    seq: nextDiagnosticSequence++,
    timestamp: new Date().toISOString(),
    scope: clipTextForLogs(scope, 64),
    event: clipTextForLogs(event, 96),
    detail: (serializeValue(detail) as Record<string, unknown>) || {}
  };

  const buffer = ensureDiagnosticBuffer();
  if (buffer) {
    buffer.push(entry);
    if (buffer.length > MAX_DIAGNOSTIC_ENTRIES) {
      buffer.splice(0, buffer.length - MAX_DIAGNOSTIC_ENTRIES);
    }
  }

  const consoleMethod =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  consoleMethod(`[UiDiag][${entry.scope}] ${entry.event}`, {
    seq: entry.seq,
    timestamp: entry.timestamp,
    ...entry.detail
  });

  return entry;
}
