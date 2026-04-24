/* global RequestInit */

import { FinanceData, MarketData } from '@/types/data';
import { DomainMetadata, SystemHealth } from '@/types/strategy';
import { config as uiConfig } from '@/config';
import {
  appendAuthHeaders,
  hasInteractiveAuthHandler,
  requestInteractiveReauth
} from '@/services/authTransport';
import { fetchWithOptionalTimeout } from '@/services/fetchWithTimeout';
import {
  clipTextForLogs,
  logUiDiagnostic,
  summarizeHeadersForLogs,
  summarizeUrlForLogs
} from '@/services/uiDiagnostics';

const API_WARMUP_PATH = '/healthz';
const API_COLD_START_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const API_WARMUP_MAX_ATTEMPTS = 3;
const API_WARMUP_BASE_DELAY_MS = 500;
const API_WARMUP_MAX_DELAY_MS = 4000;
const API_WARMUP_TIMEOUT_MS = 5000;
const API_REQUEST_MAX_ATTEMPTS = 3;
const API_REQUEST_RETRY_BASE_DELAY_MS = 500;
const API_REQUEST_RETRY_MAX_DELAY_MS = 4000;
const AUTH_SESSION_STATUS_ENDPOINT = '/auth/session';
const RECENT_AUTH_SESSION_VALIDATION_WINDOW_MS = 60_000;
const CSRF_COOKIE_NAMES = ['__Host-aa_csrf', 'aa_csrf_dev'] as const;

const apiWarmupAttempted = new Set<string>();
const apiWarmupInFlight = new Map<string, Promise<void>>();
let lastSuccessfulAuthSessionValidationAt = 0;

function logAuthRecovery(
  event: string,
  detail: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  logUiDiagnostic('AuthRecovery', event, detail, level);
}

function logApiRequest(
  event: string,
  detail: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  logUiDiagnostic('API', event, detail, level);
}

function summarizeResponseForLogs(response: Response): Record<string, unknown> {
  return {
    status: response.status,
    statusText: response.statusText,
    responseUrl: response.url || null,
    redirected: response.redirected,
    type: response.type,
    server: response.headers.get('Server') ?? null,
    wwwAuthenticate: response.headers.get('Www-Authenticate') ?? null,
    accessControlAllowOrigin: response.headers.get('Access-Control-Allow-Origin') ?? null,
    accessControlAllowCredentials:
      response.headers.get('Access-Control-Allow-Credentials') ?? null,
    vary: response.headers.get('Vary') ?? null
  };
}

function noteAuthSessionValidation(endpoint: string, ok: boolean): void {
  if (endpoint !== AUTH_SESSION_STATUS_ENDPOINT) {
    return;
  }

  lastSuccessfulAuthSessionValidationAt = ok ? Date.now() : 0;
}

function getRecentAuthSessionValidationAgeMs(endpoint: string): number | null {
  if (
    endpoint === AUTH_SESSION_STATUS_ENDPOINT ||
    lastSuccessfulAuthSessionValidationAt <= 0
  ) {
    return null;
  }

  const ageMs = Date.now() - lastSuccessfulAuthSessionValidationAt;
  if (ageMs < 0 || ageMs > RECENT_AUTH_SESSION_VALIDATION_WINDOW_MS) {
    return null;
  }

  return ageMs;
}

function buildRecentSessionSuppressedAuthMessage(
  response: Response,
  requestId: string,
  errorBody: string
): string {
  const detail = String(errorBody ?? '').trim();
  const suffix = detail ? ` - ${detail}` : '';
  return `API Error: ${response.status} ${response.statusText} [requestId=${requestId}]${suffix} Interactive sign-in was suppressed because /auth/session succeeded recently; check API authorization or upstream auth configuration.`;
}

function buildMissingBearerTokenMessage(
  endpoint: string,
  requestId: string,
  options: { forceRefresh?: boolean } = {}
): string {
  const prefix = options.forceRefresh
    ? 'OIDC token refresh did not produce a bearer token'
    : 'OIDC token acquisition did not produce a bearer token';
  return `${prefix} [requestId=${requestId}] - ${endpoint}. The UI refused to send the protected API call without authorization.`;
}

function canReplayWithBrowserSession(url: string, headers: Headers): boolean {
  if (uiConfig.oidcEnabled || !headers.has('Authorization') || typeof window === 'undefined') {
    return false;
  }

  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

function buildBrowserSessionReplayHeaders(headers: Headers): Headers {
  const replayHeaders = new Headers(headers);
  replayHeaders.delete('Authorization');
  return replayHeaders;
}

function requiresOidcBearerToken(endpoint: string): boolean {
  return (
    uiConfig.oidcEnabled &&
    uiConfig.authSessionMode !== 'cookie' &&
    endpoint !== AUTH_SESSION_STATUS_ENDPOINT
  );
}

function usesCookieAuth(headers: Headers): boolean {
  return uiConfig.authSessionMode === 'cookie' && !headers.has('Authorization');
}

function shouldWarmUpBeforeRequest(endpoint: string): boolean {
  return endpoint !== AUTH_SESSION_STATUS_ENDPOINT && endpoint !== '/realtime/ticket';
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') {
    return '';
  }

  const target = `${name}=`;
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(target))
    ?.slice(target.length) ?? '';
}

function readCsrfToken(): string {
  for (const name of CSRF_COOKIE_NAMES) {
    const token = readCookie(name);
    if (token) {
      return decodeURIComponent(token);
    }
  }
  return '';
}

function appendCookieAuthHeaders(headers: Headers, method: string): Headers {
  const nextHeaders = new Headers(headers);
  if (!isSafeReplayMethod(method) && !nextHeaders.has('X-CSRF-Token')) {
    const csrfToken = readCsrfToken();
    if (csrfToken) {
      nextHeaders.set('X-CSRF-Token', csrfToken);
    }
  }
  return nextHeaders;
}

