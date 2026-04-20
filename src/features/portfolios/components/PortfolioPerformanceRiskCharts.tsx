import { Area } from 'recharts/es6/cartesian/Area';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { ComposedChart } from 'recharts/es6/chart/ComposedChart';

import { StatePanel } from '@/app/components/common/StatePanel';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/app/components/ui/chart';
import type { PortfolioBenchmarkComparison } from '@/features/portfolios/lib/portfolioBenchmark';

const RISK_CHART_CONFIG = {
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

interface PortfolioPerformanceRiskChartsProps {
  chartPoints: PortfolioBenchmarkComparison['points'];
}

export function PortfolioPerformanceRiskCharts({
  chartPoints
}: PortfolioPerformanceRiskChartsProps) {
  return (
    <>
      <ChartCard
        title="Drawdown"
        description="Drawdown stays visible next to performance so the desk sees path risk instead of only endpoint return."
      >
        {chartPoints.length === 0 ? (
          <StatePanel
            tone="empty"
            title="No drawdown series"
            message="Drawdown history is unavailable."
          />
        ) : (
          <ChartContainer config={RISK_CHART_CONFIG} className="h-[18rem] w-full">
            <AreaChart data={chartPoints}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickFormatter={(value) => `${value}%`} width={60} />
              <ChartTooltip
                content={({ content: _content, ...props }) => <ChartTooltipContent {...props} />}
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
          <StatePanel
            tone="empty"
            title="No turnover series"
            message="Turnover history is unavailable."
          />
        ) : (
          <ChartContainer config={RISK_CHART_CONFIG} className="h-[18rem] w-full">
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
                content={({ content: _content, ...props }) => <ChartTooltipContent {...props} />}
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
    </>
  );
}
