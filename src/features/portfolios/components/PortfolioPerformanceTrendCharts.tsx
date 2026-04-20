import { Area } from 'recharts/es6/cartesian/Area';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { LineChart } from 'recharts/es6/chart/LineChart';

import { StatePanel } from '@/app/components/common/StatePanel';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/app/components/ui/chart';
import type { PortfolioBenchmarkComparison } from '@/features/portfolios/lib/portfolioBenchmark';

const TREND_CHART_CONFIG = {
  portfolioIndexed: { label: 'Portfolio', color: '#1e6b6b' },
  benchmarkIndexed: { label: 'Benchmark', color: '#9a6b2f' },
  activeReturnPct: { label: 'Active return', color: '#6a3f2a' }
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

interface PortfolioPerformanceTrendChartsProps {
  chartPoints: PortfolioBenchmarkComparison['points'];
}

export function PortfolioPerformanceTrendCharts({
  chartPoints
}: PortfolioPerformanceTrendChartsProps) {
  return (
    <>
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
          <ChartContainer config={TREND_CHART_CONFIG} className="h-[20rem] w-full">
            <LineChart data={chartPoints}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickFormatter={(value) => `${value}`} width={52} />
              <ChartTooltip
                content={({ content: _content, ...props }) => <ChartTooltipContent {...props} />}
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
          <ChartContainer config={TREND_CHART_CONFIG} className="h-[20rem] w-full">
            <AreaChart data={chartPoints}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickFormatter={(value) => `${value}%`} width={60} />
              <ChartTooltip
                content={({ content: _content, ...props }) => <ChartTooltipContent {...props} />}
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
    </>
  );
}
