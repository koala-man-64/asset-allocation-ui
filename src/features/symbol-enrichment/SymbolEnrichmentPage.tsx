import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  WandSparkles
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import {
  symbolEnrichmentApi,
  type SymbolCleanupRunSummary,
  type SymbolEnrichmentField,
  type SymbolEnrichmentSymbolDetail,
  type SymbolOverwriteMode,
  type SymbolProfileCurrent,
  type SymbolProfileOverride,
  type SymbolProfileValues,
  type SymbolProviderFacts
} from '@/services/symbolEnrichmentApi';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

const SYMBOL_ENRICHMENT_FIELDS: SymbolEnrichmentField[] = [
  'security_type_norm',
  'exchange_mic',
  'country_of_risk',
  'sector_norm',
  'industry_group_norm',
  'industry_norm',
  'is_adr',
  'is_etf',
  'is_cef',
  'is_preferred',
  'share_class',
  'listing_status_norm',
  'issuer_summary_short'
];
const BOOLEAN_FIELDS = new Set<SymbolEnrichmentField>([
  'is_adr',
  'is_etf',
  'is_cef',
  'is_preferred'
]);
const TEXTAREA_FIELDS = new Set<SymbolEnrichmentField>(['issuer_summary_short']);

type OverrideDraft = {
  rawValue: string;
  isLocked: boolean;
  hasExisting: boolean;
};

function formatFieldLabel(fieldName: string): string {
  return fieldName
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function formatCount(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0';
  }
  return new Intl.NumberFormat('en-US').format(value);
}

