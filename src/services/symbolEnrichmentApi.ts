import { request } from '@/services/apiService';

export type SymbolCleanupStatus = 'queued' | 'running' | 'completed' | 'failed';
export type SymbolSourceKind = 'provider' | 'ai' | 'derived' | 'override';
export type SymbolValidationStatus = 'accepted' | 'rejected' | 'pending' | 'locked';
export type SymbolOverwriteMode = 'fill_missing' | 'full_reconcile';
export type SymbolEnrichmentField =
  | 'security_type_norm'
  | 'exchange_mic'
  | 'country_of_risk'
  | 'sector_norm'
  | 'industry_group_norm'
  | 'industry_norm'
  | 'is_adr'
  | 'is_etf'
  | 'is_cef'
  | 'is_preferred'
  | 'share_class'
  | 'listing_status_norm'
  | 'issuer_summary_short';

export interface SymbolProfileValues {
  security_type_norm?: string | null;
  exchange_mic?: string | null;
  country_of_risk?: string | null;
  sector_norm?: string | null;
  industry_group_norm?: string | null;
  industry_norm?: string | null;
  is_adr?: boolean | null;
  is_etf?: boolean | null;
  is_cef?: boolean | null;
  is_preferred?: boolean | null;
  share_class?: string | null;
  listing_status_norm?: string | null;
  issuer_summary_short?: string | null;
}

export interface SymbolCleanupRunSummary {
  runId: string;
  status: SymbolCleanupStatus;
  mode: SymbolOverwriteMode;
  queuedCount: number;
  claimedCount: number;
  completedCount: number;
  failedCount: number;
  acceptedUpdateCount: number;
  rejectedUpdateCount: number;
  lockedSkipCount: number;
  overwriteCount: number;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface SymbolEnrichmentSummary {
  backlogCount: number;
  lastRun?: SymbolCleanupRunSummary | null;
  activeRun?: SymbolCleanupRunSummary | null;
  validationFailureCount: number;
  lockCount: number;
}

export interface SymbolEnrichmentSymbolListItem {
  symbol: string;
  name?: string | null;
  status: SymbolValidationStatus;
  sourceKind: SymbolSourceKind;
  updatedAt?: string | null;
  missingFieldCount: number;
  lockedFieldCount: number;
  dataCompletenessScore?: number | null;
}

export interface SymbolProviderFacts {
  symbol: string;
  name?: string | null;
  description?: string | null;
  sector?: string | null;
  industry?: string | null;
  industry2?: string | null;
  country?: string | null;
  exchange?: string | null;
  assetType?: string | null;
  ipoDate?: string | null;
  delistingDate?: string | null;
  status?: string | null;
  isOptionable?: boolean | null;
  sourceNasdaq?: boolean | null;
  sourceMassive?: boolean | null;
  sourceAlphaVantage?: boolean | null;
}

export interface SymbolProfileCurrent extends SymbolProfileValues {
  symbol: string;
  sourceKind: SymbolSourceKind;
  sourceFingerprint?: string | null;
  aiModel?: string | null;
  aiConfidence?: number | null;
  validationStatus: SymbolValidationStatus;
  marketCapUsd?: number | null;
  marketCapBucket?: string | null;
  avgDollarVolume20d?: number | null;
  liquidityBucket?: string | null;
  isTradeableCommonEquity?: boolean | null;
  dataCompletenessScore?: number | null;
  updatedAt?: string | null;
}

export interface SymbolProfileHistoryEntry {
  historyId: string;
  symbol: string;
  fieldName: SymbolEnrichmentField;
  previousValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
  sourceKind: SymbolSourceKind;
  aiModel?: string | null;
  aiConfidence?: number | null;
  changeReason?: string | null;
  runId?: string | null;
  updatedAt: string;
}

export interface SymbolProfileOverride {
  symbol: string;
  fieldName: SymbolEnrichmentField;
  value?: string | number | boolean | null;
  isLocked: boolean;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface SymbolEnrichmentSymbolDetail {
  providerFacts: SymbolProviderFacts;
  currentProfile?: SymbolProfileCurrent | null;
  overrides: SymbolProfileOverride[];
  history: SymbolProfileHistoryEntry[];
}

export interface SymbolEnrichmentEnqueueRequest {
  symbols?: string[];
  fullScan?: boolean;
  overwriteMode?: SymbolOverwriteMode;
  maxSymbols?: number | null;
}

export const symbolEnrichmentApi = {
  async getSummary(signal?: AbortSignal): Promise<SymbolEnrichmentSummary> {
    return request<SymbolEnrichmentSummary>('/system/symbol-enrichment/summary', { signal });
  },

  async listRuns(params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) {
    return request<SymbolCleanupRunSummary[]>('/system/symbol-enrichment/runs', {
      params,
      signal
    });
  },

  async listSymbols(
    params: { q?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal
  ) {
    return request<SymbolEnrichmentSymbolListItem[]>('/system/symbol-enrichment/symbols', {
      params,
      signal
    });
  },

  async getSymbolDetail(symbol: string, signal?: AbortSignal) {
    return request<SymbolEnrichmentSymbolDetail>(
      `/system/symbol-enrichment/symbols/${encodeURIComponent(symbol)}`,
      { signal }
    );
  },

  async enqueue(payload: SymbolEnrichmentEnqueueRequest, signal?: AbortSignal) {
    return request<SymbolCleanupRunSummary>('/system/symbol-enrichment/enqueue', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async saveOverrides(symbol: string, overrides: SymbolProfileOverride[], signal?: AbortSignal) {
    return request<SymbolProfileOverride[]>(
      `/system/symbol-enrichment/overrides/${encodeURIComponent(symbol)}`,
      {
        method: 'PUT',
        body: JSON.stringify(overrides),
        signal
      }
    );
  }
};
