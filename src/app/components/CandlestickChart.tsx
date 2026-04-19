interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  data: PricePoint[];
  height?: number;
}

interface ChartPoint extends PricePoint {
  x: number;
  wickTop: number;
  wickBottom: number;
  openY: number;
  closeY: number;
  volumeTop: number;
  rising: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatCompactVolume(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(Math.round(value));
}

function formatDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function createTickIndices(length: number): number[] {
  if (length <= 1) {
    return [0];
  }

  const desiredTicks = Math.min(5, length);
  const next = new Set<number>([0, length - 1]);

  for (let index = 1; index < desiredTicks - 1; index += 1) {
    next.add(Math.round((index * (length - 1)) / (desiredTicks - 1)));
  }

  return Array.from(next).sort((left, right) => left - right);
}

export function CandlestickChart({ data, height = 320 }: CandlestickChartProps) {
  if (!data.length) {
    return null;
  }

  const chartWidth = 960;
  const chartHeight = Math.max(height, 260);
  const marginTop = 20;
  const marginRight = 60;
  const marginBottom = 52;
  const marginLeft = 18;
  const volumeBandHeight = 78;
  const priceBottom = chartHeight - volumeBandHeight - marginBottom;
  const volumeTop = priceBottom + 16;
  const volumeBottom = chartHeight - marginBottom;

  const minPrice = Math.min(...data.map((point) => point.low));
  const maxPrice = Math.max(...data.map((point) => point.high));
  const priceRange = Math.max(maxPrice - minPrice, 1);
  const paddedMinPrice = minPrice - priceRange * 0.08;
  const paddedMaxPrice = maxPrice + priceRange * 0.08;
  const paddedRange = Math.max(paddedMaxPrice - paddedMinPrice, 1);
  const maxVolume = Math.max(...data.map((point) => point.volume), 1);
  const plotWidth = chartWidth - marginLeft - marginRight;
  const priceHeight = priceBottom - marginTop;
  const xStep = data.length === 1 ? 0 : plotWidth / (data.length - 1);
  const candleWidth = clamp(plotWidth / Math.max(data.length * 2.8, 1), 5, 16);

  const priceToY = (value: number): number =>
    marginTop + ((paddedMaxPrice - value) / paddedRange) * priceHeight;
  const volumeToY = (value: number): number =>
    volumeBottom - (value / maxVolume) * (volumeBottom - volumeTop);

  const chartPoints: ChartPoint[] = data.map((point, index) => ({
    ...point,
    x: marginLeft + xStep * index,
    wickTop: priceToY(point.high),
    wickBottom: priceToY(point.low),
    openY: priceToY(point.open),
    closeY: priceToY(point.close),
    volumeTop: volumeToY(point.volume),
    rising: point.close >= point.open
  }));

  const priceTicks = [paddedMaxPrice, paddedMinPrice + paddedRange / 2, paddedMinPrice];
  const xTickIndices = createTickIndices(data.length);
  const firstClose = data[0]?.close ?? 0;
  const lastPoint = data[data.length - 1];
  const priceDelta = lastPoint.close - firstClose;
  const percentDelta = firstClose ? (priceDelta / firstClose) * 100 : 0;
  const chartTitleId = `candlestick-chart-title-${data.length}-${lastPoint.date}`;
  const chartDescriptionId = `candlestick-chart-description-${data.length}-${lastPoint.date}`;

  return (
    <figure className="flex h-full min-w-0 flex-col rounded-[1.5rem] border border-border/35 bg-background/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/35 pb-3">
        <div>
          <div className="page-kicker">Market Tape</div>
          <div className="text-sm text-muted-foreground">
            Daily price candles with relative volume bars.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-border/35 bg-mcm-cream/65 px-3 py-1 font-mono text-foreground">
            Last {formatCurrency(lastPoint.close)}
          </span>
          <span
            className={`rounded-full border px-3 py-1 font-mono ${
              priceDelta >= 0
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-700'
            }`}
          >
            {priceDelta >= 0 ? '+' : ''}
            {formatCurrency(priceDelta)} ({priceDelta >= 0 ? '+' : ''}
            {percentDelta.toFixed(2)}%)
          </span>
          <span className="rounded-full border border-border/35 bg-mcm-cream/65 px-3 py-1 font-mono text-foreground">
            Vol {formatCompactVolume(lastPoint.volume)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex-1">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-full w-full"
          role="img"
          aria-labelledby={chartTitleId}
          aria-describedby={chartDescriptionId}
        >
          <title id={chartTitleId}>Daily price and volume chart</title>
          <desc id={chartDescriptionId}>
            Candlestick chart showing open, high, low, close, and relative volume for the selected
            symbol.
          </desc>

          {priceTicks.map((tick) => {
            const y = priceToY(tick);
            return (
              <g key={tick}>
                <line
                  x1={marginLeft}
                  x2={chartWidth - marginRight}
                  y1={y}
                  y2={y}
                  stroke="color-mix(in srgb, var(--mcm-walnut) 18%, transparent)"
                  strokeDasharray="6 6"
                />
                <text
                  x={chartWidth - marginRight + 8}
                  y={y + 4}
                  fill="var(--muted-foreground)"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  fontSize="11"
                >
                  {formatCurrency(tick)}
                </text>
              </g>
            );
          })}

          <line
            x1={marginLeft}
            x2={chartWidth - marginRight}
            y1={priceBottom}
            y2={priceBottom}
            stroke="color-mix(in srgb, var(--mcm-walnut) 28%, transparent)"
          />

          <line
            x1={marginLeft}
            x2={chartWidth - marginRight}
            y1={volumeTop}
            y2={volumeTop}
            stroke="color-mix(in srgb, var(--mcm-walnut) 18%, transparent)"
            strokeDasharray="4 6"
          />

          {chartPoints.map((point) => {
            const bodyTop = Math.min(point.openY, point.closeY);
            const bodyHeight = Math.max(Math.abs(point.openY - point.closeY), 2);
            const candleColor = point.rising ? 'var(--mcm-teal)' : '#c25d2d';
            const candleFill = point.rising
              ? 'color-mix(in srgb, var(--mcm-teal) 26%, transparent)'
              : 'color-mix(in srgb, #c25d2d 26%, transparent)';

            return (
              <g key={`${point.date}-${point.x}`}>
                <rect
                  x={point.x - candleWidth / 2}
                  y={point.volumeTop}
                  width={candleWidth}
                  height={Math.max(volumeBottom - point.volumeTop, 2)}
                  rx={Math.min(candleWidth / 3, 4)}
                  fill="color-mix(in srgb, var(--mcm-mustard) 52%, transparent)"
                />
                <line
                  x1={point.x}
                  x2={point.x}
                  y1={point.wickTop}
                  y2={point.wickBottom}
                  stroke={candleColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <rect
                  x={point.x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  rx={Math.min(candleWidth / 3, 4)}
                  fill={candleFill}
                  stroke={candleColor}
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {xTickIndices.map((index) => {
            const point = chartPoints[index];
            if (!point) {
              return null;
            }

            return (
              <text
                key={`${point.date}-${index}`}
                x={point.x}
                y={chartHeight - 20}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                fontSize="11"
              >
                {formatDateLabel(point.date)}
              </text>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
