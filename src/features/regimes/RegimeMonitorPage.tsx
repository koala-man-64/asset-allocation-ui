import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Gauge, Layers3, Sparkles } from 'lucide-react';

import { PageLoader } from '@/app/components/common/PageLoader';
import { PageHero } from '@/app/components/common/PageHero';
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
import type { RegimeSnapshot } from '@/types/regime';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import { toast } from 'sonner';

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

function getPrimaryRegimeCode(snapshot?: RegimeSnapshot | null): string | null {
  return snapshot?.active_regimes[0] ?? null;
}

function getActiveSignals(snapshot?: RegimeSnapshot | null) {
  return (snapshot?.signals ?? []).filter((signal) => signal.is_active);
}

function getMatchedRule(snapshot?: RegimeSnapshot | null): string {
  return (
    getActiveSignals(snapshot)
      .map((signal) => signal.matched_rule_id)
      .find(Boolean) ?? 'n/a'
  );
}

function regimeTone(
  snapshot?: RegimeSnapshot | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!snapshot) return 'outline';
  const primaryRegime = getPrimaryRegimeCode(snapshot);
  if (snapshot.halt_flag || primaryRegime === 'high_volatility' || primaryRegime === 'liquidity_stress') {
    return 'destructive';
  }
  if (!snapshot.active_regimes.length || primaryRegime === 'unclassified') return 'secondary';
  return 'default';
}

