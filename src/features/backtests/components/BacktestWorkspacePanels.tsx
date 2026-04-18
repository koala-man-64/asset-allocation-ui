import { useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis
} from 'recharts';

import { Badge } from '@/app/components/ui/badge';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from '@/app/components/ui/chart';
import { Input } from '@/app/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { cn } from '@/app/components/ui/utils';
import { BacktestMetricCard } from '@/features/backtests/components/BacktestMetricCard';
import {
  type BacktestWorkspaceTab,
  formatMetricBps,
  formatMetricCurrency,
  formatMetricInteger,
  formatMetricNumber,
  formatMetricPercent,
  formatRunTimestamp,
  formatSnakeCaseLabel
} from '@/features/backtests/lib/presentation';
import type {
  BacktestSummary,
  ClosedPositionResponse,
  RollingMetricPointResponse,
  RunStatusResponse,
  TimeseriesPointResponse,
  TradeResponse
} from '@/services/backtestApi';

function BacktestWorkspaceSectionFrame({
  title,
  description,
  action,
  children,
  className
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mcm-panel overflow-hidden', className)}>
      <div className="border-b border-border/40 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-foreground">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
          {action}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PinnedSourceTile({
  label,
  name,
  version,
  fallback = 'Not pinned'
}: {
  label: string;
  name?: string | null;
  version?: number | null;
  fallback?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-foreground">{name || fallback}</div>
      <div className="mt-2 text-sm text-muted-foreground">
        {version ? `Version ${version}` : 'Version unavailable'}
      </div>
    </div>
  );
}

export function BacktestWorkspaceStatePanel({
  title,
  description,
  detail,
  icon
}: {
  title: string;
  description: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[1.7rem] border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-8">
      <div className="flex items-start gap-4">
        <div className="mt-1 rounded-full border border-mcm-walnut/25 bg-mcm-paper/80 p-3 text-mcm-teal">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-2xl text-foreground">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          <p className="mt-3 text-sm text-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 1
  }).format(value);
}

function formatAxisDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(parsed);
}

