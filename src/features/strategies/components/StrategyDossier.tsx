import { ArrowUpRight, Layers3, Orbit, TableProperties, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { PageLoader } from '@/app/components/common/PageLoader';
import type { RunRecordResponse } from '@/services/backtestApi';
import type { StrategyDetail } from '@/types/strategy';
import {
  describeRegimePolicy,
  describeStrategyExecution,
  describeStrategySelection,
  formatRuleType,
  formatStrategyTimestamp,
  formatStrategyType,
  summarizeExitRule
} from '@/features/strategies/lib/strategySummary';

interface StrategyDossierProps {
  selectedStrategyName: string | null;
  strategy: StrategyDetail | undefined;
  isLoading: boolean;
  errorMessage: string;
  recentRuns: RunRecordResponse[];
  recentRunsLoading: boolean;
  recentRunsError: string;
}

function DossierTile({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-mcm-walnut/25 bg-mcm-cream/65 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function formatRunDateRange(run: RunRecordResponse): string {
  return `${run.start_date || 'Unknown start'} to ${run.end_date || 'Unknown end'}`;
}

export function StrategyDossier({
  selectedStrategyName,
  strategy,
  isLoading,
  errorMessage,
  recentRuns,
  recentRunsLoading,
  recentRunsError
}: StrategyDossierProps) {
  return (
    <section className="mcm-panel flex min-h-[680px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Strategy Dossier
            </p>
            <h2 className="font-display text-xl text-foreground">Primary Readout</h2>
            <p className="text-sm text-muted-foreground">
              Review strategy dependencies, pacing, regime logic, and exit structure before
              changing anything.
            </p>
          </div>
          {selectedStrategyName ? <Badge variant="secondary">{selectedStrategyName}</Badge> : null}
        </div>
      </div>

      <div className="flex-1 space-y-6 p-6">
        {!selectedStrategyName ? (
          <div className="rounded-[2rem] border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/75 p-8">
            <p className="font-display text-2xl text-foreground">No strategy selected</p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Pick a strategy from the library to load the desk dossier. The center pane stays read
              focused, while create, edit, duplicate, and destructive actions live in the rail.
            </p>
          </div>
        ) : isLoading ? (
          <PageLoader text="Loading strategy dossier..." className="h-80" />
        ) : errorMessage ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : strategy ? (
          <>
            <div className="rounded-[2rem] border-2 border-mcm-walnut bg-[linear-gradient(135deg,rgba(255,247,233,0.98),rgba(245,245,220,0.82))] px-6 py-6 shadow-[8px_8px_0px_0px_rgba(119,63,26,0.12)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Desk dossier</Badge>
                    <Badge variant={strategy.type === 'configured' ? 'default' : 'outline'}>
                      {formatStrategyType(strategy.type)}
                    </Badge>
                    {strategy.config.regimePolicy ? (
                      <Badge variant="outline">Regime aware</Badge>
                    ) : (
                      <Badge variant="outline">No regime gate</Badge>
                    )}
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

                <div className="rounded-[1.6rem] border border-mcm-walnut/25 bg-mcm-paper/80 px-4 py-3 text-right">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Last updated
                  </div>
                  <div className="mt-2 text-sm font-semibold text-foreground">
                    {formatStrategyTimestamp(strategy.updated_at)}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DossierTile
                label="Universe"
                value={strategy.config.universeConfigName || 'Not assigned'}
                detail={
                  strategy.config.universe
                    ? 'This record still carries a legacy embedded universe payload.'
                    : 'Linked universe definition used for symbol eligibility.'
                }
              />
              <DossierTile
                label="Ranking"
                value={strategy.config.rankingSchemaName || 'Not attached'}
                detail="Linked ranking schema used during materialization and selection."
              />
              <DossierTile
                label="Selection"
                value={describeStrategySelection(strategy)}
                detail="Selection breadth and lookback drive the strategy’s turnover and signal stability."
              />
              <DossierTile
                label="Execution"
                value={describeStrategyExecution(strategy)}
                detail={`Rebalance ${strategy.config.rebalance} | conflict policy ${strategy.config.intrabarConflictPolicy}`}
              />
              <DossierTile
                label="Cost Model"
                value={strategy.config.costModel}
                detail="Cost assumptions stay visible here because desk process should not hide execution drag."
              />
              <DossierTile
                label="Regime Policy"
                value={strategy.config.regimePolicy ? strategy.config.regimePolicy.modelName : 'Disabled'}
                detail={describeRegimePolicy(strategy)}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-display text-lg text-foreground">Exit Stack</h4>
                    <p className="text-sm text-muted-foreground">
                      Rules remain visible in priority order so risk logic is inspectable before edit.
                    </p>
                  </div>
                  <Badge variant="secondary">{strategy.config.exits.length} rules</Badge>
                </div>

                {strategy.config.exits.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
                    No exit rules configured.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {strategy.config.exits.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-display text-base text-foreground">{rule.id}</div>
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              {formatRuleType(rule.type)} | priority {rule.priority ?? 'auto'}
                            </div>
                          </div>
                          <Badge variant="outline">Position scope</Badge>
                        </div>
                        <div className="mt-3 text-sm text-foreground">
                          {summarizeExitRule(rule)}
                          {rule.minHoldBars > 0 ? ` | minimum hold ${rule.minHoldBars} bars` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
                <div>
                  <h4 className="font-display text-lg text-foreground">Attachments</h4>
                  <p className="text-sm text-muted-foreground">
                    Universe and ranking authoring stay on their own routes.
                  </p>
                </div>

                <div className="space-y-3">
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link to="/universes">
                      <span className="inline-flex items-center gap-2">
                        <Orbit className="h-4 w-4" />
                        Universe configurations
                      </span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link to="/rankings">
                      <span className="inline-flex items-center gap-2">
                        <Layers3 className="h-4 w-4" />
                        Ranking configurations
                      </span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link to="/strategy-exploration">
                      <span className="inline-flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Strategy exploration
                      </span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    <TableProperties className="h-4 w-4" />
                    Platinum output
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">
                    {strategy.output_table_name
                      ? `platinum.${strategy.output_table_name}`
                      : 'No output table assigned'}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-display text-lg text-foreground">Recent Backtest Runs</h4>
                  <p className="text-sm text-muted-foreground">
                    Backtest launch stays secondary, but recent queue and completion state remain visible.
                  </p>
                </div>
                <Badge variant="secondary">{recentRuns.length} runs</Badge>
              </div>

              {recentRunsLoading ? (
                <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
                  Loading recent runs...
                </div>
              ) : recentRunsError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {recentRunsError}
                </div>
              ) : recentRuns.length ? (
                <div className="space-y-3">
                  {recentRuns.map((run) => (
                    <div
                      key={run.run_id}
                      className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-display text-base text-foreground">
                            {run.run_name || run.run_id}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatRunDateRange(run)}
                          </div>
                        </div>
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
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
                  No backtests have been submitted for this strategy yet.
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
