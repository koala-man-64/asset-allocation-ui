import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CopyPlus,
  PencilLine,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { PageLoader } from '@/app/components/common/PageLoader';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { rankingApi } from '@/services/rankingApi';
import { universeApi } from '@/services/universeApi';
import type { RunRecordResponse } from '@/services/backtestApi';
import type {
  RankingCatalogColumn,
  RankingFactor,
  RankingGroup,
  RankingSchemaDetail,
  RankingTransform,
  StrategyDetail,
  StrategySummary,
  UniverseDefinition
} from '@/types/strategy';
import type { StrategyRiskPolicy } from '@/types/strategyAnalytics';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import { RankingGroupOverview } from '@/features/rankings/components/RankingGroupOverview';
import { RankingGroupWorkspace } from '@/features/rankings/components/RankingGroupWorkspace';
import { RankingSchemaBasics } from '@/features/rankings/components/RankingSchemaBasics';
import { RankingTransformSequenceEditor } from '@/features/rankings/components/RankingTransformSequenceEditor';
import {
  buildEmptyFactor,
  buildEmptyGroup,
  clampIndex,
  cloneFactor,
  cloneGroup,
  countFactors,
  moveItem,
  serializeSchemaDetail
} from '@/features/rankings/components/rankingEditorUtils';
import { UniverseRuleBuilder } from '@/features/universes/components/UniverseRuleBuilder';
import {
  describeRegimePolicy,
  describeStrategyExecution,
  describeStrategySelection,
  formatStrategyTimestamp,
  formatStrategyType,
  summarizeExitStack
} from '@/features/strategies/lib/strategySummary';
import { toast } from 'sonner';

interface StrategyEditorPanelProps {
  selectedStrategyName: string | null;
  selectedStrategy: StrategySummary | null;
  strategy: StrategyDetail | undefined;
  isLoading: boolean;
  errorMessage: string;
  detailReady: boolean;
  recentRuns: RunRecordResponse[];
  recentRunsLoading: boolean;
  recentRunsError: string;
  onCreateStrategy: () => void;
  onEditStrategy: () => void;
  onDuplicateStrategy: () => void;
  onOpenBacktest: () => void;
  onDeleteStrategy: () => void;
}

function formatRatio(value?: number | null): string {
  if (value === undefined || value === null) {
    return 'Unset';
  }

  return `${(value * 100).toFixed(1)}%`;
}

function riskValue(policy: StrategyRiskPolicy | null | undefined, key: keyof StrategyRiskPolicy): string {
  const value = policy?.[key];
  if (typeof value === 'number') {
    return key === 'maxTradeNotionalBaseCcy'
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0
        }).format(value)
      : formatRatio(value);
  }

  return 'Unset';
}