function toDateValue(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function withinDateRange(value: string, from: string, to: string): boolean {
  const candidate = toDateValue(value);
  if (candidate === null) return false;

  const fromValue = from ? toDateValue(from) : null;
  const toValue = to ? toDateValue(to) : null;

  if (fromValue !== null && candidate < fromValue) return false;
  if (toValue !== null && candidate > toValue + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

function OverviewPanel({
  run,
  summary,
  timeseries
}: {
  run: RunStatusResponse;
  summary?: BacktestSummary;
  timeseries: TimeseriesPointResponse[];
}) {
  const chartData = timeseries.slice(-120);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BacktestMetricCard
          label="Net Return"
          value={formatMetricPercent(summary?.total_return)}
          detail="Net performance after commission and slippage."
          emphasis="accent"
        />
        <BacktestMetricCard
          label="Annualized Return"
          value={formatMetricPercent(summary?.annualized_return)}
          detail="Cadence-aware return annualization from the runtime."
        />
        <BacktestMetricCard
          label="Max Drawdown"
          value={formatMetricPercent(summary?.max_drawdown)}
          detail="Peak-to-trough drawdown on the net equity path."
        />
        <BacktestMetricCard
          label="Final Equity"
          value={formatMetricCurrency(summary?.final_equity)}
          detail="Ending marked portfolio value for this frozen run."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BacktestMetricCard
          label="Gross Return"
          value={formatMetricPercent(summary?.gross_total_return)}
          detail="Gross performance before implementation drag."
        />
        <BacktestMetricCard
          label="Cost Drag"
          value={formatMetricBps(summary?.cost_drag_bps)}
          detail="Commission and slippage drag against gross return."
        />
        <BacktestMetricCard
          label="Avg Gross Exposure"
          value={formatMetricPercent(summary?.avg_gross_exposure)}
          detail="Absolute market value over equity."
        />
        <BacktestMetricCard
          label="Avg Net Exposure"
          value={formatMetricPercent(summary?.avg_net_exposure)}
          detail="Signed market value over equity for this long-only scope."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BacktestMetricCard
          label="Closed Positions"
          value={formatMetricInteger(summary?.closed_positions)}
          detail="Round-trip position outcomes, separate from execution events."
        />
        <BacktestMetricCard
          label="Hit Rate"
          value={formatMetricPercent(summary?.hit_rate)}
          detail="Winning closed positions divided by total closed positions."
        />
        <BacktestMetricCard
          label="Profit Factor"
          value={formatMetricNumber(summary?.profit_factor)}
          detail="Gross wins divided by gross losses across closed positions."
        />
        <BacktestMetricCard
          label="Expectancy"
          value={formatMetricCurrency(summary?.expectancy_pnl)}
          detail="Average realized P&L expectation per closed position."
        />
      </div>

      <BacktestWorkspaceSectionFrame
        title="Pinned Definition"
        description="This run is frozen against specific strategy, ranking, universe, and regime revisions."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PinnedSourceTile
            label="Strategy"
            name={run.pins?.strategyName || run.strategy_name}
            version={run.pins?.strategyVersion || run.strategy_version}
          />
          <PinnedSourceTile
            label="Ranking Schema"
            name={run.pins?.rankingSchemaName}
            version={run.pins?.rankingSchemaVersion}
          />
          <PinnedSourceTile
            label="Universe"
            name={run.pins?.universeName}
            version={run.pins?.universeVersion}
          />
          <PinnedSourceTile
            label="Regime Model"
            name={run.pins?.regimeModelName}
            version={run.pins?.regimeModelVersion}
            fallback="Disabled"
          />
        </div>
      </BacktestWorkspaceSectionFrame>

      <BacktestWorkspaceSectionFrame
        title="Equity Snapshot"
        description="One view for the portfolio path. Drill into the risk tab for rolling and implementation detail."
      >
        {chartData.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/65 p-6 text-sm text-muted-foreground">
            Equity series unavailable for this run.
          </div>
        ) : (
          <ChartContainer
            className="h-[320px] w-full"
            config={{
              portfolio_value: { label: 'Portfolio value', color: 'var(--color-mcm-teal)' },
              drawdown: { label: 'Drawdown', color: 'var(--color-destructive)' }
            }}
          >
            <ComposedChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatAxisDate} minTickGap={32} />
              <YAxis
                yAxisId="equity"
                tickFormatter={(value) => formatCompactCurrency(Number(value))}
                width={90}
              />
              <YAxis
                yAxisId="drawdown"
                orientation="right"
                tickFormatter={(value) => formatMetricPercent(Number(value), 0)}
                width={72}
              />
              <ChartTooltip
                content={({ active, payload, label, coordinate, accessibilityLayer, activeIndex }) => (
                  <ChartTooltipContent
                    active={active}
                    payload={payload}
                    label={label}
                    coordinate={coordinate}
                    accessibilityLayer={accessibilityLayer}
                    activeIndex={activeIndex}
                    formatter={(value, name) => {
                      if (name === 'drawdown') return formatMetricPercent(Number(value), 2);
                      return formatMetricCurrency(Number(value));
                    }}
                    labelFormatter={(tooltipLabel) => formatRunTimestamp(String(tooltipLabel))}
                  />
                )}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                yAxisId="equity"
                type="monotone"
                dataKey="portfolio_value"
                stroke="var(--color-portfolio_value)"
                fill="var(--color-portfolio_value)"
                fillOpacity={0.16}
                strokeWidth={2}
              />
              <Line
                yAxisId="drawdown"
                type="monotone"
                dataKey="drawdown"
                stroke="var(--color-drawdown)"
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </BacktestWorkspaceSectionFrame>
    </div>
  );
}

function RiskPanel({
  summary,
  timeseries,
  rolling,
  windowDays,
  onWindowDaysChange
}: {
  summary?: BacktestSummary;
  timeseries: TimeseriesPointResponse[];
  rolling: RollingMetricPointResponse[];
  windowDays: number;
  onWindowDaysChange: (value: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BacktestMetricCard
          label="Sharpe"
          value={formatMetricNumber(summary?.sharpe_ratio)}
          detail="Net return relative to annualized volatility."
        />
        <BacktestMetricCard
          label="Sortino"
          value={formatMetricNumber(summary?.sortino_ratio)}
          detail="Downside-sensitive risk quality."
        />
        <BacktestMetricCard
          label="Calmar"
          value={formatMetricNumber(summary?.calmar_ratio)}
          detail="Return efficiency relative to max drawdown."
        />
        <BacktestMetricCard
          label="Trades"
          value={formatMetricInteger(summary?.trades)}
          detail="Execution events, not round-trip positions."
        />
      </div>
 
      <BacktestWorkspaceSectionFrame
        title="Equity and Drawdown"
        description="Primary portfolio view. The portfolio path and drawdown stay together."
      >
        {timeseries.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/65 p-6 text-sm text-muted-foreground">
            No timeseries data published for this run yet.
          </div>
        ) : (
          <ChartContainer
            className="h-[340px] w-full"
            config={{
              portfolio_value: { label: 'Portfolio value', color: 'var(--color-mcm-teal)' },
              drawdown: { label: 'Drawdown', color: 'var(--color-destructive)' }
            }}
          >
            <ComposedChart data={timeseries} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatAxisDate} minTickGap={28} />
              <YAxis
                yAxisId="equity"
                tickFormatter={(value) => formatCompactCurrency(Number(value))}
                width={90}
              />
              <YAxis
                yAxisId="drawdown"
                orientation="right"
                tickFormatter={(value) => formatMetricPercent(Number(value), 0)}
                width={72}
              />
              <ChartTooltip
                content={({ active, payload, label, coordinate, accessibilityLayer, activeIndex }) => (
                  <ChartTooltipContent
                    active={active}
                    payload={payload}
                    label={label}
                    coordinate={coordinate}
                    accessibilityLayer={accessibilityLayer}
                    activeIndex={activeIndex}
                    formatter={(value, name) => {
                      if (name === 'drawdown') return formatMetricPercent(Number(value), 2);
                      return formatMetricCurrency(Number(value));
                    }}
                    labelFormatter={(tooltipLabel) => formatRunTimestamp(String(tooltipLabel))}
                  />
                )}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                yAxisId="equity"
                type="monotone"
                dataKey="portfolio_value"
                stroke="var(--color-portfolio_value)"
                fill="var(--color-portfolio_value)"
                fillOpacity={0.16}
                strokeWidth={2}
              />
              <Line
                yAxisId="drawdown"
                type="monotone"
                dataKey="drawdown"
                stroke="var(--color-drawdown)"
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </BacktestWorkspaceSectionFrame>

      <div className="grid gap-6 xl:grid-cols-2">
        <BacktestWorkspaceSectionFrame
          title="Return and Cash Series"
          description="Use the cadence-aware period return field, with cumulative return and cash context."
        >
          {timeseries.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/65 p-6 text-sm text-muted-foreground">
              No return series published for this run yet.
            </div>
          ) : (
            <ChartContainer
              className="h-[300px] w-full"
              config={{
                cumulative_return: { label: 'Cumulative return', color: 'var(--color-mcm-teal)' },
                period_return: { label: 'Period return', color: 'var(--color-mcm-mustard)' },
                cash: { label: 'Cash', color: 'var(--color-mcm-olive)' }
              }}
            >
              <LineChart data={timeseries} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} minTickGap={28} />
                <YAxis
                  yAxisId="returns"
                  tickFormatter={(value) => formatMetricPercent(Number(value), 0)}
                  width={72}
                />
                <YAxis
                  yAxisId="cash"
                  orientation="right"
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  width={90}
                />
                <ChartTooltip
                  content={({ active, payload, label, coordinate, accessibilityLayer, activeIndex }) => (
                    <ChartTooltipContent
                      active={active}
                      payload={payload}
                      label={label}
                      coordinate={coordinate}
                      accessibilityLayer={accessibilityLayer}
                      activeIndex={activeIndex}
                      formatter={(value, name) => {
                        if (name === 'cash') return formatMetricCurrency(Number(value));
                        return formatMetricPercent(Number(value), 2);
                      }}
                      labelFormatter={(tooltipLabel) => formatRunTimestamp(String(tooltipLabel))}
                    />
                  )}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  yAxisId="returns"
                  type="monotone"
                  dataKey="cumulative_return"
                  stroke="var(--color-cumulative_return)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="returns"
                  type="monotone"
                  dataKey="period_return"
                  stroke="var(--color-period_return)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="cash"
                  type="monotone"
                  dataKey="cash"
                  stroke="var(--color-cash)"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ChartContainer>
          )}
        </BacktestWorkspaceSectionFrame>

        <BacktestWorkspaceSectionFrame
          title="Exposure and Trading Activity"
          description="Gross and net exposure remain separate. Turnover, commission, slippage, and trade count stay visible on the same risk page."
        >
          {timeseries.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/65 p-6 text-sm text-muted-foreground">
              No exposure series published for this run yet.
            </div>
          ) : (
            <ChartContainer
              className="h-[300px] w-full"
              config={{
                gross_exposure: { label: 'Gross exposure', color: 'var(--color-mcm-teal)' },
                net_exposure: { label: 'Net exposure', color: 'var(--color-mcm-mustard)' },
                turnover: { label: 'Turnover', color: 'var(--color-mcm-olive)' },
                trade_count: { label: 'Trade count', color: 'var(--color-chart-4)' },
                commission: { label: 'Commission', color: 'var(--color-chart-5)' },
                slippage_cost: { label: 'Slippage', color: 'var(--color-destructive)' }
              }}
            >
              <LineChart data={timeseries} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} minTickGap={28} />
                <YAxis
                  yAxisId="ratio"
                  tickFormatter={(value) => formatMetricPercent(Number(value), 0)}
                  width={72}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  tickFormatter={(value) => formatMetricCurrency(Number(value))}
                  width={90}
                />
                <ChartTooltip
                  content={({ active, payload, label, coordinate, accessibilityLayer, activeIndex }) => (
                    <ChartTooltipContent
                      active={active}
                      payload={payload}
                      label={label}
                      coordinate={coordinate}
                      accessibilityLayer={accessibilityLayer}
                      activeIndex={activeIndex}
                      formatter={(value, name) => {
                        if (name === 'trade_count') {
                          return formatMetricInteger(Number(value));
                        }
                        if (name === 'commission' || name === 'slippage_cost') {
                          return formatMetricCurrency(Number(value));
                        }
                        return formatMetricPercent(Number(value), 2);
                      }}
                      labelFormatter={(tooltipLabel) => formatRunTimestamp(String(tooltipLabel))}
                    />
                  )}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  yAxisId="ratio"
                  type="monotone"
                  dataKey="gross_exposure"
                  stroke="var(--color-gross_exposure)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="ratio"
                  type="monotone"
                  dataKey="net_exposure"
                  stroke="var(--color-net_exposure)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="ratio"
                  type="monotone"
                  dataKey="turnover"
                  stroke="var(--color-turnover)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="trade_count"
                  stroke="var(--color-trade_count)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="commission"
                  stroke="var(--color-commission)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="slippage_cost"
                  stroke="var(--color-slippage_cost)"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ChartContainer>
          )}
        </BacktestWorkspaceSectionFrame>
      </div>

      <BacktestWorkspaceSectionFrame
        title="Rolling Metrics"
        description="Rolling statistics stay cadence-aware. The plotted values use runtime window periods even though the endpoint is parameterized by window days."
        action={
          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Window Days
            </span>
            <select
              value={windowDays}
              onChange={(event) => onWindowDaysChange(Number(event.target.value))}
              className="h-10 min-w-[160px] rounded-xl border border-input bg-background px-3 text-sm"
            >
              {[21, 63, 126, 252].map((value) => (
                <option key={value} value={value}>
                  {value} days
                </option>
              ))}
            </select>
          </label>
        }
      >
        {rolling.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/65 p-6 text-sm text-muted-foreground">
            Rolling metrics unavailable for this window.
          </div>
        ) : (
          <ChartContainer
            className="h-[320px] w-full"
            config={{
              rolling_return: { label: 'Rolling return', color: 'var(--color-mcm-teal)' },
              rolling_volatility: {
                label: 'Rolling volatility',
                color: 'var(--color-mcm-mustard)'
              },
              rolling_sharpe: { label: 'Rolling sharpe', color: 'var(--color-mcm-olive)' },
              rolling_max_drawdown: {
                label: 'Rolling drawdown',
                color: 'var(--color-destructive)'
              }
            }}
          >
            <LineChart data={rolling} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={formatAxisDate} minTickGap={28} />
              <YAxis tickFormatter={(value) => formatMetricPercent(Number(value), 0)} width={72} />
              <ChartTooltip
                content={({ active, payload, label, coordinate, accessibilityLayer, activeIndex }) => (
                  <ChartTooltipContent
                    active={active}
                    payload={payload}
                    label={label}
                    coordinate={coordinate}
                    accessibilityLayer={accessibilityLayer}
                    activeIndex={activeIndex}
                    formatter={(value) => formatMetricPercent(Number(value), 2)}
                    labelFormatter={(tooltipLabel, currentPayload) => {
                      const point = currentPayload?.[0]
                        ?.payload as RollingMetricPointResponse | undefined;
                      const windowLabel = point?.window_periods
                        ? `${point.window_periods} periods`
                        : `${windowDays} days`;
                      return `${formatRunTimestamp(String(tooltipLabel))} | ${windowLabel}`;
                    }}
                  />
                )}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="rolling_return"
                stroke="var(--color-rolling_return)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="rolling_volatility"
                stroke="var(--color-rolling_volatility)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="rolling_sharpe"
                stroke="var(--color-rolling_sharpe)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="rolling_max_drawdown"
                stroke="var(--color-rolling_max_drawdown)"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ChartContainer>
        )}
      </BacktestWorkspaceSectionFrame>
    </div>
  );
}

