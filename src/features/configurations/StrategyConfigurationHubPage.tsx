import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/app/components/ui/card';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { cn } from '@/app/components/ui/utils';
import { RankingConfigPage } from '@/features/rankings/RankingConfigPage';
import {
  buildDefaultRiskPolicy,
  buildExitRule,
  EXIT_RULE_OPTIONS,
  getNextRuleId,
  getRuleValueLabel,
  INTRABAR_OPTIONS,
  PRICE_FIELD_OPTIONS,
  toOptionalNumber
} from '@/features/strategies/lib/strategyDraft';
import { UniverseConfigPage } from '@/features/universes/UniverseConfigPage';
import { exitRuleSetApi } from '@/services/exitRuleSetApi';
import { rebalancePolicyApi } from '@/services/rebalancePolicyApi';
import { regimePolicyApi } from '@/services/regimePolicyApi';
import { riskPolicyApi } from '@/services/riskPolicyApi';
import type {
  ExitRule,
  ExitRulePriceField,
  ExitRuleSetConfig,
  ExitRuleSetDetail,
  ExitRuleSetSummary,
  ExitRuleType,
  IntrabarConflictPolicy,
  RebalancePolicy,
  RebalancePolicyDetail,
  RegimePolicyConfigDetail,
  RiskPolicyConfigDetail,
  StrategyRiskPolicy,
  StrategyRiskStopLossAction,
  StrategyRiskStopLossBasis,
  StrategyRiskTakeProfitAction,
  StrategyRiskTakeProfitBasis
} from '@/types/strategy';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

const CONFIG_TABS = [
  'universe',
  'ranking',
  'rebalance-policy',
  'regime-policy',
  'risk-policy',
  'exit-rules'
] as const;
type ConfigTab = (typeof CONFIG_TABS)[number];

const TAB_LABELS: Record<ConfigTab, string> = {
  universe: 'Universe',
  ranking: 'Ranking',
  'rebalance-policy': 'Rebalance Policy',
  'regime-policy': 'Regime Policy',
  'risk-policy': 'Risk Policy',
  'exit-rules': 'Exit Rules'
};

const DEFAULT_EXIT_RULE_SET: ExitRuleSetConfig = {
  intrabarConflictPolicy: 'stop_first',
  exits: []
};

const DEFAULT_REBALANCE_POLICY: RebalancePolicy = {
  frequency: 'every_bar',
  executionTiming: 'next_bar_open',
  cadence: 'monthly',
  dayRule: 'last_trading_day',
  anchor: 'next_open',
  tradeDelayBars: 0,
  driftThresholdBps: null,
  maxTurnoverPerRebalance: null,
  intervalBars: null,
  driftThresholdPct: null,
  minTradeNotional: 0,
  cashBufferPct: 0,
  maxTurnoverPct: null,
  allowPartialRebalance: true,
  closeRemovedPositions: true
};

const STOP_LOSS_BASIS_OPTIONS: Array<{ value: StrategyRiskStopLossBasis; label: string }> = [
  { value: 'strategy_nav_drawdown', label: 'Strategy NAV Drawdown' },
  { value: 'sleeve_nav_drawdown', label: 'Sleeve NAV Drawdown' }
];

const STOP_LOSS_ACTION_OPTIONS: Array<{ value: StrategyRiskStopLossAction; label: string }> = [
  { value: 'reduce_exposure', label: 'Reduce Exposure' },
  { value: 'liquidate', label: 'Liquidate' },
  { value: 'freeze_buys', label: 'Freeze Buys' }
];

const TAKE_PROFIT_BASIS_OPTIONS: Array<{ value: StrategyRiskTakeProfitBasis; label: string }> = [
  { value: 'strategy_nav_gain', label: 'Strategy NAV Gain' },
  { value: 'sleeve_nav_gain', label: 'Sleeve NAV Gain' }
];

const TAKE_PROFIT_ACTION_OPTIONS: Array<{ value: StrategyRiskTakeProfitAction; label: string }> = [
  { value: 'reduce_exposure', label: 'Reduce Exposure' },
  { value: 'rebalance_to_target', label: 'Rebalance To Target' }
];

function isConfigTab(value: string | null): value is ConfigTab {
  return CONFIG_TABS.includes(value as ConfigTab);
}

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return 'Never updated';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function normalizeNumber(value: string): number | null {
  const parsed = toOptionalNumber(value);
  return parsed === undefined ? null : parsed;
}

function validateName(name: string): string | null {
  return name.trim() ? null : 'Name is required.';
}

function validateRiskPolicy(policy: StrategyRiskPolicy): string | null {
  const ratioChecks: Array<[string, number | null | undefined]> = [
    ['stop-loss threshold', policy.stopLoss?.thresholdPct],
    ['stop-loss reduction', policy.stopLoss?.reductionPct],
    ['take-profit threshold', policy.takeProfit?.thresholdPct],
    ['take-profit reduction', policy.takeProfit?.reductionPct]
  ];

  for (const [label, value] of ratioChecks) {
    if (value === null || value === undefined) {
      continue;
    }
    if (value < 0 || value > 1) {
      return `${label} must be entered as a ratio between 0 and 1.`;
    }
  }

  if (!Number.isInteger(policy.reentry.cooldownBars) || policy.reentry.cooldownBars < 0) {
    return 'Reentry cooldown bars must be a nonnegative integer.';
  }

  return null;
}

function validateExitRuleSet(config: ExitRuleSetConfig): string | null {
  const ids = new Set<string>();
  for (const rule of config.exits) {
    const id = String(rule.id || '').trim();
    if (!id) {
      return 'Every exit rule needs an id.';
    }
    if (ids.has(id)) {
      return `Exit rule id '${id}' is duplicated.`;
    }
    if (rule.type === 'rank_decay' && (!rule.rankThreshold || rule.rankThreshold < 1)) {
      return 'Rank decay exits require a positive rank threshold.';
    }
    ids.add(id);
  }
  return null;
}

