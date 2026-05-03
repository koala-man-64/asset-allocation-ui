import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cable, CheckCircle2, Plus, Search, ShieldAlert, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageLoader } from '@/app/components/common/PageLoader';
import { StatCard } from '@/app/components/common/StatCard';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/app/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Textarea } from '@/app/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { AccountConfigurationPanel } from '@/features/accounts/components/AccountConfigurationPanel';
import {
  accountMatchesBoardFilters,
  getAccountActionAvailability
} from '@/features/accounts/lib/accountMonitoring';
import type {
  AccountActionAvailability,
  AccountBoardScope,
  AccountMonitoringSnapshot,
  AccountStatusFilter,
  BrokerFilter
} from '@/features/accounts/lib/accountMonitoring';
import {
  accountAssignmentDetail,
  accountAssignmentTitle,
  alertToneClass,
  brokerAccentClass,
  compactMetricToneClass,
  formatCurrency,
  formatNumber,
  formatTimestamp,
  sortAccountsByPriority,
  statusBadgeVariant,
  tradeReadinessLabel
} from '@/features/accounts/lib/accountPresentation';
import {
  ActivityTimeline,
  BlotterTable,
  OrdersTable,
  PositionsTable
} from '@/features/trade-desk/tradeDeskComponents';
import {
  buildTradeDeskPath,
  buildTradeMonitorPath,
  environmentVariant,
  extractTradeDeskErrorMessage,
  readinessVariant,
  titleCase
} from '@/features/trade-desk/tradeDeskUtils';
import { accountOperationsApi, accountOperationsKeys } from '@/services/accountOperationsApi';
import { tradeDeskApi, tradeDeskKeys } from '@/services/tradeDeskApi';
import type {
  TradeAccountDetailView,
  TradeAccountSummaryView,
  TradeBlotterRow
} from '@/services/tradeDeskModels';
import type {
  BrokerAccountAlert,
  BrokerAccountConfiguration,
  BrokerAccountDetail,
  BrokerAccountExecutionPosture,
  BrokerAccountAllocationUpdateRequest,
  BrokerHealthTone,
  BrokerAccountOnboardingCandidate,
  BrokerAccountOnboardingEnvironment,
  BrokerAccountOnboardingResponse,
  BrokerAccountSummary,
  BrokerSyncStatus,
  BrokerSyncScope,
  BrokerTradeReadiness,
  BrokerTradingPolicyUpdateRequest,
  BrokerVendor
} from '@/types/brokerAccounts';
import type { TradeDataFreshness, TradeOrder, TradePosition } from '@asset-allocation/contracts';

type DetailTab = 'overview' | 'connectivity' | 'risk' | 'monitoring' | 'activity' | 'configuration';

type CapabilityQueryState = {
  detail: BrokerAccountDetail | null;
  loading: boolean;
  error: unknown;
};

type AccountActionDialogTarget =
  | { kind: 'refresh'; account: BrokerAccountSummary }
  | { kind: 'reconnect'; account: BrokerAccountSummary }
  | { kind: 'pause_sync'; account: BrokerAccountSummary }
  | { kind: 'resume_sync'; account: BrokerAccountSummary }
  | { kind: 'acknowledge_alert'; account: BrokerAccountSummary; alert: BrokerAccountAlert };

type AccountActionDialogPayload = {
  reason: string;
  scope: BrokerSyncScope;
};

type OnboardingStep = 'provider' | 'candidates' | 'setup' | 'review';

type AccountMonitoringData = {
  tradeAccount: TradeAccountSummaryView | null;
  tradeAccountsError: unknown;
  tradeDetail: TradeAccountDetailView | null;
  tradeDetailLoading: boolean;
  tradeDetailError: unknown;
  positions: readonly TradePosition[];
  positionsFreshness: TradeDataFreshness | null;
  positionsLoading: boolean;
  positionsError: unknown;
  orders: readonly TradeOrder[];
  ordersLoading: boolean;
  ordersError: unknown;
  history: readonly TradeOrder[];
  historyLoading: boolean;
  historyError: unknown;
  blotterRows: readonly TradeBlotterRow[];
  blotterLoading: boolean;
  blotterError: unknown;
};

const EMPTY_ACCOUNTS: readonly BrokerAccountSummary[] = [];
const EMPTY_TRADE_ACCOUNTS: readonly TradeAccountSummaryView[] = [];
const EMPTY_POSITIONS: readonly TradePosition[] = [];
const EMPTY_ORDERS: readonly TradeOrder[] = [];
const EMPTY_BLOTTER_ROWS: readonly TradeBlotterRow[] = [];

function tradeSyncStatus(account: TradeAccountSummaryView): BrokerSyncStatus {
  const states = [
    account.freshness.balancesState,
    account.freshness.positionsState,
    account.freshness.ordersState
  ];

  if (states.every((state) => state === 'fresh')) {
    return 'fresh';
  }

  if (states.some((state) => state === 'stale')) {
    return 'stale';
  }

  return 'never_synced';
}

function tradeOverallStatus(
  account: TradeAccountSummaryView,
  syncStatus: BrokerSyncStatus
): BrokerHealthTone {
  if (
    account.readiness === 'blocked' ||
    account.killSwitchActive ||
    !account.capabilities.canReadAccount
  ) {
    return 'critical';
  }

  if (
    account.readiness === 'review' ||
    account.capabilities.readOnly ||
    syncStatus !== 'fresh' ||
    account.unresolvedAlertCount > 0
  ) {
    return 'warning';
  }

  return 'healthy';
}

function tradeConnectionHealth(
  account: TradeAccountSummaryView,
  syncStatus: BrokerSyncStatus,
  overallStatus: BrokerHealthTone
): BrokerAccountSummary['connectionHealth'] {
  const canReadAccount = account.capabilities.canReadAccount;
  const lastObservedAt = account.snapshotAsOf ?? account.lastSyncedAt ?? null;
  const failureMessage = !canReadAccount
    ? account.capabilities.unsupportedReason ||
      account.readinessReason ||
      'Trade account cannot be read.'
    : account.readiness === 'blocked' || account.killSwitchActive
      ? account.readinessReason || 'Account trading is blocked.'
      : null;

  return {
    overallStatus,
    authStatus: canReadAccount ? 'authenticated' : 'not_connected',
    connectionState: !canReadAccount
      ? 'disconnected'
      : syncStatus === 'fresh'
        ? 'connected'
        : 'degraded',
    syncStatus,
    lastCheckedAt: lastObservedAt,
    lastSuccessfulSyncAt:
      syncStatus === 'fresh' || syncStatus === 'stale' ? account.lastSyncedAt ?? null : null,
    lastFailedSyncAt: null,
    authExpiresAt: null,
    staleReason: syncStatus === 'stale' ? account.freshness.staleReason ?? null : null,
    failureMessage,
    syncPaused: false
  };
}

function brokerSummaryFromTradeAccount(account: TradeAccountSummaryView): BrokerAccountSummary {
  const syncStatus = tradeSyncStatus(account);
  const overallStatus = tradeOverallStatus(account, syncStatus);

  return {
    accountId: account.accountId,
    broker: account.provider,
    name: account.name,
    accountNumberMasked: account.accountNumberMasked,
    baseCurrency: account.baseCurrency,
    overallStatus,
    tradeReadiness: account.readiness,
    tradeReadinessReason: account.readinessReason,
    highestAlertSeverity: account.unresolvedAlertCount > 0 ? 'warning' : null,
    connectionHealth: tradeConnectionHealth(account, syncStatus, overallStatus),
    equity: account.equity,
    cash: account.cash,
    buyingPower: account.buyingPower,
    openPositionCount: account.positionCount,
    openOrderCount: account.openOrderCount,
    lastSyncedAt: account.lastSyncedAt,
    snapshotAsOf: account.snapshotAsOf,
    activePortfolioName: null,
    strategyLabel: null,
    configurationVersion: account.policyVersion ?? null,
    allocationSummary: null,
    alertCount: account.unresolvedAlertCount
  };
}

function populateExistingTradeAccounts(
  brokerAccounts: readonly BrokerAccountSummary[],
  tradeAccounts: readonly TradeAccountSummaryView[]
): readonly BrokerAccountSummary[] {
  if (!tradeAccounts.length) {
    return brokerAccounts;
  }

  const knownAccountIds = new Set(brokerAccounts.map((account) => account.accountId));
  const missingBrokerAccounts = tradeAccounts
    .filter((account) => !knownAccountIds.has(account.accountId))
    .map(brokerSummaryFromTradeAccount);

  return missingBrokerAccounts.length
    ? [...brokerAccounts, ...missingBrokerAccounts]
    : brokerAccounts;
}

const ACTION_REASON_PRESETS: Record<AccountActionDialogTarget['kind'], string[]> = {
  refresh: [
    'Refresh requested before rebalance review.',
    'Refresh requested after broker sync warning.',
    'Refresh requested for stale account snapshot.'
  ],
  reconnect: [
    'Reconnect requested after broker session expiry.',
    'Reconnect requested before execution window.',
    'Reconnect requested after authentication warning.'
  ],
  pause_sync: [
    'Sync paused while account exception is investigated.',
    'Sync paused during broker maintenance window.',
    'Sync paused to prevent stale data overwrite.'
  ],
  resume_sync: [
    'Sync resumed after exception review.',
    'Sync resumed after broker maintenance cleared.',
    'Sync resumed for normal monitoring.'
  ],
  acknowledge_alert: [
    'Acknowledged for active desk review.',
    'Acknowledged after operator triage.',
    'Acknowledged pending broker follow-up.'
  ]
};

const ONBOARDING_PROVIDERS: Array<{ value: BrokerVendor; label: string }> = [
  { value: 'alpaca', label: 'Alpaca' },
  { value: 'etrade', label: 'E*TRADE' },
  { value: 'schwab', label: 'Schwab' }
];

const ONBOARDING_ENVIRONMENTS: Array<{
  value: BrokerAccountOnboardingEnvironment;
  label: string;
}> = [
  { value: 'paper', label: 'Paper' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'live', label: 'Live' }
];

