import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CircleAlert, Layers3, TrendingUp } from 'lucide-react';

import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import { buildEmptyPortfolioSleeve } from '@/features/portfolios/lib/portfolioDraft';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatTimestamp,
  statusBadgeVariant
} from '@/features/portfolios/lib/portfolioPresentation';
import { backtestApi } from '@/services/backtestApi';
import { strategyApi } from '@/services/strategyApi';
import type {
  PortfolioDetail,
  PortfolioPreviewResponse,
  PortfolioSleeveDefinition
} from '@/types/portfolio';
import type { StrategySummary } from '@/types/strategy';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

import { PortfolioStrategyPicker } from './PortfolioStrategyPicker';

interface PortfolioConstructionTabProps {
  draft: PortfolioDetail;
  targetWeightTotal: number;
  residualWeightPct: number;
  strategies: readonly StrategySummary[];
  strategiesLoading: boolean;
  strategiesError?: string;
  previewResult: PortfolioPreviewResponse | null;
  previewPending: boolean;
  previewError?: string;
  previewStale: boolean;
  onUpdateDraft: (updater: (current: PortfolioDetail) => PortfolioDetail) => void;
}

function updateSleeveField(
  sleeve: PortfolioSleeveDefinition,
  field: keyof PortfolioSleeveDefinition,
  value: string
): PortfolioSleeveDefinition {
  const numericFields = new Set<keyof PortfolioSleeveDefinition>([
    'strategyVersion',
    'targetWeightPct',
    'minWeightPct',
    'maxWeightPct',
    'rebalanceBandPct',
    'rebalancePriority',
    'expectedHoldings'
  ]);

  if (numericFields.has(field)) {
    return {
      ...sleeve,
      [field]: Number(value || 0)
    };
  }

  return {
    ...sleeve,
    [field]: value
  };
}

