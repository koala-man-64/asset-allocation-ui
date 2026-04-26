import type { AdlsHierarchyEntry } from '@/services/apiService';

const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'csv',
  'json',
  'jsonl',
  'log',
  'yaml',
  'yml',
  'xml',
  'md',
  'py',
  'sql',
  'ts',
  'tsx',
  'js',
  'jsx',
  'css',
  'html',
  'htm',
  'env'
]);

export type LayerKey = 'bronze' | 'silver' | 'gold' | 'platinum';
export type DomainKey = 'market' | 'finance' | 'earnings' | 'price-target' | 'regime';

export type TreeMeta = {
  container: string;
  scanLimit: number;
  truncated: boolean;
};

export const CONTAINER_OPTIONS: Array<{ value: LayerKey; label: string }> = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' }
];

export const DOMAIN_OPTIONS_BY_LAYER: Record<
  LayerKey,
  Array<{ value: DomainKey; label: string }>
> = {
  bronze: [
    { value: 'market', label: 'Market' },
    { value: 'finance', label: 'Finance' },
    { value: 'earnings', label: 'Earnings' },
    { value: 'price-target', label: 'Targets' }
  ],
  silver: [
    { value: 'market', label: 'Market' },
    { value: 'finance', label: 'Finance' },
    { value: 'earnings', label: 'Earnings' },
    { value: 'price-target', label: 'Targets' }
  ],
  gold: [
    { value: 'market', label: 'Market' },
    { value: 'finance', label: 'Finance' },
    { value: 'earnings', label: 'Earnings' },
    { value: 'price-target', label: 'Targets' },
    { value: 'regime', label: 'Regime' }
  ],
  platinum: [
    { value: 'market', label: 'Market' },
    { value: 'finance', label: 'Finance' },
    { value: 'earnings', label: 'Earnings' },
    { value: 'price-target', label: 'Targets' }
  ]
};

export const EXPLORER_ROOT_PATHS: Record<LayerKey, Record<DomainKey, string>> = {
  bronze: {
    market: 'market-data/',
    finance: 'finance-data/',
    earnings: 'earnings-data/',
    'price-target': 'price-target-data/',
    regime: 'regime/'
  },
  silver: {
    market: 'market-data/buckets/',
    finance: 'finance-data/',
    earnings: 'earnings-data/buckets/',
    'price-target': 'price-target-data/buckets/',
    regime: 'regime/'
  },
  gold: {
    market: 'market/buckets/',
    finance: 'finance/',
    earnings: 'earnings/buckets/',
    'price-target': 'targets/buckets/',
    regime: 'regime/'
  },
  platinum: {
    market: 'market/buckets/',
    finance: 'finance/',
    earnings: 'earnings/buckets/',
    'price-target': 'targets/buckets/',
    regime: 'regime/'
  }
};

export const DELTA_PREVIEW_FILE_OPTIONS = [
  { value: '0', label: '0' },
  ...Array.from({ length: 25 }, (_, index) => {
    const value = String(index + 1).padStart(2, '0');
    return { value, label: value };
  })
];

export function normalizeFolderPath(value: string): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/g, '')
    .replace(/\/+$/g, '');
  return cleaned ? `${cleaned}/` : '';
}

export function normalizeFilePath(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/g, '')
    .replace(/\/+$/g, '');
}

export function formatBytes(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function isLikelyTextFile(name: string): boolean {
  const idx = name.lastIndexOf('.');
  if (idx < 0) {
    return false;
  }
  return TEXT_FILE_EXTENSIONS.has(name.slice(idx + 1).toLowerCase());
}

export function formatTwoDigitCount(value?: number | null): string {
  const normalized = Number.isFinite(Number(value)) ? Number(value) : 0;
  return String(Math.max(0, Math.floor(normalized))).padStart(2, '0');
}

export function formatPreviewTableCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function countExplorerEntries(entries: AdlsHierarchyEntry[]): {
  folders: number;
  files: number;
} {
  return entries.reduce(
    (acc, entry) => {
      if (entry.type === 'folder') {
        acc.folders += 1;
      } else {
        acc.files += 1;
      }
      return acc;
    },
    { folders: 0, files: 0 }
  );
}
