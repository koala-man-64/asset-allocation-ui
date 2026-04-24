import { useEffect, useMemo, useState } from 'react';
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
import { toast } from 'sonner';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  createTradeDeskIdempotencyKey,
  tradeDeskApi,
  tradeDeskKeys
} from '@/services/tradeDeskApi';
import type {
  TradeAccountSummary,
  TradeDeskAuditEvent,
  TradeEnvironment,
  TradeOrder,
  TradeOrderPreviewRequest,
  TradeOrderPreviewResponse,
  TradeOrderSide,
  TradeOrderStatus,
  TradeOrderType,
  TradePosition,
  TradeTimeInForce
} from '@asset-allocation/contracts';

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

const TERMINAL_ORDER_STATUSES: TradeOrderStatus[] = ['filled', 'cancelled', 'rejected', 'expired'];

function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Not available';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 0 : 2
  }).format(value);
}

function formatNumber(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Not available';
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function formatTimestamp(value?: string | null): string {
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

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function environmentVariant(environment: TradeEnvironment) {
  if (environment === 'live') return 'destructive' as const;
  if (environment === 'sandbox') return 'secondary' as const;
  return 'outline' as const;
}

function readinessVariant(readiness: TradeAccountSummary['readiness']) {
  if (readiness === 'ready') return 'default' as const;
  if (readiness === 'review') return 'secondary' as const;
  return 'destructive' as const;
}

function orderStatusVariant(status: TradeOrderStatus) {
  if (status === 'filled' || status === 'accepted') return 'default' as const;
  if (status === 'rejected' || status === 'unknown_reconcile_required')
    return 'destructive' as const;
  if (status === 'cancel_pending' || status === 'partially_filled') return 'secondary' as const;
  return 'outline' as const;
}

function brokerLabel(provider: TradeAccountSummary['provider']): string {
  if (provider === 'etrade') return 'E*TRADE';
  if (provider === 'schwab') return 'Schwab';
  return 'Alpaca';
}

function parsePositiveNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function buildPreviewRequest(
  selectedAccount: TradeAccountSummary,
  draft: OrderDraft
): { payload?: TradeOrderPreviewRequest; errors: string[] } {
  const symbol = draft.symbol.trim().toUpperCase();
  const quantity = parsePositiveNumber(draft.quantity);
  const notional = parsePositiveNumber(draft.notional);
  const limitPrice = parsePositiveNumber(draft.limitPrice);
  const stopPrice = parsePositiveNumber(draft.stopPrice);
  const errors: string[] = [];

  if (!symbol) errors.push('Symbol is required.');
  if (quantity !== undefined && Number.isNaN(quantity))
    errors.push('Quantity must be greater than zero.');
  if (notional !== undefined && Number.isNaN(notional))
    errors.push('Notional must be greater than zero.');
  if ((quantity === undefined) === (notional === undefined)) {
    errors.push('Enter exactly one of quantity or notional.');
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

  if (errors.length) {
    return { errors };
  }

  return {
    errors,
    payload: {
      accountId: selectedAccount.accountId,
      environment: selectedAccount.environment,
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
}

function AccountReadinessRail({
  selectedAccount,
  events
}: {
  selectedAccount: TradeAccountSummary;
  events: readonly TradeDeskAuditEvent[];
}) {
  const capabilities = selectedAccount.capabilities;
  const freshness = selectedAccount.freshness;
  const restrictionItems = [
    selectedAccount.killSwitchActive ? 'Account kill switch active' : null,
    !capabilities.canPreview ? 'Preview disabled' : null,
    selectedAccount.environment === 'live' && !capabilities.canSubmitLive
      ? 'Live submit disabled'
      : null,
    capabilities.readOnly ? 'Read-only account' : null,
    capabilities.unsupportedReason ?? null
  ].filter(Boolean);

  return (
    <aside className="mcm-panel flex min-h-[42rem] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Account Controls
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={readinessVariant(selectedAccount.readiness)}>
            {titleCase(selectedAccount.readiness)}
          </Badge>
          <Badge variant={environmentVariant(selectedAccount.environment)}>
            {selectedAccount.environment.toUpperCase()}
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
              <span className="font-semibold">{brokerLabel(selectedAccount.provider)}</span>
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
              <span className="text-muted-foreground">Open orders</span>
              <span className="font-semibold">{titleCase(freshness.ordersState)}</span>
            </div>
          </div>
          {selectedAccount.readinessReason ? (
            <p className="rounded-xl border border-mcm-walnut/20 bg-background/40 p-3 text-sm">
              {selectedAccount.readinessReason}
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
              No account-level execution blockers reported.
            </div>
          )}
        </section>

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
          <ActivityTimeline events={events} compact />
        </section>
      </div>
    </aside>
  );
}

function PositionsTable({ positions }: { positions: readonly TradePosition[] }) {
  if (!positions.length) {
    return (
      <StatePanel
        tone="empty"
        title="No Positions"
        message="This account has no position rows in the current trade desk snapshot."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Class</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Last</TableHead>
          <TableHead className="text-right">Unrealized</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position) => (
          <TableRow key={position.symbol}>
            <TableCell className="font-mono font-semibold">{position.symbol}</TableCell>
            <TableCell>{titleCase(position.assetClass)}</TableCell>
            <TableCell className="text-right font-mono">
              {formatNumber(position.quantity)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(position.marketValue)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(position.lastPrice)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(position.unrealizedPnl)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OrdersTable({
  orders,
  onCancel,
  cancellingOrderId
}: {
  orders: readonly TradeOrder[];
  onCancel?: (order: TradeOrder) => void;
  cancellingOrderId?: string | null;
}) {
  if (!orders.length) {
    return <StatePanel tone="empty" title="No Orders" message="No order rows match this view." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Notional</TableHead>
          <TableHead>Updated</TableHead>
          {onCancel ? <TableHead className="text-right">Action</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const canCancel = onCancel && !TERMINAL_ORDER_STATUSES.includes(order.status);
          return (
            <TableRow key={order.orderId}>
              <TableCell className="max-w-[12rem] truncate font-mono text-xs">
                {order.orderId}
              </TableCell>
              <TableCell className="font-mono font-semibold">{order.symbol}</TableCell>
              <TableCell>
                <Badge variant={order.side === 'buy' ? 'default' : 'secondary'}>
                  {order.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={orderStatusVariant(order.status)}>{titleCase(order.status)}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{formatNumber(order.quantity)}</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(order.estimatedNotional ?? order.notional)}
              </TableCell>
              <TableCell>{formatTimestamp(order.updatedAt ?? order.createdAt)}</TableCell>
              {onCancel ? (
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canCancel || cancellingOrderId === order.orderId}
                    onClick={() => onCancel(order)}
                  >
                    Cancel
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ActivityTimeline({
  events,
  compact = false
}: {
  events: readonly TradeDeskAuditEvent[];
  compact?: boolean;
}) {
  if (!events.length) {
    return <div className="text-sm text-muted-foreground">No trade desk activity recorded.</div>;
  }

  return (
    <div className="space-y-3">
      {events.slice(0, compact ? 4 : 12).map((event) => (
        <div key={event.eventId} className="border-l-2 border-mcm-teal pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={event.severity === 'critical' ? 'destructive' : 'outline'}>
              {titleCase(event.eventType)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(event.occurredAt)}
            </span>
          </div>
          <p className="mt-1 text-sm">{event.summary || titleCase(event.eventType)}</p>
          {event.statusAfter ? (
            <p className="text-xs text-muted-foreground">Status: {titleCase(event.statusAfter)}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function OrderTicket({
  selectedAccount,
  draft,
  preview,
  liveConfirmed,
  onDraftChange,
  onPreview,
  onSubmit,
  onLiveConfirmedChange,
  previewPending,
  submitPending
}: {
  selectedAccount: TradeAccountSummary;
  draft: OrderDraft;
  preview: TradeOrderPreviewResponse | null;
  liveConfirmed: boolean;
  onDraftChange: (nextDraft: OrderDraft) => void;
  onPreview: () => void;
  onSubmit: () => void;
  onLiveConfirmedChange: (checked: boolean) => void;
  previewPending: boolean;
  submitPending: boolean;
}) {
  const submitDisabled =
    !preview ||
    preview.blocked ||
    submitPending ||
    (selectedAccount.environment === 'live' && !liveConfirmed) ||
    (selectedAccount.environment === 'live' && !selectedAccount.capabilities.canSubmitLive);

  return (
    <aside className="mcm-panel min-h-[42rem] overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Manual Ticket
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={environmentVariant(selectedAccount.environment)}>
            {selectedAccount.environment.toUpperCase()}
          </Badge>
          <Badge variant={selectedAccount.capabilities.readOnly ? 'secondary' : 'outline'}>
            {selectedAccount.capabilities.readOnly ? 'Read Only' : 'Execution Capable'}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="trade-symbol">Symbol</Label>
            <Input
              id="trade-symbol"
              value={draft.symbol}
              onChange={(event) => onDraftChange({ ...draft, symbol: event.target.value })}
              placeholder="MSFT"
            />
          </div>

          <div className="space-y-2">
            <Label>Side</Label>
            <Select
              value={draft.side}
              onValueChange={(value) => onDraftChange({ ...draft, side: value as TradeOrderSide })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Order Type</Label>
            <Select
              value={draft.orderType}
              onValueChange={(value) =>
                onDraftChange({ ...draft, orderType: value as TradeOrderType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="market">Market</SelectItem>
                <SelectItem value="limit">Limit</SelectItem>
                <SelectItem value="stop">Stop</SelectItem>
                <SelectItem value="stop_limit">Stop Limit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-quantity">Quantity</Label>
            <Input
              id="trade-quantity"
              inputMode="decimal"
              value={draft.quantity}
              onChange={(event) => onDraftChange({ ...draft, quantity: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-notional">Notional</Label>
            <Input
              id="trade-notional"
              inputMode="decimal"
              value={draft.notional}
              onChange={(event) => onDraftChange({ ...draft, notional: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-limit-price">Limit</Label>
            <Input
              id="trade-limit-price"
              inputMode="decimal"
              value={draft.limitPrice}
              onChange={(event) => onDraftChange({ ...draft, limitPrice: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-stop-price">Stop</Label>
            <Input
              id="trade-stop-price"
              inputMode="decimal"
              value={draft.stopPrice}
              onChange={(event) => onDraftChange({ ...draft, stopPrice: event.target.value })}
            />
          </div>

          <div className="col-span-2 space-y-2">
            <Label>Time In Force</Label>
            <Select
              value={draft.timeInForce}
              onValueChange={(value) =>
                onDraftChange({ ...draft, timeInForce: value as TradeTimeInForce })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="gtc">GTC</SelectItem>
                <SelectItem value="ioc">IOC</SelectItem>
                <SelectItem value="fok">FOK</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedAccount.environment === 'live' ? (
          <label className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <Checkbox
              checked={liveConfirmed}
              onCheckedChange={(checked) => onLiveConfirmedChange(checked === true)}
            />
            <span>I confirm this is a LIVE order for {selectedAccount.name}.</span>
          </label>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onPreview} disabled={previewPending}>
            <Ticket className="size-4" />
            Preview
          </Button>
          <Button type="button" variant="outline" onClick={onSubmit} disabled={submitDisabled}>
            <ShieldCheck className="size-4" />
            Submit
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
            <div className="space-y-2">
              {preview.riskChecks.map((check) => (
                <div key={check.checkId} className="flex items-start justify-between gap-3 text-sm">
                  <span>{check.label}</span>
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
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

export function TradeDeskPage() {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<TradeOrderPreviewResponse | null>(null);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: tradeDeskKeys.accounts(),
    queryFn: ({ signal }) => tradeDeskApi.listAccounts(signal),
    refetchInterval: 30_000
  });
  const accounts = accountsQuery.data?.accounts ?? [];

  useEffect(() => {
    if (!selectedAccountId && accounts.length) {
      setSelectedAccountId(accounts[0].accountId);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () =>
      accounts.find((account) => account.accountId === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId]
  );
  const activeAccountId = selectedAccount?.accountId ?? null;

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
  const historyQuery = useQuery({
    queryKey: tradeDeskKeys.history(activeAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listHistory(activeAccountId ?? '', signal),
    enabled: Boolean(activeAccountId),
    refetchInterval: 30_000
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) {
        throw new Error('Select an account before previewing.');
      }
      const { payload, errors } = buildPreviewRequest(selectedAccount, draft);
      if (!payload) {
        throw new Error(errors.join(' '));
      }
      return tradeDeskApi.previewOrder(selectedAccount.accountId, payload);
    },
    onSuccess: (result) => {
      setPreview(result);
      toast.success(result.blocked ? 'Preview returned blockers.' : 'Preview ready.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Preview failed.');
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount || !preview) {
        throw new Error('Preview the order before submitting.');
      }
      const payload = {
        ...preview.order,
        accountId: selectedAccount.accountId,
        environment: selectedAccount.environment,
        clientRequestId: createTradeDeskIdempotencyKey('submit-client'),
        idempotencyKey: createTradeDeskIdempotencyKey('submit'),
        previewId: preview.previewId,
        confirmedAt: new Date().toISOString(),
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
        source: 'manual' as const,
        confirmedRiskCheckIds: preview.riskChecks
          .filter((check) => !check.blocking)
          .map((check) => check.checkId)
      };
      return tradeDeskApi.placeOrder(selectedAccount.accountId, payload);
    },
    onSuccess: (result) => {
      if (selectedAccount) {
        invalidateAccountQueries(queryClient, selectedAccount.accountId);
      }
      setPreview(null);
      toast.success(result.submitted ? 'Order submitted.' : result.message || 'Order blocked.');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? `Submit result is reconciliation-required: ${error.message}`
          : 'Submit result is reconciliation-required.'
      );
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
      toast.success(
        result.cancelAccepted ? 'Cancel requested.' : result.message || 'Cancel blocked.'
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Cancel failed.');
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
          title="Account Trading"
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

  const detail = detailQuery.data;
  const positions = positionsQuery.data?.positions ?? [];
  const openOrders = ordersQuery.data?.orders ?? [];
  const history = historyQuery.data?.orders ?? [];
  const events = detail?.recentAuditEvents ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        kicker="Trade Desk"
        title="Account Trading"
        subtitle={`${selectedAccount.name} is routed through ${brokerLabel(selectedAccount.provider)} with ${selectedAccount.environment.toUpperCase()} execution labeling.`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[18rem]">
              <Select
                value={selectedAccount.accountId}
                onValueChange={(value) => {
                  setSelectedAccountId(value);
                  setPreview(null);
                  setLiveConfirmed(false);
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
              onClick={() =>
                activeAccountId && invalidateAccountQueries(queryClient, activeAccountId)
              }
            >
              <RefreshCw className="size-4" />
              Refresh
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

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
        <AccountReadinessRail selectedAccount={selectedAccount} events={events} />

        <main className="min-w-0 space-y-5">
          {selectedAccount.environment === 'live' ? (
            <StatePanel
              tone="error"
              title="LIVE Execution"
              message="Live submit remains disabled unless the control plane returns live capability and the live confirmation is checked."
              icon={<XCircle className="size-4" />}
            />
          ) : null}

          <Tabs defaultValue="positions" className="mcm-panel p-5">
            <TabsList>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Open Orders</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="positions" className="mt-5">
              {positionsQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading positions..." />
              ) : (
                <PositionsTable positions={positions} />
              )}
            </TabsContent>
            <TabsContent value="orders" className="mt-5">
              {ordersQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading orders..." />
              ) : (
                <OrdersTable
                  orders={openOrders}
                  onCancel={(order) => cancelMutation.mutate(order)}
                  cancellingOrderId={cancellingOrderId}
                />
              )}
            </TabsContent>
            <TabsContent value="history" className="mt-5">
              {historyQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading history..." />
              ) : (
                <OrdersTable orders={history} />
              )}
            </TabsContent>
            <TabsContent value="activity" className="mt-5">
              <div className="rounded-xl border border-mcm-walnut/20 bg-background/35 p-4">
                <ActivityTimeline events={events} />
              </div>
            </TabsContent>
          </Tabs>
        </main>

        <OrderTicket
          selectedAccount={selectedAccount}
          draft={draft}
          preview={preview}
          liveConfirmed={liveConfirmed}
          onDraftChange={(nextDraft) => {
            setDraft(nextDraft);
            setPreview(null);
          }}
          onPreview={() => previewMutation.mutate()}
          onSubmit={() => submitMutation.mutate()}
          onLiveConfirmedChange={setLiveConfirmed}
          previewPending={previewMutation.isPending}
          submitPending={submitMutation.isPending}
        />
      </div>
    </div>
  );
}
