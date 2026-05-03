import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  CheckCircle2,
  ShieldAlert,
  Wallet
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageLoader } from '@/app/components/common/PageLoader';
import { StatCard } from '@/app/components/common/StatCard';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/app/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  accountOperationsApi,
  accountOperationsKeys
} from '@/services/accountOperationsApi';
import { AccountConfigurationPanel } from '@/features/accounts/components/AccountConfigurationPanel';
import type {
  BrokerAccountAlert,
  BrokerAccountConfiguration,
  BrokerAccountDetail,
  BrokerAccountSummary,
  BrokerTradingPolicyUpdateRequest,
  BrokerAccountAllocationUpdateRequest,
  BrokerVendor
} from '@/types/brokerAccounts';
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
import { toast } from 'sonner';

type DetailTab = 'overview' | 'connectivity' | 'risk' | 'activity' | 'configuration';
const EMPTY_ACCOUNTS: readonly BrokerAccountSummary[] = [];

function brokerLabel(broker: BrokerVendor): string {
  if (broker === 'alpaca') {
    return 'Alpaca';
  }

  if (broker === 'schwab') {
    return 'Schwab';
  }

  return 'E*TRADE';
}

function buildVerdict(accounts: readonly BrokerAccountSummary[]): {
  title: string;
  summary: string;
} {
  const criticalCount = accounts.filter((account) => account.overallStatus === 'critical').length;
  const needsActionCount = accounts.filter(
    (account) => account.overallStatus !== 'healthy' || account.tradeReadiness !== 'ready'
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
      'Connectivity, sync freshness, and trade readiness are aligned across the connected accounts. The page can stay in scan mode instead of triage mode.'
  };
}

function AccountActionButton({
  label,
  disabled,
  onClick,
  variant = 'outline'
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
}) {
  return (
    <Button type="button" size="sm" variant={variant} disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );
}

