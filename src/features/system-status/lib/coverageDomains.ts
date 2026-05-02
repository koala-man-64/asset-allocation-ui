import { normalizeDomainKey } from '@/features/system-status/components/SystemPurgeControls';

const OPERATIONAL_WORKFLOW_DOMAIN_KEYS = new Set([
  'backtest',
  'backtests',
  'backtesting',
  'backtrests',
  'ranking',
  'rankings',
  'regime',
  'regimes'
]);

export function isOperationalWorkflowDomain(value?: string | null): boolean {
  const domainKey = normalizeDomainKey(String(value || ''));
  return Boolean(domainKey) && OPERATIONAL_WORKFLOW_DOMAIN_KEYS.has(domainKey);
}

export function isDomainLayerCoverageDomainVisible(value?: string | null): boolean {
  const domainKey = normalizeDomainKey(String(value || ''));
  return Boolean(domainKey) && !OPERATIONAL_WORKFLOW_DOMAIN_KEYS.has(domainKey);
}