const ONBOARDING_POSTURES: Array<{
  value: BrokerAccountExecutionPosture;
  label: string;
  detail: string;
}> = [
  {
    value: 'monitor_only',
    label: 'Monitor only',
    detail: 'Read-only monitoring, no preview, submit, or cancel.'
  },
  {
    value: 'paper',
    label: 'Paper',
    detail: 'Paper execution posture for paper broker environments.'
  },
  {
    value: 'sandbox',
    label: 'Sandbox',
    detail: 'Sandbox execution posture for broker sandbox environments.'
  },
  {
    value: 'live',
    label: 'Live',
    detail: 'Live execution posture after backend live gates pass.'
  }
];

function brokerLabel(broker: BrokerVendor): string {
  if (broker === 'alpaca') {
    return 'Alpaca';
  }

  if (broker === 'schwab') {
    return 'Schwab';
  }

  return 'E*TRADE';
}

function pnlClassName(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return 'text-foreground';
  }
  return value > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive';
}

function buildVerdict(snapshots: readonly AccountMonitoringSnapshot[]): {
  title: string;
  summary: string;
} {
  const criticalCount = snapshots.filter(
    ({ account, tradeAccount }) =>
      account.overallStatus === 'critical' ||
      account.tradeReadiness === 'blocked' ||
      tradeAccount?.readiness === 'blocked' ||
      tradeAccount?.killSwitchActive
  ).length;
  const needsActionCount = snapshots.filter(
    ({ account, tradeAccount }) =>
      account.overallStatus !== 'healthy' ||
      account.tradeReadiness !== 'ready' ||
      tradeAccount?.readiness !== 'ready' ||
      Boolean(tradeAccount?.capabilities.readOnly) ||
      (tradeAccount?.unresolvedAlertCount ?? 0) > 0
  ).length;

  if (criticalCount > 0) {
    return {
      title: 'Broker posture is offside.',
      summary:
        'At least one account is carrying a hard operational blocker. Reconnect or refresh the affected brokers before treating buying power as actionable.'
    };
  }

  if (needsActionCount > 0) {
    return {
      title: 'Broker posture is tradable, but not clean.',
      summary:
        'The board is usable, but stale sync state, review flags, or muted permissions are already creating execution drag. Clean the exceptions before the next rebalance window.'
    };
  }

  return {
    title: 'Broker posture is orderly.',
    summary:
      'Connectivity, sync freshness, and trade readiness are aligned across the configured accounts. The page can stay in scan mode instead of triage mode.'
  };
}

function freshnessLabel(state?: string | null): string {
  return state ? titleCase(state) : 'Not available';
}