function LibraryList<
  T extends {
    name: string;
    description?: string;
    version: number;
    archived?: boolean;
    updatedAt?: string | null;
  }
>({
  title,
  items,
  selectedName,
  isLoading,
  error,
  emptyTitle,
  emptyMessage,
  onCreate,
  onSelect
}: {
  title: string;
  items: T[];
  selectedName: string | null;
  isLoading: boolean;
  error: unknown;
  emptyTitle: string;
  emptyMessage: string;
  onCreate: () => void;
  onSelect: (name: string) => void;
}) {
  const errorMessage = formatSystemStatusText(error);

  return (
    <Card className="mcm-panel border border-border/60 bg-card shadow-sm">
      <CardHeader className="border-b border-border/60">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <CardDescription>Versioned definitions available for strategy pins.</CardDescription>
        </div>
        <CardAction>
          <Button type="button" variant="outline" size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {isLoading ? (
          <PageLoader text={`Loading ${title.toLowerCase()}...`} variant="panel" />
        ) : errorMessage ? (
          <StatePanel tone="error" title={`${title} Unavailable`} message={errorMessage} />
        ) : items.length === 0 ? (
          <StatePanel tone="empty" title={emptyTitle} message={emptyMessage} />
        ) : (
          items.map((item) => {
            const selected = selectedName === item.name;
            return (
              <button
                key={item.name}
                type="button"
                className={cn(
                  'w-full rounded-xl border px-4 py-4 text-left transition-colors',
                  selected
                    ? 'border-primary/40 bg-accent/30 shadow-sm'
                    : 'border-border/60 bg-background hover:bg-muted/25'
                )}
                onClick={() => onSelect(item.name)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="truncate font-mono text-sm font-semibold text-foreground">
                      {item.name}
                    </div>
                    <div className="text-sm leading-5 text-muted-foreground">
                      {item.description || 'No description provided.'}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={selected ? 'default' : 'outline'}>v{item.version}</Badge>
                    {item.archived ? <Badge variant="secondary">Archived</Badge> : null}
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Updated {formatTimestamp(item.updatedAt)}
                </div>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function RegimePolicyPanel() {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<RegimePolicyConfigDetail>({
    policy: { name: '', description: '', version: 1 },
    activeRevision: {
      name: '',
      version: 1,
      description: '',
      config: { modelName: 'default-regime', modelVersion: 1, mode: 'observe_only' }
    },
    revisions: []
  });

  const listQuery = useQuery({
    queryKey: ['regime-policies'],
    queryFn: ({ signal }) => regimePolicyApi.listRegimePolicies(signal)
  });
  const detailQuery = useQuery({
    queryKey: ['regime-policies', 'detail', selectedName],
    queryFn: ({ signal }) => regimePolicyApi.getRegimePolicyDetail(String(selectedName), signal),
    enabled: Boolean(selectedName)
  });

  useEffect(() => {
    if (!selectedName && listQuery.data?.length) {
      setSelectedName(listQuery.data[0].name);
    }
  }, [listQuery.data, selectedName]);

  useEffect(() => {
    if (detailQuery.data) {
      setDraft(detailQuery.data);
    }
  }, [detailQuery.data]);

  const createDraft = () => {
    setSelectedName(null);
    setDraft({
      policy: { name: '', description: '', version: 1 },
      activeRevision: {
        name: '',
        version: 1,
        description: '',
        config: { modelName: 'default-regime', modelVersion: 1, mode: 'observe_only' }
      },
      revisions: []
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const nameError = validateName(draft.policy.name);
      if (nameError) {
        throw new Error(nameError);
      }
      const config = draft.activeRevision?.config;
      if (!config?.modelName?.trim()) {
        throw new Error('Regime model name is required.');
      }
      if (!config.modelVersion || config.modelVersion < 1) {
        throw new Error('Regime model version must be a positive integer.');
      }

      return regimePolicyApi.saveRegimePolicy({
        name: draft.policy.name.trim(),
        description: draft.policy.description || '',
        config: {
          modelName: config.modelName.trim(),
          modelVersion: config.modelVersion,
          mode: 'observe_only'
        }
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['regime-policies'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      setSelectedName(draft.policy.name.trim());
      setDraft((current) => ({
        ...current,
        policy: { ...current.policy, version: result.version }
      }));
      toast.success(`Regime policy ${draft.policy.name} saved`);
    },
    onError: (error) =>
      toast.error(`Failed to save regime policy: ${formatSystemStatusText(error)}`)
  });

  const archiveMutation = useMutation({
    mutationFn: (name: string) => regimePolicyApi.archiveRegimePolicy(name),
    onSuccess: async (_, name) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['regime-policies'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      setSelectedName(null);
      createDraft();
      toast.success(`Regime policy ${name} archived`);
    },
    onError: (error) =>
      toast.error(`Failed to archive regime policy: ${formatSystemStatusText(error)}`)
  });

  const config = draft.activeRevision?.config || {
    modelName: 'default-regime',
    modelVersion: 1,
    mode: 'observe_only' as const
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <LibraryList
        title="Regime Policy Library"
        items={listQuery.data || []}
        selectedName={selectedName}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        emptyTitle="No Regime Policies"
        emptyMessage="Create a policy that pins a regime model revision in observe-only mode."
        onCreate={createDraft}
        onSelect={setSelectedName}
      />

      <Card className="mcm-panel border border-border/60 bg-card shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div>
            <CardTitle className="text-lg font-semibold">Regime Policy Editor</CardTitle>
            <CardDescription>
              Reference a published regime model revision. Mode is observe-only for this release.
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="outline">v{draft.policy.version || 1}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {detailQuery.isLoading && selectedName ? (
            <PageLoader text="Loading regime policy..." variant="panel" />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="regime-policy-name">Policy Name</Label>
                  <Input
                    id="regime-policy-name"
                    readOnly={Boolean(selectedName)}
                    value={draft.policy.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        policy: { ...current.policy, name: event.target.value }
                      }))
                    }
                    placeholder="e.g. observe-default-regime"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="regime-policy-description">Description</Label>
                  <Input
                    id="regime-policy-description"
                    value={draft.policy.description || ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        policy: { ...current.policy, description: event.target.value }
                      }))
                    }
                    placeholder="Describe when this policy should be used."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                <div className="grid gap-2">
                  <Label htmlFor="regime-policy-model">Regime Model</Label>
                  <Input
                    id="regime-policy-model"
                    value={config.modelName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        activeRevision: {
                          ...(current.activeRevision || { name: current.policy.name, version: 1 }),
                          config: { ...config, modelName: event.target.value }
                        }
                      }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="regime-policy-model-version">Model Version</Label>
                  <Input
                    id="regime-policy-model-version"
                    type="number"
                    min={1}
                    value={config.modelVersion ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        activeRevision: {
                          ...(current.activeRevision || { name: current.policy.name, version: 1 }),
                          config: { ...config, modelVersion: normalizeNumber(event.target.value) }
                        }
                      }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="regime-policy-mode">Mode</Label>
                  <Select value="observe_only">
                    <SelectTrigger id="regime-policy-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="observe_only">Observe Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-3 border-t border-border/60 pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectedName && archiveMutation.mutate(selectedName)}
                  disabled={!selectedName || archiveMutation.isPending}
                >
                  <Archive className="h-4 w-4" />
                  {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
                </Button>
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Saving...' : 'Save Regime Policy'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RebalancePolicyPanel() {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<RebalancePolicyDetail>({
    policy: { name: '', description: '', version: 1 },
    activeRevision: {
      name: '',
      version: 1,
      description: '',
      config: DEFAULT_REBALANCE_POLICY
    },
    revisions: []
  });

  const listQuery = useQuery({
    queryKey: ['rebalance-policies'],
    queryFn: ({ signal }) => rebalancePolicyApi.listRebalancePolicies(signal)
  });
  const detailQuery = useQuery({
    queryKey: ['rebalance-policies', 'detail', selectedName],
    queryFn: ({ signal }) =>
      rebalancePolicyApi.getRebalancePolicyDetail(String(selectedName), signal),
    enabled: Boolean(selectedName)
  });

  useEffect(() => {
    if (!selectedName && listQuery.data?.length) {
      setSelectedName(listQuery.data[0].name);
    }
  }, [listQuery.data, selectedName]);

  useEffect(() => {
    if (detailQuery.data) {
      setDraft(detailQuery.data);
    }
  }, [detailQuery.data]);

  const createDraft = () => {
    setSelectedName(null);
    setDraft({
      policy: { name: '', description: '', version: 1 },
      activeRevision: {
        name: '',
        version: 1,
        description: '',
        config: DEFAULT_REBALANCE_POLICY
      },
      revisions: []
    });
  };

  const config = draft.activeRevision?.config || DEFAULT_REBALANCE_POLICY;
  const setConfig = (patch: Partial<RebalancePolicy>) => {
    setDraft((current) => ({
      ...current,
      activeRevision: {
        ...(current.activeRevision || { name: current.policy.name, version: 1, description: '' }),
        config: {
          ...DEFAULT_REBALANCE_POLICY,
          ...config,
          ...patch
        }
      }
    }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const nameError = validateName(draft.policy.name);
      if (nameError) {
        throw new Error(nameError);
      }
      if (!config.cadence || !config.dayRule || !config.anchor) {
        throw new Error('Cadence, day rule, and anchor are required.');
      }
      if (config.maxTurnoverPerRebalance !== null && config.maxTurnoverPerRebalance !== undefined) {
        if (config.maxTurnoverPerRebalance < 0 || config.maxTurnoverPerRebalance > 1) {
          throw new Error('Max turnover per rebalance must be a ratio between 0 and 1.');
        }
      }

      return rebalancePolicyApi.saveRebalancePolicy({
        name: draft.policy.name.trim(),
        description: draft.policy.description || '',
        config: {
          ...DEFAULT_REBALANCE_POLICY,
          ...config
        }
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rebalance-policies'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      setSelectedName(draft.policy.name.trim());
      setDraft((current) => ({
        ...current,
        policy: { ...current.policy, version: result.version }
      }));
      toast.success(`Rebalance policy ${draft.policy.name} saved`);
    },
    onError: (error) =>
      toast.error(`Failed to save rebalance policy: ${formatSystemStatusText(error)}`)
  });

  const archiveMutation = useMutation({
    mutationFn: (name: string) => rebalancePolicyApi.archiveRebalancePolicy(name),
    onSuccess: async (_, name) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rebalance-policies'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      setSelectedName(null);
      createDraft();
      toast.success(`Rebalance policy ${name} archived`);
    },
    onError: (error) =>
      toast.error(`Failed to archive rebalance policy: ${formatSystemStatusText(error)}`)
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <LibraryList
        title="Rebalance Policy Library"
        items={listQuery.data || []}
        selectedName={selectedName}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        emptyTitle="No Rebalance Policies"
        emptyMessage="Create reusable monthly or quarterly rebalance policies for backtest grids."
        onCreate={createDraft}
        onSelect={setSelectedName}
      />

      <Card className="mcm-panel border border-border/60 bg-card shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div>
            <CardTitle className="text-lg font-semibold">Rebalance Policy Editor</CardTitle>
            <CardDescription>
              Define reusable calendar cadence, signal anchor, execution delay, drift, and turnover
              controls.
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="outline">v{draft.policy.version || 1}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {detailQuery.isLoading && selectedName ? (
            <PageLoader text="Loading rebalance policy..." variant="panel" />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="rebalance-policy-name">Policy Name</Label>
                  <Input
                    id="rebalance-policy-name"
                    readOnly={Boolean(selectedName)}
                    value={draft.policy.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        policy: { ...current.policy, name: event.target.value }
                      }))
                    }
                    placeholder="e.g. monthly_last_trading_day"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rebalance-policy-description">Description</Label>
                  <Input
                    id="rebalance-policy-description"
                    value={draft.policy.description || ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        policy: { ...current.policy, description: event.target.value }
                      }))
                    }
                    placeholder="Describe the rebalance use case."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="rebalance-policy-cadence">Cadence</Label>
                  <Select
                    value={config.cadence || 'monthly'}
                    onValueChange={(value) =>
                      setConfig({ cadence: value as RebalancePolicy['cadence'] })
                    }
                  >
                    <SelectTrigger id="rebalance-policy-cadence">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rebalance-policy-day-rule">Day Rule</Label>
                  <Select
                    value={config.dayRule || 'last_trading_day'}
                    onValueChange={(value) =>
                      setConfig({ dayRule: value as RebalancePolicy['dayRule'] })
                    }
                  >
                    <SelectTrigger id="rebalance-policy-day-rule">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_trading_day">First Trading Day</SelectItem>
                      <SelectItem value="last_trading_day">Last Trading Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rebalance-policy-anchor">Anchor</Label>
                  <Select
                    value={config.anchor || 'next_open'}
                    onValueChange={(value) =>
                      setConfig({ anchor: value as RebalancePolicy['anchor'] })
                    }
                  >
                    <SelectTrigger id="rebalance-policy-anchor">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="close">Close Signal</SelectItem>
                      <SelectItem value="next_open">Next Open</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="rebalance-policy-delay">Trade Delay Bars</Label>
                  <Input
                    id="rebalance-policy-delay"
                    type="number"
                    min={0}
                    value={config.tradeDelayBars ?? 0}
                    onChange={(event) =>
                      setConfig({ tradeDelayBars: normalizeNumber(event.target.value) ?? 0 })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rebalance-policy-drift">Drift Threshold Bps</Label>
                  <Input
                    id="rebalance-policy-drift"
                    type="number"
                    min={0}
                    value={config.driftThresholdBps ?? ''}
                    onChange={(event) =>
                      setConfig({ driftThresholdBps: normalizeNumber(event.target.value) })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rebalance-policy-turnover">Max Turnover</Label>
                  <Input
                    id="rebalance-policy-turnover"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={config.maxTurnoverPerRebalance ?? ''}
                    onChange={(event) =>
                      setConfig({ maxTurnoverPerRebalance: normalizeNumber(event.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-3 border-t border-border/60 pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectedName && archiveMutation.mutate(selectedName)}
                  disabled={!selectedName || archiveMutation.isPending}
                >
                  <Archive className="h-4 w-4" />
                  {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
                </Button>
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Saving...' : 'Save Rebalance Policy'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RiskPolicyPanel() {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<RiskPolicyConfigDetail>({
    policy: { name: '', description: '', version: 1 },
    activeRevision: {
      name: '',
      version: 1,
      description: '',
      config: { policy: buildDefaultRiskPolicy() }
    },
    revisions: []
  });

  const listQuery = useQuery({
    queryKey: ['risk-policies'],
    queryFn: ({ signal }) => riskPolicyApi.listRiskPolicies(signal)
  });
  const detailQuery = useQuery({
    queryKey: ['risk-policies', 'detail', selectedName],
    queryFn: ({ signal }) => riskPolicyApi.getRiskPolicyDetail(String(selectedName), signal),
    enabled: Boolean(selectedName)
  });

  useEffect(() => {
    if (!selectedName && listQuery.data?.length) {
      setSelectedName(listQuery.data[0].name);
    }
  }, [listQuery.data, selectedName]);

  useEffect(() => {
    if (detailQuery.data) {
      setDraft(detailQuery.data);
    }
  }, [detailQuery.data]);

  const createDraft = () => {
    setSelectedName(null);
    setDraft({
      policy: { name: '', description: '', version: 1 },
      activeRevision: {
        name: '',
        version: 1,
        description: '',
        config: { policy: buildDefaultRiskPolicy() }
      },
      revisions: []
    });
  };

  const policy = draft.activeRevision?.config.policy || buildDefaultRiskPolicy();
  const stopLoss = policy.stopLoss || buildDefaultRiskPolicy().stopLoss;
  const takeProfit = policy.takeProfit || buildDefaultRiskPolicy().takeProfit;

  const updatePolicy = (updater: (current: StrategyRiskPolicy) => StrategyRiskPolicy) => {
    setDraft((current) => ({
      ...current,
      activeRevision: {
        ...(current.activeRevision || { name: current.policy.name, version: 1 }),
        config: {
          policy: updater(current.activeRevision?.config.policy || buildDefaultRiskPolicy())
        }
      }
    }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const nameError = validateName(draft.policy.name);
      if (nameError) {
        throw new Error(nameError);
      }
      const validationError = validateRiskPolicy(policy);
      if (validationError) {
        throw new Error(validationError);
      }

      return riskPolicyApi.saveRiskPolicy({
        name: draft.policy.name.trim(),
        description: draft.policy.description || '',
        config: { policy }
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['risk-policies'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      setSelectedName(draft.policy.name.trim());
      setDraft((current) => ({
        ...current,
        policy: { ...current.policy, version: result.version }
      }));
      toast.success(`Risk policy ${draft.policy.name} saved`);
    },
    onError: (error) => toast.error(`Failed to save risk policy: ${formatSystemStatusText(error)}`)
  });

  const archiveMutation = useMutation({
    mutationFn: (name: string) => riskPolicyApi.archiveRiskPolicy(name),
    onSuccess: async (_, name) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['risk-policies'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      createDraft();
      toast.success(`Risk policy ${name} archived`);
    },
    onError: (error) =>
      toast.error(`Failed to archive risk policy: ${formatSystemStatusText(error)}`)
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <LibraryList
        title="Risk Policy Library"
        items={listQuery.data || []}
        selectedName={selectedName}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        emptyTitle="No Risk Policies"
        emptyMessage="Create a reusable policy for gross, concentration, turnover, and liquidity limits."
        onCreate={createDraft}
        onSelect={setSelectedName}
      />

      <Card className="mcm-panel border border-border/60 bg-card shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div>
            <CardTitle className="text-lg font-semibold">Risk Policy Editor</CardTitle>
            <CardDescription>
              Publish reusable StrategyRiskPolicy payloads that strategies pin by version.
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="outline">v{draft.policy.version || 1}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {detailQuery.isLoading && selectedName ? (
            <PageLoader text="Loading risk policy..." variant="panel" />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="risk-policy-name">Policy Name</Label>
                  <Input
                    id="risk-policy-name"
                    readOnly={Boolean(selectedName)}
                    value={draft.policy.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        policy: { ...current.policy, name: event.target.value }
                      }))
                    }
                    placeholder="e.g. balanced-risk"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="risk-policy-description">Description</Label>
                  <Input
                    id="risk-policy-description"
                    value={draft.policy.description || ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        policy: { ...current.policy, description: event.target.value }
                      }))
                    }
                    placeholder="Describe limit intent and desk use."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                  <Checkbox
                    checked={policy.enabled}
                    onCheckedChange={(checked) =>
                      updatePolicy((current) => ({ ...current, enabled: Boolean(checked) }))
                    }
                  />
                  <span>Enabled</span>
                </label>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="risk-policy-scope">Scope</Label>
                  <Select
                    value={policy.scope}
                    onValueChange={(value) =>
                      updatePolicy((current) => ({
                        ...current,
                        scope: value as StrategyRiskPolicy['scope']
                      }))
                    }
                  >
                    <SelectTrigger id="risk-policy-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strategy">Strategy</SelectItem>
                      <SelectItem value="sleeve">Sleeve</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {stopLoss ? (
                <div className="rounded-lg border border-border/60 bg-background p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Stop Loss</h3>
                      <p className="text-xs text-muted-foreground">
                        Drawdown guardrail applied at the selected policy scope.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={stopLoss.enabled}
                        onCheckedChange={(checked) =>
                          updatePolicy((current) => ({
                            ...current,
                            stopLoss: {
                              ...(current.stopLoss || stopLoss),
                              enabled: Boolean(checked)
                            }
                          }))
                        }
                      />
                      <span>Enabled</span>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="grid gap-2 xl:col-span-2">
                      <Label htmlFor="risk-policy-stop-id">Rule Id</Label>
                      <Input
                        id="risk-policy-stop-id"
                        value={stopLoss.id}
                        onChange={(event) =>
                          updatePolicy((current) => ({
                            ...current,
                            stopLoss: {
                              ...(current.stopLoss || stopLoss),
                              id: event.target.value
                            }
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="risk-policy-stop-basis">Basis</Label>
                      <Select
                        value={stopLoss.basis}
                        onValueChange={(value) =>
                          updatePolicy((current) => ({
                            ...current,
                            stopLoss: {
                              ...(current.stopLoss || stopLoss),
                              basis: value as StrategyRiskStopLossBasis
                            }
                          }))
                        }
                      >
                        <SelectTrigger id="risk-policy-stop-basis">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STOP_LOSS_BASIS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="risk-policy-stop-threshold">Threshold</Label>
                      <Input
                        id="risk-policy-stop-threshold"
                        type="number"
                        min={0}
                        max={1}
                        step="0.01"
                        value={String(stopLoss.thresholdPct)}
                        onChange={(event) =>
                          updatePolicy((current) => ({
                            ...current,
                            stopLoss: {
                              ...(current.stopLoss || stopLoss),
                              thresholdPct: normalizeNumber(event.target.value) ?? 0
                            }
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="risk-policy-stop-action">Action</Label>
                      <Select
                        value={stopLoss.action}
                        onValueChange={(value) =>
                          updatePolicy((current) => ({
                            ...current,
                            stopLoss: {
                              ...(current.stopLoss || stopLoss),
                              action: value as StrategyRiskStopLossAction
                            }
                          }))
                        }
                      >
                        <SelectTrigger id="risk-policy-stop-action">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STOP_LOSS_ACTION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="risk-policy-stop-reduction">Reduction</Label>
                      <Input
                        id="risk-policy-stop-reduction"
                        type="number"
                        min={0}
                        max={1}
                        step="0.01"
                        value={
                          typeof stopLoss.reductionPct === 'number'
                            ? String(stopLoss.reductionPct)
                            : ''
                        }
                        onChange={(event) =>
                          updatePolicy((current) => ({
                            ...current,
                            stopLoss: {
                              ...(current.stopLoss || stopLoss),
                              reductionPct: normalizeNumber(event.target.value)
                            }
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {takeProfit ? (
                <div className="rounded-lg border border-border/60 bg-background p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Take Profit</h3>
                      <p className="text-xs text-muted-foreground">
                        Gain guardrail applied at the selected policy scope.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={takeProfit.enabled}
                        onCheckedChange={(checked) =>
                          updatePolicy((current) => ({
                            ...current,
                            takeProfit: {
                              ...(current.takeProfit || takeProfit),
                              enabled: Boolean(checked)
                            }
                          }))
                        }
                      />
                      <span>Enabled</span>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="grid gap-2 xl:col-span-2">
                      <Label htmlFor="risk-policy-profit-id">Rule Id</Label>
                      <Input
                        id="risk-policy-profit-id"
                        value={takeProfit.id}
                        onChange={(event) =>
                          updatePolicy((current) => ({
                            ...current,
                            takeProfit: {
                              ...(current.takeProfit || takeProfit),
                              id: event.target.value
                            }
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="risk-policy-profit-basis">Basis</Label>
                      <Select
                        value={takeProfit.basis}
                        onValueChange={(value) =>
                          updatePolicy((current) => ({
                            ...current,
                            takeProfit: {
                              ...(current.takeProfit || takeProfit),
                              basis: value as StrategyRiskTakeProfitBasis
                            }
                          }))
                        }
                      >
                        <SelectTrigger id="risk-policy-profit-basis">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TAKE_PROFIT_BASIS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="risk-policy-profit-threshold">Threshold</Label>
                      <Input
                        id="risk-policy-profit-threshold"
                        type="number"
                        min={0}
                        max={1}
                        step="0.01"
                        value={String(takeProfit.thresholdPct)}
                        onChange={(event) =>
                          updatePolicy((current) => ({
                            ...current,
                            takeProfit: {
                              ...(current.takeProfit || takeProfit),
                              thresholdPct: normalizeNumber(event.target.value) ?? 0
                            }
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="risk-policy-profit-action">Action</Label>
                      <Select
                        value={takeProfit.action}
                        onValueChange={(value) =>
                          updatePolicy((current) => ({
                            ...current,
                            takeProfit: {
                              ...(current.takeProfit || takeProfit),
                              action: value as StrategyRiskTakeProfitAction
                            }
                          }))
                        }
                      >
                        <SelectTrigger id="risk-policy-profit-action">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TAKE_PROFIT_ACTION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="risk-policy-profit-reduction">Reduction</Label>
                      <Input
                        id="risk-policy-profit-reduction"
                        type="number"
                        min={0}
                        max={1}
                        step="0.01"
                        value={
                          typeof takeProfit.reductionPct === 'number'
                            ? String(takeProfit.reductionPct)
                            : ''
                        }
                        onChange={(event) =>
                          updatePolicy((current) => ({
                            ...current,
                            takeProfit: {
                              ...(current.takeProfit || takeProfit),
                              reductionPct: normalizeNumber(event.target.value)
                            }
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 rounded-lg border border-border/60 bg-background p-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="risk-policy-cooldown">Reentry Cooldown Bars</Label>
                  <Input
                    id="risk-policy-cooldown"
                    type="number"
                    min={0}
                    step={1}
                    value={String(policy.reentry.cooldownBars)}
                    onChange={(event) =>
                      updatePolicy((current) => ({
                        ...current,
                        reentry: {
                          ...current.reentry,
                          cooldownBars: normalizeNumber(event.target.value) ?? 0
                        }
                      }))
                    }
                  />
                </div>
                <label className="flex items-center gap-3 self-end rounded-lg border border-border/60 bg-card px-3 py-2 text-sm">
                  <Checkbox
                    checked={policy.reentry.requireApproval}
                    onCheckedChange={(checked) =>
                      updatePolicy((current) => ({
                        ...current,
                        reentry: {
                          ...current.reentry,
                          requireApproval: Boolean(checked)
                        }
                      }))
                    }
                  />
                  <span>Require Approval For Reentry</span>
                </label>
              </div>

              <div className="flex flex-wrap justify-between gap-3 border-t border-border/60 pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectedName && archiveMutation.mutate(selectedName)}
                  disabled={!selectedName || archiveMutation.isPending}
                >
                  <Archive className="h-4 w-4" />
                  {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
                </Button>
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Saving...' : 'Save Risk Policy'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExitRuleSetPanel() {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [newRuleType, setNewRuleType] = useState<ExitRuleType>('stop_loss_fixed');
  const [draft, setDraft] = useState<ExitRuleSetDetail>({
    ruleSet: { name: '', description: '', version: 1, ruleCount: 0 },
    activeRevision: {
      name: '',
      version: 1,
      description: '',
      config: DEFAULT_EXIT_RULE_SET
    },
    revisions: []
  });

  const listQuery = useQuery({
    queryKey: ['exit-rule-sets'],
    queryFn: ({ signal }) => exitRuleSetApi.listExitRuleSets(signal)
  });
  const detailQuery = useQuery({
    queryKey: ['exit-rule-sets', 'detail', selectedName],
    queryFn: ({ signal }) => exitRuleSetApi.getExitRuleSetDetail(String(selectedName), signal),
    enabled: Boolean(selectedName)
  });

  useEffect(() => {
    if (!selectedName && listQuery.data?.length) {
      setSelectedName(listQuery.data[0].name);
    }
  }, [listQuery.data, selectedName]);

  useEffect(() => {
    if (detailQuery.data) {
      setDraft(detailQuery.data);
    }
  }, [detailQuery.data]);

  const createDraft = () => {
    setSelectedName(null);
    setDraft({
      ruleSet: { name: '', description: '', version: 1, ruleCount: 0 },
      activeRevision: {
        name: '',
        version: 1,
        description: '',
        config: DEFAULT_EXIT_RULE_SET
      },
      revisions: []
    });
  };

  const config = draft.activeRevision?.config || DEFAULT_EXIT_RULE_SET;
  const setConfig = (nextConfig: ExitRuleSetConfig) => {
    setDraft((current) => ({
      ...current,
      activeRevision: {
        ...(current.activeRevision || { name: current.ruleSet.name, version: 1 }),
        config: nextConfig
      },
      ruleSet: { ...current.ruleSet, ruleCount: nextConfig.exits.length }
    }));
  };

  const updateRule = (index: number, nextRule: ExitRule) => {
    const nextRules = config.exits.slice();
    nextRules[index] = nextRule;
    setConfig({ ...config, exits: nextRules });
  };

  const moveRule = (index: number, offset: -1 | 1) => {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= config.exits.length) {
      return;
    }
    const nextRules = config.exits.slice();
    const [rule] = nextRules.splice(index, 1);
    nextRules.splice(targetIndex, 0, rule);
    setConfig({
      ...config,
      exits: nextRules.map((item, priority) => ({ ...item, priority }))
    });
  };

  const addRule = () => {
    const id = getNextRuleId(newRuleType, config.exits);
    setConfig({
      ...config,
      exits: [...config.exits, buildExitRule(newRuleType, id, { priority: config.exits.length })]
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const nameError = validateName(draft.ruleSet.name);
      if (nameError) {
        throw new Error(nameError);
      }
      const validationError = validateExitRuleSet(config);
      if (validationError) {
        throw new Error(validationError);
      }

      return exitRuleSetApi.saveExitRuleSet({
        name: draft.ruleSet.name.trim(),
        description: draft.ruleSet.description || '',
        config: {
          intrabarConflictPolicy: config.intrabarConflictPolicy,
          exits: config.exits.map((rule, priority) => ({ ...rule, priority }))
        }
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exit-rule-sets'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      setSelectedName(draft.ruleSet.name.trim());
      setDraft((current) => ({
        ...current,
        ruleSet: { ...current.ruleSet, version: result.version }
      }));
      toast.success(`Exit rule set ${draft.ruleSet.name} saved`);
    },
    onError: (error) =>
      toast.error(`Failed to save exit rule set: ${formatSystemStatusText(error)}`)
  });

  const archiveMutation = useMutation({
    mutationFn: (name: string) => exitRuleSetApi.archiveExitRuleSet(name),
    onSuccess: async (_, name) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exit-rule-sets'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      createDraft();
      toast.success(`Exit rule set ${name} archived`);
    },
    onError: (error) =>
      toast.error(`Failed to archive exit rule set: ${formatSystemStatusText(error)}`)
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <LibraryList<ExitRuleSetSummary>
        title="Exit Rule Set Library"
        items={listQuery.data || []}
        selectedName={selectedName}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        emptyTitle="No Exit Rule Sets"
        emptyMessage="Create an ordered set of reusable exit rules for strategy pins."
        onCreate={createDraft}
        onSelect={setSelectedName}
      />

      <Card className="mcm-panel border border-border/60 bg-card shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div>
            <CardTitle className="text-lg font-semibold">Exit Rule Set Editor</CardTitle>
            <CardDescription>
              Maintain ordered exit rules and their intrabar conflict policy as one pinned object.
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="outline">v{draft.ruleSet.version || 1}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {detailQuery.isLoading && selectedName ? (
            <PageLoader text="Loading exit rule set..." variant="panel" />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="exit-rule-set-name">Rule Set Name</Label>
                  <Input
                    id="exit-rule-set-name"
                    readOnly={Boolean(selectedName)}
                    value={draft.ruleSet.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        ruleSet: { ...current.ruleSet, name: event.target.value }
                      }))
                    }
                    placeholder="e.g. standard-exits"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="exit-rule-set-description">Description</Label>
                  <Input
                    id="exit-rule-set-description"
                    value={draft.ruleSet.description || ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        ruleSet: { ...current.ruleSet, description: event.target.value }
                      }))
                    }
                    placeholder="Describe rule ordering and intent."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
                <div className="grid gap-2">
                  <Label htmlFor="exit-rule-set-conflict">Intrabar Conflict Policy</Label>
                  <Select
                    value={config.intrabarConflictPolicy}
                    onValueChange={(value) =>
                      setConfig({
                        ...config,
                        intrabarConflictPolicy: value as IntrabarConflictPolicy
                      })
                    }
                  >
                    <SelectTrigger id="exit-rule-set-conflict">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTRABAR_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end justify-end gap-2">
                  <Select
                    value={newRuleType}
                    onValueChange={(value) => setNewRuleType(value as ExitRuleType)}
                  >
                    <SelectTrigger className="min-w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXIT_RULE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={addRule}>
                    <Plus className="h-4 w-4" />
                    Add Rule
                  </Button>
                </div>
              </div>

              {config.exits.length === 0 ? (
                <StatePanel
                  tone="empty"
                  title="No Exit Rules"
                  message="Add a rule before attaching this set to a strategy."
                />
              ) : (
                <div className="space-y-4">
                  {config.exits.map((rule, index) => {
                    const ruleType = rule.type;
                    return (
                      <div
                        key={`${rule.id}-${index}`}
                        className="space-y-4 rounded-xl border border-border/60 bg-background p-4"
                      >
                        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-type-${index}`}>Rule Type</Label>
                            <Select
                              value={ruleType}
                              onValueChange={(value) =>
                                updateRule(
                                  index,
                                  buildExitRule(value as ExitRuleType, rule.id, {
                                    priority: rule.priority,
                                    minHoldBars: rule.minHoldBars
                                  })
                                )
                              }
                            >
                              <SelectTrigger id={`exit-rule-type-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXIT_RULE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-id-${index}`}>Rule ID</Label>
                            <Input
                              id={`exit-rule-id-${index}`}
                              value={rule.id}
                              onChange={(event) =>
                                updateRule(index, { ...rule, id: event.target.value })
                              }
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => moveRule(index, -1)}
                              disabled={index === 0}
                              aria-label={`Move exit rule ${index + 1} up`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => moveRule(index, 1)}
                              disabled={index === config.exits.length - 1}
                              aria-label={`Move exit rule ${index + 1} down`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                setConfig({
                                  ...config,
                                  exits: config.exits.filter((_, ruleIndex) => ruleIndex !== index)
                                })
                              }
                              aria-label={`Remove exit rule ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-priority-${index}`}>Priority</Label>
                            <Input
                              id={`exit-rule-priority-${index}`}
                              type="number"
                              value={rule.priority ?? index}
                              onChange={(event) =>
                                updateRule(index, {
                                  ...rule,
                                  priority: normalizeNumber(event.target.value) ?? index
                                })
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-min-hold-${index}`}>Min Hold Bars</Label>
                            <Input
                              id={`exit-rule-min-hold-${index}`}
                              type="number"
                              min={0}
                              value={rule.minHoldBars ?? 0}
                              onChange={(event) =>
                                updateRule(index, {
                                  ...rule,
                                  minHoldBars: normalizeNumber(event.target.value) ?? 0
                                })
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-price-field-${index}`}>Price Field</Label>
                            <Select
                              value={rule.priceField || 'close'}
                              disabled={ruleType === 'rank_decay'}
                              onValueChange={(value) =>
                                updateRule(index, {
                                  ...rule,
                                  priceField: value as ExitRulePriceField
                                })
                              }
                            >
                              <SelectTrigger id={`exit-rule-price-field-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRICE_FIELD_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-value-${index}`}>
                              {getRuleValueLabel(ruleType)}
                            </Label>
                            <Input
                              id={`exit-rule-value-${index}`}
                              type="number"
                              step={
                                ruleType === 'time_stop' || ruleType === 'rank_decay' ? 1 : 0.01
                              }
                              value={
                                ruleType === 'rank_decay'
                                  ? typeof rule.rankThreshold === 'number'
                                    ? String(rule.rankThreshold)
                                    : ''
                                  : typeof rule.value === 'number'
                                    ? String(rule.value)
                                    : ''
                              }
                              onChange={(event) =>
                                updateRule(
                                  index,
                                  ruleType === 'rank_decay'
                                    ? {
                                        ...rule,
                                        rankThreshold:
                                          normalizeNumber(event.target.value) ?? undefined,
                                        value: undefined
                                      }
                                    : {
                                        ...rule,
                                        value: normalizeNumber(event.target.value) ?? undefined
                                      }
                                )
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-atr-${index}`}>ATR Column</Label>
                            <Input
                              id={`exit-rule-atr-${index}`}
                              value={rule.atrColumn || ''}
                              onChange={(event) =>
                                updateRule(index, {
                                  ...rule,
                                  atrColumn: event.target.value || undefined
                                })
                              }
                              disabled={ruleType !== 'trailing_stop_atr'}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap justify-between gap-3 border-t border-border/60 pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectedName && archiveMutation.mutate(selectedName)}
                  disabled={!selectedName || archiveMutation.isPending}
                >
                  <Archive className="h-4 w-4" />
                  {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
                </Button>
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? 'Saving...' : 'Save Exit Rule Set'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function StrategyConfigurationHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: ConfigTab = isConfigTab(requestedTab) ? requestedTab : 'universe';

  const handleTabChange = (value: string) => {
    if (!isConfigTab(value)) {
      return;
    }
    setSearchParams(
      (current) => {
        const nextParams = new URLSearchParams(current);
        nextParams.set('tab', value);
        return nextParams;
      },
      { replace: true }
    );
  };

  const tabMetrics = useMemo(
    () => [
      {
        label: 'Assembly Model',
        value: 'Pinned',
        detail: 'Strategies reference exact config revisions.'
      },
      {
        label: 'Runtime Snapshots',
        value: 'Immutable',
        detail: 'Resolved strategy revisions remain executable after library edits.'
      },
      {
        label: 'Persistence',
        value: 'Control Plane',
        detail: 'The UI saves through APIs; Postgres remains server-owned.'
      }
    ],
    []
  );

  return (
    <div className="page-shell space-y-6">
      <PageHero
        kicker="Strategy Setup"
        title="Configuration Library"
        subtitle="Maintain reusable universe, ranking, rebalance, regime, risk, and exit definitions as versioned library objects. Strategies pin exact revisions and only move when explicitly repinned."
        actions={
          <Button asChild variant="outline">
            <Link to="/strategies">
              <ExternalLink className="h-4 w-4" />
              Strategy Workspace
            </Link>
          </Button>
        }
        metrics={tabMetrics}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-5">
        <div className="overflow-x-auto">
          <TabsList className="h-11 w-max rounded-xl">
            {CONFIG_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="px-4">
                {TAB_LABELS[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="universe">
          <UniverseConfigPage embedded />
        </TabsContent>
        <TabsContent value="ranking">
          <RankingConfigPage embedded />
        </TabsContent>
        <TabsContent value="rebalance-policy">
          <RebalancePolicyPanel />
        </TabsContent>
        <TabsContent value="regime-policy">
          <RegimePolicyPanel />
        </TabsContent>
        <TabsContent value="risk-policy">
          <RiskPolicyPanel />
        </TabsContent>
        <TabsContent value="exit-rules">
          <ExitRuleSetPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
