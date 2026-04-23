import { ApiError, request } from '@/services/apiService';
import type {
  PortfolioAlert,
  PortfolioAlertSeverity,
  PortfolioBuildListResponse,
  PortfolioBuildRunSummary,
  PortfolioBuildStatus,
  PortfolioConfig,
  PortfolioDetail,
  PortfolioExecutionPolicy,
  PortfolioHealthTone,
  PortfolioLedgerEventRow,
  PortfolioMonitorSnapshot,
  PortfolioOverlayConfig,
  PortfolioPositionRow,
  PortfolioPreviewAllocation,
  PortfolioPreviewResponse,
  PortfolioRiskLimits,
  PortfolioSleeveDefinition,
  PortfolioSleeveMonitorRow,
  PortfolioSleeveStatus,
  PortfolioStatus,
  PortfolioSummary,
  TriggerPortfolioBuildPayload,
  TriggerPortfolioBuildResponse
} from '@/types/portfolio';

const DEFAULT_RISK_LIMITS: PortfolioRiskLimits = {
  grossExposurePct: 110,
  netExposurePct: 100,
  singleNameMaxPct: 8,
  sectorMaxPct: 28,
  turnoverBudgetPct: 18,
  driftRebalanceThresholdPct: 3
};

const DEFAULT_EXECUTION_POLICY: PortfolioExecutionPolicy = {
  participationRatePct: 12,
  maxTradeNotionalUsd: 250000,
  staggerMinutes: 45
};

const DEFAULT_OVERLAYS: PortfolioOverlayConfig = {
  regimeModelName: 'strategy-native',
  riskModelName: 'core-risk-v1',
  honorHaltFlag: true
};

interface RawStrategyReference {
  strategyName: string;
  strategyVersion: number;
}

interface RawPortfolioAllocation {
  sleeveId: string;
  sleeveName?: string;
  strategy: RawStrategyReference;
  targetWeight: number;
  minWeight?: number | null;
  maxWeight?: number | null;
  enabled: boolean;
  rebalancePriority?: number;
  notes?: string;
}