function TradesPanel({
  trades,
  summary
}: {
  trades: TradeResponse[];
  summary?: BacktestSummary;
}) {
  const [symbolFilter, setSymbolFilter] = useState('');
  const [tradeRole, setTradeRole] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      const matchesSymbol =
        !symbolFilter.trim() ||
        trade.symbol.toLowerCase().includes(symbolFilter.trim().toLowerCase());
      const matchesRole = tradeRole === 'all' || trade.trade_role === tradeRole;
      const matchesDate =
        (!fromDate && !toDate) || withinDateRange(trade.execution_date, fromDate, toDate);

      return matchesSymbol && matchesRole && matchesDate;
    });
  }, [fromDate, symbolFilter, toDate, tradeRole, trades]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BacktestMetricCard
          label="Trade Count"
          value={formatMetricInteger(summary?.trades)}
          detail="Execution events only. Do not use this surface for round-trip attribution."
        />
        <BacktestMetricCard
          label="Commission"
          value={formatMetricCurrency(summary?.total_commission)}
          detail="Explicit commissions across all execution rows."
        />
        <BacktestMetricCard
          label="Slippage"
          value={formatMetricCurrency(summary?.total_slippage_cost)}
          detail="Slippage cost accrued during rebalances and exits."
        />
        <BacktestMetricCard
          label="Transaction Cost"
          value={formatMetricCurrency(summary?.total_transaction_cost)}
          detail="Combined execution drag booked to the portfolio."
        />
      </div>

      <BacktestWorkspaceSectionFrame
        title="Trade Audit"
        description="This table stays execution-only. Entries, rebalances, and exits are represented as separate audit rows."
      >
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Symbol
            </span>
            <Input
              value={symbolFilter}
              onChange={(event) => setSymbolFilter(event.target.value)}
              placeholder="Filter symbol"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Trade Role
            </span>
            <select
              value={tradeRole}
              onChange={(event) => setTradeRole(event.target.value)}
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="all">All roles</option>
              <option value="entry">Entry</option>
              <option value="rebalance_increase">Rebalance increase</option>
              <option value="rebalance_decrease">Rebalance decrease</option>
              <option value="exit">Exit</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              From Date
            </span>
            <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              To Date
            </span>
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>

        {filteredTrades.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/65 p-6 text-sm text-muted-foreground">
            No trade audit rows match the current filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>td]:bg-transparent">
                <TableHead>Execution</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Notional</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Slippage</TableHead>
                <TableHead>Cash After</TableHead>
                <TableHead>Position Id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTrades.map((trade, index) => (
                <TableRow key={`${trade.execution_date}-${trade.symbol}-${index}`}>
                  <TableCell>{formatRunTimestamp(trade.execution_date)}</TableCell>
                  <TableCell>{trade.symbol}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatSnakeCaseLabel(trade.trade_role)}</Badge>
                  </TableCell>
                  <TableCell>{formatMetricNumber(trade.quantity)}</TableCell>
                  <TableCell>{formatMetricCurrency(trade.price)}</TableCell>
                  <TableCell>{formatMetricCurrency(trade.notional)}</TableCell>
                  <TableCell>{formatMetricCurrency(trade.commission)}</TableCell>
                  <TableCell>{formatMetricCurrency(trade.slippage_cost)}</TableCell>
                  <TableCell>{formatMetricCurrency(trade.cash_after)}</TableCell>
                  <TableCell>{trade.position_id || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </BacktestWorkspaceSectionFrame>
    </div>
  );
}