function AccountActionButton({
  label,
  availability,
  onClick,
  variant = 'outline'
}: {
  label: string;
  availability?: AccountActionAvailability;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}) {
  const disabled = availability ? !availability.allowed : false;

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={disabled}
      title={availability?.reason ?? undefined}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function AccountCard({
  snapshot,
  capabilityState,
  onOpenDetail,
  onRefresh,
  onReconnect,
  onTogglePause,
  busy
}: {
  snapshot: AccountMonitoringSnapshot;
  capabilityState: CapabilityQueryState;
  onOpenDetail: () => void;
  onRefresh: () => void;
  onReconnect: () => void;
  onTogglePause: () => void;
  busy: boolean;
}) {
  const { account, tradeAccount } = snapshot;
  const capabilities = capabilityState.detail?.capabilities ?? null;
  const pauseAction = account.connectionHealth.syncPaused ? 'resume_sync' : 'pause_sync';
  const pauseLabel = account.connectionHealth.syncPaused ? 'Resume Sync' : 'Pause Sync';
  const capabilityInput = {
    account,
    capabilities,
    capabilitiesLoading: capabilityState.loading,
    capabilitiesError: capabilityState.error,
    busy
  };
  const refreshAvailability = getAccountActionAvailability({
    ...capabilityInput,
    action: 'refresh'
  });
  const pauseAvailability = getAccountActionAvailability({
    ...capabilityInput,
    action: pauseAction
  });
  const reconnectAvailability = getAccountActionAvailability({
    ...capabilityInput,
    action: 'reconnect'
  });
  const freshness = tradeAccount?.freshness;

  return (
    <article
      className={`rounded-[1.8rem] border-l-[10px] border border-mcm-walnut/20 p-5 shadow-sm ${brokerAccentClass(
        account.broker
      )}`}
      data-testid={`account-card-${account.accountId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{brokerLabel(account.broker)}</Badge>
            <Badge variant={statusBadgeVariant(account.overallStatus)}>
              {account.overallStatus.toUpperCase()}
            </Badge>
            <Badge variant={statusBadgeVariant(account.tradeReadiness)}>
              {tradeReadinessLabel(account.tradeReadiness)}
            </Badge>
            {tradeAccount ? (
              <>
                <Badge variant={environmentVariant(tradeAccount.environment)}>
                  {tradeAccount.environment.toUpperCase()}
                </Badge>
                <Badge variant={readinessVariant(tradeAccount.readiness)}>
                  {titleCase(tradeAccount.readiness)}
                </Badge>
              </>
            ) : (
              <Badge variant="outline">Trade monitor unavailable</Badge>
            )}
            {tradeAccount?.killSwitchActive ? (
              <Badge variant="destructive">Kill switch</Badge>
            ) : null}
            {tradeAccount?.capabilities.readOnly ? (
              <Badge variant="secondary">Read only</Badge>
            ) : null}
            {account.accountNumberMasked ? (
              <Badge variant="secondary">{account.accountNumberMasked}</Badge>
            ) : null}
          </div>
          <div>
            <h3 className="font-display text-xl text-foreground">{account.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {accountAssignmentTitle(account)} | {accountAssignmentDetail(account)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <AccountActionButton label="Open Dossier" variant="secondary" onClick={onOpenDetail} />
          <AccountActionButton
            label="Refresh Now"
            availability={refreshAvailability}
            onClick={onRefresh}
          />
          <AccountActionButton
            label={pauseLabel}
            availability={pauseAvailability}
            onClick={onTogglePause}
          />
          <AccountActionButton
            label="Reconnect"
            availability={reconnectAvailability}
            onClick={onReconnect}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        <div
          className={`rounded-[1.2rem] border p-3 ${compactMetricToneClass(account.overallStatus)}`}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Buying Power
          </div>
          <div className="mt-2 font-display text-2xl text-foreground">
            {formatCurrency(account.buyingPower, account.baseCurrency)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Equity {formatCurrency(account.equity, account.baseCurrency)} | Cash{' '}
            {formatCurrency(account.cash, account.baseCurrency)}
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-mcm-walnut/18 bg-mcm-paper/85 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Sync Health
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(account.connectionHealth.syncStatus)}>
              {account.connectionHealth.syncStatus}
            </Badge>
            <Badge variant={statusBadgeVariant(account.connectionHealth.connectionState)}>
              {account.connectionHealth.connectionState}
            </Badge>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {account.connectionHealth.staleReason ||
              account.connectionHealth.failureMessage ||
              'No connectivity exception is currently flagged.'}
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-mcm-walnut/18 bg-mcm-paper/85 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            P&amp;L / Exposure
          </div>
          <div className={`mt-2 font-display text-2xl ${pnlClassName(tradeAccount?.pnl?.dayPnl)}`}>
            {formatCurrency(tradeAccount?.pnl?.dayPnl, account.baseCurrency)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Gross {formatCurrency(tradeAccount?.pnl?.grossExposure, account.baseCurrency)} | Net{' '}
            {formatCurrency(tradeAccount?.pnl?.netExposure, account.baseCurrency)}
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-mcm-walnut/18 bg-mcm-paper/85 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Inventory / Freshness
          </div>
          <div className="mt-2 font-display text-2xl text-foreground">
            {formatNumber(tradeAccount?.positionCount ?? account.openPositionCount)} positions
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {formatNumber(tradeAccount?.openOrderCount ?? account.openOrderCount)} open orders |
            Orders {freshnessLabel(freshness?.ordersState)}
          </div>
        </div>
      </div>
    </article>
  );
}

function DetailSection({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/80 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-medium text-foreground">{value}</div>
      {detail ? <div className="mt-1 text-sm text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function AccountBoardControls({
  searchTerm,
  brokerFilter,
  statusFilter,
  scope,
  brokers,
  onSearchTermChange,
  onBrokerFilterChange,
  onStatusFilterChange,
  onScopeChange
}: {
  searchTerm: string;
  brokerFilter: BrokerFilter;
  statusFilter: AccountStatusFilter;
  scope: AccountBoardScope;
  brokers: readonly BrokerVendor[];
  onSearchTermChange: (value: string) => void;
  onBrokerFilterChange: (value: BrokerFilter) => void;
  onStatusFilterChange: (value: AccountStatusFilter) => void;
  onScopeChange: (value: AccountBoardScope) => void;
}) {
  const scopeOptions: Array<{ value: AccountBoardScope; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'needs_action', label: 'Needs action' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'disconnected', label: 'Disconnected' },
    { value: 'paused', label: 'Paused' },
    { value: 'live', label: 'Live' },
    { value: 'paper', label: 'Paper' }
  ];

  return (
    <div className="mt-5 space-y-4 rounded-[1.4rem] border border-mcm-walnut/15 bg-mcm-cream/50 p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_13rem_13rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Account search"
            value={searchTerm}
            placeholder="Search account, broker, portfolio, symbol, freshness"
            className="pl-9"
            onChange={(event) => onSearchTermChange(event.target.value)}
          />
        </div>

        <Select
          value={brokerFilter}
          onValueChange={(value) => onBrokerFilterChange(value as BrokerFilter)}
        >
          <SelectTrigger aria-label="Broker filter">
            <SelectValue placeholder="All Brokers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brokers</SelectItem>
            {brokers.map((broker) => (
              <SelectItem key={broker} value={broker}>
                {brokerLabel(broker)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => onStatusFilterChange(value as AccountStatusFilter)}
        >
          <SelectTrigger aria-label="Status filter">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="ready">Trade Ready</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ToggleGroup
        type="single"
        value={scope}
        className="flex w-full flex-wrap items-center justify-start gap-2"
        aria-label="Account scope"
        onValueChange={(value) => {
          if (value) {
            onScopeChange(value as AccountBoardScope);
          }
        }}
      >
        {scopeOptions.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className="h-8 flex-none rounded-full border border-mcm-walnut/15 bg-mcm-paper/45 px-3 text-[11px] leading-none tracking-[0.12em] first:rounded-full last:rounded-full data-[state=on]:border-mcm-teal/30 data-[state=on]:bg-accent"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function actionDialogTitle(target: AccountActionDialogTarget): string {
  if (target.kind === 'refresh') return `Refresh ${target.account.name}`;
  if (target.kind === 'reconnect') return `Reconnect ${target.account.name}`;
  if (target.kind === 'pause_sync') return `Pause sync for ${target.account.name}`;
  if (target.kind === 'resume_sync') return `Resume sync for ${target.account.name}`;
  return `Acknowledge ${target.alert.title}`;
}

function actionDialogSubmitLabel(target: AccountActionDialogTarget): string {
  if (target.kind === 'refresh') return 'Queue Refresh';
  if (target.kind === 'reconnect') return 'Submit Reconnect';
  if (target.kind === 'pause_sync') return 'Pause Sync';
  if (target.kind === 'resume_sync') return 'Resume Sync';
  return 'Acknowledge Alert';
}

function AccountActionDialog({
  target,
  submitting,
  onCancel,
  onSubmit
}: {
  target: AccountActionDialogTarget | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: AccountActionDialogPayload) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<BrokerSyncScope>('full');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const targetKey = target
    ? `${target.kind}:${target.account.accountId}:${
        target.kind === 'acknowledge_alert' ? target.alert.alertId : 'account'
      }`
    : 'none';

  useEffect(() => {
    setReason('');
    setScope('full');
    setReasonError(null);
  }, [targetKey]);

  if (!target) {
    return null;
  }

  const presets = ACTION_REASON_PRESETS[target.kind];
  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= 5;

  const handleSubmit = async () => {
    if (!reasonValid) {
      setReasonError('Enter an operator reason with at least 5 characters.');
      return;
    }
    await onSubmit({ reason: trimmedReason, scope });
  };

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onCancel();
        }
      }}
    >
      <DialogContent className="border-2 border-mcm-walnut bg-mcm-paper sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{actionDialogTitle(target)}</DialogTitle>
          <DialogDescription>
            Operator actions are audited. Confirm the account, reason, and scope before sending the
            request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-cream/55 p-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Account
              </div>
              <div className="mt-1 font-medium text-foreground">{target.account.name}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Broker
              </div>
              <div className="mt-1 font-medium text-foreground">
                {brokerLabel(target.account.broker)}
              </div>
            </div>
          </div>

          {target.kind === 'refresh' ? (
            <div className="space-y-2">
              <label
                htmlFor="account-action-refresh-scope"
                className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground"
              >
                Refresh Scope
              </label>
              <Select value={scope} onValueChange={(value) => setScope(value as BrokerSyncScope)}>
                <SelectTrigger id="account-action-refresh-scope">
                  <SelectValue placeholder="Refresh scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balances">Balances</SelectItem>
                  <SelectItem value="positions">Positions</SelectItem>
                  <SelectItem value="orders">Orders</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Quick Reasons
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={reason === preset ? 'secondary' : 'outline'}
                  onClick={() => {
                    setReason(preset);
                    setReasonError(null);
                  }}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="account-action-reason"
              className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground"
            >
              {target.kind === 'acknowledge_alert' ? 'Acknowledgement Note' : 'Operator Reason'}
            </label>
            <Textarea
              id="account-action-reason"
              value={reason}
              placeholder="Describe the operational reason for this action."
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim().length >= 5) {
                  setReasonError(null);
                }
              }}
            />
            {reasonError ? <p className="text-sm text-destructive">{reasonError}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting || !reasonValid} onClick={handleSubmit}>
            {actionDialogSubmitLabel(target)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function onboardingStepIndex(step: OnboardingStep): number {
  return {
    provider: 1,
    candidates: 2,
    setup: 3,
    review: 4
  }[step];
}

function candidateStateVariant(candidate: BrokerAccountOnboardingCandidate) {
  if (candidate.state === 'available' || candidate.state === 'disabled') {
    return 'default';
  }
  if (candidate.state === 'blocked' || candidate.state === 'already_configured') {
    return 'destructive';
  }
  return 'secondary';
}

function AccountOnboardingDialog({
  open,
  onOpenChange,
  onSuccess
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (response: BrokerAccountOnboardingResponse) => Promise<void>;
}) {
  const [step, setStep] = useState<OnboardingStep>('provider');
  const [provider, setProvider] = useState<BrokerVendor>('alpaca');
  const [environment, setEnvironment] = useState<BrokerAccountOnboardingEnvironment>('paper');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [readiness, setReadiness] = useState<BrokerTradeReadiness>('review');
  const [executionPosture, setExecutionPosture] =
    useState<BrokerAccountExecutionPosture>('monitor_only');
  const [initialRefresh, setInitialRefresh] = useState(true);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('provider');
      setProvider('alpaca');
      setEnvironment('paper');
      setSelectedCandidateId(null);
      setDisplayName('');
      setReadiness('review');
      setExecutionPosture('monitor_only');
      setInitialRefresh(true);
      setReason('');
      setReasonError(null);
    }
  }, [open]);

  const candidatesQuery = useQuery({
    queryKey: accountOperationsKeys.onboardingCandidates(provider, environment),
    queryFn: ({ signal }) =>
      accountOperationsApi.listOnboardingCandidates(provider, environment, signal),
    enabled: open && step !== 'provider',
    staleTime: 5000
  });

  const candidates = candidatesQuery.data?.candidates ?? [];
  const selectedCandidate =
    candidates.find((candidate) => candidate.candidateId === selectedCandidateId) ?? null;

  const onboardMutation = useMutation({
    mutationFn: (payload: {
      candidate: BrokerAccountOnboardingCandidate;
      displayName: string;
      readiness: BrokerTradeReadiness;
      executionPosture: BrokerAccountExecutionPosture;
      initialRefresh: boolean;
      reason: string;
    }) =>
      accountOperationsApi.onboardAccount({
        candidateId: payload.candidate.candidateId,
        provider: payload.candidate.provider,
        environment: payload.candidate.environment,
        displayName: payload.displayName,
        readiness: payload.readiness,
        executionPosture: payload.executionPosture,
        initialRefresh: payload.initialRefresh,
        reason: payload.reason
      }),
    onSuccess: async (response) => {
      await onSuccess(response);
      toast.success(response.reenabled ? 'Account re-enabled.' : 'Account onboarded.');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to onboard account: ${String(error)}`);
    }
  });

  const selectCandidate = (candidate: BrokerAccountOnboardingCandidate) => {
    if (!candidate.canOnboard) {
      return;
    }
    setSelectedCandidateId(candidate.candidateId);
    setDisplayName(candidate.displayName);
    setReadiness('review');
    setExecutionPosture('monitor_only');
    setStep('setup');
  };

  const goBack = () => {
    if (step === 'review') {
      setStep('setup');
    } else if (step === 'setup') {
      setStep('candidates');
    } else if (step === 'candidates') {
      setStep('provider');
    }
  };

  const submit = async () => {
    if (!selectedCandidate) {
      return;
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setReasonError('Enter an operator reason with at least 5 characters.');
      return;
    }
    await onboardMutation.mutateAsync({
      candidate: selectedCandidate,
      displayName: displayName.trim(),
      readiness,
      executionPosture,
      initialRefresh,
      reason: trimmedReason
    });
  };

  const primaryDisabled =
    onboardMutation.isPending ||
    (step === 'candidates' && (!selectedCandidate || !selectedCandidate.canOnboard)) ||
    (step === 'setup' &&
      (!selectedCandidate ||
        !displayName.trim() ||
        !selectedCandidate.allowedExecutionPostures.includes(executionPosture))) ||
    (step === 'review' && reason.trim().length < 5);

  const primaryLabel =
    step === 'provider'
      ? 'Discover Accounts'
      : step === 'candidates'
        ? 'Continue'
        : step === 'setup'
          ? 'Review'
          : 'Onboard Account';

  const handlePrimary = async () => {
    if (step === 'provider') {
      setSelectedCandidateId(null);
      setStep('candidates');
      return;
    }
    if (step === 'candidates') {
      if (selectedCandidate?.canOnboard) {
        setStep('setup');
      }
      return;
    }
    if (step === 'setup') {
      setStep('review');
      return;
    }
    await submit();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && onboardMutation.isPending) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto border-2 border-mcm-walnut bg-mcm-paper sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add Account</DialogTitle>
          <DialogDescription>
            Discover broker accounts, choose an initial control posture, and seed account
            monitoring without manual database changes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {(['provider', 'candidates', 'setup', 'review'] as OnboardingStep[]).map((item) => (
            <Badge key={item} variant={item === step ? 'default' : 'outline'}>
              {onboardingStepIndex(item)}. {titleCase(item)}
            </Badge>
          ))}
        </div>

        {step === 'provider' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="onboarding-provider"
                className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground"
              >
                Provider
              </label>
              <Select value={provider} onValueChange={(value) => setProvider(value as BrokerVendor)}>
                <SelectTrigger id="onboarding-provider">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {ONBOARDING_PROVIDERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="onboarding-environment"
                className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground"
              >
                Environment
              </label>
              <Select
                value={environment}
                onValueChange={(value) =>
                  setEnvironment(value as BrokerAccountOnboardingEnvironment)
                }
              >
                <SelectTrigger id="onboarding-environment">
                  <SelectValue placeholder="Environment" />
                </SelectTrigger>
                <SelectContent>
                  {ONBOARDING_ENVIRONMENTS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {step === 'candidates' ? (
          <div className="space-y-4">
            {candidatesQuery.isLoading ? (
              <PageLoader variant="panel" text="Discovering broker accounts..." />
            ) : candidatesQuery.error ? (
              <StatePanel
                tone="error"
                title="Discovery failed"
                message={String(candidatesQuery.error)}
              />
            ) : candidatesQuery.data?.discoveryStatus !== 'completed' ? (
              <StatePanel
                tone="warning"
                title="Provider prerequisite missing"
                message={
                  candidatesQuery.data?.message ||
                  'The selected provider is not connected or configured for discovery.'
                }
                action={
                  <Button asChild variant="outline">
                    <Link to="/runtime-config">Runtime Config</Link>
                  </Button>
                }
              />
            ) : candidates.length === 0 ? (
              <StatePanel
                tone="empty"
                title="No broker accounts discovered"
                message="The provider returned no account candidates for the selected environment."
              />
            ) : (
              <div className="grid gap-3">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.candidateId}
                    type="button"
                    disabled={!candidate.canOnboard}
                    className={`rounded-[1.2rem] border p-4 text-left transition ${
                      selectedCandidateId === candidate.candidateId
                        ? 'border-mcm-teal bg-mcm-teal/10'
                        : 'border-mcm-walnut/18 bg-mcm-cream/55'
                    } ${candidate.canOnboard ? 'hover:border-mcm-teal' : 'cursor-not-allowed opacity-75'}`}
                    onClick={() => {
                      setSelectedCandidateId(candidate.candidateId);
                      if (candidate.canOnboard) {
                        setDisplayName(candidate.displayName);
                        setExecutionPosture('monitor_only');
                      }
                    }}
                    onDoubleClick={() => selectCandidate(candidate)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">{candidate.displayName}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {candidate.suggestedAccountId} | {candidate.accountNumberMasked || 'masked id unavailable'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{brokerLabel(candidate.provider)}</Badge>
                        <Badge variant={environmentVariant(candidate.environment)}>
                          {candidate.environment.toUpperCase()}
                        </Badge>
                        <Badge variant={candidateStateVariant(candidate)}>{candidate.state}</Badge>
                      </div>
                    </div>
                    {candidate.stateReason ? (
                      <div className="mt-3 text-sm text-muted-foreground">
                        {candidate.stateReason}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidate.allowedExecutionPostures.map((posture) => (
                        <Badge key={posture} variant="secondary">
                          {titleCase(posture)}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {step === 'setup' && selectedCandidate ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-cream/55 p-4 text-sm md:grid-cols-3">
              <DetailSection label="Candidate" value={selectedCandidate.suggestedAccountId} />
              <DetailSection
                label="Broker"
                value={`${brokerLabel(selectedCandidate.provider)} / ${selectedCandidate.environment.toUpperCase()}`}
              />
              <DetailSection
                label="Identifier"
                value={selectedCandidate.accountNumberMasked || 'Masked id unavailable'}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="onboarding-display-name"
                  className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground"
                >
                  Display Name
                </label>
                <Input
                  id="onboarding-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="onboarding-readiness"
                  className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground"
                >
                  Initial Readiness
                </label>
                <Select
                  value={readiness}
                  onValueChange={(value) => setReadiness(value as BrokerTradeReadiness)}
                >
                  <SelectTrigger id="onboarding-readiness">
                    <SelectValue placeholder="Initial readiness" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Execution Posture
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {ONBOARDING_POSTURES.map((posture) => {
                  const allowed = selectedCandidate.allowedExecutionPostures.includes(posture.value);
                  const reason = selectedCandidate.blockedExecutionPostureReasons[posture.value];
                  const postureDescription = allowed
                    ? posture.detail
                    : reason || 'Unavailable for this candidate.';
                  return (
                    <Button
                      key={posture.value}
                      type="button"
                      variant={executionPosture === posture.value ? 'secondary' : 'outline'}
                      disabled={!allowed}
                      title={reason ?? undefined}
                      aria-label={`${posture.label} ${postureDescription}`}
                      className="h-auto justify-start whitespace-normal px-4 py-3 text-left"
                      onClick={() => setExecutionPosture(posture.value)}
                    >
                      <span>
                        <span className="block font-medium">{posture.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {postureDescription}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-cream/55 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={initialRefresh}
                onChange={(event) => setInitialRefresh(event.target.checked)}
              />
              <span>
                <span className="block font-medium text-foreground">Run initial refresh</span>
                <span className="block text-muted-foreground">
                  Hydrates balances, positions, orders, and account freshness after the seed is
                  created.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {step === 'review' && selectedCandidate ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <DetailSection label="Account ID" value={selectedCandidate.suggestedAccountId} />
              <DetailSection label="Display Name" value={displayName.trim()} />
              <DetailSection label="Readiness" value={titleCase(readiness)} />
              <DetailSection label="Execution Posture" value={titleCase(executionPosture)} />
              <DetailSection label="Initial Refresh" value={initialRefresh ? 'Yes' : 'No'} />
              <DetailSection
                label="Provider"
                value={`${brokerLabel(selectedCandidate.provider)} / ${selectedCandidate.environment.toUpperCase()}`}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="onboarding-reason"
                className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground"
              >
                Operator Reason
              </label>
              <Textarea
                id="onboarding-reason"
                value={reason}
                placeholder="Describe why this account is being enabled for monitoring and controls."
                onChange={(event) => {
                  setReason(event.target.value);
                  if (event.target.value.trim().length >= 5) {
                    setReasonError(null);
                  }
                }}
              />
              {reasonError ? <p className="text-sm text-destructive">{reasonError}</p> : null}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={onboardMutation.isPending}
            onClick={() => {
              if (step === 'provider') {
                onOpenChange(false);
              } else {
                goBack();
              }
            }}
          >
            {step === 'provider' ? 'Cancel' : 'Back'}
          </Button>
          <Button
            type="button"
            disabled={primaryDisabled || (step === 'candidates' && candidatesQuery.isLoading)}
            onClick={() => void handlePrimary()}
          >
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreshnessPanel({ freshness }: { freshness: TradeDataFreshness | null }) {
  if (!freshness) {
    return (
      <StatePanel
        tone="empty"
        title="Freshness unavailable"
        message="The trade monitor did not return balance, position, or order freshness for this account."
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <DetailSection
        label="Balances Feed"
        value={freshnessLabel(freshness.balancesState)}
        detail={`As of ${formatTimestamp(freshness.balancesAsOf)}`}
      />
      <DetailSection
        label="Positions Feed"
        value={freshnessLabel(freshness.positionsState)}
        detail={`As of ${formatTimestamp(freshness.positionsAsOf)}`}
      />
      <DetailSection
        label="Orders Feed"
        value={freshnessLabel(freshness.ordersState)}
        detail={freshness.staleReason || `As of ${formatTimestamp(freshness.ordersAsOf)}`}
      />
    </div>
  );
}

function QueryErrorPanel({
  title,
  error,
  fallback
}: {
  title: string;
  error: unknown;
  fallback: string;
}) {
  if (!error) {
    return null;
  }

  return (
    <StatePanel
      tone="error"
      title={title}
      message={extractTradeDeskErrorMessage(error, fallback)}
    />
  );
}

function AccountMonitoringDossier({
  subject,
  monitoring
}: {
  subject: BrokerAccountSummary;
  monitoring: AccountMonitoringData;
}) {
  const tradeAccount = monitoring.tradeDetail?.account ?? monitoring.tradeAccount;
  const freshness = monitoring.positionsFreshness ?? tradeAccount?.freshness ?? null;
  const riskLimits = monitoring.tradeDetail?.riskLimits ?? null;
  const restrictions = [
    tradeAccount?.killSwitchActive ? 'Account kill switch active.' : null,
    tradeAccount?.capabilities.readOnly ? 'Account is read only.' : null,
    tradeAccount?.capabilities.unsupportedReason ?? null,
    ...(monitoring.tradeDetail?.restrictions ?? []),
    ...(monitoring.tradeDetail?.unresolvedAlerts ?? [])
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Monitoring Surface
          </p>
          <h3 className="mt-1 font-display text-xl text-foreground">
            Positions, orders, fills, P&amp;L, and account-scoped activity
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Execution entry remains in Trade Desk. This dossier is for monitoring and account
            operations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="secondary">
            <Link to={buildTradeDeskPath(subject.accountId)}>Open in Trade Desk</Link>
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to={buildTradeMonitorPath(subject.accountId)}>Open in Trade Monitor</Link>
          </Button>
        </div>
      </div>

      {monitoring.tradeAccountsError && !tradeAccount ? (
        <QueryErrorPanel
          title="Trade Monitor Snapshot Unavailable"
          error={monitoring.tradeAccountsError}
          fallback="Trade monitor data could not be loaded for this broker account."
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailSection
          label="Environment"
          value={tradeAccount ? tradeAccount.environment.toUpperCase() : 'Unavailable'}
          detail={
            tradeAccount
              ? titleCase(tradeAccount.readiness)
              : 'No trade account match was returned.'
          }
        />
        <DetailSection
          label="Day P&L"
          value={formatCurrency(tradeAccount?.pnl?.dayPnl, subject.baseCurrency)}
          detail={`Unrealized ${formatCurrency(
            tradeAccount?.pnl?.unrealizedPnl,
            subject.baseCurrency
          )}`}
        />
        <DetailSection
          label="Exposure"
          value={`Gross ${formatCurrency(tradeAccount?.pnl?.grossExposure, subject.baseCurrency)}`}
          detail={`Net ${formatCurrency(tradeAccount?.pnl?.netExposure, subject.baseCurrency)}`}
        />
        <DetailSection
          label="Last Trade"
          value={formatTimestamp(tradeAccount?.lastTradeAt)}
          detail={`P&L as of ${formatTimestamp(tradeAccount?.pnl?.asOf)}`}
        />
      </div>

      <FreshnessPanel freshness={freshness} />

      {monitoring.tradeDetailError ? (
        <QueryErrorPanel
          title="Trade Controls Unavailable"
          error={monitoring.tradeDetailError}
          fallback="Trade detail, risk limits, and activity could not be loaded."
        />
      ) : null}

      {monitoring.tradeDetailLoading && !monitoring.tradeDetail ? (
        <PageLoader variant="panel" text="Loading trade monitor controls..." />
      ) : null}

      {riskLimits ? (
        <div className="space-y-3 rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Trade Risk Controls
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <DetailSection
              label="Max Order"
              value={formatCurrency(riskLimits.maxOrderNotional, subject.baseCurrency)}
            />
            <DetailSection
              label="Max Daily"
              value={formatCurrency(riskLimits.maxDailyNotional, subject.baseCurrency)}
            />
            <DetailSection
              label="Max Share Qty"
              value={formatNumber(riskLimits.maxShareQuantity)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {riskLimits.allowedAssetClasses.map((assetClass) => (
              <Badge key={assetClass} variant="outline">
                {titleCase(assetClass)}
              </Badge>
            ))}
            {riskLimits.allowedOrderTypes.map((orderType) => (
              <Badge key={orderType} variant="outline">
                {titleCase(orderType)}
              </Badge>
            ))}
            <Badge variant={riskLimits.liveTradingAllowed ? 'default' : 'secondary'}>
              {riskLimits.liveTradingAllowed ? 'Live allowed' : 'Live restricted'}
            </Badge>
          </div>
        </div>
      ) : null}

      {restrictions.length ? (
        <div className="space-y-2 rounded-[1.4rem] border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Active Trading Restrictions
          </p>
          {restrictions.map((restriction) => (
            <div key={restriction} className="text-sm text-foreground">
              {restriction}
            </div>
          ))}
        </div>
      ) : null}

      <Tabs
        defaultValue="positions"
        className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4"
      >
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="min-w-max justify-start">
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="orders">Open Orders</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="blotter">Blotter/Fills</TabsTrigger>
            <TabsTrigger value="activity">Trade Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="positions" className="mt-4">
          {monitoring.positionsLoading ? (
            <PageLoader variant="panel" text="Loading positions..." />
          ) : monitoring.positionsError ? (
            <QueryErrorPanel
              title="Positions Unavailable"
              error={monitoring.positionsError}
              fallback="Positions could not be loaded for this account."
            />
          ) : (
            <div className="-mx-2 overflow-x-auto px-2">
              <PositionsTable positions={monitoring.positions} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          {monitoring.ordersLoading ? (
            <PageLoader variant="panel" text="Loading open orders..." />
          ) : monitoring.ordersError ? (
            <QueryErrorPanel
              title="Orders Unavailable"
              error={monitoring.ordersError}
              fallback="Open orders could not be loaded for this account."
            />
          ) : (
            <div className="-mx-2 overflow-x-auto px-2">
              <OrdersTable
                orders={monitoring.orders}
                emptyMessage="No open orders are currently staged for this account."
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {monitoring.historyLoading ? (
            <PageLoader variant="panel" text="Loading order history..." />
          ) : monitoring.historyError ? (
            <QueryErrorPanel
              title="History Unavailable"
              error={monitoring.historyError}
              fallback="Order history could not be loaded for this account."
            />
          ) : (
            <div className="-mx-2 overflow-x-auto px-2">
              <OrdersTable
                orders={monitoring.history}
                emptyTitle="No History"
                emptyMessage="No historical orders were returned for this account."
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="blotter" className="mt-4">
          {monitoring.blotterLoading ? (
            <PageLoader variant="panel" text="Loading blotter..." />
          ) : monitoring.blotterError ? (
            <QueryErrorPanel
              title="Blotter Unavailable"
              error={monitoring.blotterError}
              fallback="Blotter rows could not be loaded for this account."
            />
          ) : (
            <div className="-mx-2 overflow-x-auto px-2">
              <BlotterTable rows={monitoring.blotterRows} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityTimeline events={monitoring.tradeDetail?.recentAuditEvents ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountDetailSheet({
  open,
  onOpenChange,
  snapshot,
  detail,
  configuration,
  configurationLoading,
  configurationError,
  loading,
  error,
  monitoring,
  activeTab,
  onActiveTabChange,
  onRefresh,
  onReconnect,
  onTogglePause,
  onAcknowledgeAlert,
  onReloadConfiguration,
  onSaveTradingPolicy,
  onSaveAllocation,
  onConfigurationDirtyChange,
  configurationSavingPolicy,
  configurationSavingAllocation,
  mutationBusy
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  snapshot: AccountMonitoringSnapshot | null;
  detail: BrokerAccountDetail | null;
  configuration: BrokerAccountConfiguration | null;
  configurationLoading: boolean;
  configurationError: string | null;
  loading: boolean;
  error: string | null;
  monitoring: AccountMonitoringData;
  activeTab: DetailTab;
  onActiveTabChange: (value: DetailTab) => void;
  onRefresh: () => void;
  onReconnect: () => void;
  onTogglePause: () => void;
  onAcknowledgeAlert: (account: BrokerAccountSummary, alert: BrokerAccountAlert) => void;
  onReloadConfiguration: () => void;
  onSaveTradingPolicy: (
    payload: BrokerTradingPolicyUpdateRequest
  ) => Promise<BrokerAccountConfiguration>;
  onSaveAllocation: (
    payload: BrokerAccountAllocationUpdateRequest
  ) => Promise<BrokerAccountConfiguration>;
  onConfigurationDirtyChange: (dirty: boolean) => void;
  configurationSavingPolicy: boolean;
  configurationSavingAllocation: boolean;
  mutationBusy: boolean;
}) {
  const subject = detail?.account ?? snapshot?.account ?? null;
  const tradeAccount =
    monitoring.tradeDetail?.account ?? snapshot?.tradeAccount ?? monitoring.tradeAccount;
  const activeAlerts = detail?.alerts.filter((alert) => alert.status !== 'resolved') ?? [];
  const capabilities = detail?.capabilities ?? null;
  const capabilityEntries = Object.entries(detail?.capabilities ?? {}).filter(
    ([, value]) => typeof value === 'boolean'
  ) as Array<[string, boolean]>;
  const capabilityInput = subject
    ? {
        account: subject,
        capabilities,
        capabilitiesLoading: loading,
        capabilitiesError: error,
        busy: mutationBusy
      }
    : null;
  const refreshAvailability = capabilityInput
    ? getAccountActionAvailability({ ...capabilityInput, action: 'refresh' })
    : { allowed: false, reason: 'No account selected.' };
  const pauseAvailability = capabilityInput
    ? getAccountActionAvailability({
        ...capabilityInput,
        action: subject?.connectionHealth.syncPaused ? 'resume_sync' : 'pause_sync'
      })
    : { allowed: false, reason: 'No account selected.' };
  const reconnectAvailability = capabilityInput
    ? getAccountActionAvailability({ ...capabilityInput, action: 'reconnect' })
    : { allowed: false, reason: 'No account selected.' };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto border-l-2 border-mcm-walnut bg-mcm-paper sm:max-w-5xl"
      >
        <SheetHeader className="border-b border-border/40 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            {subject ? <Badge variant="outline">{brokerLabel(subject.broker)}</Badge> : null}
            {subject ? (
              <Badge variant={statusBadgeVariant(subject.tradeReadiness)}>
                {tradeReadinessLabel(subject.tradeReadiness)}
              </Badge>
            ) : null}
            {tradeAccount ? (
              <Badge variant={environmentVariant(tradeAccount.environment)}>
                {tradeAccount.environment.toUpperCase()}
              </Badge>
            ) : null}
            {tradeAccount?.killSwitchActive ? (
              <Badge variant="destructive">Kill switch</Badge>
            ) : null}
          </div>
          <SheetTitle className="font-display text-2xl text-foreground">
            {subject?.name || 'Account dossier'}
          </SheetTitle>
          <SheetDescription>
            Connectivity, risk, P&amp;L, positions, orders, fills, and recent operator actions for
            the selected account.
          </SheetDescription>
          {subject ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <AccountActionButton
                label="Refresh Now"
                availability={refreshAvailability}
                onClick={onRefresh}
              />
              <AccountActionButton
                label={subject.connectionHealth.syncPaused ? 'Resume Sync' : 'Pause Sync'}
                availability={pauseAvailability}
                onClick={onTogglePause}
              />
              <AccountActionButton
                label="Reconnect"
                availability={reconnectAvailability}
                onClick={onReconnect}
              />
            </div>
          ) : null}
        </SheetHeader>

        <div className="p-5">
          {loading ? (
            <PageLoader
              text="Loading account dossier..."
              variant="panel"
              className="min-h-[28rem]"
            />
          ) : error ? (
            <StatePanel tone="error" title="Account Dossier Unavailable" message={error} />
          ) : detail && subject ? (
            <Tabs
              value={activeTab}
              onValueChange={(value) => onActiveTabChange(value as DetailTab)}
            >
              <div className="-mx-1 overflow-x-auto px-1">
                <TabsList className="min-w-max justify-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="connectivity">Connectivity</TabsTrigger>
                  <TabsTrigger value="risk">Risk</TabsTrigger>
                  <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="configuration">Configuration</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <DetailSection label="Account Type" value={detail.accountType} />
                  <DetailSection
                    label="Buying Power"
                    value={formatCurrency(subject.buyingPower, subject.baseCurrency)}
                    detail={`Equity ${formatCurrency(subject.equity, subject.baseCurrency)}`}
                  />
                  <DetailSection
                    label="Cash"
                    value={formatCurrency(subject.cash, subject.baseCurrency)}
                    detail={`Snapshot ${formatTimestamp(subject.snapshotAsOf)}`}
                  />
                  <DetailSection
                    label="Assignment"
                    value={accountAssignmentTitle(subject)}
                    detail={accountAssignmentDetail(subject)}
                  />
                  <DetailSection
                    label="Open Inventory"
                    value={`${formatNumber(tradeAccount?.positionCount ?? subject.openPositionCount)} positions`}
                    detail={`${formatNumber(
                      tradeAccount?.openOrderCount ?? subject.openOrderCount
                    )} open orders`}
                  />
                  <DetailSection
                    label="Last Trade"
                    value={formatTimestamp(tradeAccount?.lastTradeAt)}
                    detail={`Trade monitor ${tradeAccount ? titleCase(tradeAccount.readiness) : 'unavailable'}`}
                  />
                </div>
              </TabsContent>

              <TabsContent value="connectivity" className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <DetailSection
                    label="Connection State"
                    value={subject.connectionHealth.connectionState}
                    detail={
                      subject.connectionHealth.syncPaused
                        ? 'Sync is currently paused by an operator action.'
                        : 'Broker session routing is active.'
                    }
                  />
                  <DetailSection
                    label="Auth Status"
                    value={subject.connectionHealth.authStatus}
                    detail={`Expires ${formatTimestamp(subject.connectionHealth.authExpiresAt)}`}
                  />
                  <DetailSection
                    label="Sync Status"
                    value={subject.connectionHealth.syncStatus}
                    detail={
                      subject.connectionHealth.staleReason ||
                      subject.connectionHealth.failureMessage
                    }
                  />
                  <DetailSection
                    label="Last Successful Sync"
                    value={formatTimestamp(subject.connectionHealth.lastSuccessfulSyncAt)}
                  />
                  <DetailSection
                    label="Last Failed Sync"
                    value={formatTimestamp(subject.connectionHealth.lastFailedSyncAt)}
                    detail={subject.connectionHealth.failureMessage}
                  />
                </div>
                <FreshnessPanel
                  freshness={monitoring.positionsFreshness ?? tradeAccount?.freshness ?? null}
                />
                <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Capability Flags
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {capabilityEntries.map(([key, enabled]) => (
                      <Badge
                        key={key}
                        variant={enabled ? 'default' : 'outline'}
                        className="capitalize"
                      >
                        {key
                          .replace(/^can/, '')
                          .replace(/([A-Z])/g, ' $1')
                          .trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="risk" className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <DetailSection
                    label="Buying Power"
                    value={formatCurrency(subject.buyingPower, subject.baseCurrency)}
                    detail={`Cash ${formatCurrency(subject.cash, subject.baseCurrency)}`}
                  />
                  <DetailSection
                    label="Trading State"
                    value={detail.tradingBlocked ? 'Blocked' : 'Clear'}
                    detail={detail.tradingBlockedReason}
                  />
                  <DetailSection
                    label="Unsettled Funds"
                    value={formatCurrency(detail.unsettledFunds, subject.baseCurrency)}
                  />
                  <DetailSection
                    label="Day-Trade Buying Power"
                    value={formatCurrency(detail.dayTradeBuyingPower, subject.baseCurrency)}
                  />
                  <DetailSection
                    label="Maintenance Excess"
                    value={formatCurrency(detail.maintenanceExcess, subject.baseCurrency)}
                  />
                  <DetailSection
                    label="Trade Controls"
                    value={
                      tradeAccount?.killSwitchActive
                        ? 'Kill switch active'
                        : tradeAccount?.capabilities.readOnly
                          ? 'Read only'
                          : 'Control clear'
                    }
                    detail={tradeAccount?.capabilities.unsupportedReason ?? null}
                  />
                  <DetailSection
                    label="Day P&L"
                    value={formatCurrency(tradeAccount?.pnl?.dayPnl, subject.baseCurrency)}
                    detail={`Unrealized ${formatCurrency(
                      tradeAccount?.pnl?.unrealizedPnl,
                      subject.baseCurrency
                    )}`}
                  />
                  <DetailSection
                    label="Gross Exposure"
                    value={formatCurrency(tradeAccount?.pnl?.grossExposure, subject.baseCurrency)}
                    detail={`Net ${formatCurrency(tradeAccount?.pnl?.netExposure, subject.baseCurrency)}`}
                  />
                  <DetailSection
                    label="Trade Alerts"
                    value={`${formatNumber(tradeAccount?.unresolvedAlertCount ?? activeAlerts.length)} active`}
                    detail={tradeAccount?.readinessReason ?? subject.tradeReadinessReason}
                  />
                </div>

                <div className="space-y-3 rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Active Alerts
                  </p>
                  {activeAlerts.length ? (
                    activeAlerts.map((alert) => {
                      const acknowledgeAvailability = getAccountActionAvailability({
                        account: subject,
                        capabilities,
                        capabilitiesLoading: loading,
                        capabilitiesError: error,
                        busy: mutationBusy,
                        action: 'acknowledge_alert',
                        alertStatus: alert.status
                      });
                      return (
                        <div
                          key={alert.alertId}
                          className={`rounded-[1.2rem] border p-3 ${alertToneClass(alert.severity)}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground">{alert.title}</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {alert.message}
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                Observed {formatTimestamp(alert.observedAt)}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!acknowledgeAvailability.allowed}
                              title={acknowledgeAvailability.reason ?? undefined}
                              onClick={() => onAcknowledgeAlert(subject, alert)}
                            >
                              {alert.status === 'open' ? 'Acknowledge' : alert.status}
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <StatePanel
                      tone="empty"
                      title="No active alerts"
                      message="The selected account is not carrying any open risk or connectivity alerts."
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="monitoring" className="mt-4">
                <AccountMonitoringDossier subject={subject} monitoring={monitoring} />
              </TabsContent>

              <TabsContent value="activity" className="mt-4 space-y-4">
                <div className="space-y-3 rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Sync Runs
                  </p>
                  {detail.syncRuns.length ? (
                    detail.syncRuns.map((run) => (
                      <div
                        key={run.runId}
                        className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-cream/55 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">
                              {run.trigger} | {run.scope}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              Requested {formatTimestamp(run.requestedAt)}
                            </div>
                          </div>
                          <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                        </div>
                        {run.errorMessage ? (
                          <div className="mt-2 text-sm text-muted-foreground">
                            {run.errorMessage}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <StatePanel
                      tone="empty"
                      title="No sync activity"
                      message="The selected account does not have any recent sync runs."
                    />
                  )}
                </div>

                <div className="space-y-3 rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Manual Actions
                  </p>
                  {detail.recentActivity.length ? (
                    detail.recentActivity.map((activity) => (
                      <div
                        key={activity.activityId}
                        className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-cream/55 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{activity.summary}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {activity.actor || 'system'} | {formatTimestamp(activity.requestedAt)}
                            </div>
                            {activity.note ? (
                              <div className="mt-2 text-sm text-muted-foreground">
                                Reason: {activity.note}
                              </div>
                            ) : null}
                          </div>
                          <Badge variant={statusBadgeVariant(activity.status)}>
                            {activity.status}
                          </Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <StatePanel
                      tone="empty"
                      title="No recent manual actions"
                      message="Reconnects, pauses, refreshes, and acknowledgements will appear here."
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="configuration" className="mt-4">
                <AccountConfigurationPanel
                  key={subject.accountId}
                  account={subject}
                  configuration={configuration}
                  loading={configurationLoading}
                  error={configurationError}
                  savingPolicy={configurationSavingPolicy}
                  savingAllocation={configurationSavingAllocation}
                  onReload={onReloadConfiguration}
                  onSavePolicy={onSaveTradingPolicy}
                  onSaveAllocation={onSaveAllocation}
                  onDirtyChange={onConfigurationDirtyChange}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <StatePanel
              tone="empty"
              title="No account selected"
              message="Open an account dossier from the board to inspect connectivity and risk."
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DeskVerdictRail({
  snapshots,
  generatedAt
}: {
  snapshots: readonly AccountMonitoringSnapshot[];
  generatedAt?: string | null;
}) {
  const verdict = buildVerdict(snapshots);
  const immediateFocus = sortAccountsByPriority(snapshots.map((snapshot) => snapshot.account))
    .filter((account) => account.overallStatus !== 'healthy' || account.tradeReadiness !== 'ready')
    .slice(0, 4);

  const accounts = snapshots.map((snapshot) => snapshot.account);
  const connectedCount = accounts.filter(
    (account) => account.connectionHealth.connectionState === 'connected'
  ).length;
  const disconnectedCount = accounts.filter(
    (account) => account.connectionHealth.connectionState !== 'connected'
  ).length;
  const blockedCount = snapshots.filter(
    ({ account, tradeAccount }) =>
      account.tradeReadiness === 'blocked' ||
      tradeAccount?.readiness === 'blocked' ||
      tradeAccount?.killSwitchActive
  ).length;

  return (
    <aside
      aria-label="Desk verdict"
      className="mcm-panel flex flex-col overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]"
    >
      <div className="border-b border-border/40 px-5 py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
          Desk Verdict
        </p>
        <h2 className="mt-1 font-display text-xl text-foreground">Exception Brief</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Lead with the operational posture, then pull the top exceptions into the queue.
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="rounded-[1.8rem] border border-mcm-walnut/20 bg-mcm-paper/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Verdict
              </p>
              <p className="mt-2 font-display text-lg text-foreground">{verdict.title}</p>
            </div>
            <Badge
              variant={
                blockedCount > 0 ? 'destructive' : disconnectedCount > 0 ? 'secondary' : 'default'
              }
            >
              {blockedCount > 0
                ? 'BLOCKS PRESENT'
                : disconnectedCount > 0
                  ? 'WATCHLIST'
                  : 'ORDERLY'}
            </Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{verdict.summary}</p>
        </div>

        <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/20 bg-mcm-paper/85 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Observed Facts
          </p>
          {[
            `${connectedCount} accounts are currently connected and ${disconnectedCount} are degraded or disconnected.`,
            `${blockedCount} accounts are blocked from clean trade readiness.`,
            generatedAt
              ? `Board snapshot generated ${formatTimestamp(generatedAt)}.`
              : 'Board timestamp is not currently available.'
          ].map((fact) => (
            <div
              key={fact}
              className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-cream/60 px-3 py-3 text-sm text-muted-foreground"
            >
              {fact}
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/20 bg-mcm-paper/85 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Immediate Focus
          </p>
          {immediateFocus.length ? (
            immediateFocus.map((account) => (
              <div
                key={account.accountId}
                className={`rounded-[1.2rem] border px-3 py-3 text-sm ${compactMetricToneClass(account.overallStatus)}`}
              >
                <div className="font-medium text-foreground">
                  {account.name} | {brokerLabel(account.broker)}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {account.tradeReadinessReason ||
                    account.connectionHealth.staleReason ||
                    account.connectionHealth.failureMessage ||
                    'Review the selected account before the next execution window.'}
                </div>
              </div>
            ))
          ) : (
            <StatePanel
              tone="empty"
              title="No immediate queue"
              message="The board is clear enough to stay in scan mode."
            />
          )}
        </div>

        <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/20 bg-mcm-paper/85 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Adjacent Surfaces
          </p>
          <Button asChild variant="ghost" className="w-full justify-between">
            <Link to="/portfolios">Portfolio Workspace</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full justify-between">
            <Link to="/runtime-config">Runtime Config</Link>
          </Button>
        </div>
      </div>
    </aside>
  );
}

export function AccountOperationsPage() {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [configurationDirty, setConfigurationDirty] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<AccountBoardScope>('all');
  const [actionTarget, setActionTarget] = useState<AccountActionDialogTarget | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: accountOperationsKeys.list(),
    queryFn: ({ signal }) => accountOperationsApi.listAccounts(signal),
    refetchInterval: 30000,
    refetchOnWindowFocus: true
  });

  const tradeAccountsQuery = useQuery({
    queryKey: tradeDeskKeys.accounts(),
    queryFn: ({ signal }) => tradeDeskApi.listAccounts(signal),
    refetchInterval: 30000,
    refetchOnWindowFocus: true
  });

  const brokerAccounts = listQuery.data?.accounts ?? EMPTY_ACCOUNTS;
  const tradeAccounts = tradeAccountsQuery.data?.accounts ?? EMPTY_TRADE_ACCOUNTS;
  const accounts = useMemo(
    () => populateExistingTradeAccounts(brokerAccounts, tradeAccounts),
    [brokerAccounts, tradeAccounts]
  );
  const tradeAccountsById = useMemo(
    () => new Map(tradeAccounts.map((account) => [account.accountId, account])),
    [tradeAccounts]
  );
  const snapshots = useMemo<AccountMonitoringSnapshot[]>(
    () =>
      accounts.map((account) => ({
        account,
        tradeAccount: tradeAccountsById.get(account.accountId) ?? null
      })),
    [accounts, tradeAccountsById]
  );
  const brokers = useMemo(
    () => Array.from(new Set(accounts.map((account) => account.broker))).sort(),
    [accounts]
  );
  const filteredSnapshots = useMemo(
    () =>
      snapshots.filter((snapshot) =>
        accountMatchesBoardFilters(snapshot, {
          searchTerm,
          broker: brokerFilter,
          status: statusFilter,
          scope: scopeFilter
        })
      ),
    [snapshots, searchTerm, brokerFilter, statusFilter, scopeFilter]
  );
  const sortedSnapshots = useMemo(() => {
    const snapshotById = new Map(
      filteredSnapshots.map((snapshot) => [snapshot.account.accountId, snapshot])
    );
    return sortAccountsByPriority(filteredSnapshots.map((snapshot) => snapshot.account))
      .map((account) => snapshotById.get(account.accountId))
      .filter((snapshot): snapshot is AccountMonitoringSnapshot => Boolean(snapshot));
  }, [filteredSnapshots]);

  const capabilityQueries = useQueries({
    queries: sortedSnapshots.map((snapshot) => ({
      queryKey: accountOperationsKeys.detail(snapshot.account.accountId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        accountOperationsApi.getAccountDetail(snapshot.account.accountId, signal),
      refetchInterval: 60000,
      refetchOnWindowFocus: true,
      staleTime: 15000
    }))
  });
  const capabilityStateByAccountId = useMemo(() => {
    const state = new Map<string, CapabilityQueryState>();
    sortedSnapshots.forEach((snapshot, index) => {
      const query = capabilityQueries[index];
      state.set(snapshot.account.accountId, {
        detail: query?.data ?? null,
        loading: query?.isLoading ?? true,
        error: query?.error ?? null
      });
    });
    return state;
  }, [sortedSnapshots, capabilityQueries]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.account.accountId === selectedAccountId) ?? null,
    [snapshots, selectedAccountId]
  );
  const selectedAccount = selectedSnapshot?.account ?? null;

  const detailQuery = useQuery({
    queryKey: accountOperationsKeys.detail(selectedAccountId),
    queryFn: ({ signal }) =>
      accountOperationsApi.getAccountDetail(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 60000 : false,
    refetchOnWindowFocus: true
  });

  const configurationQuery = useQuery({
    queryKey: accountOperationsKeys.configuration(selectedAccountId),
    queryFn: ({ signal }) =>
      accountOperationsApi.getConfiguration(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 60000 : false,
    refetchOnWindowFocus: true
  });

  const tradeDetailQuery = useQuery({
    queryKey: tradeDeskKeys.detail(selectedAccountId),
    queryFn: ({ signal }) => tradeDeskApi.getAccountDetail(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 30000 : false,
    refetchOnWindowFocus: true
  });
  const positionsQuery = useQuery({
    queryKey: tradeDeskKeys.positions(selectedAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listPositions(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 30000 : false,
    refetchOnWindowFocus: true
  });
  const ordersQuery = useQuery({
    queryKey: tradeDeskKeys.orders(selectedAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listOrders(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 15000 : false,
    refetchOnWindowFocus: true
  });
  const historyQuery = useQuery({
    queryKey: tradeDeskKeys.history(selectedAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listHistory(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 30000 : false,
    refetchOnWindowFocus: true
  });
  const blotterQuery = useQuery({
    queryKey: tradeDeskKeys.blotter(selectedAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listBlotter(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 30000 : false,
    refetchOnWindowFocus: true
  });

  const invalidateAccountViews = async (accountId?: string | null) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: accountOperationsKeys.list() }),
      queryClient.invalidateQueries({ queryKey: tradeDeskKeys.accounts() })
    ];

    if (accountId) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.detail(accountId) }),
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.configuration(accountId) }),
        queryClient.invalidateQueries({ queryKey: tradeDeskKeys.detail(accountId) }),
        queryClient.invalidateQueries({ queryKey: tradeDeskKeys.positions(accountId) }),
        queryClient.invalidateQueries({ queryKey: tradeDeskKeys.orders(accountId) }),
        queryClient.invalidateQueries({ queryKey: tradeDeskKeys.history(accountId) }),
        queryClient.invalidateQueries({ queryKey: tradeDeskKeys.blotter(accountId) })
      );
    }

    await Promise.all(invalidations);
  };

  const reconnectMutation = useMutation({
    mutationFn: (payload: { accountId: string; reason: string }) =>
      accountOperationsApi.reconnectAccount(payload.accountId, {
        reason: payload.reason
      }),
    onSuccess: async (_, payload) => {
      await invalidateAccountViews(payload.accountId);
      toast.success('Reconnect request submitted.');
    },
    onError: (error) => {
      toast.error(`Failed to reconnect account: ${String(error)}`);
    }
  });

  const refreshMutation = useMutation({
    mutationFn: (payload: { accountId: string; reason: string; scope: BrokerSyncScope }) =>
      accountOperationsApi.refreshAccount(payload.accountId, {
        scope: payload.scope,
        force: true,
        reason: payload.reason
      }),
    onSuccess: async (_, payload) => {
      await invalidateAccountViews(payload.accountId);
      toast.success('Refresh queued.');
    },
    onError: (error) => {
      toast.error(`Failed to queue refresh: ${String(error)}`);
    }
  });

  const pauseMutation = useMutation({
    mutationFn: (payload: { accountId: string; paused: boolean; reason: string }) =>
      accountOperationsApi.setSyncPaused(payload.accountId, {
        paused: payload.paused,
        reason: payload.reason
      }),
    onSuccess: async (_, payload) => {
      await invalidateAccountViews(payload.accountId);
      toast.success(payload.paused ? 'Sync paused.' : 'Sync resumed.');
    },
    onError: (error) => {
      toast.error(`Failed to update sync state: ${String(error)}`);
    }
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (payload: { accountId: string; alertId: string; note: string }) =>
      accountOperationsApi.acknowledgeAlert(payload.accountId, payload.alertId, {
        note: payload.note
      }),
    onSuccess: async (_, payload) => {
      await invalidateAccountViews(payload.accountId);
      toast.success('Alert acknowledged.');
    },
    onError: (error) => {
      toast.error(`Failed to acknowledge alert: ${String(error)}`);
    }
  });

  const saveTradingPolicyMutation = useMutation({
    mutationFn: (payload: { accountId: string; body: BrokerTradingPolicyUpdateRequest }) =>
      accountOperationsApi.saveTradingPolicy(payload.accountId, payload.body),
    onSuccess: async (configuration, payload) => {
      queryClient.setQueryData(
        accountOperationsKeys.configuration(payload.accountId),
        configuration
      );
      await invalidateAccountViews(payload.accountId);
    }
  });

  const saveAllocationMutation = useMutation({
    mutationFn: (payload: { accountId: string; body: BrokerAccountAllocationUpdateRequest }) =>
      accountOperationsApi.saveAllocation(payload.accountId, payload.body),
    onSuccess: async (configuration, payload) => {
      queryClient.setQueryData(
        accountOperationsKeys.configuration(payload.accountId),
        configuration
      );
      await invalidateAccountViews(payload.accountId);
    }
  });

  const displayedAccounts = sortedSnapshots.map((snapshot) => snapshot.account);
  const connectedAccounts = displayedAccounts.filter(
    (account) => account.connectionHealth.connectionState === 'connected'
  ).length;
  const tradeReadyAccounts = sortedSnapshots.filter(
    ({ account, tradeAccount }) =>
      account.tradeReadiness === 'ready' && (!tradeAccount || tradeAccount.readiness === 'ready')
  ).length;
  const needsActionAccounts = sortedSnapshots.filter(({ account, tradeAccount }) => {
    return (
      account.overallStatus !== 'healthy' ||
      account.tradeReadiness !== 'ready' ||
      tradeAccount?.readiness !== 'ready' ||
      Boolean(tradeAccount?.killSwitchActive) ||
      Boolean(tradeAccount?.capabilities.readOnly) ||
      (tradeAccount?.unresolvedAlertCount ?? 0) > 0
    );
  }).length;
  const aggregateBuyingPower = displayedAccounts.reduce(
    (total, account) => total + account.buyingPower,
    0
  );
  const actionMutationBusy =
    reconnectMutation.isPending ||
    refreshMutation.isPending ||
    pauseMutation.isPending ||
    acknowledgeMutation.isPending;
  const mutationBusy = actionMutationBusy;
  const hasActiveFilters =
    searchTerm.trim() || brokerFilter !== 'all' || statusFilter !== 'all' || scopeFilter !== 'all';
  const selectedConfiguration = configurationQuery.data ?? detailQuery.data?.configuration ?? null;
  const selectedMonitoring: AccountMonitoringData = {
    tradeAccount: selectedSnapshot?.tradeAccount ?? null,
    tradeAccountsError: tradeAccountsQuery.error,
    tradeDetail: tradeDetailQuery.data ?? null,
    tradeDetailLoading: tradeDetailQuery.isLoading,
    tradeDetailError: tradeDetailQuery.error,
    positions: positionsQuery.data?.positions ?? EMPTY_POSITIONS,
    positionsFreshness: positionsQuery.data?.freshness ?? null,
    positionsLoading: positionsQuery.isLoading,
    positionsError: positionsQuery.error,
    orders: ordersQuery.data?.orders ?? EMPTY_ORDERS,
    ordersLoading: ordersQuery.isLoading,
    ordersError: ordersQuery.error,
    history: historyQuery.data?.orders ?? EMPTY_ORDERS,
    historyLoading: historyQuery.isLoading,
    historyError: historyQuery.error,
    blotterRows: blotterQuery.data?.rows ?? EMPTY_BLOTTER_ROWS,
    blotterLoading: blotterQuery.isLoading,
    blotterError: blotterQuery.error
  };

  const handleOpenDetail = (accountId: string) => {
    if (
      selectedAccountId &&
      selectedAccountId !== accountId &&
      configurationDirty &&
      !window.confirm('Discard unsaved configuration changes?')
    ) {
      return;
    }
    setSelectedAccountId(accountId);
    setDetailTab('overview');
    setConfigurationDirty(false);
  };

  const handleCloseDetail = (open: boolean) => {
    if (open) {
      return;
    }
    if (configurationDirty && !window.confirm('Discard unsaved configuration changes?')) {
      return;
    }
    setSelectedAccountId(null);
    setConfigurationDirty(false);
  };

  const handleOnboardingSuccess = async (response: BrokerAccountOnboardingResponse) => {
    const accountId = response.account.accountId;
    await Promise.all([
      invalidateAccountViews(accountId),
      queryClient.invalidateQueries({ queryKey: accountOperationsKeys.all() }),
      queryClient.invalidateQueries({ queryKey: tradeDeskKeys.all() })
    ]);
    setSelectedAccountId(accountId);
    setDetailTab('overview');
    setConfigurationDirty(false);
  };

  const handleSaveTradingPolicy = async (
    payload: BrokerTradingPolicyUpdateRequest
  ): Promise<BrokerAccountConfiguration> => {
    if (!selectedAccountId) {
      throw new Error('No broker account is selected.');
    }
    return saveTradingPolicyMutation.mutateAsync({
      accountId: selectedAccountId,
      body: payload
    });
  };

  const handleSaveAllocation = async (
    payload: BrokerAccountAllocationUpdateRequest
  ): Promise<BrokerAccountConfiguration> => {
    if (!selectedAccountId) {
      throw new Error('No broker account is selected.');
    }
    return saveAllocationMutation.mutateAsync({
      accountId: selectedAccountId,
      body: payload
    });
  };

  const submitAccountAction = async ({ reason, scope }: AccountActionDialogPayload) => {
    if (!actionTarget) {
      return;
    }

    try {
      if (actionTarget.kind === 'refresh') {
        await refreshMutation.mutateAsync({
          accountId: actionTarget.account.accountId,
          reason,
          scope
        });
      } else if (actionTarget.kind === 'reconnect') {
        await reconnectMutation.mutateAsync({
          accountId: actionTarget.account.accountId,
          reason
        });
      } else if (actionTarget.kind === 'pause_sync' || actionTarget.kind === 'resume_sync') {
        await pauseMutation.mutateAsync({
          accountId: actionTarget.account.accountId,
          paused: actionTarget.kind === 'pause_sync',
          reason
        });
      } else {
        await acknowledgeMutation.mutateAsync({
          accountId: actionTarget.account.accountId,
          alertId: actionTarget.alert.alertId,
          note: reason
        });
      }
      setActionTarget(null);
    } catch {
      // Mutation handlers surface the failure toast and keep the dialog available for correction.
    }
  };

  if (listQuery.isLoading || (brokerAccounts.length === 0 && tradeAccountsQuery.isLoading)) {
    return <PageLoader text="Loading account operations board..." />;
  }

  if (listQuery.error) {
    return (
      <StatePanel
        tone="error"
        title="Account Operations Unavailable"
        message={String(listQuery.error)}
      />
    );
  }

  return (
    <div className="page-shell">
      <h1 className="sr-only">Account Operations</h1>

      <section
        aria-label="Account operations summary"
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Configured Accounts"
          value={`${displayedAccounts.length}/${accounts.length}`}
          detail={`${connectedAccounts} currently connected in the visible account set.`}
          icon={<Cable className="h-4 w-4 text-mcm-teal" />}
        />
        <StatCard
          label="Trade Ready"
          value={String(tradeReadyAccounts)}
          detail="Visible accounts currently clear for broker and trade readiness."
          icon={<CheckCircle2 className="h-4 w-4 text-mcm-teal" />}
        />
        <StatCard
          label="Needs Action"
          value={String(needsActionAccounts)}
          detail="Visible accounts carrying warnings, stale sync, blocked trade state, or read-only controls."
          icon={<ShieldAlert className="h-4 w-4 text-mcm-rust" />}
        />
        <StatCard
          label="Buying Power"
          value={formatCurrency(aggregateBuyingPower)}
          detail="Visible board-level buying power across configured accounts."
          icon={<Wallet className="h-4 w-4 text-mcm-olive" />}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Account board" className="mcm-panel min-h-[760px] overflow-hidden">
          <div className="border-b border-border/40 px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                  Command Grid
                </p>
                <h2 className="mt-1 font-display text-xl text-foreground">Account Board</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Default sort is exception-first: alert severity, stale or disconnected sync,
                  blocked trading posture, then capital at risk.
                </p>
                {tradeAccountsQuery.error ? (
                  <p className="mt-2 text-sm text-destructive">
                    Trade monitor snapshot is unavailable; broker controls remain visible with
                    monitoring gaps flagged per account.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => setOnboardingOpen(true)}>
                  <Plus className="mr-2 size-4" />
                  Add Account
                </Button>
                <Badge variant="outline">
                  {hasActiveFilters
                    ? `${sortedSnapshots.length}/${accounts.length}`
                    : sortedSnapshots.length}{' '}
                  accounts
                </Badge>
              </div>
            </div>

            <AccountBoardControls
              searchTerm={searchTerm}
              brokerFilter={brokerFilter}
              statusFilter={statusFilter}
              scope={scopeFilter}
              brokers={brokers}
              onSearchTermChange={setSearchTerm}
              onBrokerFilterChange={setBrokerFilter}
              onStatusFilterChange={setStatusFilter}
              onScopeChange={setScopeFilter}
            />
          </div>

          <div className="space-y-4 p-5">
            {!accounts.length ? (
              <StatePanel
                tone="empty"
                title="No configured accounts"
                message="Discover a connected broker account and seed it into account monitoring without manual SQL."
                action={
                  <Button type="button" onClick={() => setOnboardingOpen(true)}>
                    <Plus className="mr-2 size-4" />
                    Add Account
                  </Button>
                }
              />
            ) : !sortedSnapshots.length ? (
              <StatePanel
                tone="empty"
                title="No accounts match the current board controls"
                message="Relax the search, broker, status, or scope filters to restore the account queue."
              />
            ) : (
              sortedSnapshots.map((snapshot) => {
                const account = snapshot.account.allocationSummary
                  ? { ...snapshot.account, strategyLabel: null }
                  : snapshot.account;
                const displaySnapshot = { ...snapshot, account };
                const capabilityState = capabilityStateByAccountId.get(
                  snapshot.account.accountId
                ) ?? {
                  detail: null,
                  loading: true,
                  error: null
                };
                return (
                  <AccountCard
                    key={snapshot.account.accountId}
                    snapshot={displaySnapshot}
                    capabilityState={capabilityState}
                    busy={mutationBusy}
                    onOpenDetail={() => handleOpenDetail(snapshot.account.accountId)}
                    onRefresh={() =>
                      setActionTarget({ kind: 'refresh', account: snapshot.account })
                    }
                    onReconnect={() =>
                      setActionTarget({ kind: 'reconnect', account: snapshot.account })
                    }
                    onTogglePause={() =>
                      setActionTarget({
                        kind: snapshot.account.connectionHealth.syncPaused
                          ? 'resume_sync'
                          : 'pause_sync',
                        account: snapshot.account
                      })
                    }
                  />
                );
              })
            )}
          </div>
        </section>

        <DeskVerdictRail snapshots={sortedSnapshots} generatedAt={listQuery.data?.generatedAt} />
      </div>

      <AccountDetailSheet
        open={Boolean(selectedAccountId)}
        onOpenChange={handleCloseDetail}
        snapshot={selectedSnapshot}
        detail={detailQuery.data ?? null}
        configuration={selectedConfiguration}
        configurationLoading={configurationQuery.isLoading}
        configurationError={configurationQuery.error ? String(configurationQuery.error) : null}
        loading={detailQuery.isLoading}
        error={detailQuery.error ? String(detailQuery.error) : null}
        monitoring={selectedMonitoring}
        activeTab={detailTab}
        onActiveTabChange={setDetailTab}
        onRefresh={() =>
          selectedAccount && setActionTarget({ kind: 'refresh', account: selectedAccount })
        }
        onReconnect={() =>
          selectedAccount && setActionTarget({ kind: 'reconnect', account: selectedAccount })
        }
        onTogglePause={() =>
          selectedAccount &&
          setActionTarget({
            kind: selectedAccount.connectionHealth.syncPaused ? 'resume_sync' : 'pause_sync',
            account: selectedAccount
          })
        }
        onAcknowledgeAlert={(account, alert) =>
          setActionTarget({ kind: 'acknowledge_alert', account, alert })
        }
        onReloadConfiguration={() => void configurationQuery.refetch()}
        onSaveTradingPolicy={handleSaveTradingPolicy}
        onSaveAllocation={handleSaveAllocation}
        onConfigurationDirtyChange={setConfigurationDirty}
        configurationSavingPolicy={saveTradingPolicyMutation.isPending}
        configurationSavingAllocation={saveAllocationMutation.isPending}
        mutationBusy={mutationBusy}
      />

      <AccountActionDialog
        target={actionTarget}
        submitting={actionMutationBusy}
        onCancel={() => setActionTarget(null)}
        onSubmit={submitAccountAction}
      />

      <AccountOnboardingDialog
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        onSuccess={handleOnboardingSuccess}
      />
    </div>
  );
}