function AccountCard({
  account,
  onOpenDetail,
  onRefresh,
  onReconnect,
  onTogglePause,
  busy
}: {
  account: BrokerAccountSummary;
  onOpenDetail: () => void;
  onRefresh: () => void;
  onReconnect: () => void;
  onTogglePause: () => void;
  busy: boolean;
}) {
  const pauseLabel = account.connectionHealth.syncPaused ? 'Resume Sync' : 'Pause Sync';
  const reconnectDisabled =
    busy ||
    !account.connectionHealth.connectionState ||
    account.connectionHealth.connectionState === 'connected';
  const refreshDisabled = busy || account.connectionHealth.syncPaused;
  const pauseDisabled = busy;

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
          <AccountActionButton label="Refresh Now" disabled={refreshDisabled} onClick={onRefresh} />
          <AccountActionButton
            label={pauseLabel}
            disabled={pauseDisabled}
            onClick={onTogglePause}
          />
          <AccountActionButton
            label="Reconnect"
            disabled={reconnectDisabled}
            onClick={onReconnect}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-[1.2rem] border p-3 ${compactMetricToneClass(account.overallStatus)}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Buying Power
          </div>
          <div className="mt-2 font-display text-2xl text-foreground">
            {formatCurrency(account.buyingPower, account.baseCurrency)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Equity {formatCurrency(account.equity, account.baseCurrency)}
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-mcm-walnut/18 bg-mcm-paper/85 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Sync Health
          </div>
          <div className="mt-2 flex items-center gap-2">
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
            Cash / Orders
          </div>
          <div className="mt-2 font-display text-2xl text-foreground">
            {formatCurrency(account.cash, account.baseCurrency)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {formatNumber(account.openPositionCount)} positions | {formatNumber(account.openOrderCount)} open orders
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-mcm-walnut/18 bg-mcm-paper/85 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Operator Flags
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={statusBadgeVariant(account.connectionHealth.authStatus)}>
              {account.connectionHealth.authStatus}
            </Badge>
            <Badge variant={statusBadgeVariant(account.highestAlertSeverity || undefined)}>
              {account.alertCount} alerts
            </Badge>
          </div>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <div>Auth expiry {formatTimestamp(account.connectionHealth.authExpiresAt)}</div>
            <div>Last sync {formatTimestamp(account.lastSyncedAt)}</div>
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

function AccountDetailSheet({
  open,
  onOpenChange,
  account,
  detail,
  configuration,
  configurationLoading,
  configurationError,
  loading,
  error,
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
  account: BrokerAccountSummary | null;
  detail: BrokerAccountDetail | null;
  configuration: BrokerAccountConfiguration | null;
  configurationLoading: boolean;
  configurationError: string | null;
  loading: boolean;
  error: string | null;
  activeTab: DetailTab;
  onActiveTabChange: (value: DetailTab) => void;
  onRefresh: () => void;
  onReconnect: () => void;
  onTogglePause: () => void;
  onAcknowledgeAlert: (alert: BrokerAccountAlert) => void;
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
  const subject = detail?.account ?? account;
  const activeAlerts = detail?.alerts.filter((alert) => alert.status !== 'resolved') ?? [];
  const capabilities = detail?.capabilities;
  const capabilityEntries = Object.entries(detail?.capabilities ?? {}).filter(
    ([, value]) => typeof value === 'boolean'
  ) as Array<[string, boolean]>;
  const reconnectDisabled =
    mutationBusy ||
    subject?.connectionHealth.connectionState === 'connected' ||
    capabilities?.canReconnect === false;
  const refreshDisabled =
    mutationBusy ||
    subject?.connectionHealth.syncPaused ||
    capabilities?.canRefresh === false;
  const pauseDisabled = mutationBusy || capabilities?.canPauseSync === false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto border-l-2 border-mcm-walnut bg-mcm-paper sm:max-w-3xl"
      >
        <SheetHeader className="border-b border-border/40 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            {subject ? <Badge variant="outline">{brokerLabel(subject.broker)}</Badge> : null}
            {subject ? (
              <Badge variant={statusBadgeVariant(subject.tradeReadiness)}>
                {tradeReadinessLabel(subject.tradeReadiness)}
              </Badge>
            ) : null}
          </div>
          <SheetTitle className="font-display text-2xl text-foreground">
            {subject?.name || 'Account dossier'}
          </SheetTitle>
          <SheetDescription>
            Connectivity, risk, and recent operator actions for the selected broker account.
          </SheetDescription>
          {subject ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <AccountActionButton
                label="Refresh Now"
                disabled={refreshDisabled}
                onClick={onRefresh}
              />
              <AccountActionButton
                label={subject.connectionHealth.syncPaused ? 'Resume Sync' : 'Pause Sync'}
                disabled={pauseDisabled}
                onClick={onTogglePause}
              />
              <AccountActionButton
                label="Reconnect"
                disabled={reconnectDisabled}
                onClick={onReconnect}
              />
            </div>
          ) : null}
        </SheetHeader>

        <div className="p-5">
          {loading ? (
            <PageLoader text="Loading account dossier..." variant="panel" className="min-h-[28rem]" />
          ) : error ? (
            <StatePanel tone="error" title="Account Dossier Unavailable" message={error} />
          ) : detail && subject ? (
            <Tabs value={activeTab} onValueChange={(value) => onActiveTabChange(value as DetailTab)}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="connectivity">Connectivity</TabsTrigger>
                <TabsTrigger value="risk">Risk</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="configuration">Configuration</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
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
                    value={`${formatNumber(subject.openPositionCount)} positions`}
                    detail={`${formatNumber(subject.openOrderCount)} open orders`}
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
                    detail={subject.connectionHealth.staleReason || subject.connectionHealth.failureMessage}
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
                        {key.replace(/^can/, '').replace(/([A-Z])/g, ' $1').trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="risk" className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
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
                </div>

                <div className="space-y-3 rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Active Alerts
                  </p>
                  {activeAlerts.length ? (
                    activeAlerts.map((alert) => (
                      <div
                        key={alert.alertId}
                        className={`rounded-[1.2rem] border p-3 ${alertToneClass(alert.severity)}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{alert.title}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{alert.message}</div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Observed {formatTimestamp(alert.observedAt)}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              mutationBusy ||
                              alert.status === 'acknowledged' ||
                              alert.status === 'resolved'
                            }
                            onClick={() => onAcknowledgeAlert(alert)}
                          >
                            {alert.status === 'open' ? 'Acknowledge' : alert.status}
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <StatePanel
                      tone="empty"
                      title="No active alerts"
                      message="The selected account is not carrying any open risk or connectivity alerts."
                    />
                  )}
                </div>
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
                          <div className="mt-2 text-sm text-muted-foreground">{run.errorMessage}</div>
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
                          </div>
                          <Badge variant={statusBadgeVariant(activity.status)}>{activity.status}</Badge>
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
  accounts,
  generatedAt
}: {
  accounts: readonly BrokerAccountSummary[];
  generatedAt?: string | null;
}) {
  const verdict = buildVerdict(accounts);
  const immediateFocus = sortAccountsByPriority(accounts)
    .filter((account) => account.overallStatus !== 'healthy' || account.tradeReadiness !== 'ready')
    .slice(0, 4);

  const connectedCount = accounts.filter(
    (account) => account.connectionHealth.connectionState === 'connected'
  ).length;
  const disconnectedCount = accounts.filter(
    (account) => account.connectionHealth.connectionState !== 'connected'
  ).length;
  const blockedCount = accounts.filter((account) => account.tradeReadiness === 'blocked').length;

  return (
    <aside className="mcm-panel flex min-h-[760px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
          Desk Verdict
        </p>
        <h2 className="mt-1 font-display text-xl text-foreground">Exception Brief</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Lead with the operational posture, then pull the top exceptions into the queue.
        </p>
      </div>

      <div className="flex-1 space-y-5 p-5">
        <div className="rounded-[1.8rem] border border-mcm-walnut/20 bg-mcm-paper/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Verdict
              </p>
              <p className="mt-2 font-display text-lg text-foreground">{verdict.title}</p>
            </div>
            <Badge variant={blockedCount > 0 ? 'destructive' : disconnectedCount > 0 ? 'secondary' : 'default'}>
              {blockedCount > 0 ? 'BLOCKS PRESENT' : disconnectedCount > 0 ? 'WATCHLIST' : 'ORDERLY'}
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
            generatedAt ? `Board snapshot generated ${formatTimestamp(generatedAt)}.` : 'Board timestamp is not currently available.'
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

  const listQuery = useQuery({
    queryKey: accountOperationsKeys.list(),
    queryFn: ({ signal }) => accountOperationsApi.listAccounts(signal),
    refetchInterval: 30000,
    refetchOnWindowFocus: true
  });

  const detailQuery = useQuery({
    queryKey: accountOperationsKeys.detail(selectedAccountId),
    queryFn: ({ signal }) => accountOperationsApi.getAccountDetail(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 60000 : false,
    refetchOnWindowFocus: true
  });

  const configurationQuery = useQuery({
    queryKey: accountOperationsKeys.configuration(selectedAccountId),
    queryFn: ({ signal }) => accountOperationsApi.getConfiguration(String(selectedAccountId), signal),
    enabled: Boolean(selectedAccountId),
    refetchInterval: selectedAccountId ? 60000 : false,
    refetchOnWindowFocus: true
  });

  const reconnectMutation = useMutation({
    mutationFn: (accountId: string) =>
      accountOperationsApi.reconnectAccount(accountId, {
        reason: 'Reconnect requested from Account Operations.'
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.all() })
      ]);
      toast.success('Reconnect request submitted.');
    },
    onError: (error) => {
      toast.error(`Failed to reconnect account: ${String(error)}`);
    }
  });

  const refreshMutation = useMutation({
    mutationFn: (accountId: string) =>
      accountOperationsApi.refreshAccount(accountId, {
        scope: 'full',
        force: true,
        reason: 'Manual refresh requested from Account Operations.'
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.all() })
      ]);
      toast.success('Refresh queued.');
    },
    onError: (error) => {
      toast.error(`Failed to queue refresh: ${String(error)}`);
    }
  });

  const pauseMutation = useMutation({
    mutationFn: (payload: { accountId: string; paused: boolean }) =>
      accountOperationsApi.setSyncPaused(payload.accountId, {
        paused: payload.paused,
        reason: payload.paused
          ? 'Sync paused from Account Operations.'
          : 'Sync resumed from Account Operations.'
      }),
    onSuccess: async (_, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.detail(payload.accountId) })
      ]);
      toast.success(payload.paused ? 'Sync paused.' : 'Sync resumed.');
    },
    onError: (error) => {
      toast.error(`Failed to update sync state: ${String(error)}`);
    }
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (payload: { accountId: string; alertId: string }) =>
      accountOperationsApi.acknowledgeAlert(payload.accountId, payload.alertId, {
        note: 'Acknowledged from Account Operations.'
      }),
    onSuccess: async (_, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.detail(payload.accountId) })
      ]);
      toast.success('Alert acknowledged.');
    },
    onError: (error) => {
      toast.error(`Failed to acknowledge alert: ${String(error)}`);
    }
  });

  const saveTradingPolicyMutation = useMutation({
    mutationFn: (payload: {
      accountId: string;
      body: BrokerTradingPolicyUpdateRequest;
    }) => accountOperationsApi.saveTradingPolicy(payload.accountId, payload.body),
    onSuccess: async (configuration, payload) => {
      queryClient.setQueryData(accountOperationsKeys.configuration(payload.accountId), configuration);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.detail(payload.accountId) }),
        queryClient.invalidateQueries({
          queryKey: accountOperationsKeys.configuration(payload.accountId)
        })
      ]);
    }
  });

  const saveAllocationMutation = useMutation({
    mutationFn: (payload: {
      accountId: string;
      body: BrokerAccountAllocationUpdateRequest;
    }) => accountOperationsApi.saveAllocation(payload.accountId, payload.body),
    onSuccess: async (configuration, payload) => {
      queryClient.setQueryData(accountOperationsKeys.configuration(payload.accountId), configuration);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.list() }),
        queryClient.invalidateQueries({ queryKey: accountOperationsKeys.detail(payload.accountId) }),
        queryClient.invalidateQueries({
          queryKey: accountOperationsKeys.configuration(payload.accountId)
        })
      ]);
    }
  });

  const accounts = listQuery.data?.accounts ?? EMPTY_ACCOUNTS;
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.accountId === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  const sortedAccounts = useMemo(() => sortAccountsByPriority(accounts), [accounts]);

  const connectedAccounts = accounts.filter(
    (account) => account.connectionHealth.connectionState === 'connected'
  ).length;
  const tradeReadyAccounts = accounts.filter((account) => account.tradeReadiness === 'ready').length;
  const needsActionAccounts = accounts.filter(
    (account) => account.overallStatus !== 'healthy' || account.tradeReadiness !== 'ready'
  ).length;
  const aggregateBuyingPower = accounts.reduce((total, account) => total + account.buyingPower, 0);
  const mutationBusy =
    reconnectMutation.isPending ||
    refreshMutation.isPending ||
    pauseMutation.isPending ||
    acknowledgeMutation.isPending;

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

  const selectedConfiguration = configurationQuery.data ?? detailQuery.data?.configuration ?? null;

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

  if (listQuery.isLoading) {
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
          label="Connected Accounts"
          value={String(connectedAccounts)}
          detail={`${accounts.length} tracked accounts on the board.`}
          icon={<Cable className="h-4 w-4 text-mcm-teal" />}
        />
        <StatCard
          label="Trade Ready"
          value={String(tradeReadyAccounts)}
          detail="Accounts currently clear for trade readiness."
          icon={<CheckCircle2 className="h-4 w-4 text-mcm-teal" />}
        />
        <StatCard
          label="Needs Action"
          value={String(needsActionAccounts)}
          detail="Accounts carrying warnings, stale sync, or blocked trade state."
          icon={<ShieldAlert className="h-4 w-4 text-mcm-rust" />}
        />
        <StatCard
          label="Buying Power"
          value={formatCurrency(aggregateBuyingPower)}
          detail="Aggregate board-level buying power across the connected accounts."
          icon={<Wallet className="h-4 w-4 text-mcm-olive" />}
        />
      </section>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_340px]">
        <section className="mcm-panel min-h-[760px] overflow-hidden">
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
              </div>
              <Badge variant="outline">{sortedAccounts.length} accounts</Badge>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {!accounts.length ? (
              <StatePanel
                tone="empty"
                title="No connected accounts"
                message="Connect a broker account to populate the board and start monitoring trade readiness."
              />
            ) : (
              sortedAccounts.map((account) => (
                <AccountCard
                  key={account.accountId}
                  account={account.allocationSummary ? { ...account, strategyLabel: null } : account}
                  busy={mutationBusy}
                  onOpenDetail={() => handleOpenDetail(account.accountId)}
                  onRefresh={() => refreshMutation.mutate(account.accountId)}
                  onReconnect={() => reconnectMutation.mutate(account.accountId)}
                  onTogglePause={() =>
                    pauseMutation.mutate({
                      accountId: account.accountId,
                      paused: !account.connectionHealth.syncPaused
                    })
                  }
                />
              ))
            )}
          </div>
        </section>

        <DeskVerdictRail accounts={sortedAccounts} generatedAt={listQuery.data?.generatedAt} />
      </div>

      <AccountDetailSheet
        open={Boolean(selectedAccountId)}
        onOpenChange={handleCloseDetail}
        account={selectedAccount}
        detail={detailQuery.data ?? null}
        configuration={selectedConfiguration}
        configurationLoading={configurationQuery.isLoading}
        configurationError={configurationQuery.error ? String(configurationQuery.error) : null}
        loading={detailQuery.isLoading}
        error={detailQuery.error ? String(detailQuery.error) : null}
        activeTab={detailTab}
        onActiveTabChange={setDetailTab}
        onRefresh={() => selectedAccountId && refreshMutation.mutate(selectedAccountId)}
        onReconnect={() => selectedAccountId && reconnectMutation.mutate(selectedAccountId)}
        onTogglePause={() =>
          selectedAccountId &&
          selectedAccount &&
          pauseMutation.mutate({
            accountId: selectedAccountId,
            paused: !selectedAccount.connectionHealth.syncPaused
          })
        }
        onAcknowledgeAlert={(alert) =>
          acknowledgeMutation.mutate({ accountId: alert.accountId, alertId: alert.alertId })
        }
        onReloadConfiguration={() => void configurationQuery.refetch()}
        onSaveTradingPolicy={handleSaveTradingPolicy}
        onSaveAllocation={handleSaveAllocation}
        onConfigurationDirtyChange={setConfigurationDirty}
        configurationSavingPolicy={saveTradingPolicyMutation.isPending}
        configurationSavingAllocation={saveAllocationMutation.isPending}
        mutationBusy={mutationBusy}
      />
    </div>
  );
}