function WeightBalanceMeter({
  allocatedWeightPct,
  residualCashPct,
  cashReservePct
}: {
  allocatedWeightPct: number;
  residualCashPct: number;
  cashReservePct: number;
}) {
  const normalizedAllocated = Math.max(0, Math.min(100, allocatedWeightPct));
  const normalizedResidual = Math.max(0, Math.min(100 - normalizedAllocated, residualCashPct));
  const withinReserve = residualCashPct <= cashReservePct;

  return (
    <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Weight Balance
          </div>
          <h3 className="mt-2 font-display text-xl">Allocated vs residual cash</h3>
        </div>
        <Badge variant={withinReserve ? 'default' : 'secondary'}>
          {withinReserve ? 'Inside reserve' : 'Outside reserve'}
        </Badge>
      </div>
      <div className="mt-4 h-4 overflow-hidden rounded-full bg-mcm-walnut/10">
        <div className="flex h-full">
          <div
            className="bg-mcm-teal transition-[width]"
            style={{ width: `${normalizedAllocated}%` }}
            aria-hidden
          />
          <div
            className={`${withinReserve ? 'bg-mcm-olive/65' : 'bg-mcm-rust/70'} transition-[width]`}
            style={{ width: `${normalizedResidual}%` }}
            aria-hidden
          />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MetricTile
          label="Allocated sleeve weight"
          value={formatPercent(allocatedWeightPct)}
          detail="Target weight currently assigned across sleeves."
        />
        <MetricTile
          label="Residual cash"
          value={formatPercent(residualCashPct)}
          detail="Unallocated residual implied by the current target stack."
        />
        <MetricTile
          label="Cash reserve"
          value={formatPercent(cashReservePct)}
          detail="Configured reserve capacity before the draft breaches the cash envelope."
        />
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function ControlCard({
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
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SleeveCard({
  sleeve,
  sleeveIndex,
  totalSleeves,
  strategies,
  strategiesLoading,
  onChange,
  onRemove
}: {
  sleeve: PortfolioSleeveDefinition;
  sleeveIndex: number;
  totalSleeves: number;
  strategies: readonly StrategySummary[];
  strategiesLoading: boolean;
  onChange: (nextSleeve: PortfolioSleeveDefinition) => void;
  onRemove: () => void;
}) {
  const strategyDetailQuery = useQuery({
    queryKey: ['portfolios', 'strategy-detail', sleeve.strategyName],
    queryFn: () => strategyApi.getStrategyDetail(sleeve.strategyName),
    enabled: Boolean(sleeve.strategyName)
  });
  const backtestRunsQuery = useQuery({
    queryKey: ['portfolios', 'strategy-backtest-runs', sleeve.strategyName],
    queryFn: () => backtestApi.listRuns({ q: sleeve.strategyName, limit: 1 }),
    enabled: Boolean(sleeve.strategyName)
  });
  const latestRunId = backtestRunsQuery.data?.runs[0]?.run_id;
  const backtestSummaryQuery = useQuery({
    queryKey: ['portfolios', 'strategy-backtest-summary', latestRunId],
    queryFn: () => backtestApi.getSummary(String(latestRunId)),
    enabled: Boolean(latestRunId)
  });

  const strategySummary = useMemo(() => {
    if (strategyDetailQuery.data?.description) {
      return strategyDetailQuery.data.description;
    }

    return (
      strategies.find((strategy) => strategy.name === sleeve.strategyName)?.description ||
      'Select a strategy to load its desk summary and latest backtest context.'
    );
  }, [sleeve.strategyName, strategies, strategyDetailQuery.data?.description]);

  return (
    <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Sleeve {sleeveIndex + 1}
          </div>
          <h3 className="mt-2 font-display text-xl">{sleeve.label || `Sleeve ${sleeveIndex + 1}`}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{strategySummary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusBadgeVariant(sleeve.status)}>{sleeve.status}</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRemove}
            disabled={totalSleeves <= 1}
          >
            Remove Sleeve
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`sleeve-label-${sleeve.sleeveId}`}>Sleeve label</Label>
            <Input
              id={`sleeve-label-${sleeve.sleeveId}`}
              value={sleeve.label}
              onChange={(event) => onChange(updateSleeveField(sleeve, 'label', event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Strategy selector</Label>
            <PortfolioStrategyPicker
              sleeveId={sleeve.sleeveId}
              selectedStrategyName={sleeve.strategyName}
              strategies={strategies}
              disabled={strategiesLoading}
              onSelect={(strategy) =>
                onChange({
                  ...sleeve,
                  strategyName: strategy.name
                })
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <NumberInput
              id={`sleeve-version-${sleeve.sleeveId}`}
              label="Strategy version"
              value={sleeve.strategyVersion}
              onChange={(value) => onChange(updateSleeveField(sleeve, 'strategyVersion', value))}
            />
            <NumberInput
              id={`sleeve-holdings-${sleeve.sleeveId}`}
              label="Expected holdings"
              value={sleeve.expectedHoldings}
              onChange={(value) => onChange(updateSleeveField(sleeve, 'expectedHoldings', value))}
            />
            <div className="grid gap-2">
              <Label htmlFor={`sleeve-status-${sleeve.sleeveId}`}>Status</Label>
              <Input
                id={`sleeve-status-${sleeve.sleeveId}`}
                value={sleeve.status}
                onChange={(event) => onChange(updateSleeveField(sleeve, 'status', event.target.value))}
              />
            </div>
            <NumberInput
              id={`sleeve-priority-${sleeve.sleeveId}`}
              label="Rebalance priority"
              value={sleeve.rebalancePriority}
              onChange={(value) => onChange(updateSleeveField(sleeve, 'rebalancePriority', value))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <NumberInput
              id={`sleeve-target-${sleeve.sleeveId}`}
              label="Target %"
              value={sleeve.targetWeightPct}
              onChange={(value) => onChange(updateSleeveField(sleeve, 'targetWeightPct', value))}
            />
            <NumberInput
              id={`sleeve-min-${sleeve.sleeveId}`}
              label="Min %"
              value={sleeve.minWeightPct}
              onChange={(value) => onChange(updateSleeveField(sleeve, 'minWeightPct', value))}
            />
            <NumberInput
              id={`sleeve-max-${sleeve.sleeveId}`}
              label="Max %"
              value={sleeve.maxWeightPct}
              onChange={(value) => onChange(updateSleeveField(sleeve, 'maxWeightPct', value))}
            />
            <NumberInput
              id={`sleeve-band-${sleeve.sleeveId}`}
              label="Band %"
              value={sleeve.rebalanceBandPct}
              onChange={(value) => onChange(updateSleeveField(sleeve, 'rebalanceBandPct', value))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`sleeve-notes-${sleeve.sleeveId}`}>Sleeve notes</Label>
            <Textarea
              id={`sleeve-notes-${sleeve.sleeveId}`}
              value={sleeve.notes || ''}
              onChange={(event) => onChange(updateSleeveField(sleeve, 'notes', event.target.value))}
              rows={3}
            />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-4">
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-mcm-teal" />
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Strategy Dossier
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name</span>
                <div className="font-medium">{sleeve.strategyName || 'Unassigned'}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Version</span>
                <div className="font-medium">v{sleeve.strategyVersion}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Short summary</span>
                <div className="mt-1 text-sm text-muted-foreground">{strategySummary}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Selection model</span>
                <div className="font-medium">
                  {strategyDetailQuery.data
                    ? `Top ${strategyDetailQuery.data.config.topN} over ${strategyDetailQuery.data.config.lookbackWindow} bars`
                    : 'Load a strategy to inspect the selection rules.'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-mcm-olive" />
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Recent Backtest
              </div>
            </div>
            <div className="mt-4">
              {backtestRunsQuery.isLoading || backtestSummaryQuery.isLoading ? (
                <PageLoader text="Loading backtest summary..." variant="panel" className="min-h-[7rem]" />
              ) : latestRunId && backtestSummaryQuery.data ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <MetricTile
                    label="Total return"
                    value={formatPercent(
                      typeof backtestSummaryQuery.data.total_return === 'number'
                        ? backtestSummaryQuery.data.total_return * 100
                        : null,
                      1
                    )}
                    detail={`Run ${latestRunId}`}
                  />
                  <MetricTile
                    label="Sharpe"
                    value={formatNumber(backtestSummaryQuery.data.sharpe_ratio ?? null, 2)}
                    detail={
                      backtestRunsQuery.data?.runs[0]?.submitted_at
                        ? `Submitted ${formatTimestamp(backtestRunsQuery.data.runs[0]?.submitted_at)}`
                        : 'Latest completed backtest'
                    }
                  />
                  <MetricTile
                    label="Max drawdown"
                    value={formatPercent(
                      typeof backtestSummaryQuery.data.max_drawdown === 'number'
                        ? backtestSummaryQuery.data.max_drawdown * 100
                        : null,
                      1
                    )}
                    detail="Latest available summary"
                  />
                  <MetricTile
                    label="Cost drag"
                    value={
                      backtestSummaryQuery.data.cost_drag_bps === undefined ||
                      backtestSummaryQuery.data.cost_drag_bps === null
                        ? 'n/a'
                        : `${formatNumber(backtestSummaryQuery.data.cost_drag_bps, 0)} bps`
                    }
                    detail="Estimated transaction-cost burden"
                  />
                </div>
              ) : (
                <StatePanel
                  tone="info"
                  title="No Recent Backtest Summary"
                  message="A recent run summary was not found for this strategy. The sleeve can still be configured, but the dossier remains incomplete."
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberInput({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function PreviewPanel({
  preview,
  previewPending,
  previewError,
  previewStale,
  baseCurrency
}: {
  preview: PortfolioPreviewResponse | null;
  previewPending: boolean;
  previewError?: string;
  previewStale: boolean;
  baseCurrency: string;
}) {
  if (previewPending) {
    return <PageLoader text="Rendering preview..." variant="panel" className="min-h-[12rem]" />;
  }

  if (previewError) {
    return (
      <StatePanel
        tone="error"
        title="Preview Unavailable"
        message={previewError}
      />
    );
  }

  if (!preview) {
    return (
      <StatePanel
        tone="empty"
        title="No Rebalance Preview Yet"
        message="Run the preview from the contextual rail to inspect projected exposures, trade proposals, and warnings."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile
          label="Weight stack"
          value={formatPercent(preview.summary.targetWeightPct)}
          detail={`Residual cash ${formatPercent(preview.summary.residualCashPct)}`}
        />
        <MetricTile
          label="Projected turnover"
          value={formatPercent(preview.summary.projectedTurnoverPct)}
          detail={`${preview.summary.projectedPositionCount} projected positions`}
        />
        <MetricTile
          label="Projected gross"
          value={formatPercent(preview.summary.projectedGrossExposurePct)}
          detail="Preview gross exposure"
        />
        <MetricTile
          label="Projected net"
          value={formatPercent(preview.summary.projectedNetExposurePct)}
          detail="Preview net exposure"
        />
      </div>

      <div className="rounded-3xl border border-mcm-walnut/15 bg-background/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Projected Exposure
            </div>
            <h3 className="mt-2 font-display text-xl">{preview.portfolioName}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={preview.previewSource === 'live-proposal' ? 'default' : 'secondary'}>
              {preview.previewSource === 'live-proposal' ? 'Live proposal' : 'Inferred preview'}
            </Badge>
            {preview.blocked ? <Badge variant="destructive">Blocked</Badge> : null}
            {previewStale ? <Badge variant="secondary">Draft changed since preview</Badge> : null}
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="space-y-3">
            {preview.warnings.length > 0 ? (
              <div className="rounded-2xl border border-mcm-mustard/30 bg-mcm-mustard/10 p-4">
                <div className="flex items-center gap-2">
                  <CircleAlert className="h-4 w-4 text-mcm-rust" />
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Warning list
                  </div>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Sleeve Allocation Preview
              </div>
              <div className="mt-3 space-y-3">
                {preview.allocations.map((allocation) => (
                  <div
                    key={allocation.sleeveId}
                    className="rounded-2xl border border-mcm-walnut/10 bg-background/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{allocation.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {allocation.strategyName} v{allocation.strategyVersion}
                        </div>
                      </div>
                      <Badge variant={statusBadgeVariant(allocation.status)}>{allocation.status}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        Target <span className="font-medium text-foreground">{formatPercent(allocation.targetWeightPct)}</span>
                      </div>
                      <div>
                        Projected <span className="font-medium text-foreground">{formatPercent(allocation.projectedWeightPct)}</span>
                      </div>
                      <div>
                        Sleeve gross <span className="font-medium text-foreground">{formatPercent(allocation.projectedGrossExposurePct)}</span>
                      </div>
                      <div>
                        Turnover <span className="font-medium text-foreground">{formatPercent(allocation.projectedTurnoverPct)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Proposed Rebalance Trades
            </div>
            <div className="mt-3">
              {preview.tradeProposals.length === 0 ? (
                <StatePanel
                  tone="info"
                  title="No Proposed Trades"
                  message={
                    preview.previewSource === 'inferred'
                      ? 'This is an inferred preview, so there is no live rebalance trade list yet.'
                      : 'The live proposal did not return any rebalance trades.'
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
                        <TableHead className="text-right">Est. Price</TableHead>
                        <TableHead className="text-right">Est. Notional</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">Slippage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.tradeProposals.map((trade) => (
                        <TableRow key={`${trade.sleeveId}-${trade.symbol}-${trade.side}`}>
                          <TableCell>{trade.sleeveId}</TableCell>
                          <TableCell>{trade.symbol}</TableCell>
                          <TableCell className="uppercase">{trade.side}</TableCell>
                          <TableCell className="text-right">{formatNumber(trade.quantity, 0)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(trade.estimatedPrice, baseCurrency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(trade.estimatedNotional, baseCurrency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(trade.estimatedCommission, baseCurrency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(trade.estimatedSlippageCost, baseCurrency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PortfolioConstructionTab({
  draft,
  targetWeightTotal,
  residualWeightPct,
  strategies,
  strategiesLoading,
  strategiesError,
  previewResult,
  previewPending,
  previewError,
  previewStale,
  onUpdateDraft
}: PortfolioConstructionTabProps) {
  const groupedSections = [
    {
      title: 'Exposure Limits',
      description: 'Gross and net caps define the draft exposure envelope before any sleeve-level overrides.',
      fields: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberInput
            id="risk-gross"
            label="Gross exposure %"
            value={draft.config.riskLimits.grossExposurePct}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  riskLimits: {
                    ...current.config.riskLimits,
                    grossExposurePct: Number(value || 0)
                  }
                }
              }))
            }
          />
          <NumberInput
            id="risk-net"
            label="Net exposure %"
            value={draft.config.riskLimits.netExposurePct}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  riskLimits: {
                    ...current.config.riskLimits,
                    netExposurePct: Number(value || 0)
                  }
                }
              }))
            }
          />
        </div>
      )
    },
    {
      title: 'Concentration Limits',
      description: 'Concentration caps constrain single-name and sector load before the rebalance proposal can clear.',
      fields: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberInput
            id="risk-single-name"
            label="Single-name max %"
            value={draft.config.riskLimits.singleNameMaxPct}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  riskLimits: {
                    ...current.config.riskLimits,
                    singleNameMaxPct: Number(value || 0)
                  }
                }
              }))
            }
          />
          <NumberInput
            id="risk-sector-max"
            label="Sector max %"
            value={draft.config.riskLimits.sectorMaxPct}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  riskLimits: {
                    ...current.config.riskLimits,
                    sectorMaxPct: Number(value || 0)
                  }
                }
              }))
            }
          />
        </div>
      )
    },
    {
      title: 'Turnover / Drift Controls',
      description: 'Turnover budget and drift threshold determine when the desk should rebalance versus tolerate deviation.',
      fields: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberInput
            id="risk-turnover-budget"
            label="Turnover budget %"
            value={draft.config.riskLimits.turnoverBudgetPct}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  riskLimits: {
                    ...current.config.riskLimits,
                    turnoverBudgetPct: Number(value || 0)
                  }
                }
              }))
            }
          />
          <NumberInput
            id="risk-drift-threshold"
            label="Drift threshold %"
            value={draft.config.riskLimits.driftRebalanceThresholdPct}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  riskLimits: {
                    ...current.config.riskLimits,
                    driftRebalanceThresholdPct: Number(value || 0)
                  }
                }
              }))
            }
          />
        </div>
      )
    },
    {
      title: 'Execution Controls',
      description: 'Execution policy bounds participation, notional size, and staging cadence for the rebalance implementation.',
      fields: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberInput
            id="execution-participation"
            label="Participation rate %"
            value={draft.config.executionPolicy.participationRatePct}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  executionPolicy: {
                    ...current.config.executionPolicy,
                    participationRatePct: Number(value || 0)
                  }
                }
              }))
            }
          />
          <NumberInput
            id="execution-notional"
            label="Max trade notional"
            value={draft.config.executionPolicy.maxTradeNotionalUsd}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  executionPolicy: {
                    ...current.config.executionPolicy,
                    maxTradeNotionalUsd: Number(value || 0)
                  }
                }
              }))
            }
          />
          <NumberInput
            id="execution-stagger"
            label="Stagger minutes"
            value={draft.config.executionPolicy.staggerMinutes}
            onChange={(value) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  executionPolicy: {
                    ...current.config.executionPolicy,
                    staggerMinutes: Number(value || 0)
                  }
                }
              }))
            }
          />
        </div>
      )
    },
    {
      title: 'Overlay Controls',
      description: 'Overlay models control regime interpretation, risk policy, and halt handling at the workspace level.',
      fields: (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="overlay-regime-model">Regime model</Label>
            <Input
              id="overlay-regime-model"
              value={draft.config.overlays.regimeModelName || ''}
              onChange={(event) =>
                onUpdateDraft((current) => ({
                  ...current,
                  config: {
                    ...current.config,
                    overlays: {
                      ...current.config.overlays,
                      regimeModelName: event.target.value
                    }
                  }
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="overlay-risk-model">Risk model</Label>
            <Input
              id="overlay-risk-model"
              value={draft.config.overlays.riskModelName || ''}
              onChange={(event) =>
                onUpdateDraft((current) => ({
                  ...current,
                  config: {
                    ...current.config,
                    overlays: {
                      ...current.config.overlays,
                      riskModelName: event.target.value
                    }
                  }
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="overlay-halt-flag">Honor halt flag</Label>
            <Input
              id="overlay-halt-flag"
              value={draft.config.overlays.honorHaltFlag ? 'true' : 'false'}
              onChange={(event) =>
                onUpdateDraft((current) => ({
                  ...current,
                  config: {
                    ...current.config,
                    overlays: {
                      ...current.config.overlays,
                      honorHaltFlag: event.target.value.toLowerCase() !== 'false'
                    }
                  }
                }))
              }
            />
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Workspace Definition
            </div>
            <h2 className="mt-2 font-display text-2xl">Portfolio builder</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Define the account shell, sleeve mix, benchmark, and operator notes before running a preview or publishing a rebalance candidate.
            </p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="portfolio-name">Workspace name</Label>
              <Input
                id="portfolio-name"
                value={draft.name}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    name: event.target.value,
                    portfolioName: event.target.value
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="benchmark-symbol">Benchmark</Label>
              <Input
                id="benchmark-symbol"
                value={draft.config.benchmarkSymbol}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    benchmarkSymbol: event.target.value,
                    config: {
                      ...current.config,
                      benchmarkSymbol: event.target.value
                    }
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="base-currency">Base currency</Label>
              <Input
                id="base-currency"
                value={draft.config.baseCurrency}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    baseCurrency: event.target.value,
                    config: {
                      ...current.config,
                      baseCurrency: event.target.value
                    }
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inception-date">Inception date</Label>
              <Input
                id="inception-date"
                type="date"
                value={draft.inceptionDate}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    inceptionDate: event.target.value
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="opening-cash">Opening cash</Label>
              <Input
                id="opening-cash"
                type="number"
                value={draft.openingCash ?? 0}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    openingCash: Number(event.target.value || 0)
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rebalance-cadence">Rebalance cadence</Label>
              <Input
                id="rebalance-cadence"
                value={draft.config.rebalanceCadence}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      rebalanceCadence: event.target.value as PortfolioDetail['config']['rebalanceCadence']
                    }
                  }))
                }
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mandate">Mandate</Label>
              <Textarea
                id="mandate"
                value={draft.mandate}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    mandate: event.target.value
                  }))
                }
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rebalance-anchor">Rebalance anchor</Label>
              <Textarea
                id="rebalance-anchor"
                value={draft.config.rebalanceAnchor}
                onChange={(event) =>
                  onUpdateDraft((current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      rebalanceAnchor: event.target.value
                    }
                  }))
                }
                rows={4}
              />
            </div>
          </div>
        </div>

        <WeightBalanceMeter
          allocatedWeightPct={targetWeightTotal}
          residualCashPct={residualWeightPct}
          cashReservePct={draft.config.cashReservePct}
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Sleeve Stack
            </div>
            <h2 className="mt-2 font-display text-2xl">Combine different strategies</h2>
          </div>
          <Button
            type="button"
            onClick={() =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  sleeves: [...current.config.sleeves, buildEmptyPortfolioSleeve(current.config.sleeves.length)]
                }
              }))
            }
          >
            Add Sleeve
          </Button>
        </div>
        {strategiesError ? (
          <StatePanel
            tone="error"
            title="Strategy Catalog Unavailable"
            message={strategiesError}
          />
        ) : null}
        {draft.config.sleeves.map((sleeve, index) => (
          <SleeveCard
            key={sleeve.sleeveId}
            sleeve={sleeve}
            sleeveIndex={index}
            totalSleeves={draft.config.sleeves.length}
            strategies={strategies}
            strategiesLoading={strategiesLoading}
            onChange={(nextSleeve) =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  sleeves: current.config.sleeves.map((candidate) =>
                    candidate.sleeveId === sleeve.sleeveId ? nextSleeve : candidate
                  )
                }
              }))
            }
            onRemove={() =>
              onUpdateDraft((current) => ({
                ...current,
                config: {
                  ...current.config,
                  sleeves: current.config.sleeves.filter(
                    (candidate) => candidate.sleeveId !== sleeve.sleeveId
                  )
                }
              }))
            }
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {groupedSections.map((section) => (
          <ControlCard key={section.title} title={section.title} description={section.description}>
            {section.fields}
          </ControlCard>
        ))}
      </div>

      <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-mcm-teal" />
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Rebalance Preview
            </div>
            <h2 className="mt-2 font-display text-2xl">Actionable preview surface</h2>
          </div>
        </div>
        <div className="mt-4">
          <PreviewPanel
            preview={previewResult}
            previewPending={previewPending}
            previewError={previewError}
            previewStale={previewStale}
            baseCurrency={draft.config.baseCurrency}
          />
        </div>
      </div>
    </div>
  );
}