function isRetryableStatusCode(statusCode: number): boolean {
  return API_COLD_START_RETRYABLE_STATUS_CODES.has(statusCode);
}

function isRetryableFetchError(error: unknown, externalSignal?: AbortSignal | null): boolean {
  if (externalSignal?.aborted) {
    return false;
  }

  if (error instanceof Error && error.message.startsWith('API timeout after ')) {
    return true;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('connection refused') ||
    message.includes('load failed')
  );
}

function resolveWarmupUrl(apiBaseUrl: string): string {
  const trimmed = apiBaseUrl.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return `${new URL(trimmed).origin}${API_WARMUP_PATH}`;
    } catch {
      return API_WARMUP_PATH;
    }
  }
  return API_WARMUP_PATH;
}

function isSafeReplayMethod(method?: string): boolean {
  const normalizedMethod = String(method ?? 'GET')
    .trim()
    .toUpperCase();
  return normalizedMethod === 'GET' || normalizedMethod === 'HEAD';
}

function buildRequestUrl(
  apiBaseUrl: string,
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  let url = `${apiBaseUrl}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  return url;
}

async function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function warmUpApiOnce(apiBaseUrl: string): Promise<void> {
  if (apiWarmupAttempted.has(apiBaseUrl)) {
    return;
  }

  if (!apiWarmupInFlight.has(apiBaseUrl)) {
    const warmupPromise = (async () => {
      let delayMs = API_WARMUP_BASE_DELAY_MS;
      const warmupUrl = resolveWarmupUrl(apiBaseUrl);
      const warmupRequestId = createRequestId();

      logApiRequest('warmup-start', {
        apiBaseUrl,
        warmupUrl: summarizeUrlForLogs(warmupUrl),
        requestId: warmupRequestId
      });

      try {
        for (let attempt = 1; attempt <= API_WARMUP_MAX_ATTEMPTS; attempt += 1) {
          const shouldRetry = attempt < API_WARMUP_MAX_ATTEMPTS;
          try {
            const response = await fetchWithOptionalTimeout(
              warmupUrl,
              {
                method: 'GET',
                headers: new Headers({ 'X-Request-ID': warmupRequestId }),
                cache: 'no-store'
              },
              {
                timeoutMs: API_WARMUP_TIMEOUT_MS,
                label: API_WARMUP_PATH,
                requestId: 'warmup',
                timeoutMessagePrefix: 'API timeout after'
              }
            );
            logApiRequest(
              'warmup-response',
              {
                apiBaseUrl,
                warmupUrl: summarizeUrlForLogs(warmupUrl),
                requestId: warmupRequestId,
                attempt,
                shouldRetry,
                ...summarizeResponseForLogs(response)
              },
              response.status < 400 ? 'info' : 'warn'
            );
            if (response.status < 400) {
              return;
            }
            if (!shouldRetry || !isRetryableStatusCode(response.status)) {
              return;
            }
          } catch (error) {
            logApiRequest(
              'warmup-error',
              {
                apiBaseUrl,
                warmupUrl: summarizeUrlForLogs(warmupUrl),
                requestId: warmupRequestId,
                attempt,
                shouldRetry,
                error
              },
              'warn'
            );
            if (!shouldRetry || !isRetryableFetchError(error)) {
              return;
            }
          }

          logApiRequest('warmup-retry-scheduled', {
            apiBaseUrl,
            warmupUrl: summarizeUrlForLogs(warmupUrl),
            requestId: warmupRequestId,
            attempt,
            delayMs
          });
          await wait(delayMs);
          delayMs = Math.min(API_WARMUP_MAX_DELAY_MS, Math.max(delayMs * 2, 100));
        }
      } finally {
        logApiRequest('warmup-complete', {
          apiBaseUrl,
          warmupUrl: summarizeUrlForLogs(warmupUrl),
          requestId: warmupRequestId
        });
        apiWarmupAttempted.add(apiBaseUrl);
        apiWarmupInFlight.delete(apiBaseUrl);
      }
    })();
    apiWarmupInFlight.set(apiBaseUrl, warmupPromise);
  }

  await apiWarmupInFlight.get(apiBaseUrl);
}

export interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  retryOnStatusCodes?: number[] | false;
  retryAttempts?: number;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function buildRecentSessionSuppressedApiError(
  endpoint: string,
  method: string,
  requestId: string,
  response: Response,
  recoveryAttempt: number,
  knownErrorBody?: string
): Promise<ApiError | null> {
  const recentSessionValidationAgeMs = getRecentAuthSessionValidationAgeMs(endpoint);
  if (recentSessionValidationAgeMs === null) {
    return null;
  }

  let errorBody = knownErrorBody ?? '';
  if (knownErrorBody === undefined) {
    try {
      errorBody = await response.clone().text();
    } catch (error) {
      logAuthRecovery(
        'suppressed-reauth-error-body-unavailable',
        {
          endpoint,
          method,
          requestId,
          status: response.status,
          recoveryAttempt,
          error
        },
        'warn'
      );
    }
  }

  logAuthRecovery('interactive-reauth-suppressed', {
    endpoint,
    method,
    requestId,
    status: response.status,
    recoveryAttempt,
    recentSessionValidationAgeMs
  });

  return new ApiError(
    response.status,
    buildRecentSessionSuppressedAuthMessage(response, requestId, errorBody)
  );
}

export interface RequestMeta {
  requestId: string;
  status: number;
  durationMs: number;
  url: string;
  cacheHint?: string;
  cacheDegraded?: boolean;
}

export interface ResponseWithMeta<T> {
  data: T;
  meta: RequestMeta;
}

export interface AuthSessionStatus {
  authMode: string;
  subject: string;
  displayName?: string | null;
  username?: string | null;
  requiredRoles: string[];
  grantedRoles: string[];
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function performRequest<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<ResponseWithMeta<T>> {
  const { params, headers, timeoutMs, retryOnStatusCodes, retryAttempts, ...customConfig } = config;
  const apiBaseUrl = uiConfig.apiBaseUrl;
  const maxAttempts = Number.isFinite(retryAttempts)
    ? Math.max(1, Math.floor(Number(retryAttempts)))
    : API_REQUEST_MAX_ATTEMPTS;
  const retryableStatusCodes =
    retryOnStatusCodes === false
      ? new Set<number>()
      : Array.isArray(retryOnStatusCodes)
        ? new Set<number>(retryOnStatusCodes)
        : API_COLD_START_RETRYABLE_STATUS_CODES;

  let url = buildRequestUrl(apiBaseUrl, endpoint, params);

  const requestHeaders = new Headers(headers);
  const requestMethod = String(customConfig.method ?? 'GET')
    .trim()
    .toUpperCase() || 'GET';
  const allowSilentAuthRecovery = isSafeReplayMethod(requestMethod);
  const hasBody = customConfig.body !== undefined && customConfig.body !== null;
  if (hasBody && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  if (!requestHeaders.has('X-Request-ID')) {
    requestHeaders.set('X-Request-ID', createRequestId());
  }
  let authHeaders = usesCookieAuth(requestHeaders)
    ? appendCookieAuthHeaders(requestHeaders, requestMethod)
    : await appendAuthHeaders(requestHeaders);
  const requestId = authHeaders.get('X-Request-ID') || '';
  if (requiresOidcBearerToken(endpoint) && !authHeaders.has('Authorization')) {
    const error = new Error(buildMissingBearerTokenMessage(endpoint, requestId));
    logAuthRecovery('request-missing-bearer-token', {
      endpoint,
      method: requestMethod,
      requestId
    });
    throw error;
  }
  logApiRequest('request-prepared', {
    endpoint,
    method: requestMethod,
    requestId,
    apiBaseUrl,
    apiBaseUrlMode: /^https?:\/\//i.test(apiBaseUrl) ? 'absolute' : 'same-origin',
    authSessionMode: uiConfig.authSessionMode,
    url: summarizeUrlForLogs(url),
    allowSilentAuthRecovery,
    retryAttempts: maxAttempts,
    retryOnStatusCodes: Array.from(retryableStatusCodes.values()),
    timeoutMs: timeoutMs ?? null,
    hasBody,
    requestHeaders: summarizeHeadersForLogs(requestHeaders),
    outboundHeaders: summarizeHeadersForLogs(authHeaders)
  });
  if (shouldWarmUpBeforeRequest(endpoint)) {
    await warmUpApiOnce(apiBaseUrl);
  }

  let retryDelayMs = API_REQUEST_RETRY_BASE_DELAY_MS;
  let response: Response | null = null;
  let attemptedSilentAuthRecovery = false;
  let attemptedBrowserSessionReplay = false;
  const startedAt = performance.now();
  let completedAttempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    completedAttempts = attempt;
    const shouldRetry = attempt < maxAttempts;
    const attemptStartedAt = performance.now();
    logApiRequest('request-attempt', {
      endpoint,
      method: requestMethod,
      requestId,
      attempt,
      shouldRetry,
      url: summarizeUrlForLogs(url),
      headers: summarizeHeadersForLogs(authHeaders),
      attemptedSilentAuthRecovery,
      attemptedBrowserSessionReplay
    });
    try {
      response = await fetchWithOptionalTimeout(
        url,
        {
          ...customConfig,
          headers: authHeaders,
          credentials:
            uiConfig.authSessionMode === 'cookie'
              ? 'include'
              : customConfig.credentials
        },
        {
          timeoutMs,
          label: endpoint,
          requestId,
          timeoutMessagePrefix: 'API timeout after'
        }
      );
      logApiRequest(
        'request-response',
        {
          endpoint,
          method: requestMethod,
          requestId,
          attempt,
          attemptDurationMs: Math.max(0, Math.round(performance.now() - attemptStartedAt)),
          ...summarizeResponseForLogs(response)
        },
        response.ok ? 'info' : response.status >= 500 ? 'error' : 'warn'
      );
    } catch (error) {
      const retryable = shouldRetry && isRetryableFetchError(error, customConfig.signal);
      logApiRequest(
        'request-network-error',
        {
          endpoint,
          method: requestMethod,
          requestId,
          attempt,
          attemptDurationMs: Math.max(0, Math.round(performance.now() - attemptStartedAt)),
          retryable,
          retryDelayMs,
          error
        },
        retryable ? 'warn' : 'error'
      );
      if (!retryable) {
        throw error;
      }
      logApiRequest('request-retry-scheduled', {
        endpoint,
        method: requestMethod,
        requestId,
        attempt,
        retryDelayMs
      });
      await wait(retryDelayMs);
      retryDelayMs = Math.min(API_REQUEST_RETRY_MAX_DELAY_MS, Math.max(retryDelayMs * 2, 100));
      continue;
    }

    if (response.ok) {
      if (attemptedBrowserSessionReplay) {
        logAuthRecovery('browser-session-recovery-success', {
          endpoint,
          method: requestMethod,
          requestId,
          recoveryAttempt: attemptedSilentAuthRecovery ? 2 : 1
        });
      }
      noteAuthSessionValidation(endpoint, true);
      break;
    }

    if (
      uiConfig.authSessionMode !== 'cookie' &&
      response.status === 401 &&
      allowSilentAuthRecovery &&
      !attemptedSilentAuthRecovery
    ) {
      attemptedSilentAuthRecovery = true;
      logAuthRecovery('silent-recovery-start', {
        endpoint,
        method: requestMethod,
        requestId,
        recoveryAttempt: 1
      });
      try {
        authHeaders = await appendAuthHeaders(requestHeaders, { forceRefresh: true });
        if (!authHeaders.has('Authorization')) {
          const error = new Error(
            buildMissingBearerTokenMessage(endpoint, requestId, { forceRefresh: true })
          );
          logAuthRecovery('silent-recovery-missing-token', {
            endpoint,
            method: requestMethod,
            requestId,
            recoveryAttempt: 1,
            error: error.message
          });
          if (hasInteractiveAuthHandler()) {
            const suppressedAuthError = await buildRecentSessionSuppressedApiError(
              endpoint,
              requestMethod,
              requestId,
              response,
              1
            );
            if (suppressedAuthError) {
              throw suppressedAuthError;
            }

            await requestInteractiveReauth({
              reason: error.message,
              source: 'silent-auth-recovery-missing-token',
              endpoint,
              status: response.status,
              requestId,
              recoveryAttempt: 1,
              resetOidcSession: true
            });
          }
          throw error;
        }
        logAuthRecovery('silent-recovery-success', {
          endpoint,
          method: requestMethod,
          requestId,
          recoveryAttempt: 1
        });
        continue;
      } catch (error) {
        logAuthRecovery('silent-recovery-failed', {
          endpoint,
          method: requestMethod,
          requestId,
          recoveryAttempt: 1,
          error: error instanceof Error ? error.message : String(error ?? 'Unknown error')
        });
        throw error;
      }
    }

    if (
      uiConfig.authSessionMode !== 'cookie' &&
      response.status === 401 &&
      allowSilentAuthRecovery &&
      !attemptedBrowserSessionReplay &&
      canReplayWithBrowserSession(url, authHeaders)
    ) {
      const recentSessionValidationAgeMs = getRecentAuthSessionValidationAgeMs(endpoint);
      if (recentSessionValidationAgeMs !== null) {
        attemptedBrowserSessionReplay = true;
        authHeaders = buildBrowserSessionReplayHeaders(requestHeaders);
        logAuthRecovery('browser-session-recovery-start', {
          endpoint,
          method: requestMethod,
          requestId,
          recoveryAttempt: attemptedSilentAuthRecovery ? 2 : 1,
          recentSessionValidationAgeMs
        });
        continue;
      }
    }

    if (!shouldRetry || !retryableStatusCodes.has(response.status)) {
      break;
    }

    logApiRequest('request-retry-scheduled', {
      endpoint,
      method: requestMethod,
      requestId,
      attempt,
      retryDelayMs,
      status: response.status
    });
    await wait(retryDelayMs);
    retryDelayMs = Math.min(API_REQUEST_RETRY_MAX_DELAY_MS, Math.max(retryDelayMs * 2, 100));
  }

  if (!response) {
    throw new Error(`API request failed with no response [requestId=${requestId}] - ${endpoint}`);
  }

  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

  if (!response.ok) {
    noteAuthSessionValidation(endpoint, false);
    const errorBody = await response.text();
    if (attemptedBrowserSessionReplay && response.status === 401) {
      logAuthRecovery('browser-session-recovery-failed', {
        endpoint,
        method: requestMethod,
        requestId,
        status: response.status,
        recoveryAttempt: attemptedSilentAuthRecovery ? 2 : 1
      });
    }
    if (response.status === 401 && hasInteractiveAuthHandler()) {
      const suppressedAuthError = await buildRecentSessionSuppressedApiError(
        endpoint,
        requestMethod,
        requestId,
        response,
        attemptedSilentAuthRecovery ? 1 : 0,
        errorBody
      );
      if (suppressedAuthError) {
        throw suppressedAuthError;
      }

      const recoveryAttempt = attemptedSilentAuthRecovery ? 1 : 0;
      logAuthRecovery('interactive-reauth-required', {
        endpoint,
        method: requestMethod,
        requestId,
        status: response.status,
        recoveryAttempt
      });
      await requestInteractiveReauth({
        reason: attemptedSilentAuthRecovery
          ? `API ${endpoint} returned 401 after a silent session refresh.`
          : `API ${endpoint} returned 401.`,
        source: `api:${endpoint}`,
        endpoint,
        status: response.status,
        requestId,
        recoveryAttempt
      });
    }
    logApiRequest(
      'request-failed',
      {
        endpoint,
        method: requestMethod,
        requestId,
        attempts: completedAttempts,
        durationMs,
        attemptedSilentAuthRecovery,
        attemptedBrowserSessionReplay,
        errorBodyPreview: clipTextForLogs(errorBody, 400),
        ...summarizeResponseForLogs(response)
      },
      response.status >= 500 ? 'error' : 'warn'
    );
    throw new ApiError(
      response.status,
      `API Error: ${response.status} ${response.statusText} [requestId=${requestId}] - ${errorBody}`
    );
  }

  let data: T;
  if (response.status === 204) {
    data = {} as T;
  } else {
    data = (await response.json()) as T;
  }

  logApiRequest('request-succeeded', {
    endpoint,
    method: requestMethod,
    requestId,
    attempts: completedAttempts,
    durationMs,
    cacheHint: response.headers.get('X-System-Health-Cache') || null,
    cacheDegraded: response.headers.get('X-System-Health-Cache-Degraded') === '1',
    ...summarizeResponseForLogs(response)
  });

  return {
    data,
    meta: {
      requestId,
      status: response.status,
      durationMs,
      url: response.url || url,
      cacheHint: response.headers.get('X-System-Health-Cache') || undefined,
      cacheDegraded: response.headers.get('X-System-Health-Cache-Degraded') === '1'
    }
  };
}

export async function request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
  const result = await performRequest<T>(endpoint, config);
  return result.data;
}

export async function requestWithMeta<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<ResponseWithMeta<T>> {
  return performRequest<T>(endpoint, config);
}

export interface JobConsoleLogEntry {
  timestamp?: string | null;
  stream_s?: string | null;
  executionName?: string | null;
  message: string;
}

export interface JobLogRunResponse {
  executionName?: string | null;
  executionId?: string | null;
  status?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  tail: string[];
  consoleLogs?: JobConsoleLogEntry[];
  error?: string | null;
}

export interface JobLogsResponse {
  jobName: string;
  runsRequested: number;
  runsReturned: number;
  tailLines: number;
  runs: JobLogRunResponse[];
}

export interface StockScreenerRow {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  isOptionable?: boolean | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  return1d?: number | null;
  return5d?: number | null;
  vol20d?: number | null;
  drawdown1y?: number | null;
  atr14d?: number | null;
  gapAtr?: number | null;
  sma50d?: number | null;
  sma200d?: number | null;
  trend50_200?: number | null;
  aboveSma50?: number | null;
  bbWidth20d?: number | null;
  compressionScore?: number | null;
  volumeZ20d?: number | null;
  volumePctRank252d?: number | null;
  hasSilver?: number | null;
  hasGold?: number | null;
}

export interface StockScreenerResponse {
  asOf: string;
  total: number;
  limit: number;
  offset: number;
  rows: StockScreenerRow[];
}

export interface PurgeRequest {
  scope: 'layer-domain' | 'layer' | 'domain';
  layer?: string;
  domain?: string;
  confirm: boolean;
}

export interface DomainListResetRequest {
  layer: string;
  domain: string;
  confirm: boolean;
}

export interface DomainListResetResponse {
  layer: string;
  domain: string;
  container: string;
  resetCount: number;
  targets: Array<{
    listType: 'whitelist' | 'blacklist';
    path: string;
    status: 'reset';
    existed: boolean;
  }>;
  updatedAt: string;
}

export interface DomainCheckpointResetRequest {
  layer: string;
  domain: string;
  confirm: boolean;
}

export interface DomainCheckpointResetResponse {
  layer: string;
  domain: string;
  container: string | null;
  resetCount: number;
  deletedCount: number;
  targets: Array<{
    operation: string;
    path: string;
    status: 'reset';
    existed: boolean;
    deleted: boolean;
  }>;
  updatedAt: string;
  note?: string | null;
}

export interface DomainListFilePreview {
  listType: 'whitelist' | 'blacklist';
  path: string;
  exists: boolean;
  symbolCount: number;
  symbols: string[];
  truncated: boolean;
  warning?: string | null;
}

export interface DomainListsResponse {
  layer: string;
  domain: string;
  container: string;
  limit: number;
  files: DomainListFilePreview[];
  loadedAt: string;
}

export interface DomainColumnsResponse {
  layer: 'bronze' | 'silver' | 'gold';
  domain: string;
  columns: string[];
  found: boolean;
  promptRetrieve: boolean;
  source: 'common-file' | 'artifact';
  cachePath: string;
  updatedAt?: string | null;
}

export interface PurgeCandidateRow {
  symbol: string;
  matchedValue: number;
  rowsContributing: number;
  latestAsOf: string | null;
}

export interface PurgeCandidatesRequest {
  layer: 'bronze' | 'silver' | 'gold';
  domain: 'market' | 'finance' | 'earnings' | 'price-target';
  column: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'top_percent' | 'bottom_percent';
  aggregation?: 'min' | 'max' | 'avg' | 'stddev';
  value?: number;
  percentile?: number;
  as_of?: string;
  recent_rows?: number;
  offset?: number;
  min_rows?: number;
}

export interface PurgeCandidatesCriteria {
  requestedLayer: string;
  resolvedLayer: string;
  domain: string;
  column: string;
  operator: string;
  value: number;
  asOf?: string | null;
  minRows: number;
  recentRows: number;
  aggregation: 'min' | 'max' | 'avg' | 'stddev';
}

export interface PurgeCandidatesSummary {
  totalRowsScanned: number;
  symbolsMatched: number;
  rowsContributing: number;
  estimatedDeletionTargets: number;
}

export interface PurgeCandidatesResponse {
  criteria: PurgeCandidatesCriteria;
  expression: string;
  summary: PurgeCandidatesSummary;
  symbols: PurgeCandidateRow[];
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  note?: string | null;
}

export interface PurgeSymbolResultItem {
  symbol: string;
  status: 'succeeded' | 'failed' | 'skipped';
  deleted?: number;
  dryRun?: boolean;
  error?: string;
}

export interface PurgeBlacklistSource {
  path: string;
  symbolCount: number;
  warning?: string;
}

export interface PurgeBlacklistSymbolsResponse {
  container: string;
  symbolCount: number;
  symbols: string[];
  sources: PurgeBlacklistSource[];
  loadedAt?: string;
}

export interface PurgeBatchOperationResult {
  scope: 'symbols';
  dryRun: boolean;
  scopeNote?: string | null;
  requestedSymbols: string[];
  requestedSymbolCount: number;
  completed?: number;
  pending?: number;
  inProgress?: number;
  progressPct?: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalDeleted: number;
  symbolResults: PurgeSymbolResultItem[];
}

export interface PurgeOperationResponse {
  operationId: string;
  status: 'running' | 'succeeded' | 'failed';
  scope: string;
  layer?: string | null;
  domain?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt?: string | null;
  result?: PurgeResponse | PurgeBatchOperationResult | PurgeCandidatesResponse;
  error?: string | null;
}

export interface PurgeResponse {
  scope: string;
  layer?: string | null;
  domain?: string | null;
  totalDeleted: number;
  targets: Array<{
    container: string;
    prefix?: string | null;
    layer?: string | null;
    domain?: string | null;
    deleted: number;
  }>;
}

export interface DebugSymbolsResponse {
  symbols: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface RuntimeConfigCatalogItem {
  key: string;
  description: string;
  example: string;
}

export interface RuntimeConfigCatalogResponse {
  items: RuntimeConfigCatalogItem[];
}

export interface RuntimeConfigItem {
  scope: string;
  key: string;
  value: string;
  description?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface RuntimeConfigListResponse {
  scope: string;
  items: RuntimeConfigItem[];
}

export interface ValidationColumnStat {
  name: string;
  type: string;
  total: number;
  notNull: number;
  nullPct: number;
}

export interface ValidationReport {
  layer: string;
  domain: string;
  status: string;
  rowCount: number;
  columns: ValidationColumnStat[];
  timestamp: string;
  error?: string;
  sampleLimit?: number;
}

export interface ProfilingBucket {
  label: string;
  count: number;
  start?: number | null;
  end?: number | null;
}

export interface ProfilingTopValue {
  value: string;
  count: number;
}

export interface DataProfilingResponse {
  layer: string;
  domain: string;
  column: string;
  kind: 'numeric' | 'date' | 'string';
  totalRows: number;
  nonNullCount: number;
  nullCount: number;
  sampleRows: number;
  bins: ProfilingBucket[];
  uniqueCount?: number;
  duplicateCount?: number;
  topValues?: ProfilingTopValue[];
}

export interface StorageFolderUsage {
  path: string;
  fileCount: number | null;
  totalBytes: number | null;
  truncated: boolean;
  error?: string | null;
}

export interface StorageContainerUsage {
  layer: string;
  layerLabel: string;
  container: string;
  totalFiles: number | null;
  totalBytes: number | null;
  truncated: boolean;
  error?: string | null;
  folders: StorageFolderUsage[];
}

export interface StorageUsageResponse {
  generatedAt: string;
  scanLimit: number;
  containers: StorageContainerUsage[];
}

export interface AdlsHierarchyEntry {
  type: 'folder' | 'file';
  name: string;
  path: string;
  size?: number | null;
  lastModified?: string | null;
  contentType?: string | null;
}

export interface AdlsTreeResponse {
  layer: string;
  container: string;
  path: string;
  truncated: boolean;
  scanLimit: number;
  entries: AdlsHierarchyEntry[];
}

export interface AdlsFilePreviewResponse {
  layer: string;
  container: string;
  path: string;
  isPlainText: boolean;
  encoding?: string | null;
  truncated: boolean;
  maxBytes: number;
  contentType?: string | null;
  contentPreview?: string | null;
  previewMode?: 'blob' | 'delta-log' | 'delta-table' | 'parquet-table';
  processedDeltaFiles?: number | null;
  maxDeltaFiles?: number | null;
  deltaLogPath?: string | null;
  tableColumns?: string[] | null;
  tableRows?: Record<string, unknown>[] | null;
  tableRowCount?: number | null;
  tablePreviewLimit?: number | null;
  tableTruncated?: boolean | null;
  resolvedTablePath?: string | null;
  tableVersion?: number | null;
}

export interface ContainerAppHealthCheck {
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  url?: string | null;
  httpStatus?: number | null;
  checkedAt?: string | null;
  error?: string | null;
}

export interface ContainerAppStatusItem {
  name: string;
  resourceType?: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  details?: string;
  provisioningState?: string | null;
  runningState?: string | null;
  latestReadyRevisionName?: string | null;
  ingressFqdn?: string | null;
  azureId?: string | null;
  checkedAt?: string | null;
  error?: string | null;
  health?: ContainerAppHealthCheck | null;
}

export interface ContainerAppsStatusResponse {
  probed: boolean;
  apps: ContainerAppStatusItem[];
}

export interface ContainerAppControlResponse {
  appName: string;
  action: 'start' | 'stop';
  provisioningState?: string | null;
  runningState?: string | null;
}

export interface ContainerAppLogsResponse {
  appName: string;
  lookbackMinutes: number;
  tailLines: number;
  logs: string[];
}

export interface DomainMetadataSnapshotResponse {
  version: number;
  updatedAt?: string | null;
  entries: Record<string, DomainMetadata>;
  warnings?: string[];
}

export interface SystemStatusViewResponse {
  version: number;
  generatedAt: string;
  systemHealth: SystemHealth;
  metadataSnapshot: DomainMetadataSnapshotResponse;
  sources: {
    systemHealth: 'cache' | 'live-refresh';
    metadataSnapshot: 'persisted-snapshot';
  };
}

export const apiService = {
  // --- Data Endpoints ---

  getMarketData(
    ticker: string,
    layer: 'silver' | 'gold' = 'silver',
    signal?: AbortSignal
  ): Promise<MarketData[]> {
    return request<MarketData[]>(`/data/${layer}/market`, { params: { ticker }, signal });
  },

  getFinanceData(
    ticker: string,
    subDomain: string,
    layer: 'silver' | 'gold' = 'silver',
    signal?: AbortSignal
  ): Promise<FinanceData[]> {
    return request<FinanceData[]>(`/data/${layer}/finance/${encodeURIComponent(subDomain)}`, {
      params: { ticker },
      signal
    });
  },

  getSystemHealth(params: { refresh?: boolean } = {}): Promise<SystemHealth> {
    return request<SystemHealth>('/system/health', { params });
  },

  getSystemHealthWithMeta(
    params: { refresh?: boolean } = {}
  ): Promise<ResponseWithMeta<SystemHealth>> {
    return requestWithMeta<SystemHealth>('/system/health', { params });
  },

  getAuthSessionStatusWithMeta(): Promise<ResponseWithMeta<AuthSessionStatus>> {
    return requestWithMeta<AuthSessionStatus>('/auth/session');
  },

  createAuthSessionWithBearerToken(accessToken: string): Promise<ResponseWithMeta<AuthSessionStatus>> {
    return requestWithMeta<AuthSessionStatus>('/auth/session', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      retryOnStatusCodes: false
    });
  },

  deleteAuthSession(): Promise<Record<string, never>> {
    return request<Record<string, never>>('/auth/session', {
      method: 'DELETE',
      retryOnStatusCodes: false
    });
  },

  getDomainMetadata(
    layer: 'bronze' | 'silver' | 'gold' | 'platinum',
    domain: string,
    params: { refresh?: boolean } = {}
  ): Promise<DomainMetadata> {
    return request<DomainMetadata>('/system/domain-metadata', {
      params: { layer, domain, ...params }
    });
  },

  getDomainMetadataSnapshot(
    params: { layers?: string; domains?: string; refresh?: boolean } = {}
  ): Promise<DomainMetadataSnapshotResponse> {
    return request<DomainMetadataSnapshotResponse>('/system/domain-metadata/snapshot', {
      params
    });
  },

  getSystemStatusView(
    params: {
      refresh?: boolean;
    } = {}
  ): Promise<SystemStatusViewResponse> {
    return request<SystemStatusViewResponse>('/system/status-view', { params });
  },

  getPersistedDomainMetadataSnapshotCache(): Promise<DomainMetadataSnapshotResponse> {
    return request<DomainMetadataSnapshotResponse>('/system/domain-metadata/snapshot/cache');
  },

  savePersistedDomainMetadataSnapshotCache(
    payload: DomainMetadataSnapshotResponse
  ): Promise<DomainMetadataSnapshotResponse> {
    return request<DomainMetadataSnapshotResponse>('/system/domain-metadata/snapshot/cache', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  getDomainColumns(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string
  ): Promise<DomainColumnsResponse> {
    return request<DomainColumnsResponse>('/system/domain-columns', {
      params: { layer, domain },
      timeoutMs: 10000
    });
  },

  refreshDomainColumns(payload: {
    layer: 'bronze' | 'silver' | 'gold';
    domain: string;
    sample_limit?: number;
  }): Promise<DomainColumnsResponse> {
    return request<DomainColumnsResponse>('/system/domain-columns/refresh', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 30000
    });
  },

  getLineage(): Promise<unknown> {
    return request<unknown>('/system/lineage');
  },

  getJobLogs(
    jobName: string,
    params: { runs?: number } = {},
    signal?: AbortSignal
  ): Promise<JobLogsResponse> {
    return request<JobLogsResponse>(`/system/jobs/${jobName}/logs`, {
      params,
      signal
    });
  },

  getContainerApps(
    params: { probe?: boolean } = {},
    signal?: AbortSignal
  ): Promise<ContainerAppsStatusResponse> {
    return request<ContainerAppsStatusResponse>('/system/container-apps', {
      params: { probe: params.probe ?? true },
      signal
    });
  },

  startContainerApp(appName: string, signal?: AbortSignal): Promise<ContainerAppControlResponse> {
    return request<ContainerAppControlResponse>(
      `/system/container-apps/${encodeURIComponent(appName)}/start`,
      {
        method: 'POST',
        signal
      }
    );
  },

  stopContainerApp(appName: string, signal?: AbortSignal): Promise<ContainerAppControlResponse> {
    return request<ContainerAppControlResponse>(
      `/system/container-apps/${encodeURIComponent(appName)}/stop`,
      {
        method: 'POST',
        signal
      }
    );
  },

  getContainerAppLogs(
    appName: string,
    params: { minutes?: number; tail?: number } = {},
    signal?: AbortSignal
  ): Promise<ContainerAppLogsResponse> {
    return request<ContainerAppLogsResponse>(
      `/system/container-apps/${encodeURIComponent(appName)}/logs`,
      {
        params: {
          minutes: params.minutes ?? 60,
          tail: params.tail ?? 50
        },
        signal
      }
    );
  },

  getStockScreener(
    params: {
      q?: string;
      limit?: number;
      offset?: number;
      asOf?: string;
      sort?: string;
      direction?: 'asc' | 'desc';
    } = {},
    signal?: AbortSignal
  ): Promise<StockScreenerResponse> {
    return request<StockScreenerResponse>('/data/screener', {
      params,
      signal
    });
  },

  getGenericData(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string,
    ticker?: string,
    limit?: number,
    optionsOrSignal?: { sortByDate?: 'asc' | 'desc' } | AbortSignal,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>[]> {
    const options = optionsOrSignal instanceof AbortSignal ? undefined : optionsOrSignal;
    const resolvedSignal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : signal;
    const normalizedDomain = String(domain || '').trim();
    if (layer === 'gold' && normalizedDomain.startsWith('regime/')) {
      const dataset = normalizedDomain.slice('regime/'.length);
      return request<Record<string, unknown>[]>(
        `/data/gold/regime/${encodeURIComponent(dataset)}`,
        {
          params: {
            limit,
            date_sort: options?.sortByDate
          },
          signal: resolvedSignal
        }
      );
    }
    const endpoint = `/data/${layer}/${normalizedDomain}`;
    return request<Record<string, unknown>[]>(endpoint, {
      params: {
        ticker,
        limit,
        date_sort: options?.sortByDate
      },
      signal: resolvedSignal
    });
  },

  getDataQualityValidation(
    layer: string,
    domain: string,
    tickerOrSignal?: string | AbortSignal,
    signal?: AbortSignal
  ): Promise<ValidationReport> {
    const ticker = typeof tickerOrSignal === 'string' ? tickerOrSignal : undefined;
    const resolvedSignal = tickerOrSignal instanceof AbortSignal ? tickerOrSignal : signal;
    return request<ValidationReport>(`/data/quality/${layer}/${domain}/validation`, {
      params: { ticker },
      signal: resolvedSignal
    });
  },

  getStorageUsage(signal?: AbortSignal): Promise<StorageUsageResponse> {
    return request<StorageUsageResponse>('/data/storage-usage', {
      signal
    });
  },

  getAdlsTree(
    params: {
      layer: 'bronze' | 'silver' | 'gold' | 'platinum';
      path?: string;
      maxEntries?: number;
    },
    signal?: AbortSignal
  ): Promise<AdlsTreeResponse> {
    return request<AdlsTreeResponse>('/data/adls/tree', {
      params: {
        layer: params.layer,
        path: params.path,
        max_entries: params.maxEntries
      },
      signal
    });
  },

  getAdlsFilePreview(
    params: {
      layer: 'bronze' | 'silver' | 'gold' | 'platinum';
      path: string;
      maxBytes?: number;
      maxDeltaFiles?: number;
    },
    signal?: AbortSignal
  ): Promise<AdlsFilePreviewResponse> {
    return request<AdlsFilePreviewResponse>('/data/adls/file-preview', {
      params: {
        layer: params.layer,
        path: params.path,
        max_bytes: params.maxBytes,
        max_delta_files: params.maxDeltaFiles
      },
      signal
    });
  },

  getDataProfile(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string,
    column: string,
    params: {
      ticker?: string;
      bins?: number;
      sampleRows?: number;
      topValues?: number;
    } = {},
    signal?: AbortSignal
  ): Promise<DataProfilingResponse> {
    const normalizedDomain = String(domain || '').trim();
    if (layer === 'gold' && normalizedDomain.startsWith('regime/')) {
      const dataset = normalizedDomain.slice('regime/'.length);
      return request<DataProfilingResponse>(
        `/data/gold/regime/${encodeURIComponent(dataset)}/profile`,
        {
          params: {
            column,
            bins: params.bins,
            sampleRows: params.sampleRows,
            topValues: params.topValues
          },
          signal
        }
      );
    }
    return request<DataProfilingResponse>(`/data/${layer}/profile`, {
      params: {
        domain: normalizedDomain,
        column,
        ticker: params.ticker,
        bins: params.bins,
        sampleRows: params.sampleRows,
        topValues: params.topValues
      },
      signal
    });
  },

  purgeData(payload: PurgeRequest): Promise<PurgeOperationResponse> {
    return request<PurgeOperationResponse>('/system/purge', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  resetDomainLists(payload: DomainListResetRequest): Promise<DomainListResetResponse> {
    return request<DomainListResetResponse>('/system/domain-lists/reset', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  resetDomainCheckpoints(
    payload: DomainCheckpointResetRequest
  ): Promise<DomainCheckpointResetResponse> {
    return request<DomainCheckpointResetResponse>('/system/domain-checkpoints/reset', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getDomainLists(
    layer: string,
    domain: string,
    params: { limit?: number } = {}
  ): Promise<DomainListsResponse> {
    return request<DomainListsResponse>('/system/domain-lists', {
      params: { layer, domain, ...params }
    });
  },

  getPurgeCandidates(payload: PurgeCandidatesRequest): Promise<PurgeCandidatesResponse> {
    return request<PurgeCandidatesResponse>('/system/purge-candidates', {
      params: { ...payload },
      timeoutMs: 30000,
      retryOnStatusCodes: [408, 425, 429, 500, 502, 503]
    });
  },

  createPurgeCandidatesOperation(payload: PurgeCandidatesRequest): Promise<PurgeOperationResponse> {
    return request<PurgeOperationResponse>('/system/purge-candidates', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 30000,
      retryOnStatusCodes: [408, 425, 429, 500, 502, 503]
    });
  },

  getPurgeOperation(operationId: string): Promise<PurgeOperationResponse> {
    return request<PurgeOperationResponse>(`/system/purge/${encodeURIComponent(operationId)}`);
  },

  getPurgeBlacklistSymbols(): Promise<PurgeBlacklistSymbolsResponse> {
    return request<PurgeBlacklistSymbolsResponse>('/system/purge-symbols/blacklist');
  },

  purgeSymbolsBatch(payload: {
    symbols: string[];
    confirm: boolean;
    scope_note?: string;
    dry_run?: boolean;
    audit_rule?: {
      layer: 'bronze' | 'silver' | 'gold';
      domain: 'market' | 'finance' | 'earnings' | 'price-target';
      column_name: string;
      operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'top_percent' | 'bottom_percent';
      threshold: number;
      aggregation?: 'min' | 'max' | 'avg' | 'stddev';
      recent_rows?: number;
      expression?: string;
      selected_symbol_count?: number;
      matched_symbol_count?: number;
    };
  }): Promise<PurgeOperationResponse> {
    return request<PurgeOperationResponse>('/system/purge-symbols', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getDebugSymbols(): Promise<DebugSymbolsResponse> {
    return request<DebugSymbolsResponse>('/system/debug-symbols');
  },

  setDebugSymbols(payload: { symbols: string }): Promise<DebugSymbolsResponse> {
    return request<DebugSymbolsResponse>('/system/debug-symbols', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  deleteDebugSymbols(): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>('/system/debug-symbols', {
      method: 'DELETE'
    });
  },

  getRuntimeConfigCatalog(): Promise<RuntimeConfigCatalogResponse> {
    return request<RuntimeConfigCatalogResponse>('/system/runtime-config/catalog');
  },

  getRuntimeConfig(scope: string = 'global'): Promise<RuntimeConfigListResponse> {
    return request<RuntimeConfigListResponse>('/system/runtime-config', {
      params: { scope }
    });
  },

  setRuntimeConfig(payload: {
    key: string;
    scope?: string;
    value: string;
    description?: string;
  }): Promise<RuntimeConfigItem> {
    return request<RuntimeConfigItem>('/system/runtime-config', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteRuntimeConfig(
    key: string,
    scope: string = 'global'
  ): Promise<{ scope: string; key: string; deleted: boolean }> {
    return request<{ scope: string; key: string; deleted: boolean }>(
      `/system/runtime-config/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
        params: { scope }
      }
    );
  },

  getSymbolSyncState(): Promise<SymbolSyncState> {
    return request<SymbolSyncState>('/system/symbol-sync-state');
  }
};

export interface SymbolSyncState {
  id: number;
  last_refreshed_at: string;
  last_refreshed_sources: {
    nasdaq?: { rows: number; timestamp: string };
    alpha_vantage?: { rows: number; timestamp: string };
    massive?: { rows: number; timestamp: string };
  };
  last_refresh_error?: string;
}
