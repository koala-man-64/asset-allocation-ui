import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpDown, Database, RefreshCcw, Search } from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { cn } from '@/app/components/ui/utils';
import { buildStockDetailPath } from '@/features/stocks/stockRoutes';
import type { StockScreenerResponse, StockScreenerRow } from '@/services/backtestApi';
import { DataService } from '@/services/DataService';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 250;

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatMillions(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

function heatClassForPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'text-muted-foreground';
  }
  if (value > 0) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  if (value < 0) {
    return 'text-rose-600 dark:text-rose-400';
  }
  return 'text-muted-foreground';
}

export function StockExplorerPage() {
  const navigate = useNavigate();

  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [asOf, setAsOf] = useState('');
  const [sort, setSort] = useState('volume');
  const [direction, setDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(rawQuery.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [rawQuery]);

  const queryKey = useMemo(
    () => ['stockScreener', query || '-', sort, direction, asOf || '-'] as const,
    [asOf, direction, query, sort]
  );

  const screenerQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      DataService.getStockScreener(
        {
          q: query || undefined,
          limit: PAGE_SIZE,
          offset: typeof pageParam === 'number' ? pageParam : 0,
          asOf: asOf || undefined,
          sort,
          direction
        },
        signal
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const page = lastPage as StockScreenerResponse;
      const nextOffset = page.offset + (page.rows?.length ?? 0);
      if (nextOffset >= page.total) {
        return undefined;
      }
      return nextOffset;
    },
    staleTime: 15_000,
    retry: false
  });

  const rows = useMemo(() => {
    const pages = screenerQuery.data?.pages ?? [];
    return pages.flatMap((page) => page.rows ?? []) as StockScreenerRow[];
  }, [screenerQuery.data]);

  const firstPage = screenerQuery.data?.pages?.[0] as StockScreenerResponse | undefined;
  const total = firstPage?.total ?? 0;
  const resolvedAsOf = firstPage?.asOf ?? null;
  const showing = rows.length;
  const sortChip = `${sort} ${direction === 'asc' ? 'up' : 'down'}`;

  const onToggleSort = (nextSort: string) => {
    if (sort === nextSort) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSort(nextSort);
    setDirection('desc');
  };

  return (
    <div className="page-shell">
      <PageHero
        kicker="Market Intelligence"
        title={
          <span className="flex items-center gap-2">
            <Database className="h-5 w-5 text-mcm-teal" />
            Stock Explorer
          </span>
        }
        subtitle="Review the daily cross-section through one shared operations desk instead of a separate terminal-themed surface. Search, sort, and open symbol detail from the same readout."
        actions={
          <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[34rem]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={rawQuery}
                  onChange={(event) => setRawQuery(event.target.value)}
                  placeholder="Search symbol or name..."
                  className="h-10 pl-9 font-mono text-xs"
                />
              </div>
              <Input
                type="date"
                value={asOf}
                onChange={(event) => setAsOf(event.target.value)}
                className="h-10 w-full font-mono text-xs sm:w-[168px]"
                aria-label="As-of date"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2"
                onClick={() => void screenerQuery.refetch()}
              >
                <RefreshCcw className={cn('h-4 w-4', screenerQuery.isFetching && 'animate-spin')} />
                Refresh
              </Button>
            </div>
          </div>
        }
        metrics={[
          {
            label: 'Result Set',
            value: `${showing.toLocaleString()} / ${total.toLocaleString()}`,
            detail: 'Rows currently materialized into the explorer table.'
          },
          {
            label: 'Sort',
            value: sortChip,
            detail: 'Server-side screener sort applied to the current query.'
          },
          {
            label: 'As Of',
            value: resolvedAsOf || 'Latest snapshot',
            detail: resolvedAsOf
              ? 'Snapshot date returned by the screener response.'
              : 'No explicit date filter is currently applied.'
          }
        ]}
      />

      <section className="mcm-panel overflow-hidden">
        <div className="border-b border-border/40 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="page-kicker">Cross-Section Snapshot</div>
              <h2 className="text-lg">Daily Stock Screener</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Daily rows sourced from the shared stock screener response. Open any symbol to move
                into the detail dossier.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="font-mono text-[11px] uppercase tracking-[0.18em]"
              >
                {screenerQuery.isFetching
                  ? 'Loading'
                  : screenerQuery.isError
                    ? 'Unavailable'
                    : 'Ready'}
              </Badge>
              <Badge
                variant="secondary"
                className="font-mono text-[11px] uppercase tracking-[0.18em]"
              >
                Sort: {sortChip}
              </Badge>
              {resolvedAsOf ? (
                <Badge
                  variant="outline"
                  className="font-mono text-[11px] uppercase tracking-[0.18em]"
                >
                  As-of {resolvedAsOf}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="overflow-hidden">
          <ScrollArea className="max-h-[calc(100vh-21rem)] xl:h-[calc(100vh-21rem)]">
            {screenerQuery.isError ? (
              <div className="p-5">
                <StatePanel
                  tone="error"
                  title="Screener Unavailable"
                  message={
                    <>
                      <span className="font-mono text-xs">
                        {formatSystemStatusText(screenerQuery.error) || 'Failed to load screener.'}
                      </span>
                      <span className="mt-2 block text-sm text-muted-foreground">
                        Requires Postgres symbol coverage plus Silver and Gold stock surfaces.
                      </span>
                    </>
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/25 hover:bg-muted/25">
                    <TableHead className="w-[120px] font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('symbol')}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        Symbol <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[240px] font-mono text-[10px] uppercase tracking-[0.18em]">
                      Name
                    </TableHead>
                    <TableHead className="min-w-[160px] font-mono text-[10px] uppercase tracking-[0.18em]">
                      Sector
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('close')}
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                      >
                        Close <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('return_1d')}
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                      >
                        1D% <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('return_5d')}
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                      >
                        5D% <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('vol_20d')}
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                      >
                        Vol20 <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('drawdown_1y')}
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                      >
                        DD1Y <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('atr_14d')}
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                      >
                        ATR14 <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('volume')}
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                      >
                        Vol <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('compression_score')}
                        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
                      >
                        Compress <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.map((row) => {
                    const symbol = String(row.symbol || '')
                      .trim()
                      .toUpperCase();
                    const hasSilver = Boolean(row.hasSilver);
                    const hasGold = Boolean(row.hasGold);

                    return (
                      <TableRow
                        key={`${symbol}:${row.name || ''}`}
                        className="text-xs hover:bg-muted/35"
                      >
                        <TableCell className="font-mono font-black">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(buildStockDetailPath(symbol))}
                              className="text-primary hover:underline decoration-dotted underline-offset-4"
                            >
                              {symbol || '--'}
                            </button>
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  'h-2.5 w-2.5 rounded-full border',
                                  hasSilver ? 'border-sky-600 bg-sky-500' : 'border-border bg-muted'
                                )}
                                title={hasSilver ? 'Silver data present' : 'Missing Silver data'}
                              />
                              <span
                                className={cn(
                                  'h-2.5 w-2.5 rounded-full border',
                                  hasGold
                                    ? 'border-amber-600 bg-amber-500'
                                    : 'border-border bg-muted'
                                )}
                                title={hasGold ? 'Gold data present' : 'Missing Gold data'}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[240px]">
                          <div className="truncate font-medium text-foreground">
                            {row.name || '--'}
                          </div>
                          <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {row.industry || ''}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[160px] text-muted-foreground">
                          {row.sector || '--'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatPrice(row.close)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono font-semibold',
                            heatClassForPercent(row.return1d)
                          )}
                        >
                          {formatPercent(row.return1d)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono font-semibold',
                            heatClassForPercent(row.return5d)
                          )}
                        >
                          {formatPercent(row.return5d)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatPercent(row.vol20d, 1)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono font-semibold',
                            heatClassForPercent(row.drawdown1y)
                          )}
                        >
                          {formatPercent(row.drawdown1y, 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatNumber(row.atr14d, 2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatMillions(row.volume)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {row.compressionScore === null || row.compressionScore === undefined
                            ? '--'
                            : `${Math.round((1 - row.compressionScore) * 100)}%`}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigate(buildStockDetailPath(symbol))}
                            aria-label={`Open ${symbol}`}
                          >
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {screenerQuery.isFetching && rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="p-0">
                        <PageLoader text="Loading snapshot..." className="h-[58vh] border-0" />
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {!screenerQuery.isFetching && rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="py-16 text-center">
                        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          No rows found
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-5 py-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {resolvedAsOf ? `As-of ${resolvedAsOf}` : 'As-of latest'} | {showing.toLocaleString()}{' '}
            shown | {total.toLocaleString()} total
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!screenerQuery.hasNextPage || screenerQuery.isFetchingNextPage}
            onClick={() => void screenerQuery.fetchNextPage()}
          >
            {screenerQuery.isFetchingNextPage
              ? 'Loading...'
              : screenerQuery.hasNextPage
                ? 'Load More'
                : 'End'}
          </Button>
        </div>
      </section>
    </div>
  );
}