interface RawPortfolioDefinition {
  name: string;
  description?: string;
  benchmarkSymbol?: string | null;
  status: PortfolioStatus;
  latestVersion?: number | null;
  activeVersion?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface RawPortfolioRevision {
  portfolioName: string;
  version: number;
  description?: string;
  benchmarkSymbol?: string | null;
  allocations: RawPortfolioAllocation[];
  notes?: string;
  publishedAt?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

interface RawPortfolioDefinitionDetailResponse {
  portfolio: RawPortfolioDefinition;
  activeRevision?: RawPortfolioRevision | null;
  revisions?: RawPortfolioRevision[];
}

interface RawPortfolioAccount {
  accountId: string;
  name: string;
  description?: string;
  status: PortfolioStatus;
  mode: string;
  accountingDepth: string;
  cadenceMode: string;
  baseCurrency: string;
  benchmarkSymbol?: string | null;
  inceptionDate: string;
  mandate?: string;
  latestRevision?: number | null;
  activeRevision?: number | null;
  activePortfolioName?: string | null;
  activePortfolioVersion?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastMaterializedAt?: string | null;
  openAlertCount?: number;
}

interface RawPortfolioAccountListResponse {
  accounts: RawPortfolioAccount[];
}

interface RawPortfolioAssignment {
  assignmentId: string;
  accountId: string;
  accountVersion: number;
  portfolioName: string;
  portfolioVersion: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: 'scheduled' | 'active' | 'ended';
  notes?: string;
  createdAt?: string | null;
}

interface RawPortfolioLedgerEvent {
  eventId: string;
  accountId: string;
  effectiveAt: string;
  eventType: string;
  currency: string;
  cashAmount: number;
  symbol?: string | null;
  quantity?: number | null;
  price?: number | null;
  commission?: number | null;
  slippageCost?: number | null;
  description?: string;
}

interface RawPortfolioAccountDetailResponse {
  account: RawPortfolioAccount;
  revision?: {
    notes?: string;
  } | null;
  activeAssignment?: RawPortfolioAssignment | null;
  recentLedgerEvents: RawPortfolioLedgerEvent[];
}

interface RawFreshnessStatus {
  domain: string;
  state: 'fresh' | 'stale' | 'error' | 'missing';
  asOf?: string | null;
  checkedAt?: string | null;
  reason?: string;
}

interface RawStrategySliceAttribution {
  asOf: string;
  sleeveId: string;
  strategyName: string;
  strategyVersion: number;
  targetWeight: number;
  actualWeight: number;
  marketValue: number;
  grossExposure: number;
  netExposure: number;
  pnlContribution: number;
  returnContribution: number;
  drawdownContribution: number;
  turnover?: number | null;
  sinceInceptionReturn?: number | null;
}

interface RawPortfolioSnapshot {
  accountId: string;
  accountName: string;
  asOf: string;
  nav: number;
  cash: number;
  grossExposure: number;
  netExposure: number;
  sinceInceptionPnl: number;
  sinceInceptionReturn: number;
  currentDrawdown: number;
  maxDrawdown?: number | null;
  openAlertCount: number;
  activeAssignment?: RawPortfolioAssignment | null;
  freshness: RawFreshnessStatus[];
  slices: RawStrategySliceAttribution[];
}

interface RawPortfolioHistoryPoint {
  asOf: string;
  nav: number;
  cash: number;
  grossExposure: number;
  netExposure: number;
  periodPnl?: number | null;
  periodReturn?: number | null;
  cumulativePnl?: number | null;
  cumulativeReturn?: number | null;
  drawdown?: number | null;
  turnover?: number | null;
  costDragBps?: number | null;
}

interface RawPortfolioHistoryResponse {
  points: RawPortfolioHistoryPoint[];
  totalPoints: number;
  truncated: boolean;
}

interface RawPortfolioPositionContributor {
  sleeveId: string;
  strategyName: string;
  strategyVersion: number;
  quantity: number;
  marketValue: number;
  weight: number;
}

interface RawPortfolioPosition {
  asOf: string;
  symbol: string;
  quantity: number;
  marketValue: number;
  weight: number;
  averageCost?: number | null;
  lastPrice?: number | null;
  unrealizedPnl?: number | null;
  realizedPnl?: number | null;
  contributors: RawPortfolioPositionContributor[];
}

interface RawPortfolioPositionListResponse {
  positions: RawPortfolioPosition[];
  total: number;
  limit: number;
  offset: number;
}

interface RawPortfolioAlert {
  alertId: string;
  accountId: string;
  severity: PortfolioAlertSeverity;
  status: 'open' | 'acknowledged' | 'resolved';
  code: string;
  title: string;
  description?: string;
  detectedAt: string;
  asOf?: string | null;
}

interface RawPortfolioAlertListResponse {
  alerts: RawPortfolioAlert[];
  total: number;
  openCount: number;
}

interface RawRebalanceTradeProposal {
  sleeveId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  estimatedPrice: number;
  estimatedNotional: number;
  estimatedCommission: number;
  estimatedSlippageCost: number;
}

interface RawRebalanceProposal {
  proposalId: string;
  accountId: string;
  asOf: string;
  portfolioName: string;
  portfolioVersion: number;
  blocked: boolean;
  warnings: string[];
  blockedReasons: string[];
  estimatedCashImpact: number;
  estimatedTurnover: number;
  trades: RawRebalanceTradeProposal[];
}

interface RawMaterializationRow {
  accountId: string;
  status: string;
  claimToken?: string | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
  lastMaterializedAt?: string | null;
  lastSnapshotAsOf?: string | null;
  lastError?: string | null;
  updatedAt?: string | null;
}

interface RawMaterializationListResponse {
  rows: RawMaterializationRow[];
  count: number;
}

export type {
  PortfolioAlert,
  PortfolioAlertSeverity,
  PortfolioBuildListResponse,
  PortfolioBuildRunSummary,
  PortfolioBuildScope,
  PortfolioBuildStatus,
  PortfolioConfig,
  PortfolioDetail,
  PortfolioExecutionPolicy,
  PortfolioHealthTone,
  PortfolioMonitorSnapshot,
  PortfolioPreviewAllocation,
  PortfolioPreviewResponse,
  PortfolioPreviewSummary,
  PortfolioRebalanceCadence,
  PortfolioRiskLimits,
  PortfolioSleeveDefinition,
  PortfolioSleeveMonitorRow,
  PortfolioSleeveStatus,
  PortfolioStatus,
  PortfolioSummary,
  TriggerPortfolioBuildPayload,
  TriggerPortfolioBuildResponse
} from '@/types/portfolio';

function ratioToPct(value?: number | null): number {
  return Number((((value ?? 0) as number) * 100).toFixed(2));
}

function pctToRatio(value?: number | null): number {
  return Number((((value ?? 0) as number) / 100).toFixed(6));
}

function normalizeBenchmark(symbol?: string | null): string {
  return String(symbol || '').trim().toUpperCase() || 'Unassigned';
}

function toPortfolioName(detail: PortfolioDetail): string {
  return detail.portfolioName?.trim() || detail.name.trim();
}

function mapSleeveStatus(enabled: boolean): PortfolioSleeveStatus {
  return enabled ? 'active' : 'paused';
}

function deriveHealthTone(
  alerts: PortfolioAlert[],
  freshness: { state: string }[],
  hasSnapshot: boolean
): PortfolioHealthTone {
  if (alerts.some((alert) => alert.severity === 'critical')) {
    return 'critical';
  }
  if (freshness.some((item) => item.state === 'error')) {
    return 'critical';
  }
  if (!hasSnapshot) {
    return 'warning';
  }
  if (
    alerts.some((alert) => alert.severity === 'warning') ||
    freshness.some((item) => item.state === 'stale' || item.state === 'missing')
  ) {
    return 'warning';
  }
  return 'healthy';
}

function mapAllocationToSleeve(allocation: RawPortfolioAllocation): PortfolioSleeveDefinition {
  return {
    sleeveId: allocation.sleeveId,
    label: allocation.sleeveName || allocation.sleeveId,
    strategyName: allocation.strategy.strategyName,
    strategyVersion: allocation.strategy.strategyVersion,
    targetWeightPct: ratioToPct(allocation.targetWeight),
    minWeightPct: ratioToPct(allocation.minWeight ?? 0),
    maxWeightPct: ratioToPct(
      allocation.maxWeight ?? allocation.targetWeight ?? allocation.minWeight ?? 0
    ),
    rebalanceBandPct: 2,
    rebalancePriority: allocation.rebalancePriority ?? 0,
    expectedHoldings: 25,
    status: mapSleeveStatus(allocation.enabled),
    notes: allocation.notes || ''
  };
}

function mapSleeveToAllocation(sleeve: PortfolioSleeveDefinition): RawPortfolioAllocation {
  const boundedTarget = Math.max(0, Math.min(100, sleeve.targetWeightPct));
  const boundedMin = Math.max(0, Math.min(boundedTarget, sleeve.minWeightPct));
  const boundedMax = Math.max(boundedTarget, sleeve.maxWeightPct);
  return {
    sleeveId: sleeve.sleeveId.trim() || sleeve.label.trim() || `sleeve-${Date.now()}`,
    sleeveName: sleeve.label.trim(),
    strategy: {
      strategyName: sleeve.strategyName.trim(),
      strategyVersion: Math.max(1, Math.round(sleeve.strategyVersion || 1))
    },
    targetWeight: pctToRatio(boundedTarget),
    minWeight: pctToRatio(boundedMin),
    maxWeight: pctToRatio(Math.min(100, boundedMax)),
    enabled: sleeve.status !== 'paused',
    rebalancePriority: Math.max(0, Math.round(sleeve.rebalancePriority || 0)),
    notes: sleeve.notes?.trim() || ''
  };
}

function buildConfig(benchmarkSymbol: string, baseCurrency: string, sleeves: PortfolioSleeveDefinition[]): PortfolioConfig {
  const targetWeightPct = Number(
    sleeves.reduce((total, sleeve) => total + sleeve.targetWeightPct, 0).toFixed(2)
  );
  return {
    benchmarkSymbol,
    baseCurrency,
    rebalanceCadence: 'weekly',
    rebalanceAnchor: 'Strategy native cadence',
    targetGrossExposurePct: targetWeightPct,
    cashReservePct: Number(Math.max(0, 100 - targetWeightPct).toFixed(2)),
    maxNames: 60,
    sleeves,
    riskLimits: { ...DEFAULT_RISK_LIMITS },
    executionPolicy: { ...DEFAULT_EXECUTION_POLICY },
    overlays: { ...DEFAULT_OVERLAYS }
  };
}

function mapAssignment(assignment?: RawPortfolioAssignment | null): PortfolioDetail['activeAssignment'] {
  if (!assignment) {
    return null;
  }
  return {
    assignmentId: assignment.assignmentId,
    accountVersion: assignment.accountVersion,
    portfolioName: assignment.portfolioName,
    portfolioVersion: assignment.portfolioVersion,
    effectiveFrom: assignment.effectiveFrom,
    effectiveTo: assignment.effectiveTo,
    status: assignment.status,
    notes: assignment.notes || ''
  };
}

function mapLedgerEvent(event: RawPortfolioLedgerEvent): PortfolioLedgerEventRow {
  return {
    eventId: event.eventId,
    effectiveAt: event.effectiveAt,
    eventType: event.eventType,
    currency: event.currency,
    cashAmount: event.cashAmount,
    symbol: event.symbol,
    quantity: event.quantity,
    price: event.price,
    commission: event.commission,
    slippageCost: event.slippageCost,
    description: event.description || ''
  };
}

function mapAlert(alert: RawPortfolioAlert): PortfolioAlert {
  return {
    alertId: alert.alertId,
    severity: alert.severity,
    status: alert.status,
    code: alert.code,
    title: alert.title,
    message: alert.description || alert.code,
    observedAt: alert.detectedAt,
    asOfDate: alert.asOf
  };
}

function resolveOpeningCash(events: RawPortfolioLedgerEvent[]): number | null {
  const openingEvent = [...events]
    .sort((left, right) => Date.parse(left.effectiveAt) - Date.parse(right.effectiveAt))
    .find((event) => event.eventType === 'opening_balance');
  return openingEvent ? openingEvent.cashAmount : null;
}

function buildDetailFromResponses(
  accountDetail: RawPortfolioAccountDetailResponse,
  portfolioDetail?: RawPortfolioDefinitionDetailResponse | null,
  freshness: PortfolioDetail['freshness'] = []
): PortfolioDetail {
  const activeRevision = portfolioDetail?.activeRevision;
  const sleeves = (activeRevision?.allocations || []).map(mapAllocationToSleeve);
  const config = buildConfig(
    normalizeBenchmark(accountDetail.account.benchmarkSymbol ?? activeRevision?.benchmarkSymbol),
    accountDetail.account.baseCurrency,
    sleeves
  );
  const openingCash = resolveOpeningCash(accountDetail.recentLedgerEvents || []);

  return {
    accountId: accountDetail.account.accountId,
    portfolioName: activeRevision?.portfolioName || accountDetail.account.activePortfolioName || accountDetail.account.name,
    name: accountDetail.account.name,
    description: accountDetail.account.description || activeRevision?.description || '',
    mandate: accountDetail.account.mandate || '',
    status: accountDetail.account.status,
    version:
      accountDetail.account.activePortfolioVersion ||
      activeRevision?.version ||
      accountDetail.account.activeRevision ||
      accountDetail.account.latestRevision ||
      1,
    benchmarkSymbol: config.benchmarkSymbol,
    baseCurrency: config.baseCurrency,
    sleeveCount: sleeves.length,
    targetGrossExposurePct: config.targetGrossExposurePct,
    cashReservePct: config.cashReservePct,
    inceptionDate: accountDetail.account.inceptionDate,
    openingCash,
    buildStatus: accountDetail.account.lastMaterializedAt
      ? accountDetail.account.openAlertCount
        ? 'partial'
        : 'completed'
      : null,
    lastBuiltAt: accountDetail.account.lastMaterializedAt || null,
    updated_at: accountDetail.account.updatedAt || portfolioDetail?.portfolio.updatedAt || null,
    updated_by: activeRevision?.createdBy || null,
    openAlertCount: accountDetail.account.openAlertCount || 0,
    notes: activeRevision?.notes || accountDetail.revision?.notes || '',
    activeAssignment: mapAssignment(accountDetail.activeAssignment),
    recentLedgerEvents: (accountDetail.recentLedgerEvents || []).map(mapLedgerEvent),
    freshness,
    config
  };
}

async function requestOptional<T>(endpoint: string, init?: Parameters<typeof request<T>>[1]): Promise<T | null> {
  try {
    return await request<T>(endpoint, init);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function getAccountDirectory(signal?: AbortSignal): Promise<RawPortfolioAccount[]> {
  const response = await request<RawPortfolioAccountListResponse>('/portfolio-accounts', { signal });
  return response.accounts;
}

async function resolveAccount(identifier: string, signal?: AbortSignal): Promise<RawPortfolioAccount> {
  const accounts = await getAccountDirectory(signal);
  const normalized = identifier.trim().toLowerCase();
  const account = accounts.find(
    (candidate) =>
      candidate.accountId.toLowerCase() === normalized || candidate.name.toLowerCase() === normalized
  );
  if (!account) {
    throw new Error(`Portfolio account '${identifier}' not found.`);
  }
  return account;
}

async function getPortfolioDetailResponse(
  portfolioName?: string | null,
  signal?: AbortSignal
): Promise<RawPortfolioDefinitionDetailResponse | null> {
  const normalized = String(portfolioName || '').trim();
  if (!normalized) {
    return null;
  }
  return requestOptional<RawPortfolioDefinitionDetailResponse>(
    `/portfolios/${encodeURIComponent(normalized)}`,
    { signal }
  );
}

function buildSyntheticPreview(detail: PortfolioDetail, asOfDate: string): PortfolioPreviewResponse {
  const allocations: PortfolioPreviewAllocation[] = detail.config.sleeves.map((sleeve) => ({
    sleeveId: sleeve.sleeveId,
    label: sleeve.label,
    strategyName: sleeve.strategyName,
    strategyVersion: sleeve.strategyVersion,
    targetWeightPct: sleeve.targetWeightPct,
    projectedWeightPct: sleeve.targetWeightPct,
    projectedGrossExposurePct: sleeve.targetWeightPct,
    projectedTurnoverPct: 0,
    expectedHoldings: sleeve.expectedHoldings,
    status: sleeve.status
  }));

  const targetWeightPct = Number(
    allocations.reduce((total, allocation) => total + allocation.targetWeightPct, 0).toFixed(2)
  );
  const residualCashPct = Number(Math.max(0, 100 - targetWeightPct).toFixed(2));
  const warnings: string[] = [];

  if (!detail.mandate.trim()) {
    warnings.push('Mandate is blank; add an operator mandate before publishing the workspace.');
  }
  if (!detail.inceptionDate) {
    warnings.push('Inception date is missing.');
  }
  if (targetWeightPct > 100) {
    warnings.push('Sleeve weights exceed 100% and need to be reduced before publish.');
  }
  if (residualCashPct > 15) {
    warnings.push('Residual cash is materially above the current sleeve mix.');
  }
  if (detail.config.sleeves.some((sleeve) => !sleeve.strategyName.trim())) {
    warnings.push('Each sleeve must pin a strategy before publish.');
  }

  const projectedPositionCount = allocations.reduce(
    (total, allocation) => total + allocation.expectedHoldings,
    0
  );

  return {
    portfolioName: toPortfolioName(detail),
    asOfDate,
    summary: {
      targetWeightPct,
      residualCashPct,
      projectedGrossExposurePct: targetWeightPct,
      projectedNetExposurePct: targetWeightPct,
      projectedTurnoverPct: 0,
      projectedPositionCount
    },
    allocations,
    warnings,
    tradeProposals: [],
    previewSource: 'inferred',
    blocked: false,
    blockedReasons: []
  };
}

function buildPreviewFromProposal(
  proposal: RawRebalanceProposal,
  detail: PortfolioDetail
): PortfolioPreviewResponse {
  const fallback = buildSyntheticPreview(detail, proposal.asOf);
  return {
    portfolioName: proposal.portfolioName,
    asOfDate: proposal.asOf,
    summary: {
      targetWeightPct: fallback.summary.targetWeightPct,
      residualCashPct: fallback.summary.residualCashPct,
      projectedGrossExposurePct: fallback.summary.targetWeightPct,
      projectedNetExposurePct: fallback.summary.targetWeightPct,
      projectedTurnoverPct: ratioToPct(proposal.estimatedTurnover),
      projectedPositionCount: proposal.trades.length || fallback.summary.projectedPositionCount
    },
    allocations: fallback.allocations,
    warnings: [...proposal.warnings, ...proposal.blockedReasons],
    tradeProposals: proposal.trades.map((trade) => ({
      sleeveId: trade.sleeveId,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      estimatedPrice: trade.estimatedPrice,
      estimatedNotional: trade.estimatedNotional,
      estimatedCommission: trade.estimatedCommission,
      estimatedSlippageCost: trade.estimatedSlippageCost
    })),
    previewSource: 'live-proposal',
    blocked: proposal.blocked,
    blockedReasons: proposal.blockedReasons
  };
}

function mapMaterializationStatus(status: string): PortfolioBuildStatus {
  if (status === 'claimed' || status === 'running') {
    return 'running';
  }
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'dirty' || status === 'queued') {
    return 'queued';
  }
  return 'completed';
}

function buildFallbackRun(account: RawPortfolioAccount): PortfolioBuildRunSummary[] {
  if (!account.lastMaterializedAt) {
    return [];
  }
  return [
    {
      runId: `materialized-${account.accountId}`,
      portfolioName: account.activePortfolioName || account.name,
      accountId: account.accountId,
      status: account.openAlertCount ? 'partial' : 'completed',
      buildScope: 'materialization',
      triggeredBy: 'system',
      asOfDate: account.lastMaterializedAt.slice(0, 10),
      submittedAt: account.lastMaterializedAt,
      completedAt: account.lastMaterializedAt,
      error: null
    }
  ];
}

export const portfolioApi = {
  async listPortfolios(signal?: AbortSignal): Promise<PortfolioSummary[]> {
    const accounts = await getAccountDirectory(signal);
    const uniquePortfolioNames = [
      ...new Set(
        accounts
          .map((account) => String(account.activePortfolioName || '').trim())
          .filter((portfolioName) => Boolean(portfolioName))
      )
    ];
    const details = await Promise.all(
      uniquePortfolioNames.map(async (portfolioName) => [
        portfolioName,
        await getPortfolioDetailResponse(portfolioName, signal)
      ] as const)
    );
    const detailMap = new Map(details);

    return accounts.map((account) => {
      const portfolioDetail = detailMap.get(account.activePortfolioName || '') || null;
      const activeRevision = portfolioDetail?.activeRevision;
      const sleeveCount = activeRevision?.allocations?.length ?? 0;
      const targetWeightPct = Number(
        ((activeRevision?.allocations || []).reduce(
          (total, allocation) => total + ratioToPct(allocation.targetWeight),
          0
        )).toFixed(2)
      );
      return {
        accountId: account.accountId,
        portfolioName: account.activePortfolioName || account.name,
        name: account.name,
        description: account.description || portfolioDetail?.portfolio.description || '',
        mandate: account.mandate || '',
        status: account.status,
        version:
          account.activePortfolioVersion || account.activeRevision || account.latestRevision || 1,
        benchmarkSymbol: normalizeBenchmark(
          account.benchmarkSymbol ?? portfolioDetail?.portfolio.benchmarkSymbol
        ),
        baseCurrency: account.baseCurrency,
        sleeveCount,
        targetGrossExposurePct: targetWeightPct,
        cashReservePct: Number(Math.max(0, 100 - targetWeightPct).toFixed(2)),
        inceptionDate: account.inceptionDate,
        openingCash: null,
        lastBuiltAt: account.lastMaterializedAt || null,
        buildStatus: account.lastMaterializedAt
          ? account.openAlertCount
            ? 'partial'
            : 'completed'
          : null,
        updated_at: account.updatedAt || portfolioDetail?.portfolio.updatedAt || null,
        updated_by: activeRevision?.createdBy || null,
        openAlertCount: account.openAlertCount || 0
      };
    });
  },

  async getPortfolioDetail(identifier: string, signal?: AbortSignal): Promise<PortfolioDetail> {
    const account = await resolveAccount(identifier, signal);
    const accountDetail = await request<RawPortfolioAccountDetailResponse>(
      `/portfolio-accounts/${encodeURIComponent(account.accountId)}`,
      { signal }
    );
    const portfolioDetail = await getPortfolioDetailResponse(account.activePortfolioName, signal);
    return buildDetailFromResponses(accountDetail, portfolioDetail);
  },

  async previewPortfolio(
    payload: {
      portfolio: PortfolioDetail;
      asOfDate?: string;
    },
    signal?: AbortSignal
  ): Promise<PortfolioPreviewResponse> {
    const asOfDate = payload.asOfDate || new Date().toISOString().slice(0, 10);
    if (!payload.portfolio.accountId) {
      return buildSyntheticPreview(payload.portfolio, asOfDate);
    }

    try {
      const proposal = await request<RawRebalanceProposal>(
        `/portfolio-accounts/${encodeURIComponent(payload.portfolio.accountId)}/rebalances/preview`,
        {
          method: 'POST',
          body: JSON.stringify({
            asOf: asOfDate,
            notes: payload.portfolio.notes || ''
          }),
          signal
        }
      );
      return buildPreviewFromProposal(proposal, payload.portfolio);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return buildSyntheticPreview(payload.portfolio, asOfDate);
      }
      throw error;
    }
  },

  async savePortfolio(
    payload: PortfolioDetail,
    signal?: AbortSignal
  ): Promise<{ status: string; message: string; portfolio: PortfolioSummary }> {
    const portfolioName = toPortfolioName(payload);
    const allocations = payload.config.sleeves
      .filter((sleeve) => sleeve.strategyName.trim())
      .map(mapSleeveToAllocation);

    const portfolioResponse = await request<RawPortfolioDefinitionDetailResponse>('/portfolios', {
      method: 'POST',
      body: JSON.stringify({
        name: portfolioName,
        description: payload.description || '',
        benchmarkSymbol: payload.config.benchmarkSymbol || null,
        allocations,
        notes: payload.notes || ''
      }),
      signal
    });

    const accountPayload = {
      name: payload.name.trim() || portfolioName,
      description: payload.description || '',
      mandate: payload.mandate || '',
      baseCurrency: payload.config.baseCurrency || 'USD',
      benchmarkSymbol: payload.config.benchmarkSymbol || null,
      inceptionDate: payload.inceptionDate,
      openingCash: payload.accountId ? undefined : payload.openingCash ?? undefined,
      notes: payload.notes || ''
    };

    const accountResponse = payload.accountId
      ? await request<RawPortfolioAccountDetailResponse>(
          `/portfolio-accounts/${encodeURIComponent(payload.accountId)}`,
          {
            method: 'PUT',
            body: JSON.stringify(accountPayload),
            signal
          }
        )
      : await request<RawPortfolioAccountDetailResponse>('/portfolio-accounts', {
          method: 'POST',
          body: JSON.stringify(accountPayload),
          signal
        });

    await request<RawPortfolioAssignment>(
      `/portfolio-accounts/${encodeURIComponent(accountResponse.account.accountId)}/assignments`,
      {
        method: 'POST',
        body: JSON.stringify({
          accountVersion:
            accountResponse.account.activeRevision || accountResponse.account.latestRevision || 1,
          portfolioName: portfolioResponse.portfolio.name,
          portfolioVersion:
            portfolioResponse.portfolio.activeVersion ||
            portfolioResponse.portfolio.latestVersion ||
            1,
          effectiveFrom: payload.inceptionDate,
          notes: payload.notes || ''
        }),
        signal
      }
    );

    const hydrated = await portfolioApi.getPortfolioDetail(accountResponse.account.accountId, signal);
    return {
      status: 'ok',
      message: 'saved',
      portfolio: {
        ...hydrated,
        name: hydrated.name
      }
    };
  },

  async listBuildRuns(
    params: {
      portfolioName?: string;
      status?: PortfolioBuildRunSummary['status'];
      limit?: number;
      offset?: number;
    } = {},
    signal?: AbortSignal
  ): Promise<PortfolioBuildListResponse> {
    const limit = params.limit ?? 10;
    const offset = params.offset ?? 0;
    const accounts = await getAccountDirectory(signal);
    const scopedAccount = params.portfolioName
      ? accounts.find((account) => account.name === params.portfolioName)
      : undefined;

    const materializationState = await requestOptional<RawMaterializationListResponse>(
      '/internal/portfolio-materializations/stale',
      { signal }
    );

    let runs: PortfolioBuildRunSummary[] = [];
    if (materializationState?.rows?.length) {
      const rows = scopedAccount
        ? materializationState.rows.filter((row) => row.accountId === scopedAccount.accountId)
        : materializationState.rows;
      runs = rows.map((row) => {
        const account = accounts.find((candidate) => candidate.accountId === row.accountId);
        return {
          runId: row.claimToken || `materialization-${row.accountId}`,
          portfolioName: account?.activePortfolioName || account?.name || row.accountId,
          accountId: row.accountId,
          status: mapMaterializationStatus(row.status),
          buildScope: 'materialization',
          triggeredBy: row.claimedBy || 'system',
          asOfDate:
            row.lastSnapshotAsOf ||
            row.lastMaterializedAt?.slice(0, 10) ||
            row.updatedAt?.slice(0, 10) ||
            new Date().toISOString().slice(0, 10),
          submittedAt: row.claimedAt || row.updatedAt || row.lastMaterializedAt || new Date().toISOString(),
          completedAt: row.lastMaterializedAt || null,
          error: row.lastError || null
        };
      });
    } else if (scopedAccount) {
      runs = buildFallbackRun(scopedAccount);
    }

    if (params.status) {
      runs = runs.filter((run) => run.status === params.status);
    }

    runs.sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt));
    return {
      runs: runs.slice(offset, offset + limit),
      limit,
      offset,
      total: runs.length
    };
  },

