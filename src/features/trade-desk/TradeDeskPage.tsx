import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeDollarSign,
  FileClock,
  RefreshCw,
  ShieldCheck,
  Ticket,
  XCircle
} from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  createTradeDeskIdempotencyKey,
  tradeDeskApi,
  tradeDeskKeys
} from '@/services/tradeDeskApi';
import type {
  TradeOrder,
  TradeOrderPlaceRequest,
  TradeOrderPreviewRequest,
  TradeOrderPreviewResponse,
  TradeOrderSide,
  TradeOrderType,
  TradeTimeInForce
} from '@asset-allocation/contracts';
import type {
  TradeAccountDetailView,
  TradeAccountSummaryView
} from '@/services/tradeDeskModels';
import {
  ActivityTimeline,
  OrdersTable,
  PositionsTable,
  RiskCheckEvidence
} from '@/features/trade-desk/tradeDeskComponents';
import {
  brokerLabel,
  buildTradeMonitorPath,
  environmentVariant,
  extractTradeDeskErrorMessage,
  formatCurrency,
  formatNumber,
  formatTimestamp,
  readinessVariant,
  titleCase
} from '@/features/trade-desk/tradeDeskUtils';

type OrderDraft = {
  symbol: string;
  side: TradeOrderSide;
  quantity: string;
  notional: string;
  orderType: TradeOrderType;
  timeInForce: TradeTimeInForce;
  limitPrice: string;
  stopPrice: string;
  allowExtendedHours: boolean;
};

type WorkflowMessage = {
  tone: 'info' | 'warning' | 'error';
  title: string;
  message: string;
};

const EMPTY_DRAFT: OrderDraft = {
  symbol: '',
  side: 'buy',
  quantity: '',
  notional: '',
  orderType: 'market',
  timeInForce: 'day',
  limitPrice: '',
  stopPrice: '',
  allowExtendedHours: false
};

const TIME_IN_FORCE_OPTIONS: Array<{ value: TradeTimeInForce; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'gtc', label: 'GTC' },
  { value: 'ioc', label: 'IOC' },
  { value: 'fok', label: 'FOK' }
];

const ORDER_TYPE_LABELS: Record<TradeOrderType, string> = {
  market: 'Market',
  limit: 'Limit',
  stop: 'Stop',
  stop_limit: 'Stop Limit'
};

function parsePositiveNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function getCapabilityOrderTypes(account: TradeAccountSummaryView): TradeOrderType[] {
  const types: TradeOrderType[] = [];
  if (account.capabilities.supportsMarketOrders) types.push('market');
  if (account.capabilities.supportsLimitOrders) types.push('limit');
  if (account.capabilities.supportsStopOrders) {
    types.push('stop', 'stop_limit');
  }
  return types;
}

function getAllowedOrderTypes(
  account: TradeAccountSummaryView,
  detail?: TradeAccountDetailView | null
): TradeOrderType[] {
  const capabilityTypes = getCapabilityOrderTypes(account);
  const policyTypes = detail?.riskLimits.allowedOrderTypes ?? [];
  if (!policyTypes.length) {
    return capabilityTypes;
  }
  const allowed = capabilityTypes.filter((type) => policyTypes.includes(type));
  return allowed.length ? allowed : capabilityTypes;
}

