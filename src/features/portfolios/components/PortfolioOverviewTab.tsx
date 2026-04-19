import { Activity, AlertTriangle, Clock3, Gauge, ShieldCheck, TrendingUp } from 'lucide-react';

import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import type { PortfolioBenchmarkComparison } from '@/features/portfolios/lib/portfolioBenchmark';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  statusBadgeVariant,
  titleCaseWords
} from '@/features/portfolios/lib/portfolioPresentation';
import type { NextRebalanceWindow } from '@/features/portfolios/lib/portfolioRebalance';
import type { PortfolioDetail, PortfolioMonitorSnapshot } from '@/types/portfolio';

interface PortfolioOverviewTabProps {
  draft: PortfolioDetail;
  monitorSnapshot: PortfolioMonitorSnapshot | null;
  benchmarkComparison: PortfolioBenchmarkComparison | null;
  currentRegimeCode?: string | null;
  nextRebalance: NextRebalanceWindow;
}

function OverviewMetric({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
      <div className="flex items-center gap-2">
        <span className="text-mcm-teal">{icon}</span>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="mt-3 font-display text-2xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

export function PortfolioOverviewTab({
  draft,
  monitorSnapshot,
  benchmarkComparison,
  currentRegimeCode,
  nextRebalance
}: PortfolioOverviewTabProps) {
  const sleeveRows =
    monitorSnapshot?.sleeves.length
      ? monitorSnapshot.sleeves
      : draft.config.sleeves.map((sleeve) => ({
          sleeveId: sleeve.sleeveId,
          label: sleeve.label,
          strategyName: sleeve.strategyName,
          strategyVersion: sleeve.strategyVersion,
          targetWeightPct: sleeve.targetWeightPct,
          liveWeightPct: sleeve.targetWeightPct,
          driftPct: 0,
          marketValue: null,
          returnContributionPct: null,
          status: 'healthy' as const,
          lastSignalAt: null
        }));
  const topSleeveContribution =
    sleeveRows
      .filter((sleeve) => sleeve.returnContributionPct !== null && sleeve.returnContributionPct !== undefined)
      .sort((left, right) => (right.returnContributionPct || 0) - (left.returnContributionPct || 0))[0] ??
    null;
  const activeAssignment = draft.activeAssignment;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Desk Verdict
        </div>
        <h2 className="mt-2 font-display text-2xl">Overview</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Lead with the desk decision surface: regime, build health, next rebalance, current drift, alert load, and benchmark-relative performance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OverviewMetric
          icon={<TrendingUp className="h-4 w-4" />}
          label="Current regime"
          value={titleCaseWords(currentRegimeCode || 'unclassified')}
          detail="Current regime overlay applied to performance and outlook."
        />
        <OverviewMetric
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Build health"
          value={titleCaseWords(monitorSnapshot?.buildHealth || draft.buildStatus || draft.status)}
          detail={monitorSnapshot?.buildWindowLabel || 'No active build window is published yet.'}
        />
        <OverviewMetric
          icon={<Clock3 className="h-4 w-4" />}
          label="Next rebalance"
          value={nextRebalance.windowLabel}
          detail={nextRebalance.inferred ? `${nextRebalance.reason} (inferred)` : nextRebalance.reason}
        />
        <OverviewMetric
          icon={<Gauge className="h-4 w-4" />}
          label="Drift vs threshold"
          value={`${formatPercent(monitorSnapshot?.driftPct ?? 0)} / ${formatPercent(
            draft.config.riskLimits.driftRebalanceThresholdPct
          )}`}
          detail="Largest sleeve drift against the current rebalance threshold."
        />
        <OverviewMetric
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Open alerts"
          value={String(monitorSnapshot?.alerts.length ?? draft.openAlertCount ?? 0)}
          detail="Actionable portfolio alerts still open on the desk."
        />
        <OverviewMetric
          icon={<Activity className="h-4 w-4" />}
          label="Active return"
          value={formatPercent(benchmarkComparison?.activeHeadlineReturnPct ?? null)}
          detail={`Benchmark-relative return vs ${draft.config.benchmarkSymbol}.`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Current Allocation
              </div>
              <h3 className="mt-2 font-display text-xl">Target vs live sleeve mix</h3>
            </div>
            {monitorSnapshot ? (
              <Badge variant={statusBadgeVariant(monitorSnapshot.buildHealth)}>
                {monitorSnapshot.buildHealth}
              </Badge>
            ) : null}
          </div>

          {sleeveRows.length === 0 ? (
            <div className="mt-4">
              <StatePanel
                tone="empty"
                title="No sleeve allocation data"
                message="Add sleeves in Construction to build out the allocation stack."
              />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sleeve</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Live</TableHead>
                    <TableHead className="text-right">Drift</TableHead>
                    <TableHead className="text-right">Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sleeveRows.map((sleeve) => (
                    <TableRow key={sleeve.sleeveId}>
                      <TableCell className="font-medium">{sleeve.label}</TableCell>
                      <TableCell>{sleeve.strategyName || 'Unassigned'}</TableCell>
                      <TableCell className="text-right">{formatPercent(sleeve.targetWeightPct)}</TableCell>
                      <TableCell className="text-right">{formatPercent(sleeve.liveWeightPct)}</TableCell>
                      <TableCell className="text-right">{formatPercent(sleeve.driftPct)}</TableCell>
                      <TableCell className="text-right">
                        {formatPercent(sleeve.returnContributionPct ?? null)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Allocation Summary
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Cash</div>
                <div className="mt-2 font-display text-2xl">
                  {formatCurrency(monitorSnapshot?.cash ?? draft.openingCash ?? null, draft.baseCurrency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatPercent(monitorSnapshot?.cashPct ?? draft.cashReservePct)} reserve
                </div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Gross / net</div>
                <div className="mt-2 font-display text-2xl">
                  {formatPercent(monitorSnapshot?.grossExposurePct ?? draft.targetGrossExposurePct)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Net {formatPercent(monitorSnapshot?.netExposurePct ?? draft.targetGrossExposurePct)}
                </div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Largest position</div>
                <div className="mt-2 font-display text-2xl">
                  {formatPercent(monitorSnapshot?.largestPositionPct ?? null)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Largest single-name weight in the current book.
                </div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Top sleeve contribution</div>
                <div className="mt-2 font-display text-2xl">
                  {topSleeveContribution ? formatPercent(topSleeveContribution.returnContributionPct) : 'n/a'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {topSleeveContribution ? topSleeveContribution.label : 'No sleeve contribution data yet.'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Account Identity
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Account / workspace</span>
                <span className="font-medium">{monitorSnapshot?.accountName || draft.name || 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Active portfolio version</span>
                <span className="font-medium">
                  v{activeAssignment?.portfolioVersion ?? monitorSnapshot?.activeVersion ?? draft.version}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Effective assignment date</span>
                <span className="font-medium">
                  {formatDate(activeAssignment?.effectiveFrom || draft.inceptionDate)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Benchmark</span>
                <span className="font-medium">{draft.config.benchmarkSymbol}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Rebalance anchor</span>
                <span className="max-w-[14rem] text-right font-medium">{draft.config.rebalanceAnchor}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
