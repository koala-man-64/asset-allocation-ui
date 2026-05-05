import { type ComponentType, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Database,
  FilterX,
  LineChart,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  TriangleAlert
} from 'lucide-react';

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
import type {
  StockScreenerRequestParams,
  StockScreenerResponse,
  StockScreenerRow,
  StockScreenerSortDirection,
  StockScreenerSortKey
} from '@/services/apiService';
import { DataService } from '@/services/DataService';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

type ScreenerPresetId =
  | 'momentum'
  | 'trend'
  | 'compression'
  | 'risk'
  | 'liquidity'
  | 'data-gaps';
type ActivePresetId = ScreenerPresetId | 'custom';
type CoverageMode = 'all' | 'complete' | 'missing-silver' | 'missing-gold';

interface ScreenerPreset {
  id: ScreenerPresetId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  sort: StockScreenerSortKey;
  direction: StockScreenerSortDirection;
  filters: Partial<StockScreenerRequestParams>;
}

const PAGE_SIZE = 250;
const DEFAULT_PRESET_ID: ScreenerPresetId = 'momentum';
const TABLE_COL_SPAN = 16;

const PRESETS: ScreenerPreset[] = [
  {
    id: 'momentum',
    label: 'Momentum',
    icon: TrendingUp,
    sort: 'return_5d',
    direction: 'desc',
    filters: { has_gold: true }
  },
  {
    id: 'trend',
    label: 'Trend',
    icon: LineChart,
    sort: 'trend_50_200',
    direction: 'desc',
    filters: { above_sma_50: true, has_gold: true }
  },
  {
    id: 'compression',
    label: 'Compression',
    icon: BarChart3,
    sort: 'compression_score',
    direction: 'asc',
    filters: { has_gold: true, max_compression_score: 0.5 }
  },
  {
    id: 'risk',
    label: 'Volatility/Risk',
    icon: TrendingDown,
    sort: 'drawdown_1y',
    direction: 'asc',
    filters: { has_gold: true }
  },
  {
    id: 'liquidity',
    label: 'Liquidity',
    icon: Activity,
    sort: 'volume_pct_rank_252d',
    direction: 'desc',
    filters: { has_silver: true, min_volume_pct_rank_252d: 0.6 }
  },
  {
    id: 'data-gaps',
    label: 'Data Gaps',
    icon: TriangleAlert,
    sort: 'symbol',
    direction: 'asc',
    filters: { has_gold: false }
  }
];

const DEFAULT_PRESET = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID) ?? PRESETS[0];

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
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

function formatCoveragePct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return `${Math.round(value * 100)}%`;
}

function asBoolean(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function returnHeatClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'bg-muted/20 text-muted-foreground';
  }
  if (value >= 0.03) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  }
  if (value > 0) {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (value <= -0.03) {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  }
  if (value < 0) {
    return 'bg-rose-500/10 text-rose-700 dark:text-rose-300';
  }
  return 'bg-muted/20 text-muted-foreground';
}

function drawdownHeatClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'bg-muted/20 text-muted-foreground';
  }
  if (value <= -0.25) {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  }
  if (value <= -0.12) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
  return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}

function compressionHeatClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'bg-muted/20 text-muted-foreground';
  }
  if (value <= 0.35) {
    return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
  }
  if (value <= 0.65) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
  return 'bg-muted/25 text-muted-foreground';
}

function liquidityHeatClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'bg-muted/20 text-muted-foreground';
  }
  if (value >= 0.8) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  }
  if (value >= 0.5) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  }
  return 'bg-muted/25 text-muted-foreground';
}

function compactParams(params: StockScreenerRequestParams): StockScreenerRequestParams {
  const compacted: StockScreenerRequestParams = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    (compacted as Record<string, unknown>)[key] = value;
  });
  return compacted;
}

function coverageParams(mode: CoverageMode): Partial<StockScreenerRequestParams> {
  if (mode === 'complete') {
    return { has_silver: true, has_gold: true };
  }
  if (mode === 'missing-silver') {
    return { has_silver: false };
  }
  if (mode === 'missing-gold') {
    return { has_gold: false };
  }
  return {};
}