function formatRatio(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${Math.round(Number(value) * 100)}%`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function buildOverrideDrafts(detail?: SymbolEnrichmentSymbolDetail | null): Record<string, OverrideDraft> {
  const overridesByField = new Map(detail?.overrides.map((override) => [override.fieldName, override]));
  return Object.fromEntries(
    SYMBOL_ENRICHMENT_FIELDS.map((fieldName) => {
      const existing = overridesByField.get(fieldName);
      return [
        fieldName,
        {
          rawValue: existing?.value === null || existing?.value === undefined ? '' : String(existing.value),
          isLocked: Boolean(existing?.isLocked),
          hasExisting: Boolean(existing)
        } satisfies OverrideDraft
      ];
    })
  );
}

function parseOverrideValue(fieldName: SymbolEnrichmentField, rawValue: string): string | boolean | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  if (BOOLEAN_FIELDS.has(fieldName)) {
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    throw new Error(`${formatFieldLabel(fieldName)} must be true, false, or blank.`);
  }
  return trimmed;
}

function buildOverridePayload(
  symbol: string,
  drafts: Record<string, OverrideDraft>
): SymbolProfileOverride[] {
  return SYMBOL_ENRICHMENT_FIELDS.flatMap((fieldName) => {
    const draft = drafts[fieldName];
    if (!draft) {
      return [];
    }
    if (!draft.hasExisting && !draft.isLocked && !draft.rawValue.trim()) {
      return [];
    }
    return [
      {
        symbol,
        fieldName,
        value: parseOverrideValue(fieldName, draft.rawValue),
        isLocked: draft.isLocked
      }
    ];
  });
}

function profileValueRows(profile?: SymbolProfileValues | SymbolProfileCurrent | null) {
  return SYMBOL_ENRICHMENT_FIELDS.map((fieldName) => ({
    fieldName,
    label: formatFieldLabel(fieldName),
    value: profile?.[fieldName]
  }));
}

function providerFactRows(providerFacts: SymbolProviderFacts) {
  return [
    ['Name', providerFacts.name],
    ['Exchange', providerFacts.exchange],
    ['Asset Type', providerFacts.assetType],
    ['Country', providerFacts.country],
    ['Sector', providerFacts.sector],
    ['Industry', providerFacts.industry],
    ['Industry Group', providerFacts.industry2],
    ['Listing Status', providerFacts.status],
    ['IPO Date', providerFacts.ipoDate],
    ['Delisting Date', providerFacts.delistingDate],
    ['Optionable', providerFacts.isOptionable]
  ] as const;
}

function runStatusTone(status: SymbolCleanupRunSummary['status']) {
  if (status === 'failed') return 'destructive' as const;
  if (status === 'running') return 'secondary' as const;
  return 'outline' as const;
}

export function SymbolEnrichmentPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const deferredSearch = useDeferredValue(searchInput.trim());
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [overwriteMode, setOverwriteMode] = useState<SymbolOverwriteMode>('fill_missing');
  const [maxSymbolsInput, setMaxSymbolsInput] = useState('500');
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, OverrideDraft>>(
    buildOverrideDrafts()
  );

  const summaryQuery = useQuery({
    queryKey: ['symbol-enrichment', 'summary'],
    queryFn: ({ signal }) => symbolEnrichmentApi.getSummary(signal)
  });

  const runsQuery = useQuery({
    queryKey: ['symbol-enrichment', 'runs'],
    queryFn: ({ signal }) => symbolEnrichmentApi.listRuns({ limit: 8 }, signal)
  });

  const symbolsQuery = useQuery({
    queryKey: ['symbol-enrichment', 'symbols', deferredSearch],
    queryFn: ({ signal }) =>
      symbolEnrichmentApi.listSymbols(
        {
          q: deferredSearch || undefined,
          limit: 50
        },
        signal
      )
  });

  useEffect(() => {
    const symbols = symbolsQuery.data || [];
    if (!symbols.length) {
      setSelectedSymbol(null);
      return;
    }
    if (!selectedSymbol || !symbols.some((item) => item.symbol === selectedSymbol)) {
      setSelectedSymbol(symbols[0].symbol);
    }
  }, [selectedSymbol, symbolsQuery.data]);

  const detailQuery = useQuery({
    queryKey: ['symbol-enrichment', 'detail', selectedSymbol],
    queryFn: ({ signal }) => symbolEnrichmentApi.getSymbolDetail(selectedSymbol || '', signal),
    enabled: Boolean(selectedSymbol)
  });

  useEffect(() => {
    setOverrideDrafts(buildOverrideDrafts(detailQuery.data));
  }, [detailQuery.data]);

  const enqueueMutation = useMutation({
    mutationFn: (payload: {
      fullScan: boolean;
      symbols?: string[];
      overwriteMode: SymbolOverwriteMode;
      maxSymbols?: number;
    }) => symbolEnrichmentApi.enqueue(payload),
    onSuccess: async (run) => {
      toast.success(`Enqueued symbol enrichment run ${run.runId}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['symbol-enrichment', 'summary'] }),
        queryClient.invalidateQueries({ queryKey: ['symbol-enrichment', 'runs'] }),
        queryClient.invalidateQueries({ queryKey: ['symbol-enrichment', 'symbols'] })
      ]);
    },
    onError: (error) => {
      toast.error(`Failed to enqueue symbol enrichment: ${formatSystemStatusText(error)}`);
    }
  });

  const saveOverridesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSymbol) {
        throw new Error('Select a symbol before saving overrides.');
      }
      return symbolEnrichmentApi.saveOverrides(
        selectedSymbol,
        buildOverridePayload(selectedSymbol, overrideDrafts)
      );
    },
    onSuccess: async () => {
      toast.success('Overrides saved.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['symbol-enrichment', 'summary'] }),
        queryClient.invalidateQueries({ queryKey: ['symbol-enrichment', 'symbols'] }),
        queryClient.invalidateQueries({ queryKey: ['symbol-enrichment', 'detail', selectedSymbol] })
      ]);
    },
    onError: (error) => {
      toast.error(`Failed to save overrides: ${formatSystemStatusText(error)}`);
    }
  });

  const isInitialLoading =
    summaryQuery.isLoading || runsQuery.isLoading || symbolsQuery.isLoading;
  const initialError = summaryQuery.error || runsQuery.error || symbolsQuery.error;
  const selectedDetail = detailQuery.data;
  const currentProfile = selectedDetail?.currentProfile;
  const maxSymbols = Math.max(1, Number.parseInt(maxSymbolsInput || '500', 10) || 500);
  const symbolRows = symbolsQuery.data || [];
  const activeRun = summaryQuery.data?.activeRun;

  const providerRows = useMemo(
    () =>
      selectedDetail
        ? providerFactRows(selectedDetail.providerFacts).filter(([, value]) => value !== undefined)
        : [],
    [selectedDetail]
  );

  if (isInitialLoading) {
    return (
      <div className="page-shell">
        <PageHero
          kicker="Live Operations"
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-mcm-teal" />
              Symbol Enrichment
            </span>
          }
          subtitle="Inspect missing symbol metadata, queue enrichment runs, and manage field-level locks from the operator shell."
        />
        <PageLoader text="Loading symbol enrichment console..." variant="panel" />
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="page-shell">
        <PageHero
          kicker="Live Operations"
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-mcm-teal" />
              Symbol Enrichment
            </span>
          }
          subtitle="Inspect missing symbol metadata, queue enrichment runs, and manage field-level locks from the operator shell."
        />
        <StatePanel
          tone="error"
          title="Symbol Enrichment Unavailable"
          message={formatSystemStatusText(initialError)}
          className="mcm-panel border-destructive/30 bg-destructive/10"
        />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHero
        kicker="Live Operations"
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-mcm-teal" />
            Symbol Enrichment Console
          </span>
        }
        subtitle="Queue full scans or targeted reruns, review provider facts against enriched fields, and lock high-conviction overrides before the next cleanup pass."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                void Promise.all([
                  summaryQuery.refetch(),
                  runsQuery.refetch(),
                  symbolsQuery.refetch(),
                  detailQuery.refetch()
                ])
              }
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              className="gap-2"
              onClick={() =>
                enqueueMutation.mutate({
                  fullScan: true,
                  overwriteMode,
                  maxSymbols
                })
              }
              disabled={enqueueMutation.isPending}
            >
              <WandSparkles className="h-4 w-4" />
              {enqueueMutation.isPending ? 'Queueing…' : 'Queue Full Scan'}
            </Button>
          </div>
        }
        metrics={[
          {
            label: 'Backlog',
            value: formatCount(summaryQuery.data?.backlogCount),
            detail: activeRun
              ? `Active run ${activeRun.runId} is ${activeRun.status}.`
              : 'No active enrichment run is in flight.'
          },
          {
            label: 'Validation Failures',
            value: formatCount(summaryQuery.data?.validationFailureCount),
            detail: 'Failed or rejected work items currently needing operator attention.'
          },
          {
            label: 'Locked Fields',
            value: formatCount(summaryQuery.data?.lockCount),
            detail: 'Field-level overrides protected from auto-reconciliation.'
          }
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="mcm-panel">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-mcm-olive" />
                Run Controls
              </CardTitle>
              <CardDescription>
                Search the symbol catalog, queue targeted reruns, and control overwrite mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-2">
                <Label htmlFor="symbol-enrichment-search">Search symbols</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="symbol-enrichment-search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="AAPL, SPY, semiconductor…"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="symbol-enrichment-mode">Overwrite mode</Label>
                  <select
                    id="symbol-enrichment-mode"
                    value={overwriteMode}
                    onChange={(event) => setOverwriteMode(event.target.value as SymbolOverwriteMode)}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="fill_missing">Fill Missing</option>
                    <option value="full_reconcile">Full Reconcile</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="symbol-enrichment-max">Max symbols</Label>
                  <Input
                    id="symbol-enrichment-max"
                    value={maxSymbolsInput}
                    onChange={(event) => setMaxSymbolsInput(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    selectedSymbol &&
                    enqueueMutation.mutate({
                      fullScan: false,
                      symbols: [selectedSymbol],
                      overwriteMode,
                      maxSymbols: 1
                    })
                  }
                  disabled={!selectedSymbol || enqueueMutation.isPending}
                >
                  Rerun Symbol
                </Button>
                <Button
                  variant="outline"
                  onClick={() => saveOverridesMutation.mutate()}
                  disabled={!selectedSymbol || saveOverridesMutation.isPending}
                >
                  Save Overrides
                </Button>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                {selectedSymbol ? (
                  <>
                    Selected symbol: <span className="font-semibold text-foreground">{selectedSymbol}</span>
                    <div className="mt-2">
                      Targeted rerun enqueues only the selected symbol. Full scan respects the
                      control-plane max-symbol cap and current overwrite mode.
                    </div>
                  </>
                ) : (
                  'No symbol selected yet. Choose a row from the symbol list to inspect detail and save overrides.'
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mcm-panel">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-lg">Recent Runs</CardTitle>
              <CardDescription>
                Queue state, overwrite behavior, and accepted update counts from the latest runs.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {(runsQuery.data || []).length === 0 ? (
                <StatePanel
                  tone="empty"
                  title="No Enrichment Runs"
                  message="Queue a run from this page or the control-plane to populate run history."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Accepted</TableHead>
                      <TableHead>Overwrites</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(runsQuery.data || []).map((run) => (
                      <TableRow key={run.runId}>
                        <TableCell className="font-mono text-xs">{run.runId.slice(0, 10)}</TableCell>
                        <TableCell>
                          <Badge variant={runStatusTone(run.status)}>{run.status}</Badge>
                        </TableCell>
                        <TableCell>{formatCount(run.acceptedUpdateCount)}</TableCell>
                        <TableCell>{formatCount(run.overwriteCount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mcm-panel">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-lg">Symbols</CardTitle>
              <CardDescription>
                Searchable enrichment candidates with completeness and lock visibility.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {symbolRows.length === 0 ? (
                <StatePanel
                  tone="empty"
                  title="No Symbols Matched"
                  message="Try a broader query or queue a full scan to refresh the work queue."
                />
              ) : (
                <div className="max-h-[640px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Missing</TableHead>
                        <TableHead>Locked</TableHead>
                        <TableHead>Complete</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {symbolRows.map((row) => {
                        const isSelected = row.symbol === selectedSymbol;
                        return (
                          <TableRow
                            key={row.symbol}
                            onClick={() => setSelectedSymbol(row.symbol)}
                            className={isSelected ? 'bg-primary/5' : 'cursor-pointer'}
                          >
                            <TableCell>
                              <div className="font-semibold">{row.symbol}</div>
                              <div className="text-xs text-muted-foreground">{row.name || 'No company name'}</div>
                            </TableCell>
                            <TableCell>{formatCount(row.missingFieldCount)}</TableCell>
                            <TableCell>{formatCount(row.lockedFieldCount)}</TableCell>
                            <TableCell>{formatRatio(row.dataCompletenessScore)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {!selectedSymbol ? (
            <StatePanel
              tone="empty"
              title="Select A Symbol"
              message="Choose a symbol from the list to compare provider facts, enriched values, and override history."
              className="mcm-panel"
            />
          ) : detailQuery.isLoading ? (
            <PageLoader text={`Loading ${selectedSymbol}...`} variant="panel" />
          ) : detailQuery.error ? (
            <StatePanel
              tone="error"
              title="Symbol Detail Unavailable"
              message={formatSystemStatusText(detailQuery.error)}
              className="mcm-panel border-destructive/30 bg-destructive/10"
            />
          ) : selectedDetail ? (
            <>
              <Card className="mcm-panel">
                <CardHeader className="border-b border-border/40">
                  <CardTitle className="flex items-center justify-between gap-3 text-lg">
                    <span>{selectedDetail.providerFacts.symbol}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {currentProfile?.validationStatus || 'provider'}
                      </Badge>
                      <Badge variant="secondary">
                        {currentProfile?.sourceKind || 'provider'}
                      </Badge>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    {selectedDetail.providerFacts.name || 'Provider facts'} • Updated{' '}
                    {formatDateTime(currentProfile?.updatedAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <section className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Provider Facts
                      </div>
                      <div className="grid gap-2">
                        {providerRows.map(([label, value]) => (
                          <div
                            key={label}
                            className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/10 px-4 py-3"
                          >
                            <span className="text-sm text-muted-foreground">{label}</span>
                            <span className="text-right text-sm font-medium">{formatValue(value)}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Enriched Profile
                      </div>
                      <div className="grid gap-2">
                        {profileValueRows(currentProfile).map((row) => (
                          <div
                            key={row.fieldName}
                            className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/10 px-4 py-3"
                          >
                            <span className="text-sm text-muted-foreground">{row.label}</span>
                            <span className="text-right text-sm font-medium">{formatValue(row.value)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-4">
                    <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
                      <div className="text-xs uppercase text-muted-foreground">Completeness</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {formatRatio(currentProfile?.dataCompletenessScore)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
                      <div className="text-xs uppercase text-muted-foreground">Market Cap</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {formatValue(currentProfile?.marketCapBucket)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
                      <div className="text-xs uppercase text-muted-foreground">Liquidity</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {formatValue(currentProfile?.liquidityBucket)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-muted/15 p-4">
                      <div className="text-xs uppercase text-muted-foreground">AI Confidence</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {formatRatio(currentProfile?.aiConfidence)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="mcm-panel">
                <CardHeader className="border-b border-border/40">
                  <CardTitle className="text-lg">Overrides And Locks</CardTitle>
                  <CardDescription>
                    Save field-level overrides or lock values so the cleanup worker skips them on the next run.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {SYMBOL_ENRICHMENT_FIELDS.map((fieldName) => {
                    const draft = overrideDrafts[fieldName];
                    if (!draft) {
                      return null;
                    }
                    return (
                      <div
                        key={fieldName}
                        className="grid gap-3 rounded-2xl border border-border/60 bg-muted/10 p-4 lg:grid-cols-[220px_minmax(0,1fr)_92px]"
                      >
                        <div>
                          <div className="font-medium">{formatFieldLabel(fieldName)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Current: {formatValue(currentProfile?.[fieldName])}
                          </div>
                        </div>

                        <div>
                          {BOOLEAN_FIELDS.has(fieldName) ? (
                            <select
                              aria-label={`${formatFieldLabel(fieldName)} override`}
                              value={draft.rawValue}
                              onChange={(event) =>
                                setOverrideDrafts((current) => ({
                                  ...current,
                                  [fieldName]: {
                                    ...current[fieldName],
                                    rawValue: event.target.value
                                  }
                                }))
                              }
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                              <option value="">Unset</option>
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          ) : TEXTAREA_FIELDS.has(fieldName) ? (
                            <Textarea
                              aria-label={`${formatFieldLabel(fieldName)} override`}
                              value={draft.rawValue}
                              onChange={(event) =>
                                setOverrideDrafts((current) => ({
                                  ...current,
                                  [fieldName]: {
                                    ...current[fieldName],
                                    rawValue: event.target.value
                                  }
                                }))
                              }
                              rows={3}
                            />
                          ) : (
                            <Input
                              aria-label={`${formatFieldLabel(fieldName)} override`}
                              value={draft.rawValue}
                              onChange={(event) =>
                                setOverrideDrafts((current) => ({
                                  ...current,
                                  [fieldName]: {
                                    ...current[fieldName],
                                    rawValue: event.target.value
                                  }
                                }))
                              }
                            />
                          )}
                        </div>

                        <label className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                          Lock
                          <Switch
                            checked={draft.isLocked}
                            onCheckedChange={(checked) =>
                              setOverrideDrafts((current) => ({
                                ...current,
                                [fieldName]: {
                                  ...current[fieldName],
                                  isLocked: Boolean(checked)
                                }
                              }))
                            }
                          />
                        </label>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="mcm-panel">
                <CardHeader className="border-b border-border/40">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="h-5 w-5 text-mcm-mustard" />
                    Change History
                  </CardTitle>
                  <CardDescription>
                    Recent accepted updates applied to this symbol profile.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {selectedDetail.history.length === 0 ? (
                    <StatePanel
                      tone="empty"
                      title="No Change History"
                      message="This symbol has not recorded any accepted enrichment updates yet."
                    />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>New Value</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedDetail.history.slice(0, 12).map((entry) => (
                          <TableRow key={entry.historyId}>
                            <TableCell>{formatFieldLabel(entry.fieldName)}</TableCell>
                            <TableCell>{formatValue(entry.newValue)}</TableCell>
                            <TableCell>
                              <div className="text-sm">{entry.sourceKind}</div>
                              <div className="text-xs text-muted-foreground">
                                {entry.aiModel || entry.changeReason || 'symbol_cleanup'}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{formatDateTime(entry.updatedAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
