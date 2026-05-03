import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutPanelLeft, Plus } from 'lucide-react';
import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Button } from '@/app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/app/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/app/components/ui/sheet';
import { Textarea } from '@/app/components/ui/textarea';
import { RankingGroupOverview } from '@/features/rankings/components/RankingGroupOverview';
import { RankingGroupWorkspace } from '@/features/rankings/components/RankingGroupWorkspace';
import { RankingPreviewRail } from '@/features/rankings/components/RankingPreviewRail';
import { RankingSchemaBasics } from '@/features/rankings/components/RankingSchemaBasics';
import { RankingSchemaLibrary } from '@/features/rankings/components/RankingSchemaLibrary';
import { RankingTransformSequenceEditor } from '@/features/rankings/components/RankingTransformSequenceEditor';
import {
  buildEmptyFactor,
  buildEmptyGroup,
  buildEmptySchema,
  clampIndex,
  cloneFactor,
  cloneGroup,
  moveItem,
  serializeSchemaDetail
} from '@/features/rankings/components/rankingEditorUtils';
import { rankingApi } from '@/services/rankingApi';
import { strategyApi } from '@/services/strategyApi';
import { universeApi } from '@/services/universeApi';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import type {
  RankingCatalogColumn,
  RankingSchemaDetail,
  RankingFactor,
  RankingGroup
} from '@/types/strategy';
import { toast } from 'sonner';

function getInitialPreviewDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RankingConfigPageProps {
  embedded?: boolean;
}

