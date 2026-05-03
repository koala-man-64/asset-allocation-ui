import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Clock3,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { tradeDeskApi, tradeDeskKeys } from '@/services/tradeDeskApi';
import type { TradeAccountDetailView, TradeAccountSummaryView } from '@/services/tradeDeskModels';
import {
  ActivityTimeline,
  BlotterTable,
  OrdersTable,
  PositionsTable
} from '@/features/trade-desk/tradeDeskComponents';
import {
  brokerLabel,
  buildTradeDeskPath,
  environmentVariant,
  extractTradeDeskErrorMessage,
  formatCurrency,
  formatNumber,
  formatTimestamp,
  readinessVariant,
  titleCase
} from '@/features/trade-desk/tradeDeskUtils';

function invalidateMonitorQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string | null
) {
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.accounts() });
  if (!accountId) {
    return;
  }
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.detail(accountId) });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.positions(accountId) });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.orders(accountId) });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.history(accountId) });
  void queryClient.invalidateQueries({ queryKey: tradeDeskKeys.blotter(accountId) });
}

function pnlClassName(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return 'text-foreground';
  }
  return value > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive';
}

function activeAlertCount(
  account: TradeAccountSummaryView,
  detail?: TradeAccountDetailView | null
) {
  const detailCount = detail?.alerts.filter((alert) => alert.status !== 'resolved').length;
  return detailCount ?? account.unresolvedAlertCount;
}