  async getMonitorSnapshot(identifier: string, signal?: AbortSignal): Promise<PortfolioMonitorSnapshot> {
    const account = await resolveAccount(identifier, signal);
    const [accountDetail, portfolioDetail, snapshot, history, positions, alerts] = await Promise.all([
      request<RawPortfolioAccountDetailResponse>(
        `/portfolio-accounts/${encodeURIComponent(account.accountId)}`,
        { signal }
      ),
      getPortfolioDetailResponse(account.activePortfolioName, signal),
      requestOptional<RawPortfolioSnapshot>(
        `/portfolio-accounts/${encodeURIComponent(account.accountId)}/snapshot`,
        { signal }
      ),
      requestOptional<RawPortfolioHistoryResponse>(
        `/portfolio-accounts/${encodeURIComponent(account.accountId)}/history`,
        { params: { limit: 60 }, signal }
      ),
      requestOptional<RawPortfolioPositionListResponse>(
        `/portfolio-accounts/${encodeURIComponent(account.accountId)}/positions`,
        { params: { limit: 50, offset: 0 }, signal }
      ),
      requestOptional<RawPortfolioAlertListResponse>(
        `/portfolio-accounts/${encodeURIComponent(account.accountId)}/alerts`,
        { params: { includeResolved: false }, signal }
      )
    ]);

    const normalizedAlerts = (alerts?.alerts || []).map(mapAlert);
    const freshness = (snapshot?.freshness || []).map((item) => ({
      domain: item.domain,
      state: item.state,
      asOf: item.asOf || null,
      checkedAt: item.checkedAt || null,
      reason: item.reason || ''
    }));
    const detail = buildDetailFromResponses(accountDetail, portfolioDetail, freshness);
    const historyRows =
      history?.points.map((point) => ({
        asOfDate: point.asOf,
        nav: point.nav,
        cash: point.cash,
        grossExposurePct: ratioToPct(point.grossExposure),
        netExposurePct: ratioToPct(point.netExposure),
        periodPnl: point.periodPnl ?? null,
        periodReturnPct:
          point.periodReturn === undefined || point.periodReturn === null
            ? null
            : ratioToPct(point.periodReturn),
        cumulativePnl: point.cumulativePnl ?? null,
        cumulativeReturnPct:
          point.cumulativeReturn === undefined || point.cumulativeReturn === null
            ? null
            : ratioToPct(point.cumulativeReturn),
        drawdownPct:
          point.drawdown === undefined || point.drawdown === null ? null : ratioToPct(point.drawdown),
        turnoverPct:
          point.turnover === undefined || point.turnover === null ? null : ratioToPct(point.turnover),
        costDragBps: point.costDragBps ?? null
      })) || [];

    const positionRows: PortfolioPositionRow[] =
      positions?.positions.map((position) => ({
        asOfDate: position.asOf,
        symbol: position.symbol,
        quantity: position.quantity,
        marketValue: position.marketValue,
        weightPct: ratioToPct(position.weight),
        averageCost: position.averageCost ?? null,
        lastPrice: position.lastPrice ?? null,
        unrealizedPnl: position.unrealizedPnl ?? null,
        realizedPnl: position.realizedPnl ?? null,
        contributors: (position.contributors || []).map((contributor) => ({
          sleeveId: contributor.sleeveId,
          strategyName: contributor.strategyName,
          strategyVersion: contributor.strategyVersion,
          quantity: contributor.quantity,
          marketValue: contributor.marketValue,
          weightPct: ratioToPct(contributor.weight)
        }))
      })) || [];

    const allocationBySleeve = new Map(
      detail.config.sleeves.map((sleeve) => [sleeve.sleeveId, sleeve] as const)
    );
    const sliceRows: PortfolioSleeveMonitorRow[] = (snapshot?.slices || []).map((slice) => {
      const sleeve = allocationBySleeve.get(slice.sleeveId);
      const driftPct = Number(Math.abs(ratioToPct(slice.actualWeight - slice.targetWeight)).toFixed(2));
      return {
        sleeveId: slice.sleeveId,
        label: sleeve?.label || slice.sleeveId,
        strategyName: slice.strategyName,
        strategyVersion: slice.strategyVersion,
        targetWeightPct: ratioToPct(slice.targetWeight),
        liveWeightPct: ratioToPct(slice.actualWeight),
        driftPct,
        marketValue: slice.marketValue,
        returnContributionPct: ratioToPct(slice.returnContribution),
        status:
          driftPct >= detail.config.riskLimits.driftRebalanceThresholdPct
            ? 'warning'
            : 'healthy',
        lastSignalAt: slice.asOf
      };
    });

    const largestPositionPct = positionRows.length ? positionRows[0].weightPct : 0;
    const realizedTurnoverPct = historyRows.at(-1)?.turnoverPct || 0;
    const driftPct = sliceRows.reduce((max, sleeve) => Math.max(max, sleeve.driftPct), 0);
    const buildHealth = deriveHealthTone(normalizedAlerts, freshness, Boolean(snapshot));

    return {
      accountId: account.accountId,
      accountName: detail.name,
      portfolioName: detail.portfolioName,
      mandate: detail.mandate,
      benchmarkSymbol: detail.config.benchmarkSymbol,
      baseCurrency: detail.config.baseCurrency,
      asOfDate: snapshot?.asOf || historyRows.at(-1)?.asOfDate || detail.inceptionDate,
      activeVersion: detail.activeAssignment?.portfolioVersion || detail.version,
      buildHealth,
      buildWindowLabel: detail.activeAssignment
        ? `${detail.activeAssignment.portfolioName} v${detail.activeAssignment.portfolioVersion}`
        : 'No active assignment',
      nav: snapshot?.nav || detail.openingCash || 0,
      cash: snapshot?.cash || detail.openingCash || 0,
      cashPct:
        snapshot && snapshot.nav > 0
          ? Number(((snapshot.cash / snapshot.nav) * 100).toFixed(2))
          : detail.config.cashReservePct,
      grossExposurePct: ratioToPct(snapshot?.grossExposure || 0),
      netExposurePct: ratioToPct(snapshot?.netExposure || 0),
      sinceInceptionPnl: snapshot?.sinceInceptionPnl || 0,
      sinceInceptionReturnPct: ratioToPct(snapshot?.sinceInceptionReturn || 0),
      currentDrawdownPct: ratioToPct(snapshot?.currentDrawdown || 0),
      maxDrawdownPct:
        snapshot?.maxDrawdown === undefined || snapshot?.maxDrawdown === null
          ? null
          : ratioToPct(snapshot.maxDrawdown),
      largestPositionPct,
      realizedTurnoverPct,
      driftPct,
      alerts: normalizedAlerts,
      sleeves: sliceRows,
      positions: positionRows,
      history: historyRows,
      ledgerEvents: detail.recentLedgerEvents,
      freshness
    };
  },

  async triggerBuild(
    identifier: string,
    payload: TriggerPortfolioBuildPayload = {},
    signal?: AbortSignal
  ): Promise<TriggerPortfolioBuildResponse> {
    const account = await resolveAccount(identifier, signal);
    await request<{ status: string; accountIds: string[]; count: number }>(
      '/internal/portfolio-materializations/rebuild',
      {
        method: 'POST',
        body: JSON.stringify({
          accountId: account.accountId
        }),
        signal
      }
    );
    const submittedAt = new Date().toISOString();
    return {
      status: 'queued',
      message: payload.force ? 'Rebuild requested with force semantics.' : 'Rebuild requested.',
      run: {
        runId: `rebuild-${account.accountId}-${Date.now()}`,
        portfolioName: account.activePortfolioName || account.name,
        accountId: account.accountId,
        status: 'queued',
        buildScope: 'materialization',
        triggeredBy: 'operator',
        asOfDate: submittedAt.slice(0, 10),
        submittedAt
      }
    };
  }
};