export function RankingConfigPage({ embedded = false }: RankingConfigPageProps = {}) {
  const queryClient = useQueryClient();
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [selectedSchemaName, setSelectedSchemaName] = useState<string | null>(null);
  const [draft, setDraft] = useState<RankingSchemaDetail>(buildEmptySchema());
  const [baselineSnapshot, setBaselineSnapshot] = useState(() =>
    serializeSchemaDetail(buildEmptySchema())
  );
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeFactorIndex, setActiveFactorIndex] = useState(0);
  const [previewStrategyName, setPreviewStrategyName] = useState('');
  const [previewDate, setPreviewDate] = useState(getInitialPreviewDate);
  const [lastPreviewSignature, setLastPreviewSignature] = useState<string | null>(null);

  const {
    data: schemas = [],
    isLoading: isSchemasLoading,
    error: schemasError
  } = useQuery({
    queryKey: ['ranking-schemas'],
    queryFn: () => rankingApi.listRankingSchemas()
  });

  const {
    data: rankingCatalog,
    isLoading: isCatalogLoading,
    error: rankingCatalogError
  } = useQuery({
    queryKey: ['ranking-catalog'],
    queryFn: () => rankingApi.getRankingCatalog()
  });

  const { data: strategies = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => strategyApi.listStrategies()
  });

  const { data: universeConfigs = [] } = useQuery({
    queryKey: ['universe-configs'],
    queryFn: () => universeApi.listUniverseConfigs()
  });

  const detailQuery = useQuery({
    queryKey: ['ranking-schemas', 'detail', selectedSchemaName],
    queryFn: () => rankingApi.getRankingSchemaDetail(String(selectedSchemaName)),
    enabled: Boolean(selectedSchemaName)
  });

  const selectedStrategyDetailQuery = useQuery({
    queryKey: ['strategies', 'detail', previewStrategyName],
    queryFn: () => strategyApi.getStrategyDetail(previewStrategyName),
    enabled: Boolean(previewStrategyName)
  });

  const catalogByTable = useMemo(() => {
    const tableMap = new Map<string, RankingCatalogColumn[]>();
    rankingCatalog?.tables.forEach((table) => {
      tableMap.set(table.name, table.columns);
    });
    return tableMap;
  }, [rankingCatalog]);

  const previewSignature = useMemo(
    () =>
      JSON.stringify({
        strategyName: previewStrategyName,
        asOfDate: previewDate,
        schema: draft.config
      }),
    [draft.config, previewDate, previewStrategyName]
  );

  const hasUnsavedChanges = serializeSchemaDetail(draft) !== baselineSnapshot;
  const selectedSchemaLabel = draft.name || selectedSchemaName || 'New ranking configuration';
  const attachedSchemaName = selectedStrategyDetailQuery.data?.config.rankingSchemaName || null;

  useEffect(() => {
    if (!selectedSchemaName && !isCreatingNew && schemas.length > 0) {
      setSelectedSchemaName(schemas[0].name);
    }
  }, [isCreatingNew, schemas, selectedSchemaName]);

  useEffect(() => {
    if (!previewStrategyName && strategies.length > 0) {
      setPreviewStrategyName(strategies[0].name);
    }
  }, [previewStrategyName, strategies]);

  useEffect(() => {
    if (!detailQuery.data) return;

    setDraft(detailQuery.data);
    setBaselineSnapshot(serializeSchemaDetail(detailQuery.data));
    setActiveGroupIndex(0);
    setActiveFactorIndex(0);
    setIsCreatingNew(false);
    setLastPreviewSignature(null);
  }, [detailQuery.data]);

  useEffect(() => {
    setActiveGroupIndex((current) => clampIndex(current, draft.config.groups.length));
  }, [draft.config.groups.length]);

  useEffect(() => {
    const activeGroup = draft.config.groups[activeGroupIndex];
    setActiveFactorIndex((current) => clampIndex(current, activeGroup?.factors.length || 0));
  }, [activeGroupIndex, draft.config.groups]);

  const updateDraft = (updater: (current: RankingSchemaDetail) => RankingSchemaDetail) => {
    setDraft((current) => updater(current));
  };

  const resetPreviewState = () => {
    setLastPreviewSignature(null);
  };

  const confirmLeaveCurrentDraft = () => {
    if (!hasUnsavedChanges) return true;
    return window.confirm('Discard the current unsaved ranking changes and switch workspaces?');
  };

  const openNewDraft = () => {
    if (!confirmLeaveCurrentDraft()) return;

    const emptyDraft = buildEmptySchema(rankingCatalog);
    setDraft(emptyDraft);
    setBaselineSnapshot(serializeSchemaDetail(emptyDraft));
    setSelectedSchemaName(null);
    setIsCreatingNew(true);
    setActiveGroupIndex(0);
    setActiveFactorIndex(0);
    setPreviewDate(getInitialPreviewDate());
    setIsAdvancedOpen(false);
    setIsLibraryOpen(false);
    resetPreviewState();
  };

  const loadSchema = (name: string) => {
    if (!isCreatingNew && selectedSchemaName === name) {
      setIsLibraryOpen(false);
      return;
    }

    if (!confirmLeaveCurrentDraft()) return;

    setSelectedSchemaName(name);
    setIsCreatingNew(false);
    setActiveGroupIndex(0);
    setActiveFactorIndex(0);
    setIsAdvancedOpen(false);
    setIsLibraryOpen(false);
    resetPreviewState();
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      rankingApi.saveRankingSchema({
        name: draft.name,
        description: draft.description,
        config: draft.config
      }),
    onSuccess: async (result) => {
      const savedDraft = {
        ...draft,
        version: result.version
      };

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ranking-schemas'] }),
        queryClient.invalidateQueries({ queryKey: ['ranking-schemas', 'detail', draft.name] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);

      setSelectedSchemaName(draft.name);
      setIsCreatingNew(false);
      setDraft(savedDraft);
      setBaselineSnapshot(serializeSchemaDetail(savedDraft));
      toast.success(`Ranking schema ${draft.name} saved`);
    },
    onError: (error) => {
      toast.error(`Failed to save ranking schema: ${formatSystemStatusText(error)}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => rankingApi.deleteRankingSchema(name),
    onSuccess: async (_, name) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ranking-schemas'] }),
        queryClient.invalidateQueries({ queryKey: ['ranking-schemas', 'detail', name] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);

      const nextSchemaName = schemas.find((schema) => schema.name !== name)?.name ?? null;
      const emptyDraft = buildEmptySchema(rankingCatalog);

      setSelectedSchemaName(nextSchemaName);
      setActiveGroupIndex(0);
      setActiveFactorIndex(0);
      setIsCreatingNew(nextSchemaName === null);
      if (!nextSchemaName) {
        setDraft(emptyDraft);
        setBaselineSnapshot(serializeSchemaDetail(emptyDraft));
      }
      resetPreviewState();
      toast.success(`Ranking schema ${name} archived`);
    },
    onError: (error) => {
      toast.error(`Failed to delete ranking schema: ${formatSystemStatusText(error)}`);
    }
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      rankingApi.previewRanking({
        strategyName: previewStrategyName,
        asOfDate: previewDate,
        schema: draft.config,
        limit: 25
      }),
    onSuccess: () => {
      setLastPreviewSignature(previewSignature);
    },
    onError: (error) => {
      toast.error(`Failed to preview rankings: ${formatSystemStatusText(error)}`);
    }
  });

  const materializeMutation = useMutation({
    mutationFn: () =>
      rankingApi.materializeRankings({
        strategyName: previewStrategyName
      }),
    onSuccess: (result) => {
      toast.success(
        `Materialized ${result.rowCount} rows across ${result.dateCount} dates to platinum.${result.outputTableName}`
      );
    },
    onError: (error) => {
      toast.error(`Failed to materialize rankings: ${formatSystemStatusText(error)}`);
    }
  });

  const previewIsStale = Boolean(previewMutation.data) && lastPreviewSignature !== previewSignature;

  const listError = formatSystemStatusText(schemasError);
  const detailError = formatSystemStatusText(detailQuery.error);
  const catalogError = formatSystemStatusText(rankingCatalogError);
  const strategyDetailError = formatSystemStatusText(selectedStrategyDetailQuery.error);

  const hasSchemaName = Boolean(draft.name.trim());
  const hasUniverseConfig = Boolean(draft.config.universeConfigName);
  const hasGroups = draft.config.groups.length > 0;
  const everyGroupHasFactor =
    hasGroups && draft.config.groups.every((group) => group.factors.length > 0);
  const hasPreviewStrategy = Boolean(previewStrategyName);

  const readinessItems = [
    {
      label: 'Schema name',
      detail: hasSchemaName
        ? 'The draft has a stable saved identifier.'
        : 'Name the schema before you save it.',
      ready: hasSchemaName
    },
    {
      label: 'Ranking universe',
      detail: hasUniverseConfig
        ? 'A ranking universe config is attached.'
        : 'Attach a saved ranking universe before saving or previewing.',
      ready: hasUniverseConfig
    },
    {
      label: 'Factor coverage',
      detail: everyGroupHasFactor
        ? 'Each group has at least one factor to score.'
        : 'Every group should carry at least one factor before preview.',
      ready: everyGroupHasFactor
    },
    {
      label: 'Preview target',
      detail: hasPreviewStrategy
        ? 'A strategy is selected for preview and attachment checks.'
        : 'Select a strategy to preview the draft against.',
      ready: hasPreviewStrategy
    },
    {
      label: 'Materialize attachment',
      detail:
        attachedSchemaName && attachedSchemaName === draft.name && !hasUnsavedChanges
          ? 'The selected strategy points at this saved schema.'
          : 'Materialize will stay blocked until the selected strategy is attached to this saved schema.',
      ready: Boolean(attachedSchemaName && attachedSchemaName === draft.name && !hasUnsavedChanges)
    }
  ];

  const previewDisabled =
    previewMutation.isPending || !hasPreviewStrategy || !hasUniverseConfig || !everyGroupHasFactor;
  const saveDisabled = saveMutation.isPending || !hasSchemaName || !hasUniverseConfig;

  const materializeBlockingReason = (() => {
    if (!previewStrategyName) {
      return 'Select a strategy before running materialization.';
    }

    if (selectedStrategyDetailQuery.isLoading) {
      return 'Checking which ranking schema is attached to the selected strategy.';
    }

    if (strategyDetailError) {
      return 'The strategy attachment could not be verified.';
    }

    if (!selectedSchemaName || isCreatingNew) {
      return 'Save this draft as a schema and keep it loaded before materializing.';
    }

    if (hasUnsavedChanges) {
      return 'Save the current draft before materializing through a strategy attachment.';
    }

    if (!attachedSchemaName) {
      return 'Attach a ranking schema to the selected strategy before materializing.';
    }

    if (attachedSchemaName !== draft.name) {
      return `The selected strategy is attached to ${attachedSchemaName}, not ${draft.name}.`;
    }

    return null;
  })();

  const materializeDisabled = materializeMutation.isPending || Boolean(materializeBlockingReason);
  const tableNames = rankingCatalog?.tables.map((table) => table.name) || [];
  const activeGroup = draft.config.groups[activeGroupIndex] || null;
  const factorCount = draft.config.groups.reduce((count, group) => count + group.factors.length, 0);

  const replaceGroup = (groupIndex: number, nextGroup: RankingGroup) => {
    updateDraft((current) => {
      const nextGroups = current.config.groups.slice();
      if (!nextGroups[groupIndex]) return current;
      nextGroups[groupIndex] = nextGroup;
      return {
        ...current,
        config: { ...current.config, groups: nextGroups }
      };
    });
  };

  const replaceFactor = (groupIndex: number, factorIndex: number, nextFactor: RankingFactor) => {
    updateDraft((current) => {
      const nextGroups = current.config.groups.slice();
      const targetGroup = nextGroups[groupIndex];
      if (!targetGroup) return current;
      const nextFactors = nextGroups[groupIndex]?.factors.slice() || [];
      nextFactors[factorIndex] = nextFactor;
      nextGroups[groupIndex] = {
        ...targetGroup,
        factors: nextFactors
      };

      return {
        ...current,
        config: { ...current.config, groups: nextGroups }
      };
    });
  };

  const handleAddGroup = () => {
    updateDraft((current) => {
      const nextGroups = [
        ...current.config.groups,
        buildEmptyGroup(current.config.groups.length, rankingCatalog)
      ];
      return {
        ...current,
        config: { ...current.config, groups: nextGroups }
      };
    });
    setActiveGroupIndex(draft.config.groups.length);
    setActiveFactorIndex(0);
  };

  const handleDuplicateGroup = (groupIndex: number) => {
    updateDraft((current) => {
      const targetGroup = current.config.groups[groupIndex];
      if (!targetGroup) return current;

      const nextGroups = current.config.groups.slice();
      nextGroups.splice(groupIndex + 1, 0, cloneGroup(targetGroup));
      return {
        ...current,
        config: { ...current.config, groups: nextGroups }
      };
    });
    setActiveGroupIndex(groupIndex + 1);
    setActiveFactorIndex(0);
  };

  const handleMoveGroup = (groupIndex: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? groupIndex - 1 : groupIndex + 1;
    updateDraft((current) => ({
      ...current,
      config: {
        ...current.config,
        groups: moveItem(current.config.groups, groupIndex, nextIndex)
      }
    }));
    setActiveGroupIndex(nextIndex);
  };

  const handleRemoveGroup = (groupIndex: number) => {
    updateDraft((current) => ({
      ...current,
      config: {
        ...current.config,
        groups: current.config.groups.filter((_, itemIndex) => itemIndex !== groupIndex)
      }
    }));
    setActiveGroupIndex((current) =>
      clampIndex(current > groupIndex ? current - 1 : current, draft.config.groups.length - 1)
    );
    setActiveFactorIndex(0);
  };

  const handleAddFactor = () => {
    if (!activeGroup) return;

    const nextFactor = buildEmptyFactor(
      activeGroup.name || `group-${activeGroupIndex + 1}`,
      rankingCatalog
    );
    replaceGroup(activeGroupIndex, {
      ...activeGroup,
      factors: [...activeGroup.factors, nextFactor]
    });
    setActiveFactorIndex(activeGroup.factors.length);
  };

  const handleDuplicateFactor = (factorIndex: number) => {
    if (!activeGroup) return;
    const targetFactor = activeGroup.factors[factorIndex];
    if (!targetFactor) return;

    const nextFactors = activeGroup.factors.slice();
    nextFactors.splice(factorIndex + 1, 0, cloneFactor(targetFactor));
    replaceGroup(activeGroupIndex, {
      ...activeGroup,
      factors: nextFactors
    });
    setActiveFactorIndex(factorIndex + 1);
  };

  const handleMoveFactor = (factorIndex: number, direction: 'up' | 'down') => {
    if (!activeGroup) return;
    const nextIndex = direction === 'up' ? factorIndex - 1 : factorIndex + 1;

    replaceGroup(activeGroupIndex, {
      ...activeGroup,
      factors: moveItem(activeGroup.factors, factorIndex, nextIndex)
    });
    setActiveFactorIndex(nextIndex);
  };

  const handleRemoveFactor = (factorIndex: number) => {
    if (!activeGroup) return;

    replaceGroup(activeGroupIndex, {
      ...activeGroup,
      factors: activeGroup.factors.filter((_, itemIndex) => itemIndex !== factorIndex)
    });
    setActiveFactorIndex((current) =>
      clampIndex(current > factorIndex ? current - 1 : current, activeGroup.factors.length - 1)
    );
  };

  const handleDeleteSchema = () => {
    if (!selectedSchemaName) return;

    const shouldDelete = window.confirm(`Delete ranking schema ${selectedSchemaName}?`);
    if (!shouldDelete) return;

    deleteMutation.mutate(selectedSchemaName);
  };

  return (
    <div className={embedded ? 'space-y-6' : 'page-shell space-y-6'}>
      {!embedded && (
        <PageHero
          kicker="Ranking Configuration"
          title="Ranking Workbench"
          subtitle="Build ranking schemas as a guided scoring stack instead of managing one long ladder of dropdowns and nested buttons."
          actions={
            <>
              <Sheet open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline" className="xl:hidden">
                    <LayoutPanelLeft className="h-4 w-4" />
                    Browse Schemas
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[92vw] border-mcm-walnut bg-background p-0 sm:max-w-xl"
                >
                  <SheetHeader className="border-b border-border/40">
                    <SheetTitle>Ranking Schema Library</SheetTitle>
                    <SheetDescription>
                      Switch between saved schemas or open a new draft workspace.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="h-[calc(100vh-84px)] overflow-hidden p-4">
                    <RankingSchemaLibrary
                      schemas={schemas}
                      selectedSchemaName={selectedSchemaName}
                      isCreatingNew={isCreatingNew}
                      hasUnsavedChanges={hasUnsavedChanges}
                      draftName={draft.name}
                      isLoading={isSchemasLoading}
                      error={listError}
                      onCreateNew={openNewDraft}
                      onSelectSchema={loadSchema}
                      className="h-full border-0 shadow-none before:hidden after:hidden"
                    />
                  </div>
                </SheetContent>
              </Sheet>

              <Button type="button" variant="secondary" onClick={openNewDraft}>
                <Plus className="h-4 w-4" />
                New Draft
              </Button>
            </>
          }
          metrics={[
            {
              label: 'Saved Schemas',
              value: String(schemas.length),
              detail: 'Published ranking schemas available in the library.'
            },
            {
              label: 'Draft Status',
              value: hasUnsavedChanges ? 'Unsaved' : 'Saved',
              detail: hasUnsavedChanges
                ? 'The current workspace differs from the saved baseline.'
                : 'The current workspace matches the last saved baseline.'
            },
            {
              label: 'Structure',
              value: `${draft.config.groups.length}G / ${factorCount}F`,
              detail: 'Current groups and factors in the active workspace.'
            }
          ]}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="hidden xl:block">
          <RankingSchemaLibrary
            schemas={schemas}
            selectedSchemaName={selectedSchemaName}
            isCreatingNew={isCreatingNew}
            hasUnsavedChanges={hasUnsavedChanges}
            draftName={draft.name}
            isLoading={isSchemasLoading}
            error={listError}
            onCreateNew={openNewDraft}
            onSelectSchema={loadSchema}
          />
        </div>

        <div className="space-y-6">
          {detailQuery.isLoading && selectedSchemaName && !isCreatingNew ? (
            <PageLoader
              text="Loading ranking schema..."
              variant="panel"
              className="min-h-[20rem]"
            />
          ) : detailError ? (
            <StatePanel tone="error" title="Ranking Schema Unavailable" message={detailError} />
          ) : (
            <>
              <RankingSchemaBasics
                draft={draft}
                selectedSchemaName={selectedSchemaName}
                hasUnsavedChanges={hasUnsavedChanges}
                universeConfigs={universeConfigs}
                onNameChange={(value) => updateDraft((current) => ({ ...current, name: value }))}
                onDescriptionChange={(value) =>
                  updateDraft((current) => ({ ...current, description: value }))
                }
                onUniverseConfigChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    config: {
                      ...current.config,
                      universeConfigName: value
                    }
                  }))
                }
              />

              <RankingGroupOverview
                groups={draft.config.groups}
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

              {isCatalogLoading ? (
                <PageLoader
                  text="Loading ranking catalog..."
                  variant="panel"
                  className="min-h-[12rem]"
                />
              ) : catalogError ? (
                <StatePanel
                  tone="error"
                  title="Ranking Catalog Unavailable"
                  message={catalogError}
                />
              ) : undefined}

              <RankingGroupWorkspace
                group={activeGroup}
                groupIndex={activeGroupIndex}
                activeFactorIndex={activeFactorIndex}
                catalogByTable={catalogByTable}
                tableNames={tableNames}
                onChangeGroup={(nextGroup) => replaceGroup(activeGroupIndex, nextGroup)}
                onChangeGroupTransforms={(nextTransforms) => {
                  if (!activeGroup) return;
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
                  if (!nextFactor) return;
                  replaceFactor(activeGroupIndex, factorIndex, {
                    ...nextFactor,
                    transforms: nextTransforms
                  });
                }}
              />

              <RankingTransformSequenceEditor
                title="4. Overall Transforms"
                description="Apply final transforms after the group scores have already been combined into the overall ranking."
                transforms={draft.config.overallTransforms}
                onChange={(nextTransforms) =>
                  updateDraft((current) => ({
                    ...current,
                    config: { ...current.config, overallTransforms: nextTransforms }
                  }))
                }
                addLabel="Add Overall Transform"
              />

              <div className="flex justify-between gap-3 rounded-3xl border border-mcm-walnut/20 bg-mcm-paper/60 p-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Schema Lifecycle
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Delete the currently loaded saved schema only after you have moved dependent
                    strategies away from it.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDeleteSchema}
                  disabled={!selectedSchemaName || deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Archiving...' : 'Archive Schema'}
                </Button>
              </div>

              <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
                <div className="rounded-3xl border border-mcm-walnut/20 bg-mcm-paper/60">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="space-y-1">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                        Advanced
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Inspect the normalized JSON payload without keeping it in view during normal
                        editing.
                      </p>
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="outline">
                        {isAdvancedOpen ? 'Hide JSON Preview' : 'Show JSON Preview'}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <div className="px-5 pb-5">
                      <Textarea
                        id="ranking-config-preview"
                        readOnly
                        className="min-h-[220px] font-mono text-xs"
                        value={JSON.stringify(draft.config, null, 2)}
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </>
          )}
        </div>

        <RankingPreviewRail
          draft={draft}
          schemaLabel={selectedSchemaLabel}
          strategies={strategies}
          previewStrategyName={previewStrategyName}
          previewDate={previewDate}
          onPreviewStrategyNameChange={(value) => {
            setPreviewStrategyName(value);
            resetPreviewState();
          }}
          onPreviewDateChange={(value) => {
            setPreviewDate(value);
            resetPreviewState();
          }}
          onSave={() => saveMutation.mutate()}
          saveDisabled={saveDisabled}
          savePending={saveMutation.isPending}
          onPreview={() => previewMutation.mutate()}
          previewDisabled={previewDisabled}
          previewPending={previewMutation.isPending}
          onMaterialize={() => materializeMutation.mutate()}
          materializeDisabled={materializeDisabled}
          materializePending={materializeMutation.isPending}
          previewResult={previewMutation.data}
          previewIsStale={previewIsStale}
          readinessItems={readinessItems}
          attachedSchemaName={attachedSchemaName}
          strategyDetailLoading={selectedStrategyDetailQuery.isLoading}
          strategyDetailError={strategyDetailError}
          materializeBlockingReason={materializeBlockingReason}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      </div>
    </div>
  );
}
