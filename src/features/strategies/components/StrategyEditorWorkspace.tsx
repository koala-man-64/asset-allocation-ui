import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyPlus, ExternalLink, RefreshCw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageLoader } from '@/app/components/common/PageLoader';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/app/components/ui/alert-dialog';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import { exitRuleSetApi } from '@/services/exitRuleSetApi';
import { rankingApi } from '@/services/rankingApi';
import { rebalancePolicyApi } from '@/services/rebalancePolicyApi';
import { regimePolicyApi } from '@/services/regimePolicyApi';
import { riskPolicyApi } from '@/services/riskPolicyApi';
import { strategyApi } from '@/services/strategyApi';
import { universeApi } from '@/services/universeApi';
import type {
  ExitRuleSetSummary,
  RankingSchemaSummary,
  RebalancePolicySummary,
  RegimePolicyConfigSummary,
  RiskPolicyConfigSummary,
  StrategyDetail,
  StrategyComponentRefs,
  UniverseConfigSummary
} from '@/types/strategy';
import {
  buildEmptyStrategy,
  buildStrategyDraft,
  normalizeStrategyComponentRefs,
  type StrategyEditorMode
} from '@/features/strategies/lib/strategyDraft';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

interface StrategyEditorWorkspaceProps {
  mode: StrategyEditorMode;
  sourceStrategyName?: string | null;
  strategy?: StrategyDetail | null;
  isHydrating: boolean;
  errorMessage: string;
  onCancel: () => void;
  onSaved: (strategy: StrategyDetail) => void;
}

type ConfigSummary =
  | UniverseConfigSummary
  | RankingSchemaSummary
  | RebalancePolicySummary
  | RegimePolicyConfigSummary
  | RiskPolicyConfigSummary
  | ExitRuleSetSummary;

const NO_SELECTION = '__none__';

const SECTION_IDS = ['metadata', 'assembly', 'execution'] as const;
const SECTION_LABELS: Record<(typeof SECTION_IDS)[number], string> = {
  metadata: 'Desk Identity',
  assembly: 'Pinned Assembly',
  execution: 'Execution Shape'
};

function getEditorTitle(mode: StrategyEditorMode): string {
  if (mode === 'create') {
    return 'New Strategy';
  }
  if (mode === 'duplicate') {
    return 'Duplicate Strategy';
  }
  return 'Edit Strategy';
}

function getEditorDescription(mode: StrategyEditorMode, sourceStrategyName?: string | null): string {
  if (mode === 'create') {
    return 'Author a new strategy record by pinning reusable configuration revisions.';
  }
  if (mode === 'duplicate') {
    return `Seed a new strategy from ${sourceStrategyName || 'the selected record'} while requiring a new name before save.`;
  }
  return `Repin ${sourceStrategyName || 'the selected strategy'} to exact configuration revisions. Saving creates a new strategy revision.`;
}

function getLatestVersion(items: ConfigSummary[] | undefined, name?: string | null): number | null {
  if (!name) {
    return null;
  }
  return items?.find((item) => item.name === name)?.version ?? null;
}

function formatVersion(version?: number | null): string {
  return typeof version === 'number' && Number.isFinite(version) ? `v${version}` : 'Unpinned';
}

function getPinnedRef(refs: StrategyComponentRefs | null | undefined, key: keyof StrategyComponentRefs) {
  return refs?.[key] || null;
}

