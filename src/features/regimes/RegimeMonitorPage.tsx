import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Clock3,
  Gauge,
  Layers3,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import { regimeApi } from '@/services/regimeApi';
import type { RegimeSignal, RegimeSnapshot } from '@/types/regime';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import { toast } from 'sonner';

const REGIME_REFETCH_INTERVAL_MS = 30_000;

const DEFAULT_MODEL_CONFIG_JSON = JSON.stringify(
  {
    activationThreshold: 0.6,
    haltVixThreshold: 32.0,
    haltVixStreakDays: 2,
    signalConfigs: {
      trending_up: {
        displayName: 'Trending Up',
        requiredMetrics: ['return_20d'],
        rules: [
          {
            metric: 'return_20d',
            comparison: 'gte',
            lower: 0.02,
            description: '20-day return confirms a positive trend.'
          }
        ]
      },
      high_volatility: {
        displayName: 'High Volatility',
        requiredMetrics: ['vix_spot_close'],
        rules: [
          {
            metric: 'vix_spot_close',
            comparison: 'gte',
            lower: 28,
            description: 'Spot VIX remains elevated versus the desk threshold.'
          }
        ]
      }
    }
  },
  null,
  2
);

type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline';

function formatTimestamp(value?: string | null): string {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function formatDate(value?: string | null): string {
  if (!value) return 'Not available';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(
      new Date(year, month - 1, day)
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(parsed);
}

function formatMetric(value?: number | null, digits: number = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return Number(value).toFixed(digits);
}

function formatLabel(value?: string | null): string {
  if (!value) return 'Unclassified';
  return value.replaceAll('_', ' ');
}

function formatTitleLabel(value?: string | null): string {
  return formatLabel(value).replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'n/a';
    if (Number.isInteger(value)) return String(value);
    const digits = Math.abs(value) >= 10 ? 2 : 4;
    return value.toFixed(digits).replace(/\.?0+$/, '');
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value || 'n/a';
  if (Array.isArray(value)) return value.map(formatEvidenceValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getEvidenceEntries(signal: RegimeSignal): Array<{ key: string; value: string }> {
  const evidence = signal.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return [];
  }

  return Object.entries(evidence as Record<string, unknown>).map(([key, value]) => ({
    key: formatLabel(key),
    value: formatEvidenceValue(value)
  }));
}

function getPrimaryRegimeCode(snapshot?: RegimeSnapshot | null): string | null {
  return snapshot?.active_regimes[0] ?? null;
}

function getActiveSignals(snapshot?: RegimeSnapshot | null): RegimeSignal[] {
  return (snapshot?.signals ?? []).filter((signal) => signal.is_active);
}

function getMatchedRule(snapshot?: RegimeSnapshot | null): string {
  return (
    getActiveSignals(snapshot)
      .map((signal) => signal.matched_rule_id)
      .find(Boolean) ?? 'n/a'
  );
}

function regimeTone(snapshot?: RegimeSnapshot | null): BadgeTone {
  if (!snapshot) return 'outline';
  const primaryRegime = getPrimaryRegimeCode(snapshot);
  if (
    snapshot.halt_flag ||
    primaryRegime === 'high_volatility' ||
    primaryRegime === 'liquidity_stress'
  ) {
    return 'destructive';
  }
  if (!snapshot.active_regimes.length || primaryRegime === 'unclassified') return 'secondary';
  return 'default';
}

function signalTone(signal: RegimeSignal): BadgeTone {
  if (signal.is_active) return 'default';
  if (signal.signal_state === 'inactive') return 'outline';
  return 'secondary';
}

function getFreshness(value?: string | null): {
  label: string;
  detail: string;
  tone: BadgeTone;
} {
  if (!value) {
    return {
      label: 'No computation',
      detail: 'No computed timestamp is available for this snapshot.',
      tone: 'outline'
    };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return {
      label: 'Unknown freshness',
      detail: value,
      tone: 'secondary'
    };
  }

  const ageMs = Date.now() - parsed.getTime();
  if (ageMs < 0) {
    return {
      label: 'Future timestamp',
      detail: formatTimestamp(value),
      tone: 'secondary'
    };
  }

  const ageMinutes = Math.floor(ageMs / 60_000);
  if (ageMinutes < 5) {
    return {
      label: 'Fresh',
      detail: 'Computed within the last 5 minutes.',
      tone: 'default'
    };
  }
  if (ageMinutes < 60) {
    return {
      label: `${ageMinutes}m old`,
      detail: formatTimestamp(value),
      tone: 'secondary'
    };
  }

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return {
      label: `${ageHours}h old`,
      detail: formatTimestamp(value),
      tone: ageHours >= 2 ? 'destructive' : 'secondary'
    };
  }

  const ageDays = Math.floor(ageHours / 24);
  return {
    label: `${ageDays}d old`,
    detail: formatTimestamp(value),
    tone: 'destructive'
  };
}

function sortSignals(signals: RegimeSignal[]): RegimeSignal[] {
  return signals
    .slice()
    .sort(
      (left, right) =>
        Number(right.is_active) - Number(left.is_active) ||
        (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY) ||
        left.display_name.localeCompare(right.display_name)
    );
}

function didPrimaryRegimeChange(
  row: RegimeSnapshot,
  index: number,
  rows: RegimeSnapshot[]
): boolean {
  const previousRow = rows[index + 1];
  if (!previousRow) return false;
  return getPrimaryRegimeCode(row) !== getPrimaryRegimeCode(previousRow);
}

function parseModelConfigJson(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      error instanceof Error ? `Invalid JSON: ${error.message}` : 'Invalid JSON config.'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Config JSON must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function MiniMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-mcm-walnut/15 bg-mcm-paper/75 px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate font-display text-lg text-foreground">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function RegimeMonitorPage() {
  const queryClient = useQueryClient();
  const [selectedModelName, setSelectedModelName] = useState('default-regime');
  const [isModelAdminOpen, setIsModelAdminOpen] = useState(false);
  const [configJsonError, setConfigJsonError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({
    name: '',
    description: '',
    configJson: DEFAULT_MODEL_CONFIG_JSON
  });

  const modelsQuery = useQuery({
    queryKey: ['regimes', 'models'],
    queryFn: () => regimeApi.listModels(),
    refetchInterval: REGIME_REFETCH_INTERVAL_MS
  });

  useEffect(() => {
    const models = modelsQuery.data?.models || [];
    if (!models.length) return;
    if (models.some((model) => model.name === selectedModelName)) return;
    setSelectedModelName(models[0].name);
  }, [modelsQuery.data?.models, selectedModelName]);

  const selectedModelDetailQuery = useQuery({
    queryKey: ['regimes', 'models', selectedModelName],
    queryFn: () => regimeApi.getModel(selectedModelName),
    enabled: Boolean(selectedModelName),
    refetchInterval: REGIME_REFETCH_INTERVAL_MS
  });

  const currentQuery = useQuery({
    queryKey: ['regimes', 'current', selectedModelName],
    queryFn: () => regimeApi.getCurrent({ modelName: selectedModelName }),
    enabled: Boolean(selectedModelName),
    refetchInterval: REGIME_REFETCH_INTERVAL_MS
  });

  const historyQuery = useQuery({
    queryKey: ['regimes', 'history', selectedModelName],
    queryFn: () => regimeApi.getHistory({ modelName: selectedModelName, limit: 24 }),
    enabled: Boolean(selectedModelName),
    refetchInterval: REGIME_REFETCH_INTERVAL_MS
  });

  const createMutation = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      regimeApi.createModel({
        name: createDraft.name.trim(),
        description: createDraft.description.trim(),
        config
      }),
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ['regimes'] });
      setSelectedModelName(payload.model.name);
      setConfigJsonError(null);
      setIsModelAdminOpen(false);
      setCreateDraft({
        name: '',
        description: '',
        configJson: DEFAULT_MODEL_CONFIG_JSON
      });
      toast.success(`Regime model ${payload.model.name} saved`);
    },
    onError: (error) => {
      toast.error(`Failed to save regime model: ${formatSystemStatusText(error)}`);
    }
  });

  const activateMutation = useMutation({
    mutationFn: ({ modelName, version }: { modelName: string; version: number }) =>
      regimeApi.activateModel(modelName, { version }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['regimes'] }),
        queryClient.invalidateQueries({ queryKey: ['regimes', 'models', variables.modelName] }),
        queryClient.invalidateQueries({ queryKey: ['regimes', 'current', variables.modelName] }),
        queryClient.invalidateQueries({ queryKey: ['regimes', 'history', variables.modelName] })
      ]);
      toast.success(`Activated ${variables.modelName} v${variables.version}`);
    },
    onError: (error) => {
      toast.error(`Failed to activate regime model: ${formatSystemStatusText(error)}`);
    }
  });

  const modelOptions = modelsQuery.data?.models || [];
  const currentSnapshot = currentQuery.data;
  const historyRows = historyQuery.data?.rows || [];
  const activeVersion = selectedModelDetailQuery.data?.activeRevision?.version;
  const activationThreshold =
    selectedModelDetailQuery.data?.activeRevision?.config.activationThreshold;
  const latestRevisionVersion = useMemo(() => {
    const revisions = selectedModelDetailQuery.data?.revisions || [];
    return revisions.length ? revisions[0].version : undefined;
  }, [selectedModelDetailQuery.data?.revisions]);
  const sortedSignals = useMemo(
    () => sortSignals(currentSnapshot?.signals ?? []),
    [currentSnapshot?.signals]
  );
  const activeSignals = useMemo(() => getActiveSignals(currentSnapshot), [currentSnapshot]);
  const currentRegimeLabel = currentSnapshot
    ? formatTitleLabel(getPrimaryRegimeCode(currentSnapshot))
    : 'No Snapshot';
  const matchedRule = getMatchedRule(currentSnapshot);
  const freshness = getFreshness(currentSnapshot?.computed_at);
  const isRefreshing =
    modelsQuery.isFetching ||
    selectedModelDetailQuery.isFetching ||
    currentQuery.isFetching ||
    historyQuery.isFetching;
  const coreError = modelsQuery.error || selectedModelDetailQuery.error || currentQuery.error;

  const refreshRegimeView = async () => {
    await queryClient.invalidateQueries({ queryKey: ['regimes'] });
    toast.success('Regime monitor refreshed');
  };

  const submitCreateModel = () => {
    setConfigJsonError(null);
    try {
      createMutation.mutate(parseModelConfigJson(createDraft.configJson));
    } catch (error) {
      setConfigJsonError(formatSystemStatusText(error));
    }
  };

  return (
    <div className="page-shell">
      <PageHero
        kicker="Live Operations"
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-mcm-olive" />
            Regime Monitor
          </span>
        }
        subtitle="Desk-first regime oversight for active model posture, signal evidence, halt controls, and recent transitions."
      />

      <section className="mcm-panel p-4" aria-label="Regime monitor controls">
        <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1.25fr)_repeat(3,minmax(9rem,0.7fr))_auto] lg:items-end">
          <div className="min-w-0">
            <Label htmlFor="regime-model-selector">Selected Model</Label>
            <select
              id="regime-model-selector"
              value={selectedModelName}
              onChange={(event) => setSelectedModelName(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border-2 border-input bg-background px-3 py-2 text-sm font-mono"
            >
              {modelOptions.length ? (
                modelOptions.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))
              ) : (
                <option value={selectedModelName}>{selectedModelName}</option>
              )}
            </select>
          </div>

          <MiniMetric label="Active Version" value={activeVersion ? `v${activeVersion}` : 'n/a'} />
          <MiniMetric
            label="Latest Version"
            value={latestRevisionVersion ? `v${latestRevisionVersion}` : 'n/a'}
          />
          <MiniMetric label="Computed" value={formatTimestamp(currentSnapshot?.computed_at)} />

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void refreshRegimeView();
            }}
            disabled={isRefreshing}
            aria-label="Refresh regime view"
          >
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </section>

      {coreError ? (
        <StatePanel
          tone="error"
          title="Regime Monitor Unavailable"
          message={formatSystemStatusText(coreError)}
          className="mcm-panel border-destructive/30 bg-destructive/10"
        />
      ) : (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="min-w-0 space-y-6">
            <Card className="mcm-panel overflow-hidden">
              <CardHeader className="border-b border-border/40">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Activity className="h-5 w-5 text-mcm-olive" />
                      Regime Verdict
                    </CardTitle>
                    <CardDescription>
                      Primary model state, halt posture, and snapshot freshness.
                    </CardDescription>
                  </div>
                  <Badge variant={freshness.tone}>
                    <Clock3 className="h-3.5 w-3.5" />
                    {freshness.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {currentQuery.isLoading ? (
                  <PageLoader text="Loading regime verdict..." variant="panel" />
                ) : currentSnapshot ? (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
                    <div className="min-w-0 rounded-3xl border-2 border-mcm-walnut/30 bg-background/35 p-5">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                        Observed Regime
                      </div>
                      <div
                        className="mt-3 font-display text-4xl font-black leading-tight text-foreground"
                        data-testid="regime-verdict"
                      >
                        {currentRegimeLabel}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge variant={regimeTone(currentSnapshot)}>{currentRegimeLabel}</Badge>
                        <Badge variant={currentSnapshot.halt_flag ? 'destructive' : 'outline'}>
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {currentSnapshot.halt_flag ? 'Halt Active' : 'No Halt'}
                        </Badge>
                        <Badge variant="secondary">
                          {activeSignals.length}{' '}
                          {activeSignals.length === 1 ? 'Active Signal' : 'Active Signals'}
                        </Badge>
                      </div>
                      <div className="mt-5 text-sm text-muted-foreground">
                        Freshness: {freshness.detail}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <MiniMetric
                        label="Active Regimes"
                        value={
                          currentSnapshot.active_regimes.length
                            ? currentSnapshot.active_regimes.map(formatTitleLabel).join(', ')
                            : 'Unclassified'
                        }
                      />
                      <MiniMetric label="Matched Rule" value={matchedRule} />
                      <MiniMetric label="As Of" value={formatDate(currentSnapshot.as_of_date)} />
                      <MiniMetric
                        label="Effective"
                        value={formatDate(currentSnapshot.effective_from_date)}
                      />
                      <MiniMetric
                        label="Activation Threshold"
                        value={formatMetric(activationThreshold)}
                      />
                      <MiniMetric
                        label="Halt Reason"
                        value={currentSnapshot.halt_reason || 'n/a'}
                      />
                    </div>
                  </div>
                ) : (
                  <StatePanel
                    tone="empty"
                    title="No Regime Snapshot"
                    message="No regime snapshot is available yet for this model."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="mcm-panel">
              <CardHeader className="border-b border-border/40">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Gauge className="h-5 w-5 text-mcm-teal" />
                      Signal Evidence
                    </CardTitle>
                    <CardDescription>
                      Scores, thresholds, matched rules, and raw evidence values.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{sortedSignals.length} signals</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {currentQuery.isLoading ? (
                  <PageLoader text="Loading signal evidence..." variant="panel" />
                ) : sortedSignals.length ? (
                  <div className="grid gap-3">
                    {sortedSignals.map((signal) => {
                      const evidenceEntries = getEvidenceEntries(signal);
                      return (
                        <article
                          key={`${signal.regime_code}-${signal.display_name}`}
                          className="rounded-2xl border-2 border-mcm-walnut/25 bg-mcm-paper/80 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-display text-xl text-foreground">
                                {signal.display_name}
                              </div>
                              <div className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                {formatTitleLabel(signal.regime_code)}
                              </div>
                            </div>
                            <Badge variant={signalTone(signal)}>
                              {signal.is_active ? 'Active' : signal.signal_state}
                            </Badge>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <MiniMetric label="Score" value={formatMetric(signal.score)} />
                            <MiniMetric
                              label="Threshold"
                              value={formatMetric(signal.activation_threshold)}
                            />
                            <MiniMetric
                              label="Matched Rule"
                              value={signal.matched_rule_id || 'n/a'}
                            />
                          </div>

                          <div className="mt-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                              Evidence
                            </div>
                            {evidenceEntries.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {evidenceEntries.map((entry) => (
                                  <span
                                    key={`${signal.regime_code}-${entry.key}`}
                                    className="rounded-full border border-mcm-walnut/20 bg-background/45 px-3 py-1 font-mono text-xs text-foreground"
                                  >
                                    {entry.key}: {entry.value}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-2 text-sm text-muted-foreground">
                                No evidence payload was supplied for this signal.
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <StatePanel
                    tone="empty"
                    title="No Signal Evidence"
                    message="The current snapshot does not include any regime signal rows."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="mcm-panel">
              <CardHeader className="border-b border-border/40">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers3 className="h-5 w-5 text-mcm-teal" />
                  Regime Timeline
                </CardTitle>
                <CardDescription>
                  Recent snapshots with visible transition and halt markers.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {historyQuery.isLoading ? (
                  <PageLoader text="Loading regime timeline..." variant="panel" />
                ) : historyQuery.error ? (
                  <StatePanel
                    tone="error"
                    title="History Unavailable"
                    message={formatSystemStatusText(historyQuery.error)}
                  />
                ) : historyRows.length === 0 ? (
                  <StatePanel
                    tone="empty"
                    title="No Regime History"
                    message="No regime history is available for this model yet."
                  />
                ) : (
                  <Table className="min-w-[820px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>As Of</TableHead>
                        <TableHead>Effective</TableHead>
                        <TableHead>Primary Regime</TableHead>
                        <TableHead>Signals</TableHead>
                        <TableHead>Rule</TableHead>
                        <TableHead>Transition</TableHead>
                        <TableHead className="text-right">Halt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyRows.map((row, index) => {
                        const transition = didPrimaryRegimeChange(row, index, historyRows);
                        return (
                          <TableRow
                            key={`${row.model_name}-${row.model_version}-${row.as_of_date}`}
                          >
                            <TableCell>{formatDate(row.as_of_date)}</TableCell>
                            <TableCell>{formatDate(row.effective_from_date)}</TableCell>
                            <TableCell>
                              <Badge variant={regimeTone(row)}>
                                {formatTitleLabel(getPrimaryRegimeCode(row))}
                              </Badge>
                            </TableCell>
                            <TableCell>{getActiveSignals(row).length}</TableCell>
                            <TableCell>{getMatchedRule(row)}</TableCell>
                            <TableCell>
                              <Badge variant={transition ? 'secondary' : 'outline'}>
                                {transition ? 'Transition' : 'Continuation'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={row.halt_flag ? 'destructive' : 'outline'}>
                                {row.halt_flag ? 'Halt' : 'Clear'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="mcm-panel">
              <CardHeader className="border-b border-border/40">
                <CardTitle className="text-lg">Model Revisions</CardTitle>
                <CardDescription>
                  Activate the revision that should drive current gold regime outputs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-6">
                {selectedModelDetailQuery.isLoading ? (
                  <PageLoader
                    text="Loading revisions..."
                    variant="panel"
                    className="min-h-[10rem]"
                  />
                ) : selectedModelDetailQuery.data?.revisions?.length ? (
                  selectedModelDetailQuery.data.revisions.map((revision) => (
                    <div
                      key={`${revision.name}-${revision.version}`}
                      className="rounded-2xl border-2 border-mcm-walnut/25 bg-background/35 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-display text-xl">v{revision.version}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Published {formatTimestamp(revision.published_at)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Activated {formatTimestamp(revision.activated_at)}
                          </div>
                        </div>
                        {revision.version === activeVersion ? (
                          <Badge variant="secondary">Active</Badge>
                        ) : null}
                      </div>
                      <Button
                        className="mt-4 w-full"
                        variant="outline"
                        size="sm"
                        disabled={activateMutation.isPending || revision.version === activeVersion}
                        onClick={() =>
                          activateMutation.mutate({
                            modelName: selectedModelName,
                            version: revision.version
                          })
                        }
                      >
                        Activate
                      </Button>
                    </div>
                  ))
                ) : (
                  <StatePanel
                    tone="empty"
                    title="No Revisions Found"
                    message="No revisions found for this model."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="mcm-panel">
              <CardHeader className="border-b border-border/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <SlidersHorizontal className="h-5 w-5 text-mcm-olive" />
                      Model Admin
                    </CardTitle>
                    <CardDescription>
                      Stage new revisions away from the monitoring flow.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={isModelAdminOpen}
                    onClick={() => setIsModelAdminOpen((current) => !current)}
                  >
                    {isModelAdminOpen ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </CardHeader>
              {isModelAdminOpen ? (
                <CardContent className="space-y-4 pt-6">
                  <div className="grid gap-2">
                    <Label htmlFor="regime-create-name">Name</Label>
                    <Input
                      id="regime-create-name"
                      value={createDraft.name}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="e.g. default-regime"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="regime-create-description">Description</Label>
                    <Input
                      id="regime-create-description"
                      value={createDraft.description}
                      onChange={(event) =>
                        setCreateDraft((current) => ({
                          ...current,
                          description: event.target.value
                        }))
                      }
                      placeholder="Short description"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="regime-create-config">Config JSON</Label>
                    <Textarea
                      id="regime-create-config"
                      value={createDraft.configJson}
                      onChange={(event) => {
                        setConfigJsonError(null);
                        setCreateDraft((current) => ({
                          ...current,
                          configJson: event.target.value
                        }));
                      }}
                      rows={12}
                      className="font-mono text-xs"
                    />
                  </div>
                  {configJsonError ? (
                    <StatePanel
                      tone="error"
                      title="Invalid Config JSON"
                      message={configJsonError}
                      className="rounded-2xl p-4"
                    />
                  ) : null}
                  <Button
                    className="w-full"
                    disabled={createMutation.isPending || !createDraft.name.trim()}
                    onClick={submitCreateModel}
                  >
                    {createMutation.isPending ? 'Saving...' : 'Save Model Revision'}
                  </Button>
                </CardContent>
              ) : (
                <CardContent className="pt-6">
                  <StatePanel
                    tone="info"
                    title="Admin Collapsed"
                    message="Open only when staging a new model revision. Activation controls remain visible above."
                    className="rounded-2xl p-4"
                  />
                </CardContent>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
