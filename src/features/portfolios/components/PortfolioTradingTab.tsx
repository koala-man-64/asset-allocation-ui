import { Clock3, RefreshCcw, ShieldAlert } from 'lucide-react';

import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { buildPortfolioBlotter } from '@/features/portfolios/lib/portfolioBlotter';
import {
  formatCurrency,
  formatPercent,
  formatTimestamp,
  statusBadgeVariant
} from '@/features/portfolios/lib/portfolioPresentation';
import type { NextRebalanceWindow } from '@/features/portfolios/lib/portfolioRebalance';
import type {
  PortfolioBuildRunSummary,
  PortfolioMonitorSnapshot,
  PortfolioPreviewResponse
} from '@/types/portfolio';

interface PortfolioTradingTabProps {
  monitorSnapshot: PortfolioMonitorSnapshot | null;
  buildRuns: readonly PortfolioBuildRunSummary[];
  buildRunsError?: string;
  nextRebalance: NextRebalanceWindow;
  previewResult: PortfolioPreviewResponse | null;
  triggerBuildPending: boolean;
  triggerBuildDisabled: boolean;
  onTriggerBuild: () => void;
}

function TradingCard({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function PortfolioTradingTab({
  monitorSnapshot,
  buildRuns,
  buildRunsError,
  nextRebalance,
  previewResult,
  triggerBuildPending,
  triggerBuildDisabled,
  onTriggerBuild
}: PortfolioTradingTabProps) {
  if (!monitorSnapshot) {
    return (
      <StatePanel
        tone="empty"
        title="Trading Snapshot Missing"
        message="Save or load a portfolio before relying on the rebalance workflow, blotter, alerts, and sleeve drift telemetry."
      />
    );
  }

  const blotterRows = buildPortfolioBlotter(monitorSnapshot.ledgerEvents);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Trading
        </div>
        <h2 className="mt-2 font-display text-2xl">
          Rebalance workflow, blotter, alerts, and drift
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Put the actual trading workflow in one place: next rebalance timing, recent build runs,
          proposed trades, executed history, alerts, freshness, and sleeve drift.
        </p>
      </div>

      <TradingCard
        title="Next Rebalance"
        description="The control plane owns the next rebalance schedule; the UI falls back to local cadence inference only when the server schedule is unavailable."
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                <span className="text-sm">Window</span>
              </div>
              <div className="mt-2 font-display text-2xl">{nextRebalance.windowLabel}</div>
              <div className="mt-1 text-xs text-muted-foreground">{nextRebalance.reason}</div>
            </div>
            <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-4">
              <div className="text-sm text-muted-foreground">Anchor text</div>
              <div className="mt-2 font-medium">{nextRebalance.anchorText || 'Not provided'}</div>
              {nextRebalance.inferred ? (
                <div className="mt-2">
                  <Badge variant="secondary">Inferred</Badge>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center">
            <Button
              type="button"
              className="w-full"
              disabled={triggerBuildDisabled}
              onClick={onTriggerBuild}
            >
              <RefreshCcw className="h-4 w-4" />
              {triggerBuildPending ? 'Submitting...' : 'Refresh Materialization'}
            </Button>
          </div>
        </div>
      </TradingCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <TradingCard
          title="Upcoming Rebalance Proposals"
          description="Upcoming proposals stay separate from executed ledger history so the desk can distinguish intent from posted activity."
        >
          {!previewResult ? (
            <StatePanel
              tone="info"
              title="No preview proposal loaded"
              message="Run a preview in Construction to publish a proposed trade list here."
            />
          ) : previewResult.tradeProposals.length === 0 ? (
            <StatePanel
              tone="info"
              title="No proposed trades"
              message={
                previewResult.previewSource === 'inferred'
                  ? 'The current preview is inferred and does not carry a live rebalance proposal.'
                  : 'The latest live proposal did not return trade rows.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sleeve</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Est. Notional</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewResult.tradeProposals.map((trade) => (
                    <TableRow key={`${trade.sleeveId}-${trade.symbol}-${trade.side}`}>
                      <TableCell>{trade.sleeveId}</TableCell>
                      <TableCell>{trade.symbol}</TableCell>
                      <TableCell className="uppercase">{trade.side}</TableCell>
                      <TableCell className="text-right">{trade.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(trade.estimatedNotional, monitorSnapshot.baseCurrency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(trade.estimatedCommission, monitorSnapshot.baseCurrency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TradingCard>

        <TradingCard
          title="Desk Signals"
          description="Alert load and data freshness are the fastest way to see whether a rebalance is actionable right now."
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldAlert className="h-4 w-4" />
                <span className="text-sm">Alerts</span>
              </div>
              <div className="mt-2 font-display text-2xl">{monitorSnapshot.alerts.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">Open portfolio alerts</div>
            </div>
            <div className="space-y-3">
              {monitorSnapshot.freshness.length === 0 ? (
                <StatePanel
                  tone="info"
                  title="No freshness markers"
                  message="Materialization freshness markers have not been published yet."
                />
              ) : (
                monitorSnapshot.freshness.map((item) => (
                  <div
                    key={`${item.domain}-${item.checkedAt || item.asOf || 'freshness'}`}
                    className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium capitalize">{item.domain}</span>
                      <Badge variant={statusBadgeVariant(item.state)}>{item.state}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.reason || 'No freshness exceptions are currently flagged.'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </TradingCard>
      </div>

      <TradingCard
        title="Executed Trade / Ledger Blotter"
        description="Ledger events are promoted into a desk-readable blotter with timestamps, fees, slippage, and cash impact."
      >
        {blotterRows.length === 0 ? (
          <StatePanel
            tone="empty"
            title="No ledger history"
            message="Funding, trade, fee, and cash adjustment events will appear here once they are posted."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Event type</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Slippage</TableHead>
                  <TableHead className="text-right">Cash impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blotterRows.map((row) => (
                  <TableRow key={row.rowId}>
                    <TableCell>{formatTimestamp(row.effectiveAt)}</TableCell>
                    <TableCell>{row.eventLabel}</TableCell>
                    <TableCell>{row.symbol}</TableCell>
                    <TableCell className="text-right">{row.quantity ?? 'n/a'}</TableCell>
                    <TableCell className="text-right">
                      {row.price === null
                        ? 'n/a'
                        : formatCurrency(row.price, monitorSnapshot.baseCurrency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.commission === null
                        ? 'n/a'
                        : formatCurrency(row.commission, monitorSnapshot.baseCurrency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.slippageCost === null
                        ? 'n/a'
                        : formatCurrency(row.slippageCost, monitorSnapshot.baseCurrency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.cashImpact, monitorSnapshot.baseCurrency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TradingCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <TradingCard
          title="Recent Build Runs"
          description="Recent materialization runs show whether the portfolio can actually clear a current rebalance request."
        >
          {buildRunsError ? (
            <StatePanel tone="error" title="Build Runs Unavailable" message={buildRunsError} />
          ) : buildRuns.length === 0 ? (
            <StatePanel
              tone="empty"
              title="No build runs"
              message="Materialization runs will appear here after the first rebuild request."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Drift</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildRuns.map((run) => (
                    <TableRow key={run.runId}>
                      <TableCell className="font-medium">{run.runId}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                      </TableCell>
                      <TableCell>{run.buildScope}</TableCell>
                      <TableCell>{formatTimestamp(run.submittedAt)}</TableCell>
                      <TableCell className="text-right">
                        {formatPercent(run.driftPct ?? null)}
                      </TableCell>
                      <TableCell className="text-right">{run.tradeCount ?? 'n/a'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TradingCard>

        <TradingCard
          title="Sleeve Drift and Alerts"
          description="Sleeve drift sits beside active alerts so you can see whether the rebalance trigger is weight-based or operational."
        >
          <div className="space-y-3">
            {monitorSnapshot.alerts.map((alert) => (
              <div
                key={`${alert.title}-${alert.observedAt}`}
                className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{alert.title}</div>
                  <Badge variant={statusBadgeVariant(alert.severity)}>{alert.severity}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{alert.message}</div>
              </div>
            ))}
            {monitorSnapshot.sleeves.map((sleeve) => (
              <div
                key={sleeve.sleeveId}
                className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{sleeve.label}</div>
                    <div className="text-xs text-muted-foreground">{sleeve.strategyName}</div>
                  </div>
                  <Badge variant={statusBadgeVariant(sleeve.status)}>{sleeve.status}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    Target{' '}
                    <span className="font-medium text-foreground">
                      {formatPercent(sleeve.targetWeightPct)}
                    </span>
                  </div>
                  <div>
                    Live{' '}
                    <span className="font-medium text-foreground">
                      {formatPercent(sleeve.liveWeightPct)}
                    </span>
                  </div>
                  <div>
                    Drift{' '}
                    <span className="font-medium text-foreground">
                      {formatPercent(sleeve.driftPct)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TradingCard>
      </div>
    </div>
  );
}