function PanelTile({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function EmptySection({ children }: { children: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function StrategyEditorPanel({
  selectedStrategyName,
  selectedStrategy,
  strategy,
  isLoading,
  errorMessage,
  detailReady,
  recentRuns,
  recentRunsLoading,
  recentRunsError,
  onCreateStrategy,
  onEditStrategy,
  onDuplicateStrategy,
  onOpenBacktest,
  onDeleteStrategy
}: StrategyEditorPanelProps) {
  const queryClient = useQueryClient();
  const universeName = strategy?.config.universeConfigName || null;
  const rankingName = strategy?.config.rankingSchemaName || null;
  const [universeDraft, setUniverseDraft] = useState<UniverseDefinition | null>(null);
  const [rankingDraft, setRankingDraft] = useState<RankingSchemaDetail | null>(null);
  const [universeBaseline, setUniverseBaseline] = useState('');
  const [rankingBaseline, setRankingBaseline] = useState('');
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeFactorIndex, setActiveFactorIndex] = useState(0);

  const universeDetailQuery = useQuery({
    queryKey: ['universe-configs', 'detail', universeName],
    queryFn: ({ signal }) => universeApi.getUniverseConfigDetail(String(universeName), signal),
    enabled: Boolean(universeName)
  });

  const rankingDetailQuery = useQuery({
    queryKey: ['ranking-schemas', 'detail', rankingName],
    queryFn: ({ signal }) => rankingApi.getRankingSchemaDetail(String(rankingName), signal),
    enabled: Boolean(rankingName)
  });

  const rankingCatalogQuery = useQuery({
    queryKey: ['ranking-catalog'],
    queryFn: ({ signal }) => rankingApi.getRankingCatalog(signal),
    enabled: Boolean(rankingName)
  });

  const universeConfigsQuery = useQuery({
    queryKey: ['universe-configs'],
    queryFn: ({ signal }) => universeApi.listUniverseConfigs(signal),
    enabled: Boolean(rankingName)
  });

  useEffect(() => {
    if (!universeDetailQuery.data) {
      setUniverseDraft(null);
      setUniverseBaseline('');
      return;
    }

    const snapshot = JSON.stringify(universeDetailQuery.data.config);
    setUniverseDraft(universeDetailQuery.data.config);
    setUniverseBaseline(snapshot);
  }, [universeDetailQuery.data]);

  useEffect(() => {
    if (!rankingDetailQuery.data) {
      setRankingDraft(null);
      setRankingBaseline('');
      return;
    }

    setRankingDraft(rankingDetailQuery.data);
    setRankingBaseline(serializeSchemaDetail(rankingDetailQuery.data));
    setActiveGroupIndex(0);
    setActiveFactorIndex(0);
  }, [rankingDetailQuery.data]);

  useEffect(() => {
    const activeGroup = rankingDraft?.config.groups[activeGroupIndex] || null;
    setActiveFactorIndex((current) => clampIndex(current, activeGroup?.factors.length || 0));
  }, [activeGroupIndex, rankingDraft?.config.groups]);

  const universeDirty = universeDraft ? JSON.stringify(universeDraft) !== universeBaseline : false;
  const rankingDirty = rankingDraft ? serializeSchemaDetail(rankingDraft) !== rankingBaseline : false;

  const rankingCatalog = rankingCatalogQuery.data;
  const catalogByTable = useMemo(() => {
    const tableMap = new Map<string, RankingCatalogColumn[]>();
    rankingCatalog?.tables.forEach((table) => {
      tableMap.set(table.name, table.columns);
    });
    return tableMap;
  }, [rankingCatalog]);
  const tableNames = rankingCatalog?.tables.map((table) => table.name) || [];
  const activeGroup = rankingDraft?.config.groups[activeGroupIndex] || null;
  const factorCount = rankingDraft ? countFactors(rankingDraft.config.groups) : 0;

  const saveUniverseMutation = useMutation({
    mutationFn: () => {
      if (!universeDetailQuery.data || !universeDraft) {
        throw new Error('Select a universe configuration before saving.');
      }

      return universeApi.saveUniverseConfig({
        name: universeDetailQuery.data.name,
        description: universeDetailQuery.data.description,
        config: universeDraft
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['universe-configs'] }),
        queryClient.invalidateQueries({ queryKey: ['universe-configs', 'detail', universeName] })
      ]);
      setUniverseBaseline(universeDraft ? JSON.stringify(universeDraft) : '');
      toast.success(`Universe ${universeName} saved`);
    },
    onError: (error) => {
      toast.error(`Failed to save universe: ${formatSystemStatusText(error)}`);
    }
  });

  const saveRankingMutation = useMutation({
    mutationFn: () => {
      if (!rankingDraft) {
        throw new Error('Select a ranking configuration before saving.');
      }

      return rankingApi.saveRankingSchema({
        name: rankingDraft.name,
        description: rankingDraft.description,
        config: rankingDraft.config
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ranking-schemas'] }),
        queryClient.invalidateQueries({ queryKey: ['ranking-schemas', 'detail', rankingName] })
      ]);
      setRankingBaseline(rankingDraft ? serializeSchemaDetail(rankingDraft) : '');
      toast.success(`Ranking ${rankingName} saved`);
    },
    onError: (error) => {
      toast.error(`Failed to save ranking: ${formatSystemStatusText(error)}`);
    }
  });

  const updateRankingDraft = (updater: (current: RankingSchemaDetail) => RankingSchemaDetail) => {
    setRankingDraft((current) => (current ? updater(current) : current));
  };

  const replaceGroup = (groupIndex: number, nextGroup: RankingGroup) => {
    updateRankingDraft((current) => {
      const nextGroups = current.config.groups.slice();
      if (!nextGroups[groupIndex]) {
        return current;
      }
      nextGroups[groupIndex] = nextGroup;
      return {
        ...current,
        config: {
          ...current.config,
          groups: nextGroups
        }
      };
    });
  };

  const replaceFactor = (groupIndex: number, factorIndex: number, nextFactor: RankingFactor) => {
    updateRankingDraft((current) => {
      const nextGroups = current.config.groups.slice();
      const targetGroup = nextGroups[groupIndex];
      if (!targetGroup) {
        return current;
      }
      const nextFactors = targetGroup.factors.slice();
      nextFactors[factorIndex] = nextFactor;
      nextGroups[groupIndex] = {
        ...targetGroup,
        factors: nextFactors
      };
      return {
        ...current,
        config: {
          ...current.config,
          groups: nextGroups
        }
      };
    });
  };

  const handleAddGroup = () => {
    updateRankingDraft((current) => {
      const nextGroup = buildEmptyGroup(current.config.groups.length, rankingCatalog, true);
      return {
        ...current,
        config: {
          ...current.config,
          groups: [...current.config.groups, nextGroup]
        }
      };
    });
    setActiveGroupIndex(rankingDraft?.config.groups.length || 0);
    setActiveFactorIndex(0);
  };

  const handleDuplicateGroup = (groupIndex: number) => {
    updateRankingDraft((current) => {
      const targetGroup = current.config.groups[groupIndex];
      if (!targetGroup) {
        return current;
      }
      const nextGroups = current.config.groups.slice();
      nextGroups.splice(groupIndex + 1, 0, cloneGroup(targetGroup));
      return {
        ...current,
        config: {
          ...current.config,
          groups: nextGroups
        }
      };
    });
    setActiveGroupIndex(groupIndex + 1);
    setActiveFactorIndex(0);
  };

  const handleMoveGroup = (groupIndex: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? groupIndex - 1 : groupIndex + 1;
    updateRankingDraft((current) => ({
      ...current,
      config: {
        ...current.config,
        groups: moveItem(current.config.groups, groupIndex, nextIndex)
      }
    }));
    setActiveGroupIndex(nextIndex);
    setActiveFactorIndex(0);
  };

  const handleRemoveGroup = (groupIndex: number) => {
    updateRankingDraft((current) => ({
      ...current,
      config: {
        ...current.config,
        groups: current.config.groups.filter((_, itemIndex) => itemIndex !== groupIndex)
      }
    }));
    setActiveGroupIndex((current) =>
      clampIndex(current > groupIndex ? current - 1 : current, (rankingDraft?.config.groups.length || 1) - 1)
    );
    setActiveFactorIndex(0);
  };

  const handleAddFactor = () => {
    if (!activeGroup) {
      return;
    }
    const nextFactor = buildEmptyFactor(activeGroup.name || `group-${activeGroupIndex + 1}`, rankingCatalog);
    replaceGroup(activeGroupIndex, {
      ...activeGroup,
      factors: [...activeGroup.factors, nextFactor]
    });
    setActiveFactorIndex(activeGroup.factors.length);
  };

  const handleDuplicateFactor = (factorIndex: number) => {
    if (!activeGroup) {
      return;
    }
    const targetFactor = activeGroup.factors[factorIndex];
    if (!targetFactor) {
      return;
    }
    const nextFactors = activeGroup.factors.slice();
    nextFactors.splice(factorIndex + 1, 0, cloneFactor(targetFactor));
    replaceGroup(activeGroupIndex, {
      ...activeGroup,
      factors: nextFactors
    });
    setActiveFactorIndex(factorIndex + 1);
  };

  const handleMoveFactor = (factorIndex: number, direction: 'up' | 'down') => {
    if (!activeGroup) {
      return;
    }
    const nextIndex = direction === 'up' ? factorIndex - 1 : factorIndex + 1;
    replaceGroup(activeGroupIndex, {
      ...activeGroup,
      factors: moveItem(activeGroup.factors, factorIndex, nextIndex)
    });
    setActiveFactorIndex(nextIndex);
  };

  const handleRemoveFactor = (factorIndex: number) => {
    if (!activeGroup) {
      return;
    }
    replaceGroup(activeGroupIndex, {
      ...activeGroup,
      factors: activeGroup.factors.filter((_, itemIndex) => itemIndex !== factorIndex)
    });
    setActiveFactorIndex((current) =>
      clampIndex(current > factorIndex ? current - 1 : current, activeGroup.factors.length - 1)
    );
  };

  return (
    <section className="mcm-panel flex min-h-[760px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Strategy Editor Panel
            </p>
            <h2 className="font-display text-xl text-foreground">Configuration Workspace</h2>
            <p className="text-sm text-muted-foreground">
              Universe, ranking, regime, and risk controls are grouped here; child drafts save only from their own section.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onCreateStrategy}>
              <Plus className="h-4 w-4" />
              Create Strategy
            </Button>
            <Button variant="secondary" onClick={onEditStrategy} disabled={!detailReady}>
              <PencilLine className="h-4 w-4" />
              Edit Strategy
            </Button>
            <Button variant="outline" onClick={onDuplicateStrategy} disabled={!detailReady}>
              <CopyPlus className="h-4 w-4" />
              Duplicate As New
            </Button>
            <Button variant="outline" onClick={onOpenBacktest} disabled={!selectedStrategy}>
              <Play className="h-4 w-4" />
              Launch Backtest
            </Button>
            <Button asChild variant="secondary">
              <Link
                to={`/backtests${selectedStrategyName ? `?strategy=${encodeURIComponent(selectedStrategyName)}` : ''}`}
              >
                <Play className="h-4 w-4" />
                Backtests
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {!selectedStrategyName ? (
          <EmptySection>Select a strategy from the library or create a new one to begin.</EmptySection>
        ) : isLoading ? (
          <PageLoader text="Loading strategy workspace..." className="h-80" />
        ) : errorMessage ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : strategy ? (
          <>
            <div className="rounded-[2rem] border-2 border-mcm-walnut bg-mcm-paper/90 px-6 py-6 shadow-[8px_8px_0px_0px_rgba(119,63,26,0.10)]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={strategy.type === 'configured' ? 'default' : 'outline'}>
                      {formatStrategyType(strategy.type)}
                    </Badge>
                    <Badge variant={strategy.config.regimePolicy ? 'secondary' : 'outline'}>
                      {strategy.config.regimePolicy ? 'Regime aware' : 'No regime gate'}
                    </Badge>
                    <Badge variant={strategy.config.riskPolicy ? 'secondary' : 'outline'}>
                      {strategy.config.riskPolicy ? 'Risk policy' : 'No risk policy'}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="font-display text-3xl tracking-[0.04em] text-foreground">
                      {strategy.name}
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {strategy.description || 'No desk note recorded for this strategy yet.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground xl:text-right">
                  <span>Updated {formatStrategyTimestamp(strategy.updated_at)}</span>
                  <span>{summarizeExitStack(strategy)}</span>
                  <Button
                    variant="outline"
                    className="border-destructive/60 text-destructive hover:bg-destructive/10 xl:self-end"
                    onClick={onDeleteStrategy}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Strategy
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PanelTile
                label="Universe"
                value={strategy.config.universeConfigName || 'Not assigned'}
                detail={strategy.config.universe ? 'Embedded legacy universe present.' : 'Linked eligibility definition.'}
              />
              <PanelTile
                label="Ranking"
                value={strategy.config.rankingSchemaName || 'Not attached'}
                detail="Linked ranking schema used during strategy materialization."
              />
              <PanelTile
                label="Selection"
                value={describeStrategySelection(strategy)}
                detail={describeStrategyExecution(strategy)}
              />
              <PanelTile
                label="Regime"
                value={strategy.config.regimePolicy?.modelName || 'Disabled'}
                detail={describeRegimePolicy(strategy)}
              />
            </div>

            <section className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h4 className="font-display text-lg text-foreground">Universe Configuration</h4>
                  <p className="text-sm text-muted-foreground">
                    Edit the attached universe draft here. Saving this section never saves the strategy record.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => saveUniverseMutation.mutate()}
                  disabled={!universeDirty || saveUniverseMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                  {saveUniverseMutation.isPending ? 'Saving...' : 'Save Universe Draft'}
                </Button>
              </div>

              {!universeName ? (
                <EmptySection>No universe configuration is attached. Use Edit Strategy to attach a versioned universe.</EmptySection>
              ) : universeDetailQuery.isLoading ? (
                <EmptySection>Loading attached universe configuration...</EmptySection>
              ) : universeDetailQuery.error ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {formatSystemStatusText(universeDetailQuery.error)}
                </div>
              ) : universeDraft ? (
                <UniverseRuleBuilder value={universeDraft} onChange={setUniverseDraft} />
              ) : null}
            </section>

            <section className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h4 className="font-display text-lg text-foreground">Ranking Configuration</h4>
                  <p className="text-sm text-muted-foreground">
                    Edit the attached ranking schema in place; this section has its own save action.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{factorCount} factors</Badge>
                  <Button
                    variant="secondary"
                    onClick={() => saveRankingMutation.mutate()}
                    disabled={!rankingDirty || saveRankingMutation.isPending || !rankingDraft}
                  >
                    <Save className="h-4 w-4" />
                    {saveRankingMutation.isPending ? 'Saving...' : 'Save Ranking Draft'}
                  </Button>
                </div>
              </div>

              {!rankingName ? (
                <EmptySection>No ranking schema is attached. Use Edit Strategy to attach a versioned ranking schema.</EmptySection>
              ) : rankingDetailQuery.isLoading ? (
                <EmptySection>Loading attached ranking schema...</EmptySection>
              ) : rankingDetailQuery.error ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {formatSystemStatusText(rankingDetailQuery.error)}
                </div>
              ) : rankingDraft ? (
                <div className="space-y-5">
                  {rankingCatalogQuery.error ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                      Ranking catalog failed: {formatSystemStatusText(rankingCatalogQuery.error)}
                    </div>
                  ) : null}
                  <RankingSchemaBasics
                    draft={rankingDraft}
                    selectedSchemaName={rankingName}
                    hasUnsavedChanges={rankingDirty}
                    universeConfigs={universeConfigsQuery.data || []}
                    onNameChange={(name) => setRankingDraft({ ...rankingDraft, name })}
                    onDescriptionChange={(description) =>
                      setRankingDraft({ ...rankingDraft, description })
                    }
                    onUniverseConfigChange={(universeConfigName) =>
                      setRankingDraft({
                        ...rankingDraft,
                        config: {
                          ...rankingDraft.config,
                          universeConfigName
                        }
                      })
                    }
                  />
                  <RankingGroupOverview
                    groups={rankingDraft.config.groups}
                    activeGroupIndex={activeGroupIndex}
                    onSelectGroup={(index) => {
                      setActiveGroupIndex(index);
                      setActiveFactorIndex(0);
                    }}
                    onAddGroup={handleAddGroup}
                    onDuplicateGroup={handleDuplicateGroup}
                    onMoveGroup={handleMoveGroup}
                    onRemoveGroup={handleRemoveGroup}
                  />
                  <RankingTransformSequenceEditor
                    title="Overall Transforms"
                    description="Run these after weighted groups are aggregated into the final ranking score."
                    transforms={rankingDraft.config.overallTransforms || []}
                    onChange={(nextTransforms: RankingTransform[]) =>
                      setRankingDraft({
                        ...rankingDraft,
                        config: {
                          ...rankingDraft.config,
                          overallTransforms: nextTransforms
                        }
                      })
                    }
                  />
                  <RankingGroupWorkspace
                    group={activeGroup}
                    groupIndex={activeGroupIndex}
                    activeFactorIndex={activeFactorIndex}
                    catalogByTable={catalogByTable}
                    tableNames={tableNames}
                    onChangeGroup={(nextGroup) => replaceGroup(activeGroupIndex, nextGroup)}
                    onChangeGroupTransforms={(nextTransforms) => {
                      if (!activeGroup) {
                        return;
                      }
                      replaceGroup(activeGroupIndex, {
                        ...activeGroup,
                        transforms: nextTransforms
                      });
                    }}
                    onAddFactor={handleAddFactor}
                    onSelectFactor={setActiveFactorIndex}
                    onDuplicateFactor={handleDuplicateFactor}
                    onMoveFactor={handleMoveFactor}
                    onRemoveFactor={handleRemoveFactor}
                    onChangeFactor={(factorIndex, nextFactor) =>
                      replaceFactor(activeGroupIndex, factorIndex, nextFactor)
                    }
                    onChangeFactorTransforms={(factorIndex, nextTransforms) => {
                      const nextFactor = activeGroup?.factors[factorIndex];
                      if (!nextFactor) {
                        return;
                      }
                      replaceFactor(activeGroupIndex, factorIndex, {
                        ...nextFactor,
                        transforms: nextTransforms
                      });
                    }}
                  />
                </div>
              ) : null}
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
                <div>
                  <h4 className="font-display text-lg text-foreground">Regime Configuration</h4>
                  <p className="text-sm text-muted-foreground">
                    Regime policy remains part of the strategy payload and is saved from Edit Strategy.
                  </p>
                </div>
                <div className="grid gap-3">
                  <PanelTile
                    label="Model"
                    value={strategy.config.regimePolicy?.modelName || 'Not configured'}
                    detail="Active regime model attached to the strategy."
                  />
                  <PanelTile
                    label="Mode"
                    value={strategy.config.regimePolicy?.mode.replaceAll('_', ' ') || 'Disabled'}
                    detail="Current shared schema exposes observe-only mode."
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-1 h-5 w-5 text-mcm-walnut" />
                  <div>
                    <h4 className="font-display text-lg text-foreground">Risk Configuration</h4>
                    <p className="text-sm text-muted-foreground">
                      Risk policy uses the new shared contract bridge and saves with the strategy draft.
                    </p>
                  </div>
                </div>
                {strategy.config.riskPolicy ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <PanelTile
                      label="Gross"
                      value={riskValue(strategy.config.riskPolicy, 'grossExposureLimit')}
                      detail="Gross exposure ceiling."
                    />
                    <PanelTile
                      label="Single Name"
                      value={riskValue(strategy.config.riskPolicy, 'singleNameMaxWeight')}
                      detail="Maximum issuer concentration."
                    />
                    <PanelTile
                      label="Turnover"
                      value={riskValue(strategy.config.riskPolicy, 'turnoverBudget')}
                      detail="Desk turnover budget."
                    />
                    <PanelTile
                      label="Trade Notional"
                      value={riskValue(strategy.config.riskPolicy, 'maxTradeNotionalBaseCcy')}
                      detail="Per-trade liquidity guardrail."
                    />
                  </div>
                ) : (
                  <EmptySection>No risk policy is attached. Open Edit Strategy to add the shared risk-policy payload.</EmptySection>
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-[2rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-display text-lg text-foreground">Recent Backtest Runs</h4>
                  <p className="text-sm text-muted-foreground">
                    Existing run history stays visible while analytics APIs own strategy comparison.
                  </p>
                </div>
                <Badge variant="secondary">{recentRuns.length} runs</Badge>
              </div>

              {recentRunsLoading ? (
                <EmptySection>Loading recent runs...</EmptySection>
              ) : recentRunsError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {recentRunsError}
                </div>
              ) : recentRuns.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Run</TableHead>
                        <TableHead>Window</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentRuns.map((run) => (
                        <TableRow key={run.run_id}>
                          <TableCell className="font-medium">{run.run_name || run.run_id}</TableCell>
                          <TableCell>{`${run.start_date || 'Unknown'} to ${run.end_date || 'Unknown'}`}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                run.status === 'completed'
                                  ? 'default'
                                  : run.status === 'failed'
                                    ? 'destructive'
                                    : 'outline'
                              }
                            >
                              {run.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptySection>No backtests have been submitted for this strategy yet.</EmptySection>
              )}
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