function VersionPinSelector({
  label,
  tab,
  items,
  selectedName,
  selectedVersion,
  isLoading,
  error,
  onNameChange,
  onVersionChange,
  onRepinLatest
}: {
  label: string;
  tab: string;
  items: ConfigSummary[];
  selectedName?: string | null;
  selectedVersion?: number | null;
  isLoading: boolean;
  error: unknown;
  onNameChange: (name: string | undefined) => void;
  onVersionChange: (version: number | undefined) => void;
  onRepinLatest: () => void;
}) {
  const latestVersion = getLatestVersion(items, selectedName);
  const stale = Boolean(selectedName && selectedVersion && latestVersion && selectedVersion < latestVersion);
  const errorMessage = formatSystemStatusText(error);

  return (
    <div className="rounded-[1.4rem] border border-mcm-walnut/25 bg-mcm-cream/65 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-base text-foreground">{label}</h4>
            <Badge variant={selectedName ? 'secondary' : 'outline'}>
              {selectedName ? formatVersion(selectedVersion) : 'No pin'}
            </Badge>
            {stale ? <Badge variant="destructive">Stale</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest available revision: {latestVersion ? `v${latestVersion}` : 'not available'}.
          </p>
        </div>
        <Button asChild type="button" variant="ghost" size="sm">
          <Link to={`/strategy-configurations?tab=${tab}`}>
            <ExternalLink className="h-4 w-4" />
            Open Library
          </Link>
        </Button>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-end">
        <div className="grid gap-2">
          <Label>{label} Name</Label>
          <Select
            value={selectedName || NO_SELECTION}
            disabled={isLoading || Boolean(errorMessage)}
            onValueChange={(value) => onNameChange(value === NO_SELECTION ? undefined : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoading ? 'Loading configs...' : `Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECTION}>No {label.toLowerCase()}</SelectItem>
              {items.map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.name} v{item.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>{label} Version</Label>
          <Input
            type="number"
            min={1}
            value={selectedVersion ?? ''}
            disabled={!selectedName}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              onVersionChange(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
            }}
          />
        </div>

        <Button
          type="button"
          variant={stale ? 'secondary' : 'outline'}
          disabled={!selectedName || !latestVersion || selectedVersion === latestVersion}
          onClick={onRepinLatest}
        >
          <RefreshCw className="h-4 w-4" />
          Repin Latest
        </Button>
      </div>
    </div>
  );
}

export function StrategyEditorWorkspace({
  mode,
  sourceStrategyName,
  strategy,
  isHydrating,
  errorMessage,
  onCancel,
  onSaved
}: StrategyEditorWorkspaceProps) {
  const queryClient = useQueryClient();
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const baselineRef = useRef<StrategyDetail>(buildEmptyStrategy());

  const rankingSchemasQuery = useQuery({
    queryKey: ['ranking-schemas'],
    queryFn: ({ signal }) => rankingApi.listRankingSchemas(signal)
  });
  const universeConfigsQuery = useQuery({
    queryKey: ['universe-configs'],
    queryFn: ({ signal }) => universeApi.listUniverseConfigs(signal)
  });
  const regimePoliciesQuery = useQuery({
    queryKey: ['regime-policies'],
    queryFn: ({ signal }) => regimePolicyApi.listRegimePolicies(signal)
  });
  const riskPoliciesQuery = useQuery({
    queryKey: ['risk-policies'],
    queryFn: ({ signal }) => riskPolicyApi.listRiskPolicies(signal)
  });
  const rebalancePoliciesQuery = useQuery({
    queryKey: ['rebalance-policies'],
    queryFn: ({ signal }) => rebalancePolicyApi.listRebalancePolicies(signal)
  });
  const exitRuleSetsQuery = useQuery({
    queryKey: ['exit-rule-sets'],
    queryFn: ({ signal }) => exitRuleSetApi.listExitRuleSets(signal)
  });

  const {
    formState: { errors, isDirty },
    getValues,
    handleSubmit,
    register,
    reset,
    setValue,
    watch
  } = useForm<StrategyDetail>({
    defaultValues: buildEmptyStrategy()
  });

  useEffect(() => {
    if (mode !== 'create' && !strategy) {
      return;
    }
    const nextDraft = buildStrategyDraft(mode, strategy);
    baselineRef.current = nextDraft;
    reset(nextDraft);
  }, [mode, reset, strategy]);

  const saveMutation = useMutation({
    mutationFn: (payload: StrategyDetail) => strategyApi.saveStrategy(payload),
    onSuccess: async (_, savedStrategy) => {
      queryClient.setQueryData(['strategies', 'detail', savedStrategy.name], savedStrategy);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategies'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies', 'detail', savedStrategy.name] })
      ]);
      toast.success(`Strategy ${mode === 'edit' ? 'updated' : 'saved'} in Postgres`);
      baselineRef.current = savedStrategy;
      reset(savedStrategy);
      onSaved(savedStrategy);
    },
    onError: (error) => {
      toast.error(`Failed to save strategy: ${formatSystemStatusText(error)}`);
    }
  });

  const watchedType = watch('type');
  const watchedRebalance = watch('config.rebalance');
  const watchedComponentRefs = watch('config.componentRefs');
  const watchedLongOnly = watch('config.longOnly');
  const draftName = watch('name');

  const watchedUniverseRef = getPinnedRef(watchedComponentRefs, 'universe');
  const watchedRankingRef = getPinnedRef(watchedComponentRefs, 'ranking');
  const watchedRebalanceRef = getPinnedRef(watchedComponentRefs, 'rebalance');
  const watchedRegimeRef = getPinnedRef(watchedComponentRefs, 'regimePolicy');
  const watchedRiskRef = getPinnedRef(watchedComponentRefs, 'riskPolicy');
  const watchedExitRef = getPinnedRef(watchedComponentRefs, 'exitPolicy');
  const watchedUniverseName = watchedUniverseRef?.name ?? watch('config.universeConfigName');
  const watchedUniverseVersion = watchedUniverseRef?.version ?? watch('config.universeConfigVersion');
  const watchedRankingName = watchedRankingRef?.name ?? watch('config.rankingSchemaName');
  const watchedRankingVersion = watchedRankingRef?.version ?? watch('config.rankingSchemaVersion');
  const watchedRebalanceName = watchedRebalanceRef?.name ?? null;
  const watchedRebalanceVersion = watchedRebalanceRef?.version ?? null;
  const watchedRegimeName = watchedRegimeRef?.name ?? watch('config.regimePolicyConfigName');
  const watchedRegimeVersion = watchedRegimeRef?.version ?? watch('config.regimePolicyConfigVersion');
  const watchedRiskName = watchedRiskRef?.name ?? watch('config.riskPolicyName');
  const watchedRiskVersion = watchedRiskRef?.version ?? watch('config.riskPolicyVersion');
  const watchedExitName = watchedExitRef?.name ?? watch('config.exitRuleSetName');
  const watchedExitVersion = watchedExitRef?.version ?? watch('config.exitRuleSetVersion');

  const headerBadge = useMemo(() => {
    if (mode === 'create') {
      return 'Blank draft';
    }
    if (mode === 'duplicate') {
      return 'Duplicate as new';
    }
    return 'Saved record';
  }, [mode]);

  const setComponentRef = (
    key: keyof StrategyComponentRefs,
    name: string | undefined,
    version: number | null | undefined
  ) => {
    const currentRefs = getValues('config.componentRefs') || {};
    setValue(
      'config.componentRefs',
      {
        ...currentRefs,
        [key]: name && version ? { name, version } : undefined
      },
      { shouldDirty: true, shouldTouch: true }
    );
  };

  const setUniversePin = (name: string | undefined) => {
    const version = getLatestVersion(universeConfigsQuery.data, name);
    setComponentRef('universe', name, version);
    setValue('config.universeConfigName', name, { shouldDirty: true, shouldTouch: true });
    setValue('config.universeConfigVersion', version ?? undefined, {
      shouldDirty: true,
      shouldTouch: true
    });
  };

  const setRankingPin = (name: string | undefined) => {
    const version = getLatestVersion(rankingSchemasQuery.data, name);
    setComponentRef('ranking', name, version);
    setValue('config.rankingSchemaName', name, { shouldDirty: true, shouldTouch: true });
    setValue('config.rankingSchemaVersion', version ?? undefined, {
      shouldDirty: true,
      shouldTouch: true
    });
  };

  const setRegimePin = (name: string | undefined) => {
    const version = getLatestVersion(regimePoliciesQuery.data, name);
    setComponentRef('regimePolicy', name, version);
    setValue('config.regimePolicyConfigName', name, { shouldDirty: true, shouldTouch: true });
    setValue('config.regimePolicyConfigVersion', version ?? undefined, {
      shouldDirty: true,
      shouldTouch: true
    });
    setValue('config.regimePolicy', undefined, { shouldDirty: true, shouldTouch: true });
  };

  const setRiskPin = (name: string | undefined) => {
    const version = getLatestVersion(riskPoliciesQuery.data, name);
    setComponentRef('riskPolicy', name, version);
    setValue('config.riskPolicyName', name, { shouldDirty: true, shouldTouch: true });
    setValue('config.riskPolicyVersion', version ?? undefined, {
      shouldDirty: true,
      shouldTouch: true
    });
    setValue('config.riskPolicy', undefined, { shouldDirty: true, shouldTouch: true });
    setValue('config.strategyRiskPolicy', undefined, { shouldDirty: true, shouldTouch: true });
  };

  const setExitPin = (name: string | undefined) => {
    const version = getLatestVersion(exitRuleSetsQuery.data, name);
    setComponentRef('exitPolicy', name, version);
    setValue('config.exitRuleSetName', name, { shouldDirty: true, shouldTouch: true });
    setValue('config.exitRuleSetVersion', version ?? undefined, {
      shouldDirty: true,
      shouldTouch: true
    });
    setValue('config.exits', [], { shouldDirty: true, shouldTouch: true });
  };

  const setRebalancePin = (name: string | undefined) => {
    const version = getLatestVersion(rebalancePoliciesQuery.data, name);
    setComponentRef('rebalance', name, version);
    setValue('config.rebalancePolicy', undefined, { shouldDirty: true, shouldTouch: true });
  };

  const onSubmit = (data: StrategyDetail) => {
    saveMutation.mutate({
      ...data,
      config: normalizeStrategyComponentRefs(data.config)
    });
  };

  const discardChanges = () => {
    reset(baselineRef.current);
  };

  const requestCancel = () => {
    if (isDirty) {
      setIsDiscardDialogOpen(true);
      return;
    }
    onCancel();
  };

  const jumpToSection = (sectionId: (typeof SECTION_IDS)[number]) => {
    document.getElementById(sectionId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const currentConfig = getValues('config');

  return (
    <>
      <section className="mcm-panel flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-border/40 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{headerBadge}</Badge>
                {isDirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
                {mode === 'duplicate' && sourceStrategyName ? (
                  <Badge variant="outline">
                    <CopyPlus className="h-3.5 w-3.5" />
                    From {sourceStrategyName}
                  </Badge>
                ) : null}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                  Editor Workspace
                </p>
                <h2 className="font-display text-xl text-foreground">{getEditorTitle(mode)}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {getEditorDescription(mode, sourceStrategyName)}
                </p>
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/70 px-3 py-2 text-right">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Draft focus
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {draftName?.trim() || 'Name required'}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {SECTION_IDS.map((sectionId) => (
              <Button
                key={sectionId}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => jumpToSection(sectionId)}
              >
                {SECTION_LABELS[sectionId]}
              </Button>
            ))}
          </div>
        </div>

        {isHydrating ? (
          <PageLoader text="Loading strategy draft..." className="h-80" />
        ) : errorMessage ? (
          <div className="p-5">
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {errorMessage}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
            <div className="space-y-6 px-5 py-5">
              <section
                id="metadata"
                className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5"
              >
                <div>
                  <h3 className="font-display text-lg text-foreground">Metadata</h3>
                  <p className="text-sm text-muted-foreground">
                    Desk naming and strategy identity are independent from reusable library revisions.
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Strategy Name</Label>
                    <Input
                      id="name"
                      readOnly={mode === 'edit'}
                      {...register('name', { required: true })}
                      placeholder="e.g. quality-trend-us"
                    />
                    {errors.name ? (
                      <span className="text-xs text-destructive">Strategy name is required.</span>
                    ) : mode === 'duplicate' ? (
                      <span className="text-xs text-muted-foreground">
                        Duplication requires a new name before save.
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="type">Strategy Type</Label>
                    <Select
                      value={watchedType}
                      onValueChange={(value) =>
                        setValue('type', value, { shouldDirty: true, shouldTouch: true })
                      }
                    >
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="configured">Configured</SelectItem>
                        <SelectItem value="code-based">Code Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Desk Note</Label>
                  <Textarea
                    id="description"
                    {...register('description')}
                    placeholder="Record the objective, market fit, or caveat that matters to the desk."
                  />
                </div>
              </section>

              <section
                id="assembly"
                className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="font-display text-lg text-foreground">Pinned Assembly</h3>
                    <p className="text-sm text-muted-foreground">
                      Each selector stores a config name plus exact revision. Repinning and saving creates a new strategy revision.
                    </p>
                  </div>
                  <Badge variant="outline">Control-plane resolved snapshots</Badge>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <VersionPinSelector
                    label="Universe"
                    tab="universe"
                    items={universeConfigsQuery.data || []}
                    selectedName={watchedUniverseName}
                    selectedVersion={watchedUniverseVersion}
                    isLoading={universeConfigsQuery.isLoading}
                    error={universeConfigsQuery.error}
                    onNameChange={setUniversePin}
                    onVersionChange={(version) => {
                      setComponentRef('universe', watchedUniverseName || undefined, version);
                      setValue('config.universeConfigVersion', version, {
                        shouldDirty: true,
                        shouldTouch: true
                      });
                    }}
                    onRepinLatest={() => {
                      const version = getLatestVersion(universeConfigsQuery.data, watchedUniverseName);
                      if (version) {
                        setComponentRef('universe', watchedUniverseName || undefined, version);
                        setValue('config.universeConfigVersion', version, {
                          shouldDirty: true,
                          shouldTouch: true
                        });
                      }
                    }}
                  />

                  <VersionPinSelector
                    label="Ranking"
                    tab="ranking"
                    items={rankingSchemasQuery.data || []}
                    selectedName={watchedRankingName}
                    selectedVersion={watchedRankingVersion}
                    isLoading={rankingSchemasQuery.isLoading}
                    error={rankingSchemasQuery.error}
                    onNameChange={setRankingPin}
                    onVersionChange={(version) => {
                      setComponentRef('ranking', watchedRankingName || undefined, version);
                      setValue('config.rankingSchemaVersion', version, {
                        shouldDirty: true,
                        shouldTouch: true
                      });
                    }}
                    onRepinLatest={() => {
                      const version = getLatestVersion(rankingSchemasQuery.data, watchedRankingName);
                      if (version) {
                        setComponentRef('ranking', watchedRankingName || undefined, version);
                        setValue('config.rankingSchemaVersion', version, {
                          shouldDirty: true,
                          shouldTouch: true
                        });
                      }
                    }}
                  />

                  <VersionPinSelector
                    label="Regime Policy"
                    tab="regime-policy"
                    items={regimePoliciesQuery.data || []}
                    selectedName={watchedRegimeName}
                    selectedVersion={watchedRegimeVersion}
                    isLoading={regimePoliciesQuery.isLoading}
                    error={regimePoliciesQuery.error}
                    onNameChange={setRegimePin}
                    onVersionChange={(version) => {
                      setComponentRef('regimePolicy', watchedRegimeName || undefined, version);
                      setValue('config.regimePolicyConfigVersion', version, {
                        shouldDirty: true,
                        shouldTouch: true
                      });
                    }}
                    onRepinLatest={() => {
                      const version = getLatestVersion(regimePoliciesQuery.data, watchedRegimeName);
                      if (version) {
                        setComponentRef('regimePolicy', watchedRegimeName || undefined, version);
                        setValue('config.regimePolicyConfigVersion', version, {
                          shouldDirty: true,
                          shouldTouch: true
                        });
                      }
                    }}
                  />

                  <VersionPinSelector
                    label="Rebalance Policy"
                    tab="rebalance-policy"
                    items={rebalancePoliciesQuery.data || []}
                    selectedName={watchedRebalanceName}
                    selectedVersion={watchedRebalanceVersion}
                    isLoading={rebalancePoliciesQuery.isLoading}
                    error={rebalancePoliciesQuery.error}
                    onNameChange={setRebalancePin}
                    onVersionChange={(version) => {
                      setComponentRef('rebalance', watchedRebalanceName || undefined, version);
                    }}
                    onRepinLatest={() => {
                      const version = getLatestVersion(rebalancePoliciesQuery.data, watchedRebalanceName);
                      if (version) {
                        setComponentRef('rebalance', watchedRebalanceName || undefined, version);
                      }
                    }}
                  />

                  <VersionPinSelector
                    label="Risk Policy"
                    tab="risk-policy"
                    items={riskPoliciesQuery.data || []}
                    selectedName={watchedRiskName}
                    selectedVersion={watchedRiskVersion}
                    isLoading={riskPoliciesQuery.isLoading}
                    error={riskPoliciesQuery.error}
                    onNameChange={setRiskPin}
                    onVersionChange={(version) => {
                      setComponentRef('riskPolicy', watchedRiskName || undefined, version);
                      setValue('config.riskPolicyVersion', version, {
                        shouldDirty: true,
                        shouldTouch: true
                      });
                    }}
                    onRepinLatest={() => {
                      const version = getLatestVersion(riskPoliciesQuery.data, watchedRiskName);
                      if (version) {
                        setComponentRef('riskPolicy', watchedRiskName || undefined, version);
                        setValue('config.riskPolicyVersion', version, {
                          shouldDirty: true,
                          shouldTouch: true
                        });
                      }
                    }}
                  />

                  <div className="xl:col-span-2">
                    <VersionPinSelector
                      label="Exit Rule Set"
                      tab="exit-rules"
                      items={exitRuleSetsQuery.data || []}
                      selectedName={watchedExitName}
                      selectedVersion={watchedExitVersion}
                      isLoading={exitRuleSetsQuery.isLoading}
                      error={exitRuleSetsQuery.error}
                      onNameChange={setExitPin}
                      onVersionChange={(version) => {
                        setComponentRef('exitPolicy', watchedExitName || undefined, version);
                        setValue('config.exitRuleSetVersion', version, {
                          shouldDirty: true,
                          shouldTouch: true
                        });
                      }}
                      onRepinLatest={() => {
                        const version = getLatestVersion(exitRuleSetsQuery.data, watchedExitName);
                        if (version) {
                          setComponentRef('exitPolicy', watchedExitName || undefined, version);
                          setValue('config.exitRuleSetVersion', version, {
                            shouldDirty: true,
                            shouldTouch: true
                          });
                        }
                      }}
                    />
                  </div>
                </div>
              </section>

              <section
                id="execution"
                className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5"
              >
                <div>
                  <h3 className="font-display text-lg text-foreground">Execution Shape</h3>
                  <p className="text-sm text-muted-foreground">
                    These strategy-local fields remain on the strategy revision. Library configs carry selection, risk, regime, and exit behavior.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rebalance">Rebalance Frequency</Label>
                    <Select
                      value={watchedRebalance}
                      onValueChange={(value) =>
                        setValue('config.rebalance', value, {
                          shouldDirty: true,
                          shouldTouch: true
                        })
                      }
                    >
                      <SelectTrigger id="rebalance">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="top-n">Top N</Label>
                    <Input id="top-n" type="number" min={1} {...register('config.topN', { valueAsNumber: true })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lookback">Lookback Bars</Label>
                    <Input id="lookback" type="number" min={1} {...register('config.lookbackWindow', { valueAsNumber: true })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="holding">Holding Bars</Label>
                    <Input id="holding" type="number" min={1} {...register('config.holdingPeriod', { valueAsNumber: true })} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="grid gap-2">
                    <Label htmlFor="cost-model">Cost Model</Label>
                    <Input id="cost-model" {...register('config.costModel')} />
                  </div>
                  <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">Long Only</p>
                        <p className="text-sm text-muted-foreground">Basic execution stance.</p>
                      </div>
                      <Switch
                        aria-label="Toggle long only strategy"
                        checked={Boolean(watchedLongOnly)}
                        onCheckedChange={(checked) =>
                          setValue('config.longOnly', Boolean(checked), {
                            shouldDirty: true,
                            shouldTouch: true
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-border/60 bg-background p-4 text-sm text-muted-foreground">
                  Current resolved snapshot fields: regime {currentConfig.regimePolicy ? 'present' : 'absent'}, risk{' '}
                  {currentConfig.strategyRiskPolicy || currentConfig.riskPolicy ? 'present' : 'absent'}, exits{' '}
                  {currentConfig.exits?.length || 0}. The control plane refreshes these from the pinned revisions on save.
                </div>
              </section>
            </div>

            <div className="border-t border-border/40 bg-mcm-paper/95 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-muted-foreground">
                  {isDirty ? 'Draft has unsaved changes.' : 'Draft matches the last loaded baseline.'}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={requestCancel} disabled={saveMutation.isPending}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={discardChanges}
                    disabled={!isDirty || saveMutation.isPending}
                  >
                    Discard Changes
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    <Save className="h-4 w-4" />
                    {saveMutation.isPending ? 'Saving...' : mode === 'edit' ? 'Save Strategy Revision' : 'Save New Strategy'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        )}
      </section>

      <AlertDialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
        <AlertDialogContent className="border-2 border-mcm-walnut bg-mcm-paper">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-foreground">Discard Draft Changes</AlertDialogTitle>
            <AlertDialogDescription>
              Close the editor and abandon unsaved strategy changes. The saved strategy record stays unchanged until you explicitly save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <Button
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setIsDiscardDialogOpen(false);
                onCancel();
              }}
            >
              Discard Draft
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
