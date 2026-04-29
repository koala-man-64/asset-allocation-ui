import { Area } from 'recharts/es6/cartesian/Area';
import type { ReactNode } from 'react';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { LineChart } from 'recharts/es6/chart/LineChart';

import { StatePanel } from '@/app/components/common/StatePanel';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/app/components/ui/chart';
import type { RollingMetricsResponse, TimeseriesResponse } from '@/services/backtestApi';

const PERFORMANCE_CHART_CONFIG = {
  cumulative_return: { label: 'Cumulative return', color: '#008080' },
  drawdown: { label: 'Drawdown', color: '#b42318' },
  portfolio_value: { label: 'Portfolio value', color: '#e1ad01' },
  rolling_sharpe: { label: 'Rolling Sharpe', color: '#6f6600' }
};

function ChartFrame({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

interface BacktestChartsProps {
  timeseries?: TimeseriesResponse;
  rolling?: RollingMetricsResponse;
  loading?: boolean;
  error?: string;
}

export function BacktestCharts({ timeseries, rolling, loading, error }: BacktestChartsProps) {
  if (error) {
    return <StatePanel tone="error" title="Charts Unavailable" message={error} />;
  }

  if (loading) {
    return (
      <StatePanel tone="empty" title="Loading Charts" message="Fetching published performance series." />
    );
  }

  const points = timeseries?.points ?? [];
  const rollingPoints = rolling?.points ?? [];

  if (!points.length && !rollingPoints.length) {
    return (
      <StatePanel
        tone="empty"
        title="No Chart Evidence"
        message="Published timeseries and rolling metrics are absent for this run."
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartFrame title="Equity and Return">
        {points.length ? (
          <ChartContainer config={PERFORMANCE_CHART_CONFIG} className="h-[22rem] w-full">
            <LineChart data={points}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis yAxisId="left" width={64} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} />
              <ChartTooltip
                content={({ content: _content, ...props }) => <ChartTooltipContent {...props} />}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="portfolio_value"
                stroke="var(--color-portfolio_value)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative_return"
                stroke="var(--color-cumulative_return)"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <StatePanel tone="empty" title="No Equity Series" message="No points were returned." />
        )}
      </ChartFrame>

      <ChartFrame title="Drawdown">
        {points.length ? (
          <ChartContainer config={PERFORMANCE_CHART_CONFIG} className="h-[22rem] w-full">
            <AreaChart data={points}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickFormatter={(value) => `${value}%`} width={64} />
              <ChartTooltip
                content={({ content: _content, ...props }) => <ChartTooltipContent {...props} />}
              />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke="var(--color-drawdown)"
                fill="var(--color-drawdown)"
                fillOpacity={0.18}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <StatePanel tone="empty" title="No Drawdown Series" message="No points were returned." />
        )}
      </ChartFrame>

      <ChartFrame title="Rolling Risk">
        {rollingPoints.length ? (
          <ChartContainer config={PERFORMANCE_CHART_CONFIG} className="h-[20rem] w-full">
            <LineChart data={rollingPoints}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis width={64} />
              <ChartTooltip
                content={({ content: _content, ...props }) => <ChartTooltipContent {...props} />}
              />
              <Line
                type="monotone"
                dataKey="rolling_sharpe"
                stroke="var(--color-rolling_sharpe)"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <StatePanel tone="empty" title="No Rolling Metrics" message="No rolling series returned." />
        )}
      </ChartFrame>
    </div>
  );
}
