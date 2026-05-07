import { TableProperties } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Badge } from '@/app/components/ui/badge';
import { PageLoader } from '@/app/components/common/PageLoader';
import type { RunRecordResponse, TradeResponse } from '@/services/backtestApi';
import type { StrategyDetail } from '@/types/strategy';
import {
  describeRegimePolicy,
  describeStrategyExecution,
  describeStrategySelection,
  formatRuleType,
  formatStrategyTimestamp,
  formatStrategyType,
  getStrategyComponentPin,
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
  recentTrades: TradeResponse[];
  recentTradesLoading: boolean;
  recentTradesError: string;
  recentTradesRunId: string | null;
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
  recentRunsError,
  recentTrades,
  recentTradesLoading,
  recentTradesError,
  recentTradesRunId
}: StrategyDossierProps) {
  const universePin = strategy
    ? getStrategyComponentPin(
        strategy,
        'universe',
        strategy.config.universeConfigName,
        strategy.config.universeConfigVersion
      )
    : {};
  const rankingPin = strategy
    ? getStrategyComponentPin(
        strategy,
        'ranking',
        strategy.config.rankingSchemaName,
        strategy.config.rankingSchemaVersion
      )
    : {};
  const rebalancePin = strategy ? getStrategyComponentPin(strategy, 'rebalance') : {};

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
                value={universePin.name || 'Not assigned'}
                detail={
                  strategy.config.componentRefs?.universe
                    ? `Pinned ${universePin.version ? `v${universePin.version}` : 'without version'} through componentRefs.`
                    : strategy.config.universe
                    ? 'This record still carries a legacy embedded universe payload.'
                    : 'Linked universe definition used for symbol eligibility.'
                }
              />
              <DossierTile
                label="Ranking"
                value={rankingPin.name || 'Not attached'}
                detail={
                  strategy.config.componentRefs?.ranking
                    ? `Pinned ${rankingPin.version ? `v${rankingPin.version}` : 'without version'} through componentRefs.`
                    : 'Linked ranking schema used during materialization and selection.'
                }
              />
              <DossierTile
                label="Rebalance Policy"
                value={rebalancePin.name || 'Not pinned'}
                detail={
                  strategy.config.componentRefs?.rebalance
                    ? `Pinned ${rebalancePin.version ? `v${rebalancePin.version}` : 'without version'} through componentRefs.`
                    : `Legacy rebalance field: ${strategy.config.rebalance}.`
                }
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
                    Universe and ranking authoring now lives inside the Strategies workspace.
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 text-sm text-muted-foreground">
                  Use the Strategy Editor Panel to edit the attached universe draft, ranking schema,
                  regime policy, and risk policy without leaving /strategies.
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

            <div className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-display text-lg text-foreground">Latest Backtest Trade History</h4>
                  <p className="text-sm text-muted-foreground">
                    Rendered from the existing backtest trades API so trade rows are visible without leaving the dossier.
                  </p>
                </div>
                <Badge variant="secondary">{recentTrades.length} trades</Badge>
              </div>

              {recentTradesLoading ? (
                <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
                  Loading recent trades...
                </div>
              ) : recentTradesError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {recentTradesError}
                </div>
              ) : recentTrades.length ? (
                <div className="space-y-3">
                  {recentTradesRunId ? (
                    <div className="text-sm text-muted-foreground">Run {recentTradesRunId}</div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Execution</TableHead>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentTrades.map((trade) => (
                          <TableRow
                            key={`${trade.execution_date}-${trade.symbol}-${trade.trade_role || 'trade'}`}
                          >
                            <TableCell>{formatStrategyTimestamp(trade.execution_date)}</TableCell>
                            <TableCell className="font-medium">{trade.symbol}</TableCell>
                            <TableCell>{trade.trade_role || 'trade'}</TableCell>
                            <TableCell className="text-right">{trade.quantity}</TableCell>
                            <TableCell className="text-right">{trade.price}</TableCell>
                            <TableCell className="text-right">{trade.commission}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
                  No trade rows were returned for the latest available backtest run.
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