function PositionsPanel({
  positions,
  summary
}: {
  positions: ClosedPositionResponse[];
  summary?: BacktestSummary;
}) {
  const [symbolFilter, setSymbolFilter] = useState('');
  const [exitReason, setExitReason] = useState('all');

  const filteredPositions = useMemo(() => {
    return positions.filter((position) => {
      const matchesSymbol =
        !symbolFilter.trim() ||
        position.symbol.toLowerCase().includes(symbolFilter.trim().toLowerCase());
      const matchesExitReason = exitReason === 'all' || position.exit_reason === exitReason;
      return matchesSymbol && matchesExitReason;
    });
  }, [exitReason, positions, symbolFilter]);

  const exitReasonOptions = useMemo(() => {
    return Array.from(
      new Set(positions.map((position) => position.exit_reason).filter(Boolean) as string[])
    );
  }, [positions]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BacktestMetricCard
          label="Closed Positions"
          value={formatMetricInteger(summary?.closed_positions)}
          detail="Round-trip outcomes, separate from the execution log."
          emphasis="accent"
        />
        <BacktestMetricCard
          label="Winning Positions"
          value={formatMetricInteger(summary?.winning_positions)}
          detail="Closed positions with positive realized P&L."
        />
        <BacktestMetricCard
          label="Losing Positions"
          value={formatMetricInteger(summary?.losing_positions)}
          detail="Closed positions with negative realized P&L."
        />
        <BacktestMetricCard
          label="Payoff Ratio"
          value={formatMetricNumber(summary?.payoff_ratio)}
          detail="Average win magnitude divided by average loss magnitude."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BacktestMetricCard
          label="Avg Win Return"
          value={formatMetricPercent(summary?.avg_win_return)}
          detail="Average realized return for winning positions."
        />
        <BacktestMetricCard
          label="Avg Loss Return"
          value={formatMetricPercent(summary?.avg_loss_return)}
          detail="Average realized return for losing positions."
        />
        <BacktestMetricCard
          label="Profit Factor"
          value={formatMetricNumber(summary?.profit_factor)}
          detail="Gross realized gains divided by gross realized losses."
        />
        <BacktestMetricCard
          label="Expectancy Return"
          value={formatMetricPercent(summary?.expectancy_return)}
          detail="Average realized return expectancy per closed position."
        />
      </div>

      <BacktestWorkspaceSectionFrame
        title="Closed Position Outcomes"
        description="This surface is lifecycle-only. Use it to inspect round-trip P&L, hold length, resizing, and exit discipline."
      >
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Symbol
            </span>
            <Input
              value={symbolFilter}
              onChange={(event) => setSymbolFilter(event.target.value)}
              placeholder="Filter symbol"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Exit Reason
            </span>
            <select
              value={exitReason}
              onChange={(event) => setExitReason(event.target.value)}
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="all">All exits</option>
              {exitReasonOptions.map((reason) => (
                <option key={reason} value={reason}>
                  {formatSnakeCaseLabel(reason)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredPositions.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/65 p-6 text-sm text-muted-foreground">
            No closed positions match the current filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:[&>td]:bg-transparent">
                <TableHead>Position Id</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>Hold</TableHead>
                <TableHead>Average Cost</TableHead>
                <TableHead>Exit Price</TableHead>
                <TableHead>Realized P&amp;L</TableHead>
                <TableHead>Realized Return</TableHead>
                <TableHead>Max Size</TableHead>
                <TableHead>Resizes</TableHead>
                <TableHead>Exit Reason</TableHead>
                <TableHead>Exit Rule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPositions.map((position) => (
                <TableRow key={position.position_id}>
                  <TableCell>{position.position_id}</TableCell>
                  <TableCell>{position.symbol}</TableCell>
                  <TableCell>{formatRunTimestamp(position.opened_at)}</TableCell>
                  <TableCell>{formatRunTimestamp(position.closed_at)}</TableCell>
                  <TableCell>{formatMetricInteger(position.holding_period_bars)} bars</TableCell>
                  <TableCell>{formatMetricCurrency(position.average_cost)}</TableCell>
                  <TableCell>{formatMetricCurrency(position.exit_price)}</TableCell>
                  <TableCell>{formatMetricCurrency(position.realized_pnl)}</TableCell>
                  <TableCell>{formatMetricPercent(position.realized_return)}</TableCell>
                  <TableCell>{formatMetricNumber(position.max_quantity)}</TableCell>
                  <TableCell>{formatMetricInteger(position.resize_count)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatSnakeCaseLabel(position.exit_reason)}</Badge>
                  </TableCell>
                  <TableCell>{position.exit_rule_id || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </BacktestWorkspaceSectionFrame>
    </div>
  );
}

export function BacktestWorkspaceTabContent({
  activeTab,
  run,
  summary,
  timeseries,
  rolling,
  windowDays,
  onWindowDaysChange,
  trades,
  positions
}: {
  activeTab: BacktestWorkspaceTab;
  run: RunStatusResponse;
  summary?: BacktestSummary;
  timeseries: TimeseriesPointResponse[];
  rolling: RollingMetricPointResponse[];
  windowDays: number;
  onWindowDaysChange: (value: number) => void;
  trades: TradeResponse[];
  positions: ClosedPositionResponse[];
}) {
  if (activeTab === 'overview') {
    return <OverviewPanel run={run} summary={summary} timeseries={timeseries} />;
  }

  if (activeTab === 'risk') {
    return (
      <RiskPanel
        summary={summary}
        timeseries={timeseries}
        rolling={rolling}
        windowDays={windowDays}
        onWindowDaysChange={onWindowDaysChange}
      />
    );
  }

  if (activeTab === 'trades') {
    return <TradesPanel trades={trades} summary={summary} />;
  }

  return <PositionsPanel positions={positions} summary={summary} />;
}