export function RegimeMonitorPage() {
  const queryClient = useQueryClient();
  const [selectedModelName, setSelectedModelName] = useState('default-regime');
  const [createDraft, setCreateDraft] = useState({
    name: '',
    description: '',
    configJson: DEFAULT_MODEL_CONFIG_JSON
  });

  const modelsQuery = useQuery({
    queryKey: ['regimes', 'models'],
    queryFn: () => regimeApi.listModels()
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
    enabled: Boolean(selectedModelName)
  });

  const currentQuery = useQuery({
    queryKey: ['regimes', 'current', selectedModelName],
    queryFn: () => regimeApi.getCurrent({ modelName: selectedModelName }),
    enabled: Boolean(selectedModelName)
  });

  const historyQuery = useQuery({
    queryKey: ['regimes', 'history', selectedModelName],
    queryFn: () => regimeApi.getHistory({ modelName: selectedModelName, limit: 24 }),
    enabled: Boolean(selectedModelName)
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const config = JSON.parse(createDraft.configJson);
      return regimeApi.createModel({
        name: createDraft.name.trim(),
        description: createDraft.description.trim(),
        config
      });
    },
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ['regimes'] });
      setSelectedModelName(payload.model.name);
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
  const activationThreshold = selectedModelDetailQuery.data?.activeRevision?.config.activationThreshold;
  const latestRevisionVersion = useMemo(() => {
    const revisions = selectedModelDetailQuery.data?.revisions || [];
    return revisions.length ? revisions[0].version : undefined;
  }, [selectedModelDetailQuery.data?.revisions]);
  const currentRegimeLabel = currentSnapshot
    ? formatLabel(getPrimaryRegimeCode(currentSnapshot))
    : 'Unavailable';

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
        subtitle="Track the active gold regime model, inspect live signal activations and halt posture, and activate new model revisions without leaving the control plane."
        actions={
          <div className="w-full max-w-sm rounded-2xl border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
            <Label htmlFor="regime-model-selector">Selected Model</Label>
            <select
              id="regime-model-selector"
              value={selectedModelName}
              onChange={(event) => setSelectedModelName(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            >
              {modelOptions.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Active v{activeVersion ?? 'n/a'}</Badge>
              <Badge variant="outline">Latest v{latestRevisionVersion ?? 'n/a'}</Badge>
            </div>
          </div>
        }
        metrics={[
          {
            label: 'Current Regime',
            value: currentRegimeLabel,
            detail: currentSnapshot
              ? `${getActiveSignals(currentSnapshot).length} active signals in the current snapshot.`
              : 'No current snapshot is available.'
          },
          {
            label: 'Active Version',
            value: activeVersion ? `v${activeVersion}` : 'n/a',
            detail: 'Revision currently driving gold outputs.'
          },
          {
            label: 'Latest Version',
            value: latestRevisionVersion ? `v${latestRevisionVersion}` : 'n/a',
            detail: 'Newest saved revision for the selected model.'
          }
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="mcm-panel">
              <CardHeader className="border-b border-border/40">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-mcm-olive" />
                  Current Regime
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-6">
                {currentQuery.isLoading ? (
                  <PageLoader text="Loading regime..." variant="panel" className="min-h-[8rem]" />
                ) : currentSnapshot ? (
                  <>
                    <Badge variant={regimeTone(currentSnapshot)} className="capitalize">
                      {formatLabel(getPrimaryRegimeCode(currentSnapshot))}
                    </Badge>
                    <div className="space-y-1 text-sm">
                      <div>
                        Active regimes:{' '}
                        <span className="font-medium capitalize">
                          {currentSnapshot.active_regimes.length
                            ? currentSnapshot.active_regimes.map((code) => formatLabel(code)).join(', ')
                            : 'Unclassified'}
                        </span>
                      </div>
                      <div>
                        As Of:{' '}
                        <span className="font-medium">
                          {formatDate(currentSnapshot.as_of_date)}
                        </span>
                      </div>
                      <div>
                        Effective:{' '}
                        <span className="font-medium">
                          {formatDate(currentSnapshot.effective_from_date)}
                        </span>
                      </div>
                      <div>
                        Active signals:{' '}
                        <span className="font-medium">{getActiveSignals(currentSnapshot).length}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <StatePanel
                    tone="empty"
                    title="No Regime Snapshot"
                    message="No regime snapshot is available yet for this model."
                    className="rounded-xl p-4"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="mcm-panel">
              <CardHeader className="border-b border-border/40">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Gauge className="h-5 w-5 text-mcm-rust" />
                  Signal Deck
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 pt-6 text-sm">
                {currentSnapshot?.signals.length ? (
                  currentSnapshot.signals
                    .slice()
                    .sort((left, right) => Number(right.is_active) - Number(left.is_active) || right.score - left.score)
                    .slice(0, 5)
                    .map((signal) => (
                      <div
                        key={`${signal.regime_code}-${signal.display_name}`}
                        className="rounded-[1.2rem] border border-mcm-walnut/18 bg-mcm-paper/85 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{signal.display_name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatLabel(signal.regime_code)}
                            </div>
                          </div>
                          <Badge variant={signal.is_active ? 'default' : 'outline'}>
                            {signal.is_active ? 'Active' : signal.signal_state}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Score {formatMetric(signal.score)} vs threshold {formatMetric(signal.activation_threshold)}
                        </div>
                      </div>
                    ))
                ) : (
                  <StatePanel
                    tone="empty"
                    title="No signal evidence"
                    message="The current snapshot does not include any regime signal rows."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="mcm-panel">
              <CardHeader className="border-b border-border/40">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="h-5 w-5 text-mcm-mustard" />
                  Halt Overlay
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-6 text-sm">
                <Badge variant={currentSnapshot?.halt_flag ? 'destructive' : 'outline'}>
                  {currentSnapshot?.halt_flag ? 'Halt Active' : 'No Halt'}
                </Badge>
                <div>
                  Reason:{' '}
                  <span className="font-medium">{currentSnapshot?.halt_reason || 'n/a'}</span>
                </div>
                <div>
                  Activation Threshold:{' '}
                  <span className="font-medium">{formatMetric(activationThreshold)}</span>
                </div>
                <div>
                  Matched Rule:{' '}
                  <span className="font-medium">{getMatchedRule(currentSnapshot)}</span>
                </div>
                <div>
                  Computed:{' '}
                  <span className="font-medium">
                    {formatTimestamp(currentSnapshot?.computed_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mcm-panel">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers3 className="h-5 w-5 text-mcm-teal" />
                History
              </CardTitle>
              <CardDescription>
                Recent active-regime snapshots for the selected model.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {historyQuery.isLoading ? (
                <PageLoader text="Loading history..." variant="panel" className="min-h-[10rem]" />
              ) : historyRows.length === 0 ? (
                <StatePanel
                  tone="empty"
                  title="No Regime History"
                  message="No regime history is available for this model yet."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>As Of</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Active Regimes</TableHead>
                      <TableHead>Signals</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead className="text-right">Halt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.map((row) => (
                      <TableRow key={`${row.model_name}-${row.model_version}-${row.as_of_date}`}>
                        <TableCell>{formatDate(row.as_of_date)}</TableCell>
                        <TableCell>{formatDate(row.effective_from_date)}</TableCell>
                        <TableCell className="capitalize">
                          {row.active_regimes.length
                            ? row.active_regimes.map((code) => formatLabel(code)).join(', ')
                            : 'Unclassified'}
                        </TableCell>
                        <TableCell>{getActiveSignals(row).length}</TableCell>
                        <TableCell>{getMatchedRule(row)}</TableCell>
                        <TableCell className="text-right">{row.halt_flag ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="mcm-panel">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-lg">Create Model Revision</CardTitle>
              <CardDescription>
                Publish a new named regime model revision. Activation is separate so the monitor can
                stage changes first.
              </CardDescription>
            </CardHeader>
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
                    setCreateDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Short description"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="regime-create-config">Config JSON</Label>
                <Textarea
                  id="regime-create-config"
                  value={createDraft.configJson}
                  onChange={(event) =>
                    setCreateDraft((current) => ({ ...current, configJson: event.target.value }))
                  }
                  rows={14}
                  className="font-mono text-xs"
                />
              </div>
              <Button
                className="w-full"
                disabled={createMutation.isPending || !createDraft.name.trim()}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Saving…' : 'Save Model Revision'}
              </Button>
            </CardContent>
          </Card>

          <Card className="mcm-panel">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-lg">Model Revisions</CardTitle>
              <CardDescription>
                Activate the revision that should drive the current gold regime outputs.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {selectedModelDetailQuery.isLoading ? (
                <PageLoader text="Loading revisions..." variant="panel" className="min-h-[10rem]" />
              ) : selectedModelDetailQuery.data?.revisions?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>Activated</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedModelDetailQuery.data.revisions.map((revision) => (
                      <TableRow key={`${revision.name}-${revision.version}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">v{revision.version}</span>
                            {revision.version === activeVersion && (
                              <Badge variant="secondary">Active</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatTimestamp(revision.published_at)}</TableCell>
                        <TableCell>{formatTimestamp(revision.activated_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              activateMutation.isPending || revision.version === activeVersion
                            }
                            onClick={() =>
                              activateMutation.mutate({
                                modelName: selectedModelName,
                                version: revision.version
                              })
                            }
                          >
                            Activate
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <StatePanel
                  tone="empty"
                  title="No Revisions Found"
                  message="No revisions found for this model."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
