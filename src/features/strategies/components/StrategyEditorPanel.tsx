import { Link } from 'react-router-dom';
import { CopyPlus, ExternalLink, PencilLine, Play, Plus, ShieldCheck, Trash2 } from 'lucide-react';

import { PageLoader } from '@/app/components/common/PageLoader';
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
import { cn } from '@/app/components/ui/utils';
import type { RunRecordResponse } from '@/services/backtestApi';
import type { StrategyDetail, StrategySummary } from '@/types/strategy';
import type { StrategyRiskPolicy } from '@/types/strategyAnalytics';
import {
  describeRegimePolicy,
  describeStrategyExecution,
  describeStrategySelection,
  formatStrategyTimestamp,
  formatStrategyType,
  summarizeExitStack
} from '@/features/strategies/lib/strategySummary';

interface StrategyEditorPanelProps {
  selectedStrategyName: string | null;
  selectedStrategy: StrategySummary | null;
  strategy: StrategyDetail | undefined;
  isLoading: boolean;
  errorMessage: string;
  detailReady: boolean;
  recentRuns: RunRecordResponse[];
  recentRunsLoading: boolean;
  recentRunsError: string;
  onCreateStrategy: () => void;
  onEditStrategy: () => void;
  onDuplicateStrategy: () => void;
  onOpenBacktest: () => void;
  onDeleteStrategy: () => void;
}

function formatRatio(value?: number | null): string {
  if (value === undefined || value === null) {
    return 'Unset';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function riskValue(policy: StrategyRiskPolicy | null | undefined, key: keyof StrategyRiskPolicy): string {
  const value = policy?.[key];
  if (typeof value !== 'number') {
    return 'Unset';
  }
  return key === 'maxTradeNotionalBaseCcy'
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
      }).format(value)
    : formatRatio(value);
}

function formatVersion(version?: number | null): string {
  return typeof version === 'number' && Number.isFinite(version) ? `v${version}` : 'Unpinned';
}

function PanelTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function EmptySection({ children }: { children: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function PinnedConfigCard({
  label,
  name,
  version,
  detail,
  tab
}: {
  label: string;
  name?: string | null;
  version?: number | null;
  detail: string;
  tab: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 truncate font-mono text-sm font-semibold text-foreground">
            {name || 'Not pinned'}
          </div>
        </div>
        <Badge variant={name ? 'secondary' : 'outline'}>{formatVersion(version)}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
      <Button asChild type="button" variant="ghost" size="sm" className="mt-3 px-0">
        <Link to={`/strategy-configurations?tab=${tab}`}>
          <ExternalLink className="h-4 w-4" />
          Open Library
        </Link>
      </Button>
    </div>
  );
}

export function StrategyEditorPanel({
  selectedStrategyName,
  selectedStrategy,
  strategy,
  isLoading,
  errorMessage,
  detailReady,
  recentRuns,
  recentRunsLoading,
  recentRunsError,
  onCreateStrategy,
  onEditStrategy,
  onDuplicateStrategy,
  onOpenBacktest,
  onDeleteStrategy
}: StrategyEditorPanelProps) {
  const riskPolicy = strategy?.config.strategyRiskPolicy || strategy?.config.riskPolicy || null;

  return (
    <section
      className={cn(
        'mcm-panel flex flex-col overflow-hidden',
        selectedStrategyName ? 'min-h-[640px]' : 'min-h-0'
      )}
    >
      <div className="border-b border-border/40 px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Strategy Editor Panel
            </p>
            <h2 className="font-display text-xl text-foreground">Configuration Workspace</h2>
            <p className="text-sm text-muted-foreground">
              Strategy assembly pins reusable library revisions. Edit library objects from the configuration hub; edit strategy pins here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onCreateStrategy}>
              <Plus className="h-4 w-4" />
              Create Strategy
            </Button>
            <Button variant="secondary" onClick={onEditStrategy} disabled={!detailReady}>
              <PencilLine className="h-4 w-4" />
              Edit Pins
            </Button>
            <Button variant="outline" onClick={onDuplicateStrategy} disabled={!detailReady}>
              <CopyPlus className="h-4 w-4" />
              Duplicate As New
            </Button>
            <Button variant="outline" onClick={onOpenBacktest} disabled={!selectedStrategy}>
              <Play className="h-4 w-4" />
              Launch Backtest
            </Button>
            <Button asChild variant="secondary">
              <Link
                to={`/backtests${selectedStrategyName ? `?strategy=${encodeURIComponent(selectedStrategyName)}` : ''}`}
              >
                <Play className="h-4 w-4" />
                Backtests
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {!selectedStrategyName ? (
          <EmptySection>Select a strategy from the library or create a new one to begin.</EmptySection>
        ) : isLoading ? (
          <PageLoader text="Loading strategy workspace..." className="h-80" />
        ) : errorMessage ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : strategy ? (
          <>
            <div className="rounded-[2rem] border-2 border-mcm-walnut bg-mcm-paper/90 px-6 py-6 shadow-[8px_8px_0px_0px_rgba(119,63,26,0.10)]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={strategy.type === 'configured' ? 'default' : 'outline'}>
                      {formatStrategyType(strategy.type)}
                    </Badge>
                    <Badge variant={strategy.config.regimePolicy ? 'secondary' : 'outline'}>
                      {strategy.config.regimePolicy ? 'Regime snapshot' : 'No regime snapshot'}
                    </Badge>
                    <Badge variant={riskPolicy ? 'secondary' : 'outline'}>
                      {riskPolicy ? 'Risk snapshot' : 'No risk snapshot'}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="font-display text-3xl tracking-[0.04em] text-foreground">
                      {strategy.name}
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {strategy.description || 'No desk note recorded for this strategy yet.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground xl:text-right">
                  <span>Updated {formatStrategyTimestamp(strategy.updated_at)}</span>
                  <span>{summarizeExitStack(strategy)}</span>
                  <Button
                    variant="outline"
                    className="border-destructive/60 text-destructive hover:bg-destructive/10 xl:self-end"
                    onClick={onDeleteStrategy}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Strategy
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PanelTile
                label="Selection"
                value={describeStrategySelection(strategy)}
                detail={describeStrategyExecution(strategy)}
              />
              <PanelTile
                label="Regime Snapshot"
                value={strategy.config.regimePolicy?.modelName || 'Disabled'}
                detail={describeRegimePolicy(strategy)}
              />
              <PanelTile
                label="Exit Snapshot"
                value={`${strategy.config.exits?.length || 0} rules`}
                detail={summarizeExitStack(strategy)}
              />
              <PanelTile
                label="Risk Snapshot"
                value={riskPolicy ? 'Resolved' : 'Disabled'}
                detail="Resolved from the pinned risk policy when the strategy revision was saved."
              />
            </div>

            <section className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h4 className="font-display text-lg text-foreground">Pinned Configuration Revisions</h4>
                  <p className="text-sm text-muted-foreground">
                    These pins define the library revisions used to resolve the immutable strategy snapshot.
                  </p>
                </div>
                <Button variant="secondary" onClick={onEditStrategy}>
                  <PencilLine className="h-4 w-4" />
                  Repin Strategy
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <PinnedConfigCard
                  label="Universe"
                  name={strategy.config.universeConfigName}
                  version={strategy.config.universeConfigVersion}
                  detail="Eligibility universe pinned for this strategy revision."
                  tab="universe"
                />
                <PinnedConfigCard
                  label="Ranking"
                  name={strategy.config.rankingSchemaName}
                  version={strategy.config.rankingSchemaVersion}
                  detail="Ranking schema revision used for scoring and materialization."
                  tab="ranking"
                />
                <PinnedConfigCard
                  label="Regime Policy"
                  name={strategy.config.regimePolicyConfigName}
                  version={strategy.config.regimePolicyConfigVersion}
                  detail="Regime policy revision resolved into the snapshot."
                  tab="regime-policy"
                />
                <PinnedConfigCard
                  label="Risk Policy"
                  name={strategy.config.riskPolicyName}
                  version={strategy.config.riskPolicyVersion}
                  detail="Risk limits resolved into the snapshot."
                  tab="risk-policy"
                />
                <PinnedConfigCard
                  label="Exit Rule Set"
                  name={strategy.config.exitRuleSetName}
                  version={strategy.config.exitRuleSetVersion}
                  detail="Ordered exit rule revision resolved into the snapshot."
                  tab="exit-rules"
                />
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
                <div>
                  <h4 className="font-display text-lg text-foreground">Resolved Regime</h4>
                  <p className="text-sm text-muted-foreground">
                    Execution reads this resolved snapshot, not a moving latest-by-name policy.
                  </p>
                </div>
                <div className="grid gap-3">
                  <PanelTile
                    label="Model"
                    value={strategy.config.regimePolicy?.modelName || 'Not configured'}
                    detail={`Model revision ${formatVersion(strategy.config.regimePolicy?.modelVersion)}`}
                  />
                  <PanelTile
                    label="Mode"
                    value={strategy.config.regimePolicy?.mode.replaceAll('_', ' ') || 'Disabled'}
                    detail="Current release supports observe-only mode."
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-5 w-5 text-mcm-walnut" />
                  <div>
                    <h4 className="font-display text-lg text-foreground">Resolved Risk</h4>
                    <p className="text-sm text-muted-foreground">
                      Risk limits shown here are the snapshot saved on the strategy revision.
                    </p>
                  </div>
                </div>
                {riskPolicy ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <PanelTile label="Gross" value={riskValue(riskPolicy, 'grossExposureLimit')} detail="Gross exposure ceiling." />
                    <PanelTile label="Single Name" value={riskValue(riskPolicy, 'singleNameMaxWeight')} detail="Maximum issuer concentration." />
                    <PanelTile label="Turnover" value={riskValue(riskPolicy, 'turnoverBudget')} detail="Desk turnover budget." />
                    <PanelTile label="Trade Notional" value={riskValue(riskPolicy, 'maxTradeNotionalBaseCcy')} detail="Per-trade liquidity guardrail." />
                  </div>
                ) : (
                  <EmptySection>No risk policy snapshot is attached to this strategy revision.</EmptySection>
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-display text-lg text-foreground">Recent Backtest Runs</h4>
                  <p className="text-sm text-muted-foreground">
                    Historical runs stay tied to their strategy revision and resolved config snapshot.
                  </p>
                </div>
                <Badge variant="secondary">{recentRuns.length} runs</Badge>
              </div>

              {recentRunsLoading ? (
                <EmptySection>Loading recent runs...</EmptySection>
              ) : recentRunsError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {recentRunsError}
                </div>
              ) : recentRuns.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Run</TableHead>
                        <TableHead>Window</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentRuns.map((run) => (
                        <TableRow key={run.run_id}>
                          <TableCell className="font-medium">{run.run_name || run.run_id}</TableCell>
                          <TableCell>{`${run.start_date || 'Unknown'} to ${run.end_date || 'Unknown'}`}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                run.status === 'completed'
                                  ? 'default'
                                  : run.status === 'failed'
                                    ? 'destructive'
                                    : 'outline'
                              }
                            >
                              {run.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptySection>No backtests have been submitted for this strategy yet.</EmptySection>
              )}
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
