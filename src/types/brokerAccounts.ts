export type {
  AcknowledgeBrokerAlertRequest,
  BrokerAccountActionResponse,
  BrokerAccountActionStatus,
  BrokerAccountActionType,
  BrokerAccountActivity,
  BrokerAccountAllocationUpdateRequest,
  BrokerAccountAlert,
  BrokerAccountConfiguration,
  BrokerAccountConfigurationAuditRecord,
  BrokerAccountDetail,
  BrokerAccountListResponse,
  BrokerAccountSummary,
  BrokerAccountType,
  BrokerAlertSeverity,
  BrokerAlertStatus,
  BrokerAllocationMode,
  BrokerAuthStatus,
  BrokerCapabilityFlags,
  BrokerConfigurationAuditCategory,
  BrokerConfigurationAuditOutcome,
  BrokerConnectionHealth,
  BrokerConnectionState,
  BrokerHealthTone,
  BrokerPolicyAssetClass,
  BrokerPolicySide,
  BrokerPositionSizeLimit,
  BrokerPositionSizeMode,
  BrokerStrategyAllocationItem,
  BrokerStrategyAllocationSummary,
  BrokerStrategyReference,
  BrokerSyncRun,
  BrokerSyncRunStatus,
  BrokerSyncScope,
  BrokerSyncStatus,
  BrokerSyncTrigger,
  BrokerTradeReadiness,
  BrokerTradingPolicy,
  BrokerTradingPolicyUpdateRequest,
  BrokerVendor,
  PauseBrokerSyncRequest,
  ReconnectBrokerAccountRequest,
  RefreshBrokerAccountRequest
} from '@asset-allocation/contracts';

import type {
  BrokerAccountActionResponse,
  BrokerAccountConfiguration,
  BrokerAccountConfigurationAuditRecord,
  BrokerAccountSummary,
  BrokerTradeReadiness,
  BrokerVendor
} from '@asset-allocation/contracts';

export type BrokerAccountExecutionPosture = 'monitor_only' | 'paper' | 'sandbox' | 'live';
export type BrokerAccountOnboardingCandidateState =
  | 'available'
  | 'already_configured'
  | 'disabled'
  | 'blocked'
  | 'unavailable';
export type BrokerAccountOnboardingDiscoveryStatus =
  | 'completed'
  | 'provider_unavailable'
  | 'not_connected'
  | 'failed';
export type BrokerAccountOnboardingEnvironment = 'paper' | 'sandbox' | 'live';

export interface BrokerAccountOnboardingCandidate {
  candidateId: string;
  provider: BrokerVendor;
  environment: BrokerAccountOnboardingEnvironment;
  suggestedAccountId: string;
  displayName: string;
  accountNumberMasked?: string | null;
  baseCurrency: string;
  state: BrokerAccountOnboardingCandidateState;
  stateReason?: string | null;
  existingAccountId?: string | null;
  allowedExecutionPostures: BrokerAccountExecutionPosture[];
  blockedExecutionPostureReasons: Partial<Record<BrokerAccountExecutionPosture, string>>;
  canOnboard: boolean;
}

export interface BrokerAccountOnboardingCandidateListResponse {
  candidates: BrokerAccountOnboardingCandidate[];
  discoveryStatus: BrokerAccountOnboardingDiscoveryStatus;
  message?: string | null;
  generatedAt?: string | null;
}

export interface BrokerAccountOnboardingRequest {
  candidateId: string;
  provider: BrokerVendor;
  environment: BrokerAccountOnboardingEnvironment;
  displayName: string;
  readiness: BrokerTradeReadiness;
  executionPosture: BrokerAccountExecutionPosture;
  initialRefresh: boolean;
  reason: string;
}

export interface BrokerAccountOnboardingResponse {
  account: BrokerAccountSummary;
  configuration?: BrokerAccountConfiguration | null;
  created: boolean;
  reenabled: boolean;
  refreshAction?: BrokerAccountActionResponse | null;
  audit?: BrokerAccountConfigurationAuditRecord | null;
  message?: string | null;
  generatedAt?: string | null;
}
