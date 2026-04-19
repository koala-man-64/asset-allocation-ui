import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis
} from 'recharts';

import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/app/components/ui/chart';
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
  MODEL_OUTLOOK_ASSUMPTIONS,
  MODEL_OUTLOOK_HORIZONS,
  derivePortfolioModelOutlook,
  type ModelOutlookAssumption,
  type ModelOutlookHorizon
} from '@/features/portfolios/lib/portfolioForecast';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  titleCaseWords
} from '@/features/portfolios/lib/portfolioPresentation';
import type { PortfolioMonitorSnapshot } from '@/types/portfolio';
import type { RegimeSnapshot } from '@/types/regime';

interface PortfolioPerformanceTabProps {
  monitorSnapshot: PortfolioMonitorSnapshot | null;
  benchmarkComparison: PortfolioBenchmarkComparison | null;
  benchmarkError?: string;
  regimeHistory: readonly RegimeSnapshot[];
  regimeHistoryError?: string;
  currentRegimeCode?: string | null;
}

const CHART_CONFIG = {
  portfolioIndexed: { label: 'Portfolio', color: '#1e6b6b' },
  benchmarkIndexed: { label: 'Benchmark', color: '#9a6b2f' },
  activeReturnPct: { label: 'Active return', color: '#6a3f2a' },
  drawdownPct: { label: 'Drawdown', color: '#8f2d2d' },
  turnoverPct: { label: 'Turnover', color: '#566635' },
  costDragBps: { label: 'Cost drag', color: '#5f4b32' }
};