function metricLabel(sort: StockScreenerSortKey): string {
  return sort.replaceAll('_', ' ');
}

interface MetricTileProps {
  label: string;
  value: string;
  detail: string;
}

function MetricTile({ label, value, detail }: MetricTileProps) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-lg font-black">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

interface FactorLineProps {
  label: string;
  value: string;
  className?: string;
}

function FactorLine({ label, value, className }: FactorLineProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('rounded px-2 py-1 text-right font-mono text-xs font-semibold', className)}>
        {value}
      </span>
    </div>
  );
}

export function StockExplorerPage() {
  const navigate = useNavigate();

  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [asOf, setAsOf] = useState('');
  const [sort, setSort] = useState<StockScreenerSortKey>(DEFAULT_PRESET.sort);
  const [direction, setDirection] = useState<StockScreenerSortDirection>(DEFAULT_PRESET.direction);
  const [activePresetId, setActivePresetId] = useState<ActivePresetId>(DEFAULT_PRESET_ID);
  const [sectorFilter, setSectorFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [coverageMode, setCoverageMode] = useState<CoverageMode>('all');
  const [optionableOnly, setOptionableOnly] = useState(false);
  const [minReturn5d, setMinReturn5d] = useState('');
  const [maxCompression, setMaxCompression] = useState('');
  const [minVolumeRank, setMinVolumeRank] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(rawQuery.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [rawQuery]);

  const activePreset = PRESETS.find((preset) => preset.id === activePresetId);

  const filterParams = useMemo(() => {
    const presetFilters = activePreset?.filters ?? {};
    const manualNumericFilters: Partial<StockScreenerRequestParams> = {};
    const parsedMinReturn5d = parseOptionalNumber(minReturn5d);
    const parsedMaxCompression = parseOptionalNumber(maxCompression);
    const parsedMinVolumeRank = parseOptionalNumber(minVolumeRank);
    if (parsedMinReturn5d !== undefined) {
      manualNumericFilters.min_return_5d = parsedMinReturn5d;
    }
    if (parsedMaxCompression !== undefined) {
      manualNumericFilters.max_compression_score = parsedMaxCompression;
    }
    if (parsedMinVolumeRank !== undefined) {
      manualNumericFilters.min_volume_pct_rank_252d = parsedMinVolumeRank;
    }
    return compactParams({
      ...presetFilters,
      ...coverageParams(coverageMode),
      sectors: sectorFilter.trim() || undefined,
      countries: countryFilter.trim() || undefined,
      is_optionable: optionableOnly ? true : undefined,
      ...manualNumericFilters
    });
  }, [
    activePreset?.filters,
    countryFilter,
    coverageMode,
    maxCompression,
    minReturn5d,
    minVolumeRank,
    optionableOnly,
    sectorFilter
  ]);

  const queryKey = useMemo(
    () => ['stockScreener', query || '-', sort, direction, asOf || '-', filterParams] as const,
    [asOf, direction, filterParams, query, sort]
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
          direction,
          ...filterParams
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

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedSymbol('');
      return;
    }
    if (!rows.some((row) => String(row.symbol).toUpperCase() === selectedSymbol)) {
      setSelectedSymbol(String(rows[0]?.symbol ?? '').toUpperCase());
    }
  }, [rows, selectedSymbol]);

  const firstPage = screenerQuery.data?.pages?.[0] as StockScreenerResponse | undefined;
  const total = firstPage?.total ?? 0;
  const summary = firstPage?.summary ?? null;
  const facets = firstPage?.facets ?? null;
  const resolvedAsOf = firstPage?.asOf ?? null;
  const showing = rows.length;
  const universeCount = summary?.universeCount ?? total;
  const filteredCount = summary?.filteredCount ?? total;
  const coverage = summary?.coverage;
  const goldPct = coverage?.goldPct ?? null;
  const silverPct = coverage?.silverPct ?? null;
  const topSector = facets?.sectors?.[0];
  const sortChip = `${metricLabel(sort)} ${direction === 'asc' ? 'up' : 'down'}`;
  const selectedRow =
    rows.find((row) => String(row.symbol).toUpperCase() === selectedSymbol) ?? rows[0];
  const selectedTicker = String(selectedRow?.symbol ?? '').toUpperCase();
  const activeFilterCount = Object.keys(filterParams).length + (query ? 1 : 0) + (asOf ? 1 : 0);

  const onToggleSort = (nextSort: StockScreenerSortKey) => {
    setActivePresetId('custom');
    if (sort === nextSort) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(nextSort);
    setDirection('desc');
  };

  const applyPreset = (preset: ScreenerPreset) => {
    setActivePresetId(preset.id);
    setSort(preset.sort);
    setDirection(preset.direction);
  };

  const resetFilters = () => {
    setRawQuery('');
    setQuery('');
    setAsOf('');
    setSectorFilter('');
    setCountryFilter('');
    setCoverageMode('all');
    setOptionableOnly(false);
    setMinReturn5d('');
    setMaxCompression('');
    setMinVolumeRank('');
    applyPreset(DEFAULT_PRESET);
  };

  const openDetail = (ticker: string) => {
    if (!ticker) {
      return;
    }
    navigate(buildStockDetailPath(ticker));
  };

  return (
    <div className="page-shell space-y-4">
      <section className="mcm-panel overflow-hidden">
        <div className="grid gap-4 border-b border-border/40 p-4 xl:grid-cols-[minmax(0,1fr)_34rem]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 font-mono text-[11px] uppercase">
                <Database className="h-3.5 w-3.5 text-mcm-teal" />
                Postgres backed
              </Badge>
              <Badge variant="secondary" className="font-mono text-[11px] uppercase">
                Read-only research
              </Badge>
              <Badge variant="outline" className="font-mono text-[11px] uppercase">
                {screenerQuery.isFetching
                  ? 'Loading'
                  : screenerQuery.isError
                    ? 'Unavailable'
                    : 'Ready'}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black tracking-normal">Quant Stock Screener</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Cross-sectional research signals, coverage controls, and drill-through into
                  symbol detail.
                </p>
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {resolvedAsOf ? `As-of ${resolvedAsOf}` : 'As-of latest'} | Sort {sortChip}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
            <MetricTile
              label="Universe"
              value={universeCount.toLocaleString()}
              detail={`${filteredCount.toLocaleString()} filtered`}
            />
            <MetricTile
              label="Loaded"
              value={`${showing.toLocaleString()} / ${total.toLocaleString()}`}
              detail="Rows in table"
            />
            <MetricTile label="Gold" value={formatCoveragePct(goldPct)} detail="Factor coverage" />
            <MetricTile
              label="Silver"
              value={formatCoveragePct(silverPct)}
              detail={topSector ? `${topSector.value}: ${topSector.count}` : 'Market coverage'}
            />
          </div>
        </div>

        <div className="border-b border-border/40 px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-[16rem] flex-1">
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
              className="h-10 w-full font-mono text-xs xl:w-[168px]"
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
            <Button type="button" variant="outline" className="h-10 gap-2" onClick={resetFilters}>
              <FilterX className="h-4 w-4" />
              Reset
            </Button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isActive = activePresetId === preset.id;
              return (
                <Button
                  key={preset.id}
                  type="button"
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 shrink-0 gap-2"
                  onClick={() => applyPreset(preset)}
                >
                  <Icon className="h-4 w-4" />
                  {preset.label}
                </Button>
              );
            })}
            {activePresetId === 'custom' ? (
              <Badge variant="secondary" className="h-9 rounded-md px-3 font-mono text-[11px]">
                Custom sort
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_13rem_11rem_10rem_10rem_10rem]">
          <Input
            value={sectorFilter}
            onChange={(event) => setSectorFilter(event.target.value)}
            placeholder="Sector filter"
            className="h-9 font-mono text-xs"
            aria-label="Sector filter"
          />
          <Input
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            placeholder="Country filter"
            className="h-9 font-mono text-xs"
            aria-label="Country filter"
          />
          <select
            aria-label="Coverage filter"
            value={coverageMode}
            onChange={(event) => setCoverageMode(event.target.value as CoverageMode)}
            className="h-9 rounded-md border border-border bg-background px-3 font-mono text-xs font-semibold text-foreground outline-none focus-visible:border-mcm-teal focus-visible:ring-2 focus-visible:ring-mcm-teal/30"
          >
            <option value="all">All coverage</option>
            <option value="complete">Complete</option>
            <option value="missing-silver">Missing Silver</option>
            <option value="missing-gold">Missing Gold</option>
          </select>
          <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 font-mono text-xs font-semibold">
            <input
              type="checkbox"
              checked={optionableOnly}
              onChange={(event) => setOptionableOnly(event.target.checked)}
              className="h-4 w-4"
            />
            Optionable
          </label>
          <Input
            type="number"
            step="0.01"
            value={minReturn5d}
            onChange={(event) => setMinReturn5d(event.target.value)}
            placeholder="Min 5D"
            className="h-9 font-mono text-xs"
            aria-label="Minimum 5 day return"
          />
          <Input
            type="number"
            step="0.01"
            value={maxCompression}
            onChange={(event) => setMaxCompression(event.target.value)}
            placeholder="Max comp"
            className="h-9 font-mono text-xs"
            aria-label="Maximum compression score"
          />
          <Input
            type="number"
            step="0.01"
            value={minVolumeRank}
            onChange={(event) => setMinVolumeRank(event.target.value)}
            placeholder="Min liq"
            className="h-9 font-mono text-xs"
            aria-label="Minimum volume percentile"
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="mcm-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-mcm-teal" />
              <div>
                <div className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Research Blotter
                </div>
                <div className="text-sm font-semibold">{activeFilterCount} active filters</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[11px] uppercase">
                {metricLabel(sort)}
              </Badge>
              <Badge variant="secondary" className="font-mono text-[11px] uppercase">
                {direction}
              </Badge>
            </div>
          </div>

          <ScrollArea className="max-h-[calc(100vh-22rem)] xl:h-[calc(100vh-22rem)]">
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
                        Requires Postgres symbols and a current screener market snapshot.
                      </span>
                    </>
                  }
                />
              </div>
            ) : (
              <Table className="min-w-[1420px]">
                <TableHeader>
                  <TableRow className="hover:bg-muted/20">
                    <TableHead className="sticky left-0 top-0 z-30 w-[118px] bg-mcm-paper font-mono text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() => onToggleSort('symbol')}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        Symbol <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 min-w-[230px] bg-mcm-paper font-mono text-[10px] uppercase tracking-[0.18em]">
                      Name
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 min-w-[150px] bg-mcm-paper font-mono text-[10px] uppercase tracking-[0.18em]">
                      Sector
                    </TableHead>
                    <SortableHead label="Close" sortKey="close" onToggleSort={onToggleSort} />
                    <SortableHead label="1D%" sortKey="return_1d" onToggleSort={onToggleSort} />
                    <SortableHead label="5D%" sortKey="return_5d" onToggleSort={onToggleSort} />
                    <SortableHead
                      label="Trend"
                      sortKey="trend_50_200"
                      onToggleSort={onToggleSort}
                    />
                    <SortableHead
                      label="SMA50"
                      sortKey="above_sma_50"
                      onToggleSort={onToggleSort}
                    />
                    <SortableHead label="Vol20" sortKey="vol_20d" onToggleSort={onToggleSort} />
                    <SortableHead
                      label="DD1Y"
                      sortKey="drawdown_1y"
                      onToggleSort={onToggleSort}
                    />
                    <SortableHead label="ATR14" sortKey="atr_14d" onToggleSort={onToggleSort} />
                    <SortableHead label="Volume" sortKey="volume" onToggleSort={onToggleSort} />
                    <SortableHead
                      label="Vol Pct"
                      sortKey="volume_pct_rank_252d"
                      onToggleSort={onToggleSort}
                    />
                    <SortableHead
                      label="Compress"
                      sortKey="compression_score"
                      onToggleSort={onToggleSort}
                    />
                    <TableHead className="sticky top-0 z-20 w-[116px] bg-mcm-paper text-center font-mono text-[10px] uppercase tracking-[0.18em]">
                      Coverage
                    </TableHead>
                    <TableHead className="sticky top-0 z-20 w-[58px] bg-mcm-paper" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.map((row) => {
                    const symbol = String(row.symbol || '')
                      .trim()
                      .toUpperCase();
                    const hasSilver = asBoolean(row.hasSilver);
                    const hasGold = asBoolean(row.hasGold);
                    const isSelected = symbol === selectedTicker;

                    return (
                      <TableRow
                        key={`${symbol}:${row.name || ''}`}
                        aria-selected={isSelected}
                        className={cn(
                          'cursor-pointer text-xs hover:bg-muted/35',
                          isSelected && 'bg-mcm-teal/10'
                        )}
                        onClick={() => setSelectedSymbol(symbol)}
                      >
                        <TableCell className="sticky left-0 z-20 bg-mcm-paper font-mono font-black">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetail(symbol);
                            }}
                            className="text-primary hover:underline decoration-dotted underline-offset-4"
                          >
                            {symbol || '--'}
                          </button>
                        </TableCell>
                        <TableCell className="min-w-[230px]">
                          <div className="truncate font-semibold text-foreground">
                            {row.name || '--'}
                          </div>
                          <div className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            {row.industry || '--'}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[150px] text-muted-foreground">
                          {row.sector || '--'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatPrice(row.close)}
                        </TableCell>
                        <HeatCell className={returnHeatClass(row.return1d)}>
                          {formatPercent(row.return1d)}
                        </HeatCell>
                        <HeatCell className={returnHeatClass(row.return5d)}>
                          {formatPercent(row.return5d)}
                        </HeatCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatPercent(row.trend50_200)}
                        </TableCell>
                        <TableCell className="text-center">
                          {asBoolean(row.aboveSma50) ? (
                            <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="font-mono text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatPercent(row.vol20d, 1)}
                        </TableCell>
                        <HeatCell className={drawdownHeatClass(row.drawdown1y)}>
                          {formatPercent(row.drawdown1y, 1)}
                        </HeatCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatNumber(row.atr14d, 2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {formatMillions(row.volume)}
                        </TableCell>
                        <HeatCell className={liquidityHeatClass(row.volumePctRank252d)}>
                          {formatPercent(row.volumePctRank252d, 0)}
                        </HeatCell>
                        <HeatCell className={compressionHeatClass(row.compressionScore)}>
                          {formatNumber(row.compressionScore, 2)}
                        </HeatCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <CoverageBadge label="S" active={hasSilver} title="Silver coverage" />
                            <CoverageBadge label="G" active={hasGold} title="Gold coverage" />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetail(symbol);
                            }}
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
                      <TableCell colSpan={TABLE_COL_SPAN} className="p-0">
                        <PageLoader text="Loading snapshot..." className="h-[52vh] border-0" />
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {!screenerQuery.isFetching && rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={TABLE_COL_SPAN} className="py-16 text-center">
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

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {resolvedAsOf ? `As-of ${resolvedAsOf}` : 'As-of latest'} |{' '}
              {showing.toLocaleString()} shown | {total.toLocaleString()} total
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

        <aside className="mcm-panel overflow-hidden">
          <div className="border-b border-border/40 px-4 py-3">
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Selected Symbol
            </div>
            {selectedRow ? (
              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-2xl font-black">{selectedTicker}</div>
                  <div className="truncate text-sm font-semibold">{selectedRow.name || '--'}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {selectedRow.sector || '--'} / {selectedRow.industry || '--'}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  onClick={() => openDetail(selectedTicker)}
                  aria-label={`Open detail for ${selectedTicker}`}
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">No symbol selected.</div>
            )}
          </div>

          {selectedRow ? (
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                <CoverageStat label="Silver" active={asBoolean(selectedRow.hasSilver)} />
                <CoverageStat label="Gold" active={asBoolean(selectedRow.hasGold)} />
              </div>

              <div className="mt-4 rounded-md border border-border/50 px-3">
                <FactorLine label="Close" value={formatPrice(selectedRow.close)} />
                <FactorLine
                  label="1D return"
                  value={formatPercent(selectedRow.return1d)}
                  className={returnHeatClass(selectedRow.return1d)}
                />
                <FactorLine
                  label="5D return"
                  value={formatPercent(selectedRow.return5d)}
                  className={returnHeatClass(selectedRow.return5d)}
                />
                <FactorLine label="Trend 50/200" value={formatPercent(selectedRow.trend50_200)} />
                <FactorLine
                  label="20D volatility"
                  value={formatPercent(selectedRow.vol20d, 1)}
                />
                <FactorLine
                  label="1Y drawdown"
                  value={formatPercent(selectedRow.drawdown1y, 1)}
                  className={drawdownHeatClass(selectedRow.drawdown1y)}
                />
                <FactorLine label="ATR 14D" value={formatNumber(selectedRow.atr14d, 2)} />
                <FactorLine
                  label="Volume pct"
                  value={formatPercent(selectedRow.volumePctRank252d, 0)}
                  className={liquidityHeatClass(selectedRow.volumePctRank252d)}
                />
                <FactorLine
                  label="Compression"
                  value={formatNumber(selectedRow.compressionScore, 2)}
                  className={compressionHeatClass(selectedRow.compressionScore)}
                />
              </div>

              <div className="mt-4 rounded-md border border-border/50 bg-muted/15 p-3">
                <div className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Data Quality
                </div>
                <div className="mt-2 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">As-of</span>
                    <span className="font-mono font-semibold">{resolvedAsOf || 'latest'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Optionable</span>
                    <span className="font-mono font-semibold">
                      {selectedRow.isOptionable === null || selectedRow.isOptionable === undefined
                        ? '--'
                        : selectedRow.isOptionable
                          ? 'Yes'
                          : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Country</span>
                    <span className="font-mono font-semibold">{selectedRow.country || '--'}</span>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                className="mt-4 w-full gap-2"
                onClick={() => openDetail(selectedTicker)}
              >
                Open detail
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="p-4">
              <StatePanel
                tone="empty"
                title="No Selection"
                message="Select a row from the screener table to inspect its factor snapshot."
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

interface SortableHeadProps {
  label: string;
  sortKey: StockScreenerSortKey;
  onToggleSort: (sortKey: StockScreenerSortKey) => void;
}

function SortableHead({ label, sortKey, onToggleSort }: SortableHeadProps) {
  return (
    <TableHead className="sticky top-0 z-20 bg-mcm-paper text-right font-mono text-[10px] uppercase tracking-[0.18em]">
      <button
        type="button"
        onClick={() => onToggleSort(sortKey)}
        className="inline-flex items-center justify-end gap-1 hover:text-foreground"
      >
        {label} <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  );
}

interface HeatCellProps {
  children: string;
  className?: string;
}

function HeatCell({ children, className }: HeatCellProps) {
  return (
    <TableCell className="text-right">
      <span className={cn('inline-flex min-w-16 justify-end rounded px-2 py-1 font-mono text-xs font-semibold', className)}>
        {children}
      </span>
    </TableCell>
  );
}

interface CoverageBadgeProps {
  label: string;
  active: boolean;
  title: string;
}

function CoverageBadge({ label, active, title }: CoverageBadgeProps) {
  return (
    <span
      title={active ? `${title} present` : `${title} missing`}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded border font-mono text-[10px] font-black',
        active
          ? 'border-mcm-teal/50 bg-mcm-teal/10 text-mcm-teal'
          : 'border-border bg-muted/20 text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
}

interface CoverageStatProps {
  label: string;
  active: boolean;
}

function CoverageStat({ label, active }: CoverageStatProps) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/15 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 font-mono text-sm font-black',
          active ? 'text-mcm-teal' : 'text-muted-foreground'
        )}
      >
        {active ? 'Present' : 'Missing'}
      </div>
    </div>
  );
}
