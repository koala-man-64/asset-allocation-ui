import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Loader2,
  Search,
  Table as TableIcon,
  TrendingUp
} from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { buildStockDetailPath } from '@/features/stocks/stockRoutes';
import { DataService } from '@/services/DataService';
import type { FinanceData, MarketData } from '@/types/data';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

const CandlestickChart = lazy(() =>
  import('@/app/components/CandlestickChart').then((module) => ({
    default: module.CandlestickChart
  }))
);

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return `$${value.toFixed(2)}`;
}

function formatSignedPriceChange(value: number): string {
  const absoluteValue = Math.abs(value).toFixed(2);
  return `${value >= 0 ? '+' : '-'}$${absoluteValue}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return value.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '--';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

export function StockDetailPage() {
  const { ticker: paramTicker } = useParams();
  const navigate = useNavigate();

  const [ticker, setTicker] = useState(paramTicker || '');
  const [stats, setStats] = useState<MarketData[]>([]);
  const [finance, setFinance] = useState<FinanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const loadData = useCallback(async (symbol: string) => {
    if (!symbol) {
      setStats([]);
      setFinance([]);
      setError(null);
      setWarning(null);
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);
    setStats([]);
    setFinance([]);

    try {
      const [marketResult, financeResult] = await Promise.allSettled([
        DataService.getMarketData(symbol, 'silver'),
        DataService.getFinanceData(symbol, 'summary', 'silver')
      ]);

      if (marketResult.status === 'fulfilled') {
        setStats(marketResult.value);
      } else {
        console.warn('Market data failed', marketResult.reason);
      }

      if (financeResult.status === 'fulfilled') {
        setFinance(financeResult.value);
      } else {
        console.warn('Finance data failed', financeResult.reason);
      }

      if (marketResult.status === 'rejected' && financeResult.status === 'rejected') {
        setError('Could not retrieve data for this symbol.');
      } else if (marketResult.status === 'rejected') {
        setWarning('Price history is unavailable. Fundamental records remain visible below.');
      } else if (financeResult.status === 'rejected') {
        setWarning('Fundamental data is unavailable. Quote and chart data are still live.');
      }
    } catch (nextError) {
      setError(formatSystemStatusText(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!paramTicker) {
      setTicker('');
      setStats([]);
      setFinance([]);
      setError(null);
      setWarning(null);
      return;
    }

    setTicker(paramTicker);
    void loadData(paramTicker);
  }, [loadData, paramTicker]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticker.trim()) {
      return;
    }

    navigate(buildStockDetailPath(ticker));
  };

  const latestPrice = stats.length > 0 ? stats[stats.length - 1] : null;
  const previousPrice = stats.length > 1 ? stats[stats.length - 2] : null;
  const priceChange = latestPrice && previousPrice ? latestPrice.close - previousPrice.close : 0;
  const percentChange =
    latestPrice && previousPrice && previousPrice.close
      ? (priceChange / previousPrice.close) * 100
      : 0;
  const quoteToneClass =
    priceChange >= 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';
  const financeRows = useMemo(
    () =>
      finance.flatMap((row, rowIndex) =>
        Object.entries(row)
          .filter(([key]) => key !== 'symbol' && key !== 'date' && key !== 'sub_domain')
          .map(([key, value]) => ({
            id: `${rowIndex}-${key}`,
            key,
            value: String(value)
          }))
      ),
    [finance]
  );

  return (
    <div className="page-shell">
      <PageHero
        kicker="Market Intelligence"
        title={
          <span className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-mcm-teal" />
            {paramTicker ? `${paramTicker.toUpperCase()} Detail` : 'Stock Detail'}
          </span>
        }
        subtitle="Keep symbol lookup, quote readout, chart context, and fundamentals on the same operations desk instead of a separate terminal-style surface."
        actions={
          <form
            onSubmit={handleSearch}
            className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
          >
            <div className="relative min-w-0 flex-1 sm:min-w-[18rem]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ENTER SYMBOL (e.g. SPY)"
                value={ticker}
                onChange={(event) => setTicker(event.target.value)}
                className="h-10 pl-9 font-mono uppercase"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-10 min-w-[7rem]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'LOAD'}
            </Button>
          </form>
        }
        metrics={[
          {
            label: 'Last Close',
            value: latestPrice
              ? formatPrice(latestPrice.close)
              : paramTicker
                ? 'Awaiting tape'
                : 'No symbol',
            detail: latestPrice
              ? `Date ${formatDate(latestPrice.date)}`
              : 'Load a symbol to populate quote data.'
          },
          {
            label: 'Day Change',
            value: latestPrice && previousPrice ? formatSignedPercent(percentChange) : '--',
            detail:
              latestPrice && previousPrice
                ? formatSignedPriceChange(priceChange)
                : 'Requires at least two market observations.'
          },
          {
            label: 'Fundamentals',
            value: String(financeRows.length),
            detail: financeRows.length
              ? 'Visible summary fields returned by the finance endpoint.'
              : 'No finance fields are currently available.'
          }
        ]}
      />

      {error ? (
        <StatePanel
          tone="error"
          title="Stock Detail Unavailable"
          message={
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
          }
        />
      ) : null}

      {warning ? (
        <div className="rounded-2xl border border-mcm-mustard/35 bg-mcm-mustard/10 px-4 py-3 text-sm text-mcm-walnut">
          {warning}
        </div>
      ) : null}

      {loading ? <PageLoader text="Loading Live Market Data..." className="h-[60vh]" /> : null}

      {!loading && stats.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <section className="mcm-panel overflow-hidden">
            <div className="border-b border-border/40 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="page-kicker">Price Action</div>
                  <h2 className="text-lg">Quote Dossier</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Daily silver-layer market history rendered into a lightweight local chart.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="font-mono text-[11px] uppercase tracking-[0.18em]"
                  >
                    {stats.length} data points
                  </Badge>
                  <Badge
                    variant="outline"
                    className="font-mono text-[11px] uppercase tracking-[0.18em]"
                  >
                    Silver market data
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="min-w-0">
                <Suspense
                  fallback={
                    <PageLoader text="Loading chart..." variant="panel" className="h-[28rem]" />
                  }
                >
                  <CandlestickChart data={stats} height={420} />
                </Suspense>
              </div>

              <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-border/35 bg-background/70 p-4">
                  <div className="page-kicker">Latest Quote</div>
                  <div className="mt-2 font-display text-3xl">
                    {formatPrice(latestPrice?.close)}
                  </div>
                  <div className={`mt-2 font-mono text-sm ${quoteToneClass}`}>
                    {latestPrice && previousPrice
                      ? `${formatSignedPriceChange(priceChange)} (${formatSignedPercent(percentChange)})`
                      : '--'}
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    Session date {formatDate(latestPrice?.date)}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-border/35 bg-background/70 p-4">
                  <div className="page-kicker">Range</div>
                  <div className="mt-3 grid gap-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Open</span>
                      <span className="font-mono">{formatPrice(latestPrice?.open)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">High</span>
                      <span className="font-mono">{formatPrice(latestPrice?.high)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Low</span>
                      <span className="font-mono">{formatPrice(latestPrice?.low)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Volume</span>
                      <span className="font-mono">{formatVolume(latestPrice?.volume)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="mcm-panel overflow-hidden">
              <div className="border-b border-border/40 px-5 py-4">
                <div className="flex items-center gap-2">
                  <TableIcon className="h-4 w-4 text-mcm-olive" />
                  <div>
                    <div className="page-kicker">Quote Detail</div>
                    <h2 className="text-lg">Quote Detail</h2>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                        Open
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPrice(latestPrice?.open)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                        High
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPrice(latestPrice?.high)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                        Low
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPrice(latestPrice?.low)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                        Volume
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatVolume(latestPrice?.volume)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                        Date
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatDate(latestPrice?.date)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="mcm-panel overflow-hidden">
              <div className="border-b border-border/40 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-mcm-teal" />
                  <div>
                    <div className="page-kicker">Fundamental Data</div>
                    <h2 className="text-lg">Fundamental Data</h2>
                  </div>
                </div>
              </div>
              <div className="max-h-[24rem] overflow-auto p-4">
                {financeRows.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {financeRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {row.key}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center font-mono text-xs text-muted-foreground">
                    NO FUNDAMENTAL DATA AVAILABLE
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {!loading && !error && stats.length === 0 && financeRows.length > 0 ? (
        <section className="mcm-panel p-5">
          <StatePanel
            tone="warning"
            title="Price History Unavailable"
            message="Fundamental records loaded successfully, but market candles are not currently available for this symbol."
          />
        </section>
      ) : null}

      {!loading && stats.length === 0 && financeRows.length === 0 && !error ? (
        <section className="mcm-panel flex h-64 flex-col items-center justify-center border-2 border-dashed border-border/50 bg-muted/20">
          <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground/60" />
          <p className="font-medium text-muted-foreground">
            Enter a symbol to view live market data
          </p>
        </section>
      ) : null}
    </div>
  );
}
