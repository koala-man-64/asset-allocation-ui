import type { PortfolioAlert, PortfolioHealthTone } from '@/types/portfolio';

export function formatPercent(value?: number | null, digits: number = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return `${Number(value).toFixed(digits)}%`;
}

export function formatTimestamp(value?: string | null): string {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return 'Not available';
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined
  }).format(parsed);
}

export function formatCurrency(value?: number | null, currency: string = 'USD'): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
  }).format(value);
}

export function formatNumber(value?: number | null, digits: number = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function titleCaseWords(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function statusBadgeVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'failed' || status === 'critical') {
    return 'destructive';
  }

  if (status === 'running' || status === 'warning' || status === 'partial') {
    return 'secondary';
  }

  if (!status || status === 'draft' || status === 'staged') {
    return 'outline';
  }

  return 'default';
}

export function alertToneClass(severity: PortfolioAlert['severity']): string {
  if (severity === 'critical') {
    return 'border-destructive/30 bg-destructive/10';
  }

  if (severity === 'warning') {
    return 'border-mcm-mustard/30 bg-mcm-mustard/10';
  }

  return 'border-mcm-teal/20 bg-mcm-teal/8';
}

export function compactMetricToneClass(tone: PortfolioHealthTone): string {
  if (tone === 'critical') {
    return 'border-destructive/25 bg-destructive/8';
  }

  if (tone === 'warning') {
    return 'border-mcm-mustard/25 bg-mcm-mustard/10';
  }

  return 'border-mcm-teal/20 bg-mcm-teal/8';
}