function ChartCard({
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

export function PortfolioPerformanceTab({
  monitorSnapshot,
  benchmarkComparison,
  benchmarkError,
  regimeHistory,
  regimeHistoryError,
  currentRegimeCode
}: PortfolioPerformanceTabProps) {
  const [selectedHorizon, setSelectedHorizon] = useState<ModelOutlookHorizon>('3M');
  const [selectedAssumption, setSelectedAssumption] = useState<ModelOutlookAssumption>('current');
  const [costDragOverrideBps, setCostDragOverrideBps] = useState('0');

  const outlook = useMemo(
    () =>
      derivePortfolioModelOutlook({
        history: monitorSnapshot?.history || [],
        comparison: benchmarkComparison,
        regimeHistory,
        currentRegimeCode,
        horizon: selectedHorizon,
        assumption: selectedAssumption,
        costDragOverrideBps: Number(costDragOverrideBps || 0)
      }),
    [
      benchmarkComparison,
      costDragOverrideBps,
      currentRegimeCode,
      monitorSnapshot?.history,
      regimeHistory,
      selectedAssumption,
      selectedHorizon
    ]
  );

  if (!monitorSnapshot || monitorSnapshot.history.length === 0) {
    return (
      <StatePanel
        tone="empty"
        title="Performance History Unavailable"
        message="A monitor snapshot with portfolio history is required before performance and forecast analytics can render."
      />
    );
  }

  const chartPoints = benchmarkComparison?.points || [];

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Performance
        </div>
        <h2 className="mt-2 font-display text-2xl">NAV, benchmark, attribution, and model outlook</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Replace table-only performance history with benchmark-relative context, drawdown visibility, turnover and cost drag trends, and a forecast surface with explicit confidence.
        </p>
      </div>

      {benchmarkError ? (
        <StatePanel
          tone="error"
          title="Benchmark Market Data Unavailable"
          message={benchmarkError}
        />
      ) : null}
      {regimeHistoryError ? (
        <StatePanel
          tone="error"
          title="Regime History Unavailable"
          message={regimeHistoryError}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard
          title="NAV vs Benchmark"
          description="Portfolio NAV and benchmark are normalized to the same starting point for the selected local history."
        >
          {chartPoints.length === 0 ? (
            <StatePanel
              tone="empty"
              title="No chart data"
              message="Benchmark-relative history could not be aligned to the current portfolio snapshot."
            />
          ) : (
            <ChartContainer config={CHART_CONFIG} className="h-[20rem] w-full">
              <LineChart data={chartPoints}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis tickFormatter={(value) => `${value}`} width={52} />
                <ChartTooltip
                  content={({ content, ...props }) => <ChartTooltipContent {...props} />}
                />
                <Line
                  type="monotone"
                  dataKey="portfolioIndexed"
                  stroke="var(--color-portfolioIndexed)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="benchmarkIndexed"
                  stroke="var(--color-benchmarkIndexed)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ChartContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Active Return"
          description="Cumulative active return isolates the local benchmark-relative edge instead of reporting only absolute performance."
        >
          {chartPoints.length === 0 ? (
            <StatePanel
              tone="empty"
              title="No active return view"
              message="Active return requires aligned portfolio and benchmark history."
            />
          ) : (
            <ChartContainer config={CHART_CONFIG} className="h-[20rem] w-full">
              <AreaChart data={chartPoints}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis tickFormatter={(value) => `${value}%`} width={60} />
                <ChartTooltip
                  content={({ content, ...props }) => <ChartTooltipContent {...props} />}
                />
                <Area
                  type="monotone"
                  dataKey="activeReturnPct"
                  stroke="var(--color-activeReturnPct)"
                  fill="var(--color-activeReturnPct)"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Drawdown"
          description="Drawdown stays visible next to performance so the desk sees path risk instead of only endpoint return."
        >
          {chartPoints.length === 0 ? (
            <StatePanel tone="empty" title="No drawdown series" message="Drawdown history is unavailable." />
          ) : (
            <ChartContainer config={CHART_CONFIG} className="h-[18rem] w-full">
              <AreaChart data={chartPoints}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis tickFormatter={(value) => `${value}%`} width={60} />
                <ChartTooltip
                  content={({ content, ...props }) => <ChartTooltipContent {...props} />}
                />
                <Area
                  type="monotone"
                  dataKey="drawdownPct"
                  stroke="var(--color-drawdownPct)"
                  fill="var(--color-drawdownPct)"
                  fillOpacity={0.22}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Turnover and Cost Drag"
          description="Turnover and cost drag trend together so a strong return line is not read without execution burden context."
        >
          {chartPoints.length === 0 ? (
            <StatePanel tone="empty" title="No turnover series" message="Turnover history is unavailable." />
          ) : (
            <ChartContainer config={CHART_CONFIG} className="h-[18rem] w-full">
              <ComposedChart data={chartPoints}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis yAxisId="turnover" tickFormatter={(value) => `${value}%`} width={56} />
                <YAxis
                  yAxisId="drag"
                  orientation="right"
                  tickFormatter={(value) => `${value} bps`}
                  width={64}
                />
                <ChartTooltip
                  content={({ content, ...props }) => <ChartTooltipContent {...props} />}
                />
                <Area
                  yAxisId="turnover"
                  type="monotone"
                  dataKey="turnoverPct"
                  stroke="var(--color-turnoverPct)"
                  fill="var(--color-turnoverPct)"
                  fillOpacity={0.18}
                />
                <Line
                  yAxisId="drag"
                  type="monotone"
                  dataKey="costDragBps"
                  stroke="var(--color-costDragBps)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ChartCard
          title="Sleeve Attribution"
          description="Return contribution, market value, and target-vs-live weight make sleeve-level performance and drift visible in one place."
        >
          {monitorSnapshot.sleeves.length === 0 ? (
            <StatePanel
              tone="empty"
              title="No sleeve attribution"
              message="Sleeve attribution publishes once a monitor snapshot includes slice-level data."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sleeve</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead className="text-right">Return contribution</TableHead>
                    <TableHead className="text-right">Market value</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Live</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monitorSnapshot.sleeves.map((sleeve) => (
                    <TableRow key={sleeve.sleeveId}>
                      <TableCell className="font-medium">{sleeve.label}</TableCell>
                      <TableCell>{sleeve.strategyName}</TableCell>
                      <TableCell className="text-right">
                        {formatPercent(sleeve.returnContributionPct ?? null)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(sleeve.marketValue ?? null, monitorSnapshot.baseCurrency)}
                      </TableCell>
                      <TableCell className="text-right">{formatPercent(sleeve.targetWeightPct)}</TableCell>
                      <TableCell className="text-right">{formatPercent(sleeve.liveWeightPct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ChartCard>

        <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Model Outlook
              </div>
              <h3 className="mt-2 font-display text-xl">Regime-conditioned forecast</h3>
            </div>
            <Badge variant={outlook.confidence === 'thin' ? 'secondary' : 'default'}>
              {outlook.confidenceLabel}
            </Badge>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Horizon
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {MODEL_OUTLOOK_HORIZONS.map((horizon) => (
                  <Button
                    key={horizon}
                    type="button"
                    variant={selectedHorizon === horizon ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedHorizon(horizon)}
                  >
                    {horizon}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Regime assumption
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {MODEL_OUTLOOK_ASSUMPTIONS.map((assumption) => (
                  <Button
                    key={assumption}
                    type="button"
                    variant={selectedAssumption === assumption ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedAssumption(assumption)}
                  >
                    {assumption === 'current' ? 'Current' : titleCaseWords(assumption)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="model-outlook-cost-drag"
                className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              >
                Cost-drag override (bps)
              </label>
              <Input
                id="model-outlook-cost-drag"
                type="number"
                value={costDragOverrideBps}
                onChange={(event) => setCostDragOverrideBps(event.target.value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Expected portfolio return</div>
                <div className="mt-2 font-display text-2xl">{formatPercent(outlook.expectedReturnPct)}</div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Expected active return</div>
                <div className="mt-2 font-display text-2xl">{formatPercent(outlook.expectedActiveReturnPct)}</div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Downside band</div>
                <div className="mt-2 font-display text-2xl">{formatPercent(outlook.downsidePct)}</div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Upside band</div>
                <div className="mt-2 font-display text-2xl">{formatPercent(outlook.upsidePct)}</div>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                Applied regime{' '}
                <span className="font-medium text-foreground">
                  {titleCaseWords(outlook.appliedRegimeCode)}
                </span>
              </div>
              <div>
                Sample size{' '}
                <span className="font-medium text-foreground">
                  {formatNumber(outlook.sampleSize, 0)}
                </span>{' '}
                windows
              </div>
              <div>
                Sample mode{' '}
                <span className="font-medium text-foreground">
                  {titleCaseWords(outlook.sampleMode)}
                </span>
              </div>
              {outlook.notes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
