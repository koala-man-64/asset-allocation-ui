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
import { Textarea } from '@/app/components/ui/textarea';
import { cn } from '@/app/components/ui/utils';
import { RankingConfigPage } from '@/features/rankings/RankingConfigPage';
import {
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
  RegimePolicyConfigDetail,
  RiskPolicyConfigDetail
} from '@/types/strategy';
import type { StrategyRiskPolicy } from '@/types/strategyAnalytics';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

const CONFIG_TABS = ['universe', 'ranking', 'regime-policy', 'risk-policy', 'exit-rules'] as const;
type ConfigTab = (typeof CONFIG_TABS)[number];

const TAB_LABELS: Record<ConfigTab, string> = {
  universe: 'Universe',
  ranking: 'Ranking',
  'regime-policy': 'Regime Policy',
  'risk-policy': 'Risk Policy',
  'exit-rules': 'Exit Rules'
};

const DEFAULT_RISK_POLICY: StrategyRiskPolicy = {
  grossExposureLimit: null,
  netExposureLimit: null,
  singleNameMaxWeight: null,
  sectorMaxWeight: null,
  turnoverBudget: null,
  maxDrawdownLimit: null,
  liquidityParticipationRate: null,
  maxTradeNotionalBaseCcy: null,
  notes: ''
};

const DEFAULT_EXIT_RULE_SET: ExitRuleSetConfig = {
  intrabarConflictPolicy: 'stop_first',
  exits: []
};

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
  const nonNegativeFields: Array<keyof StrategyRiskPolicy> = [
    'grossExposureLimit',
    'netExposureLimit',
    'singleNameMaxWeight',
    'sectorMaxWeight',
    'turnoverBudget',
    'maxDrawdownLimit',
    'liquidityParticipationRate',
    'maxTradeNotionalBaseCcy'
  ];

  for (const key of nonNegativeFields) {
    const value = policy[key];
    if (typeof value === 'number' && value < 0) {
      return `${key} must be nonnegative.`;
    }
  }

  const ratioFields: Array<keyof StrategyRiskPolicy> = [
    'singleNameMaxWeight',
    'sectorMaxWeight',
    'maxDrawdownLimit',
    'liquidityParticipationRate'
  ];
  for (const key of ratioFields) {
    const value = policy[key];
    if (typeof value === 'number' && value > 1) {
      return `${key} must be entered as a ratio between 0 and 1.`;
    }
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
    ids.add(id);
  }
  return null;
}

function LibraryList<T extends { name: string; description?: string; version: number; archived?: boolean; updatedAt?: string | null }>({
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
    onError: (error) => toast.error(`Failed to save regime policy: ${formatSystemStatusText(error)}`)
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
    onError: (error) => toast.error(`Failed to archive regime policy: ${formatSystemStatusText(error)}`)
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
            <CardDescription>Reference a published regime model revision. Mode is observe-only for this release.</CardDescription>
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

function RiskPolicyPanel() {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<RiskPolicyConfigDetail>({
    policy: { name: '', description: '', version: 1 },
    activeRevision: {
      name: '',
      version: 1,
      description: '',
      config: { policy: DEFAULT_RISK_POLICY }
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
        config: { policy: DEFAULT_RISK_POLICY }
      },
      revisions: []
    });
  };

  const policy = draft.activeRevision?.config.policy || DEFAULT_RISK_POLICY;
  const setPolicyField = (key: keyof StrategyRiskPolicy, value: string | number | null) => {
    setDraft((current) => ({
      ...current,
      activeRevision: {
        ...(current.activeRevision || { name: current.policy.name, version: 1 }),
        config: {
          policy: {
            ...policy,
            [key]: value
          }
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
        config: { policy: { ...policy, notes: policy.notes || '' } }
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
    onError: (error) => toast.error(`Failed to archive risk policy: ${formatSystemStatusText(error)}`)
  });

  const riskFields: Array<{ key: keyof StrategyRiskPolicy; label: string; step: string }> = [
    { key: 'grossExposureLimit', label: 'Gross Exposure Limit', step: '0.01' },
    { key: 'netExposureLimit', label: 'Net Exposure Limit', step: '0.01' },
    { key: 'singleNameMaxWeight', label: 'Single Name Max Weight', step: '0.01' },
    { key: 'sectorMaxWeight', label: 'Sector Max Weight', step: '0.01' },
    { key: 'turnoverBudget', label: 'Turnover Budget', step: '0.01' },
    { key: 'maxDrawdownLimit', label: 'Max Drawdown Limit', step: '0.01' },
    { key: 'liquidityParticipationRate', label: 'Liquidity Participation Rate', step: '0.01' },
    { key: 'maxTradeNotionalBaseCcy', label: 'Max Trade Notional', step: '1' }
  ];

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
            <CardDescription>Publish reusable StrategyRiskPolicy payloads that strategies pin by version.</CardDescription>
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

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {riskFields.map((field) => (
                  <div key={field.key} className="grid gap-2">
                    <Label htmlFor={`risk-policy-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`risk-policy-${field.key}`}
                      type="number"
                      min={0}
                      step={field.step}
                      value={typeof policy[field.key] === 'number' ? String(policy[field.key]) : ''}
                      onChange={(event) => setPolicyField(field.key, normalizeNumber(event.target.value))}
                    />
                  </div>
                ))}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="risk-policy-notes">Notes</Label>
                <Textarea
                  id="risk-policy-notes"
                  value={policy.notes || ''}
                  onChange={(event) => setPolicyField('notes', event.target.value)}
                  placeholder="Record limit rationale, review cadence, or known desk exceptions."
                />
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
    onError: (error) => toast.error(`Failed to save exit rule set: ${formatSystemStatusText(error)}`)
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
    onError: (error) => toast.error(`Failed to archive exit rule set: ${formatSystemStatusText(error)}`)
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
            <CardDescription>Maintain ordered exit rules and their intrabar conflict policy as one pinned object.</CardDescription>
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
                <StatePanel tone="empty" title="No Exit Rules" message="Add a rule before attaching this set to a strategy." />
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
                              onChange={(event) => updateRule(index, { ...rule, id: event.target.value })}
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
                            <Label htmlFor={`exit-rule-value-${index}`}>{getRuleValueLabel(ruleType)}</Label>
                            <Input
                              id={`exit-rule-value-${index}`}
                              type="number"
                              step={ruleType === 'time_stop' ? 1 : 0.01}
                              value={typeof rule.value === 'number' ? String(rule.value) : ''}
                              onChange={(event) =>
                                updateRule(index, { ...rule, value: normalizeNumber(event.target.value) ?? undefined })
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-atr-${index}`}>ATR Column</Label>
                            <Input
                              id={`exit-rule-atr-${index}`}
                              value={rule.atrColumn || ''}
                              onChange={(event) =>
                                updateRule(index, { ...rule, atrColumn: event.target.value || undefined })
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
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', value);
    setSearchParams(nextParams, { replace: true });
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
        subtitle="Maintain reusable universe, ranking, regime, risk, and exit definitions as versioned library objects. Strategies pin exact revisions and only move when explicitly repinned."
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