function buildPreviewRequest(
  account: TradeAccountSummaryView,
  detail: TradeAccountDetailView | null,
  draft: OrderDraft
): { payload?: TradeOrderPreviewRequest; errors: string[] } {
  const symbol = draft.symbol.trim().toUpperCase();
  const quantity = parsePositiveNumber(draft.quantity);
  const notional = parsePositiveNumber(draft.notional);
  const limitPrice = parsePositiveNumber(draft.limitPrice);
  const stopPrice = parsePositiveNumber(draft.stopPrice);
  const errors: string[] = [];
  const allowedOrderTypes = getAllowedOrderTypes(account, detail);
  const blockingAlerts =
    detail?.alerts.filter((alert) => alert.status === 'open' && alert.blocking) ?? [];

  if (!symbol) errors.push('Symbol is required.');
  if (quantity !== undefined && Number.isNaN(quantity)) {
    errors.push('Quantity must be greater than zero.');
  }
  if (notional !== undefined && Number.isNaN(notional)) {
    errors.push('Notional must be greater than zero.');
  }
  if ((quantity === undefined) === (notional === undefined)) {
    errors.push('Enter exactly one of quantity or notional.');
  }
  if (!allowedOrderTypes.includes(draft.orderType)) {
    errors.push(`${ORDER_TYPE_LABELS[draft.orderType]} orders are not enabled for this account.`);
  }
  if (draft.orderType === 'limit' || draft.orderType === 'stop_limit') {
    if (limitPrice === undefined || Number.isNaN(limitPrice)) {
      errors.push('Limit price is required for limit orders.');
    }
  }
  if (draft.orderType === 'stop' || draft.orderType === 'stop_limit') {
    if (stopPrice === undefined || Number.isNaN(stopPrice)) {
      errors.push('Stop price is required for stop orders.');
    }
  }
  if (detail?.riskLimits.maxShareQuantity && quantity && quantity > detail.riskLimits.maxShareQuantity) {
    errors.push(`Quantity exceeds the account share limit of ${formatNumber(detail.riskLimits.maxShareQuantity)}.`);
  }
  if (detail?.riskLimits.maxOrderNotional && notional && notional > detail.riskLimits.maxOrderNotional) {
    errors.push(
      `Notional exceeds the account order limit of ${formatCurrency(detail.riskLimits.maxOrderNotional)}.`
    );
  }
  if (detail?.restrictions.length) {
    errors.push(`Trading is restricted: ${detail.restrictions.join('; ')}.`);
  }
  if (detail?.unresolvedAlerts.length) {
    errors.push(`Resolve account alerts before preview: ${detail.unresolvedAlerts.join('; ')}.`);
  }
  if (blockingAlerts.length) {
    errors.push(`Blocking alert: ${blockingAlerts.map((alert) => alert.title).join('; ')}.`);
  }

  if (errors.length) {
    return { errors };
  }

  return {
    errors,
    payload: {
      accountId: account.accountId,
      environment: account.environment,
      clientRequestId: createTradeDeskIdempotencyKey('preview'),
      symbol,
      side: draft.side,
      orderType: draft.orderType,
      timeInForce: draft.timeInForce,
      assetClass: 'equity',
      quantity,
      notional,
      limitPrice,
      stopPrice,
      allowExtendedHours: draft.allowExtendedHours,
      source: 'manual'
    }
  };
}

function invalidateAccountQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string
) {
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.accounts() });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.detail(accountId) });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.positions(accountId) });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.orders(accountId) });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.history(accountId) });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.blotter(accountId) });
}