const EMPTY_ACCOUNTS: TradeAccountSummaryView[] = [];

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
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Max order notional</span>
          <span>{formatCurrency(riskLimits.maxOrderNotional)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Max daily notional</span>
          <span>{formatCurrency(riskLimits.maxDailyNotional)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Max share quantity</span>
          <span>{formatNumber(riskLimits.maxShareQuantity)}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {riskLimits.allowedOrderTypes.map((orderType) => (
          <Badge key={orderType} variant="outline">
            {titleCase(orderType)}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function MonitorAccountCard({
  account,
  selected,
  activeAlerts,
  onSelect
}: {
  account: TradeAccountSummaryView;
  selected: boolean;
  activeAlerts: number;
  onSelect: () => void;
}) {
  return (
    <article
      className={[
        'mcm-panel flex h-full flex-col gap-4 p-5',
        selected ? 'ring-2 ring-mcm-teal/40' : ''
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{account.name}</h2>
            <Badge variant={environmentVariant(account.environment)}>
              {account.environment.toUpperCase()}
            </Badge>
            <Badge variant={readinessVariant(account.readiness)}>
              {titleCase(account.readiness)}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {brokerLabel(account.provider)} {account.accountNumberMasked}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Last sync</div>
          <div className="font-medium text-foreground">{formatTimestamp(account.lastSyncedAt)}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-background/50 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Buying Power
          </div>
          <div className="mt-2 text-lg font-semibold">{formatCurrency(account.buyingPower)}</div>
          <div className="text-sm text-muted-foreground">Cash {formatCurrency(account.cash)}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/50 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Open Risk
          </div>
          <div className="mt-2 text-lg font-semibold">{account.openOrderCount} open orders</div>
          <div className="text-sm text-muted-foreground">{account.positionCount} positions</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/50 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Day P&amp;L
          </div>
          <div className={`mt-2 text-lg font-semibold ${pnlClassName(account.pnl?.dayPnl)}`}>
            {formatCurrency(account.pnl?.dayPnl)}
          </div>
          <div className={`text-sm ${pnlClassName(account.pnl?.unrealizedPnl)}`}>
            Unrealized {formatCurrency(account.pnl?.unrealizedPnl)}
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/50 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Alerts
          </div>
          <div className="mt-2 text-lg font-semibold">{activeAlerts}</div>
          <div className="text-sm text-muted-foreground">
            Last trade {formatTimestamp(account.lastTradeAt)}
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-3">
        <Button type="button" variant={selected ? 'default' : 'outline'} onClick={onSelect}>
          {selected ? 'Selected' : 'Monitor Account'}
        </Button>
        <Button asChild type="button" variant="secondary">
          <Link to={buildTradeDeskPath(account.accountId)}>Open in Trade Desk</Link>
        </Button>
      </div>
    </article>
  );
}

function SelectedAccountRail({
  account,
  detail,
  detailLoading
}: {
  account: TradeAccountSummaryView;
  detail: TradeAccountDetailView | null;
  detailLoading: boolean;
}) {
  if (detailLoading && !detail) {
    return <PageLoader variant="panel" text="Loading account controls..." />;
  }

  const restrictions = [
    account.killSwitchActive ? 'Account kill switch active.' : null,
    account.capabilities.readOnly ? 'Account is read only.' : null,
    account.capabilities.unsupportedReason ?? null,
    ...(detail?.restrictions ?? []),
    ...(detail?.unresolvedAlerts ?? [])
  ].filter(Boolean);
  const alerts = detail?.alerts.filter((alert) => alert.status !== 'resolved') ?? [];

  return (
    <aside className="mcm-panel flex min-h-[44rem] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Account Health
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={environmentVariant(account.environment)}>
            {account.environment.toUpperCase()}
          </Badge>
          <Badge variant={readinessVariant(account.readiness)}>
            {titleCase(account.readiness)}
          </Badge>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
            Summary
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Broker</span>
              <span className="font-semibold">{brokerLabel(account.provider)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Account</span>
              <span className="font-semibold">{account.accountNumberMasked}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Cash</span>
              <span className="font-semibold">{formatCurrency(account.cash)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Buying power</span>
              <span className="font-semibold">{formatCurrency(account.buyingPower)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Realized P&amp;L</span>
              <span className={`font-semibold ${pnlClassName(account.pnl?.realizedPnl)}`}>
                {formatCurrency(account.pnl?.realizedPnl)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Unrealized P&amp;L</span>
              <span className={`font-semibold ${pnlClassName(account.pnl?.unrealizedPnl)}`}>
                {formatCurrency(account.pnl?.unrealizedPnl)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Gross exposure</span>
              <span className="font-semibold">{formatCurrency(account.pnl?.grossExposure)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Net exposure</span>
              <span className="font-semibold">{formatCurrency(account.pnl?.netExposure)}</span>
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
          {restrictions.length ? (
            <div className="space-y-2">
              {restrictions.map((restriction) => (
                <div
                  key={restriction}
                  className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{restriction}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-mcm-teal/25 bg-accent/35 p-3 text-sm">
              No account-level restrictions are currently active.
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
            Alerts
          </h2>
          {alerts.length ? (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.alertId}
                  className="rounded-xl border border-mcm-walnut/20 bg-background/35 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={alert.blocking ? 'destructive' : 'secondary'}>
                      {titleCase(alert.severity)}
                    </Badge>
                    <Badge variant="outline">{titleCase(alert.status)}</Badge>
                    <span className="font-semibold">{alert.title}</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{alert.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-mcm-teal/25 bg-accent/35 p-3 text-sm">
              No active trader alerts are open for this account.
            </div>
          )}
        </section>

        <RiskLimitsPanel detail={detail} />

        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
            Freshness
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Balances</span>
              <span>{formatTimestamp(account.freshness.balancesAsOf)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Positions</span>
              <span>{formatTimestamp(account.freshness.positionsAsOf)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Orders</span>
              <span>{formatTimestamp(account.freshness.ordersAsOf)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Last trade</span>
              <span>{formatTimestamp(account.lastTradeAt)}</span>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}

export function TradeMonitorPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAccountId = searchParams.get('accountId');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(requestedAccountId);

  const accountsQuery = useQuery({
    queryKey: tradeDeskKeys.accounts(),
    queryFn: ({ signal }) => tradeDeskApi.listAccounts(signal),
    refetchInterval: 30_000
  });
  const accounts = accountsQuery.data?.accounts ?? EMPTY_ACCOUNTS;

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
  const historyQuery = useQuery({
    queryKey: tradeDeskKeys.history(activeAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listHistory(activeAccountId ?? '', signal),
    enabled: Boolean(activeAccountId),
    refetchInterval: 30_000
  });
  const blotterQuery = useQuery({
    queryKey: tradeDeskKeys.blotter(activeAccountId),
    queryFn: ({ signal }) => tradeDeskApi.listBlotter(activeAccountId ?? '', signal),
    enabled: Boolean(activeAccountId),
    refetchInterval: 30_000
  });

  const totals = useMemo(() => {
    return accounts.reduce(
      (acc, account) => {
        acc.cash += account.cash ?? 0;
        acc.buyingPower += account.buyingPower ?? 0;
        acc.openOrders += account.openOrderCount ?? 0;
        acc.positions += account.positionCount ?? 0;
        acc.alerts += account.unresolvedAlertCount ?? 0;
        acc.dayPnl += account.pnl?.dayPnl ?? 0;
        acc.unrealizedPnl += account.pnl?.unrealizedPnl ?? 0;
        return acc;
      },
      {
        cash: 0,
        buyingPower: 0,
        openOrders: 0,
        positions: 0,
        alerts: 0,
        dayPnl: 0,
        unrealizedPnl: 0
      }
    );
  }, [accounts]);

  if (accountsQuery.isLoading) {
    return <PageLoader text="Loading trader monitor..." />;
  }

  if (accountsQuery.error && !accounts.length) {
    return (
      <div className="space-y-6">
        <PageHero
          kicker="Trade Monitor"
          title="Trade Monitor"
          subtitle="Cross-account monitoring is unavailable until the account snapshot can be loaded."
        />
        <StatePanel
          tone="error"
          title="Account Snapshot Unavailable"
          message={extractTradeDeskErrorMessage(
            accountsQuery.error,
            'The trade account monitor could not be loaded.'
          )}
        />
      </div>
    );
  }

  if (!selectedAccount) {
    return (
      <div className="space-y-6">
        <PageHero
          kicker="Trade Monitor"
          title="Trade Monitor"
          subtitle="No configured trade accounts are available."
        />
        <StatePanel
          tone="empty"
          title="No Trade Accounts"
          message="Configure account mappings in the control plane before using the trade monitor."
        />
      </div>
    );
  }

  const detail = detailQuery.data ?? null;
  const positions = positionsQuery.data?.positions ?? [];
  const orders = ordersQuery.data?.orders ?? [];
  const history = historyQuery.data?.orders ?? [];
  const blotterRows = blotterQuery.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        kicker="Trade Monitor"
        title="Trade Monitor"
        subtitle="Cross-account readiness, P&L, positions, order flow, and trader controls stay separate from execution entry."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => invalidateMonitorQueries(queryClient, activeAccountId)}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button asChild type="button" variant="secondary">
              <Link to={buildTradeDeskPath(activeAccountId)}>Open in Trade Desk</Link>
            </Button>
          </div>
        }
        metrics={[
          {
            label: 'Accounts',
            value: accounts.length,
            detail: `${accounts.filter((account) => account.readiness === 'ready').length} ready`,
            icon: <ShieldAlert className="size-4" />
          },
          {
            label: 'Day P&L',
            value: formatCurrency(totals.dayPnl),
            detail: `Unrealized ${formatCurrency(totals.unrealizedPnl)}`,
            icon: <BadgeDollarSign className="size-4" />,
            valueClassName: pnlClassName(totals.dayPnl)
          },
          {
            label: 'Open Risk',
            value: `${totals.openOrders} orders`,
            detail: `${totals.positions} positions`,
            icon: <Activity className="size-4" />
          },
          {
            label: 'Trader Alerts',
            value: totals.alerts,
            detail: `Buying power ${formatCurrency(totals.buyingPower)}`,
            icon: <Clock3 className="size-4" />
          }
        ]}
        metricsClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">All Accounts</h2>
            <p className="text-sm text-muted-foreground">
              Select an account to inspect its positions, history, alerts, and health.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            Total cash {formatCurrency(totals.cash)}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <MonitorAccountCard
              key={account.accountId}
              account={account}
              selected={account.accountId === activeAccountId}
              activeAlerts={activeAlertCount(
                account,
                account.accountId === activeAccountId ? detail : null
              )}
              onSelect={() => setSelectedAccountId(account.accountId)}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <SelectedAccountRail
          account={selectedAccount}
          detail={detail}
          detailLoading={detailQuery.isLoading}
        />

        <div className="min-w-0 space-y-5">
          {detailQuery.error ? (
            <StatePanel
              tone="error"
              title="Account Detail Unavailable"
              message={extractTradeDeskErrorMessage(
                detailQuery.error,
                'The selected account detail could not be loaded.'
              )}
            />
          ) : null}

          <Tabs defaultValue="positions" className="mcm-panel p-5">
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList className="min-w-max">
                <TabsTrigger value="positions">Positions</TabsTrigger>
                <TabsTrigger value="orders">Open Orders</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="blotter">Blotter</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="positions" className="mt-5">
              {positionsQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading positions..." />
              ) : positionsQuery.error ? (
                <StatePanel
                  tone="error"
                  title="Positions Unavailable"
                  message={extractTradeDeskErrorMessage(
                    positionsQuery.error,
                    'Positions could not be loaded for this account.'
                  )}
                />
              ) : (
                <PositionsTable positions={positions} />
              )}
            </TabsContent>

            <TabsContent value="orders" className="mt-5">
              {ordersQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading open orders..." />
              ) : ordersQuery.error ? (
                <StatePanel
                  tone="error"
                  title="Orders Unavailable"
                  message={extractTradeDeskErrorMessage(
                    ordersQuery.error,
                    'Open orders could not be loaded for this account.'
                  )}
                />
              ) : (
                <OrdersTable
                  orders={orders}
                  emptyMessage="No open orders are currently staged for this account."
                />
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-5">
              {historyQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading order history..." />
              ) : historyQuery.error ? (
                <StatePanel
                  tone="error"
                  title="History Unavailable"
                  message={extractTradeDeskErrorMessage(
                    historyQuery.error,
                    'Order history could not be loaded for this account.'
                  )}
                />
              ) : (
                <OrdersTable
                  orders={history}
                  emptyTitle="No History"
                  emptyMessage="No historical orders were returned for this account."
                />
              )}
            </TabsContent>

            <TabsContent value="blotter" className="mt-5">
              {blotterQuery.isLoading ? (
                <PageLoader variant="panel" text="Loading trader blotter..." />
              ) : blotterQuery.error ? (
                <StatePanel
                  tone="error"
                  title="Blotter Unavailable"
                  message={extractTradeDeskErrorMessage(
                    blotterQuery.error,
                    'Blotter rows could not be loaded for this account.'
                  )}
                />
              ) : (
                <BlotterTable rows={blotterRows} />
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-5">
              {detailQuery.isLoading && !detail ? (
                <PageLoader variant="panel" text="Loading activity..." />
              ) : (
                <ActivityTimeline events={detail?.recentAuditEvents ?? []} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