function RiskLimitsPanel({ detail }: { detail: TradeAccountDetailView | null }) {
  if (!detail) {
    return null;
  }

  const { riskLimits } = detail;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
        Risk Limits
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Max order notional</span>
          <span>{formatCurrency(riskLimits.maxOrderNotional)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Max daily notional</span>
          <span>{formatCurrency(riskLimits.maxDailyNotional)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Max share quantity</span>
          <span>{formatNumber(riskLimits.maxShareQuantity)}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {riskLimits.allowedOrderTypes.map((orderType) => (
          <Badge key={orderType} variant="outline">
            {ORDER_TYPE_LABELS[orderType]}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function DeskControlsRail({
  account,
  detail
}: {
  account: TradeAccountSummaryView;
  detail: TradeAccountDetailView | null;
}) {
  const restrictionItems = [
    account.killSwitchActive ? 'Account kill switch active' : null,
    !account.capabilities.canPreview ? 'Preview disabled' : null,
    account.environment === 'live' && !account.capabilities.canSubmitLive
      ? 'Live submit disabled'
      : null,
    account.capabilities.readOnly ? 'Read-only account' : null,
    account.capabilities.unsupportedReason ?? null,
    ...(detail?.restrictions ?? []),
    ...(detail?.unresolvedAlerts ?? [])
  ].filter(Boolean);
  const activeAlerts = detail?.alerts.filter((alert) => alert.status !== 'resolved') ?? [];
  const freshness = account.freshness;

  return (
    <aside className="mcm-panel flex min-h-[42rem] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Account Controls
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={readinessVariant(account.readiness)}>{titleCase(account.readiness)}</Badge>
          <Badge variant={environmentVariant(account.environment)}>
            {account.environment.toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
            Readiness
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Broker</span>
              <span className="font-semibold">{brokerLabel(account.provider)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Positions</span>
              <span className="font-semibold">{titleCase(freshness.positionsState)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Cash</span>
              <span className="font-semibold">{titleCase(freshness.balancesState)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Orders</span>
              <span className="font-semibold">{titleCase(freshness.ordersState)}</span>
            </div>
          </div>
          {account.readinessReason ? (
            <p className="rounded-xl border border-mcm-walnut/20 bg-background/40 p-3 text-sm">
              {account.readinessReason}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
            Restrictions
          </h2>
          {restrictionItems.length ? (
            <div className="space-y-2">
              {restrictionItems.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-mcm-teal/25 bg-accent/35 p-3 text-sm">
              No account-level execution blockers are currently flagged.
            </div>
          )}
        </section>

        {activeAlerts.length ? (
          <section className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
              Active Alerts
            </h2>
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.alertId}
                  className="rounded-xl border border-mcm-walnut/20 bg-background/35 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={alert.blocking ? 'destructive' : 'secondary'}>
                      {titleCase(alert.severity)}
                    </Badge>
                    <span className="font-semibold">{alert.title}</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{alert.message}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <RiskLimitsPanel detail={detail} />

        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
            Freshness
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Balances</span>
              <span>{formatTimestamp(freshness.balancesAsOf)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Positions</span>
              <span>{formatTimestamp(freshness.positionsAsOf)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Orders</span>
              <span>{formatTimestamp(freshness.ordersAsOf)}</span>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
            Activity
          </h2>
          <ActivityTimeline events={detail?.recentAuditEvents ?? []} compact />
        </section>
      </div>
    </aside>
  );
}

function OrderTicket({
  account,
  detail,
  draft,
  preview,
  acknowledgedRiskCheckIds,
  liveConfirmed,
  onDraftChange,
  onPreview,
  onSubmit,
  onLiveConfirmedChange,
  onRiskAcknowledgementChange,
  previewPending,
  submitPending
}: {
  account: TradeAccountSummaryView;
  detail: TradeAccountDetailView | null;
  draft: OrderDraft;
  preview: TradeOrderPreviewResponse | null;
  acknowledgedRiskCheckIds: Set<string>;
  liveConfirmed: boolean;
  onDraftChange: (nextDraft: OrderDraft) => void;
  onPreview: () => void;
  onSubmit: () => void;
  onLiveConfirmedChange: (checked: boolean) => void;
  onRiskAcknowledgementChange: (checkId: string, checked: boolean) => void;
  previewPending: boolean;
  submitPending: boolean;
}) {
  const allowedOrderTypes = getAllowedOrderTypes(account, detail);
  const warningChecks = preview?.riskChecks.filter((check) => !check.blocking && check.status === 'warning') ?? [];
  const missingAcknowledgements = warningChecks.some(
    (check) => !acknowledgedRiskCheckIds.has(check.checkId)
  );
  const submitDisabled =
    !preview ||
    preview.blocked ||
    submitPending ||
    missingAcknowledgements ||
    (account.environment === 'live' && !liveConfirmed) ||
    (account.environment === 'live' && !account.capabilities.canSubmitLive);

  return (
    <aside className="mcm-panel min-h-[42rem] overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Manual Ticket
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={environmentVariant(account.environment)}>
            {account.environment.toUpperCase()}
          </Badge>
          <Badge variant={account.capabilities.readOnly ? 'secondary' : 'outline'}>
            {account.capabilities.readOnly ? 'Read Only' : 'Execution Capable'}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="trade-symbol" className="text-foreground">
              Symbol
            </Label>
            <Input
              id="trade-symbol"
              value={draft.symbol}
              onChange={(event) => onDraftChange({ ...draft, symbol: event.target.value })}
              placeholder="MSFT"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-side" className="text-foreground">
              Side
            </Label>
            <Select
              value={draft.side}
              onValueChange={(value) => onDraftChange({ ...draft, side: value as TradeOrderSide })}
            >
              <SelectTrigger id="trade-side" aria-label="Trade side">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-order-type" className="text-foreground">
              Order Type
            </Label>
            <Select
              value={draft.orderType}
              onValueChange={(value) =>
                onDraftChange({ ...draft, orderType: value as TradeOrderType })
              }
            >
              <SelectTrigger id="trade-order-type" aria-label="Trade order type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedOrderTypes.map((orderType) => (
                  <SelectItem key={orderType} value={orderType}>
                    {ORDER_TYPE_LABELS[orderType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-quantity" className="text-foreground">
              Quantity
            </Label>
            <Input
              id="trade-quantity"
              inputMode="decimal"
              value={draft.quantity}
              onChange={(event) => onDraftChange({ ...draft, quantity: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-notional" className="text-foreground">
              Notional
            </Label>
            <Input
              id="trade-notional"
              inputMode="decimal"
              value={draft.notional}
              onChange={(event) => onDraftChange({ ...draft, notional: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-limit-price" className="text-foreground">
              Limit
            </Label>
            <Input
              id="trade-limit-price"
              inputMode="decimal"
              value={draft.limitPrice}
              onChange={(event) => onDraftChange({ ...draft, limitPrice: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-stop-price" className="text-foreground">
              Stop
            </Label>
            <Input
              id="trade-stop-price"
              inputMode="decimal"
              value={draft.stopPrice}
              onChange={(event) => onDraftChange({ ...draft, stopPrice: event.target.value })}
            />
          </div>

          <div className="col-span-2 space-y-2">
            <Label htmlFor="trade-time-in-force" className="text-foreground">
              Time In Force
            </Label>
            <Select
              value={draft.timeInForce}
              onValueChange={(value) =>
                onDraftChange({ ...draft, timeInForce: value as TradeTimeInForce })
              }
            >
              <SelectTrigger id="trade-time-in-force" aria-label="Trade time in force">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_IN_FORCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {account.environment === 'live' ? (
          <label className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <Checkbox
              checked={liveConfirmed}
              onCheckedChange={(checked) => onLiveConfirmedChange(checked === true)}
            />
            <span>I confirm this is a LIVE order for {account.name}.</span>
          </label>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onPreview} disabled={previewPending}>
            <Ticket className="size-4" />
            {previewPending ? 'Previewing...' : 'Preview'}
          </Button>
          <Button type="button" variant="outline" onClick={onSubmit} disabled={submitDisabled}>
            <ShieldCheck className="size-4" />
            {submitPending ? 'Submitting...' : 'Submit'}
          </Button>
        </div>

        {preview ? (
          <section className="space-y-3 rounded-xl border border-mcm-walnut/20 bg-background/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                Preview
              </h2>
              <Badge variant={preview.blocked ? 'destructive' : 'default'}>
                {preview.blocked ? 'Blocked' : 'Clear'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <span className="text-muted-foreground">Symbol</span>
              <span className="text-right font-mono">{preview.order.symbol}</span>
              <span className="text-muted-foreground">Side</span>
              <span className="text-right font-semibold">{preview.order.side.toUpperCase()}</span>
              <span className="text-muted-foreground">Estimated cost</span>
              <span className="text-right font-mono">{formatCurrency(preview.estimatedCost)}</span>
              <span className="text-muted-foreground">Buying power after</span>
              <span className="text-right font-mono">
                {formatCurrency(preview.buyingPowerAfter)}
              </span>
            </div>
            {preview.blockReason ? (
              <p className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm">
                {preview.blockReason}
              </p>
            ) : null}
            {preview.warnings.length ? (
              <div className="rounded-xl border border-mcm-mustard/30 bg-mcm-cream/80 p-3 text-sm">
                {preview.warnings.join(' ')}
              </div>
            ) : null}
            <div className="space-y-3">
              {preview.riskChecks.map((check) => {
                const requiresAcknowledgement = !check.blocking && check.status === 'warning';
                return (
                  <div
                    key={check.checkId}
                    className="rounded-xl border border-mcm-walnut/15 bg-background/40 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{check.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {titleCase(check.status)}
                        </div>
                      </div>
                      <Badge
                        variant={
                          check.blocking
                            ? 'destructive'
                            : check.status === 'warning'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {titleCase(check.status)}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <RiskCheckEvidence message={check.message} metadata={check.metadata} />
                    </div>
                    {requiresAcknowledgement ? (
                      <label className="mt-3 flex items-start gap-3 rounded-xl border border-mcm-walnut/20 bg-background/40 p-3 text-sm">
                        <Checkbox
                          checked={acknowledgedRiskCheckIds.has(check.checkId)}
                          onCheckedChange={(checked) =>
                            onRiskAcknowledgementChange(check.checkId, checked === true)
                          }
                        />
                        <span>I acknowledge this warning and want to proceed with submission.</span>
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

export function TradeDeskPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAccountId = searchParams.get('accountId');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(requestedAccountId);
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<TradeOrderPreviewResponse | null>(null);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<WorkflowMessage | null>(null);
  const [acknowledgedRiskCheckIds, setAcknowledgedRiskCheckIds] = useState<Set<string>>(new Set());

  const accountsQuery = useQuery({
    queryKey: tradeDeskKeys.accounts(),
    queryFn: ({ signal }) => tradeDeskApi.listAccounts(signal),
    refetchInterval: 30_000
  });
  const accounts = accountsQuery.data?.accounts ?? [];

  useEffect(() => {
    if (!accounts.length) {
      return;
    }
    const nextAccountId =
      (requestedAccountId && accounts.some((account) => account.accountId === requestedAccountId)
        ? requestedAccountId
        : null) ??
      selectedAccountId ??
      accounts[0].accountId;
    if (selectedAccountId !== nextAccountId) {
      setSelectedAccountId(nextAccountId);
    }
  }, [accounts, requestedAccountId, selectedAccountId]);

  const selectedAccount = useMemo(
    () =>
      accounts.find((account) => account.accountId === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId]
  );
  const activeAccountId = selectedAccount?.accountId ?? null;

  useEffect(() => {
    if (!activeAccountId) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    if (nextParams.get('accountId') !== activeAccountId) {
      nextParams.set('accountId', activeAccountId);
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeAccountId, searchParams, setSearchParams]);

  const detailQuery = useQuery({
    queryKey: tradeDeskKeys.detail(activeAccountId),
    queryFn: ({ signal }) => tradeDeskApi.getAccountDetail(activeAccountId ?? '', signal),
    enabled: Boolean(activeAccountId),
    refetchInterval: 30_000
  });
  const positionsQuery = useQuery({
    queryKey: tradeDeskKeys.positions(activeAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listPositions(activeAccountId ?? '', signal),
    enabled: Boolean(activeAccountId),
    refetchInterval: 30_000
  });
  const ordersQuery = useQuery({
    queryKey: tradeDeskKeys.orders(activeAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listOrders(activeAccountId ?? '', signal),
    enabled: Boolean(activeAccountId),
    refetchInterval: 15_000
  });

  const selectedDetail = detailQuery.data ?? null;

  useEffect(() => {
    if (!selectedAccount) {
      return;
    }
    const allowedOrderTypes = getAllowedOrderTypes(selectedAccount, selectedDetail);
    if (!allowedOrderTypes.includes(draft.orderType)) {
      setDraft((current) => ({ ...current, orderType: allowedOrderTypes[0] ?? 'market' }));
      setPreview(null);
    }
  }, [draft.orderType, selectedAccount, selectedDetail]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) {
        throw new Error('Select an account before previewing.');
      }
      const { payload, errors } = buildPreviewRequest(selectedAccount, selectedDetail, draft);
      if (!payload) {
        throw new Error(errors.join(' '));
      }
      return tradeDeskApi.previewOrder(selectedAccount.accountId, payload);
    },
    onSuccess: (result) => {
      setPreview(result);
      setAcknowledgedRiskCheckIds(new Set());
      setWorkflowMessage({
        tone: result.blocked ? 'warning' : 'info',
        title: result.blocked ? 'Preview Blocked' : 'Preview Ready',
        message: result.blocked
          ? result.blockReason || 'The preview returned trade blockers.'
          : 'Review the ticket, risk checks, and acknowledgement requirements before submitting.'
      });
    },
    onError: (error) => {
      setWorkflowMessage({
        tone: 'error',
        title: 'Preview Failed',
        message: extractTradeDeskErrorMessage(error, 'The order preview could not be created.')
      });
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount || !preview) {
        throw new Error('Preview the order before submitting.');
      }

      const payload: TradeOrderPlaceRequest = {
        accountId: selectedAccount.accountId,
        environment: selectedAccount.environment,
        clientRequestId: createTradeDeskIdempotencyKey('submit-client'),
        symbol: preview.order.symbol,
        side: preview.order.side,
        orderType: preview.order.orderType,
        timeInForce: preview.order.timeInForce,
        assetClass: preview.order.assetClass,
        quantity: preview.order.quantity,
        notional: preview.order.notional,
        limitPrice: preview.order.limitPrice,
        stopPrice: preview.order.stopPrice,
        allowExtendedHours: draft.allowExtendedHours,
        source: 'manual',
        idempotencyKey: createTradeDeskIdempotencyKey('submit'),
        previewId: preview.previewId,
        confirmedAt: new Date().toISOString(),
        confirmedRiskCheckIds: Array.from(acknowledgedRiskCheckIds)
      };
      return tradeDeskApi.placeOrder(selectedAccount.accountId, payload);
    },
    onSuccess: (result) => {
      if (selectedAccount) {
        invalidateAccountQueries(queryClient, selectedAccount.accountId);
      }
      setPreview(null);
      setAcknowledgedRiskCheckIds(new Set());
      setWorkflowMessage({
        tone: result.submitted ? 'info' : 'warning',
        title: result.submitted ? 'Order Submitted' : 'Order Blocked',
        message: result.submitted
          ? 'The order was accepted for execution.'
          : result.message || 'The trade was not submitted.'
      });
    },
    onError: (error) => {
      setWorkflowMessage({
        tone: 'error',
        title: 'Submit Failed',
        message: extractTradeDeskErrorMessage(
          error,
          'The order submission could not be completed.'
        )
      });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (order: TradeOrder) => {
      if (!selectedAccount) {
        throw new Error('Select an account before cancelling.');
      }
      setCancellingOrderId(order.orderId);
      return tradeDeskApi.cancelOrder(selectedAccount.accountId, order.orderId, {
        accountId: selectedAccount.accountId,
        orderId: order.orderId,
        clientRequestId: createTradeDeskIdempotencyKey('cancel-client'),
        idempotencyKey: createTradeDeskIdempotencyKey('cancel'),
        reason: 'Operator cancel from trade desk.'
      });
    },
    onSuccess: (result) => {
      if (selectedAccount) {
        invalidateAccountQueries(queryClient, selectedAccount.accountId);
      }
      setWorkflowMessage({
        tone: result.cancelAccepted ? 'info' : 'warning',
        title: result.cancelAccepted ? 'Cancel Requested' : 'Cancel Blocked',
        message: result.cancelAccepted
          ? 'The cancel request was accepted.'
          : result.message || 'The cancel request was not accepted.'
      });
    },
    onError: (error) => {
      setWorkflowMessage({
        tone: 'error',
        title: 'Cancel Failed',
        message: extractTradeDeskErrorMessage(error, 'The cancel request could not be completed.')
      });
    },
    onSettled: () => setCancellingOrderId(null)
  });

  if (accountsQuery.isLoading) {
    return <PageLoader text="Loading trade accounts..." />;
  }

  if (!selectedAccount) {
    return (
      <div className="space-y-6">
        <PageHero
          kicker="Trade Desk"
          title="Trade Desk"
          subtitle="No configured trade accounts are available."
        />
        <StatePanel
          tone="empty"
          title="No Trade Accounts"
          message="Configure account mappings in the control plane before using the trade desk."
        />
      </div>
    );
  }

  const positions = positionsQuery.data?.positions ?? [];
  const openOrders = ordersQuery.data?.orders ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        kicker="Trade Desk"
        title="Trade Desk"
        subtitle={`${selectedAccount.name} is routed through ${brokerLabel(selectedAccount.provider)} with ${selectedAccount.environment.toUpperCase()} execution labeling.`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 sm:min-w-[16rem]">
              <Select
                value={selectedAccount.accountId}
                onValueChange={(value) => {
                  setSelectedAccountId(value);
                  setPreview(null);
                  setLiveConfirmed(false);
                  setWorkflowMessage(null);
                  setAcknowledgedRiskCheckIds(new Set());
                }}
              >
                <SelectTrigger aria-label="Trade account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.accountId} value={account.accountId}>
                      {account.name} · {account.environment.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => activeAccountId && invalidateAccountQueries(queryClient, activeAccountId)}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button asChild type="button" variant="secondary">
              <Link to={buildTradeMonitorPath(activeAccountId)}>View in Trade Monitor</Link>
            </Button>
          </div>
        }
        metrics={[
          {
            label: 'Environment',
            value: selectedAccount.environment.toUpperCase(),
            detail: brokerLabel(selectedAccount.provider),
            icon: <BadgeDollarSign className="size-4" />
          },
          {
            label: 'Readiness',
            value: titleCase(selectedAccount.readiness),
            detail: selectedAccount.readinessReason ?? 'No blocker reported',
            icon: <ShieldCheck className="size-4" />
          },
          {
            label: 'Cash',
            value: formatCurrency(selectedAccount.cash),
            detail: `Buying power ${formatCurrency(selectedAccount.buyingPower)}`,
            icon: <BadgeDollarSign className="size-4" />
          },
          {
            label: 'Open Orders',
            value: selectedAccount.openOrderCount,
            detail: `${selectedAccount.positionCount} positions`,
            icon: <FileClock className="size-4" />
          }
        ]}
      />

      {workflowMessage ? (
        <StatePanel
          tone={workflowMessage.tone === 'info' ? 'info' : workflowMessage.tone}
          title={workflowMessage.title}
          message={workflowMessage.message}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
        <DeskControlsRail account={selectedAccount} detail={selectedDetail} />

        <div className="min-w-0 space-y-5">
          {selectedAccount.environment === 'live' ? (
            <StatePanel
              tone="error"
              title="Live Execution"
              message="Live submit remains disabled unless the account explicitly allows live trading and the live confirmation is checked."
              icon={<XCircle className="size-4" />}
            />
          ) : null}

          <Tabs defaultValue="orders" className="mcm-panel p-5">
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList className="min-w-max">
                <TabsTrigger value="orders">Open Orders</TabsTrigger>
                <TabsTrigger value="positions">Positions</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="orders" className="mt-5">
              {ordersQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading open orders..." />
              ) : (
                <OrdersTable
                  orders={openOrders}
                  onCancel={(order) => cancelMutation.mutate(order)}
                  cancellingOrderId={cancellingOrderId}
                  emptyMessage="No open orders are currently staged for this account."
                />
              )}
            </TabsContent>
            <TabsContent value="positions" className="mt-5">
              {positionsQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading positions..." />
              ) : (
                <PositionsTable positions={positions} variant="desk" />
              )}
            </TabsContent>
          </Tabs>
        </div>

        <OrderTicket
          account={selectedAccount}
          detail={selectedDetail}
          draft={draft}
          preview={preview}
          acknowledgedRiskCheckIds={acknowledgedRiskCheckIds}
          liveConfirmed={liveConfirmed}
          onDraftChange={(nextDraft) => {
            setDraft(nextDraft);
            setPreview(null);
            setAcknowledgedRiskCheckIds(new Set());
          }}
          onPreview={() => previewMutation.mutate()}
          onSubmit={() => submitMutation.mutate()}
          onLiveConfirmedChange={setLiveConfirmed}
          onRiskAcknowledgementChange={(checkId, checked) => {
            setAcknowledgedRiskCheckIds((current) => {
              const next = new Set(current);
              if (checked) {
                next.add(checkId);
              } else {
                next.delete(checkId);
              }
              return next;
            });
          }}
          previewPending={previewMutation.isPending}
          submitPending={submitMutation.isPending}
        />
      </div>
    </div>
  );
}
