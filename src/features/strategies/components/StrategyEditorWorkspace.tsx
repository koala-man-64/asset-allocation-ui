import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CopyPlus, Plus, Trash2 } from 'lucide-react';
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
import { rankingApi } from '@/services/rankingApi';
import { strategyApi } from '@/services/strategyApi';
import { universeApi } from '@/services/universeApi';
import type { StrategyDetail } from '@/types/strategy';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import {
  buildDefaultRegimePolicy,
  buildEmptyStrategy,
  buildExitRule,
  buildStrategyDraft,
  EXIT_RULE_OPTIONS,
  getNextRuleId,
  getRuleValueLabel,
  INTRABAR_OPTIONS,
  PRICE_FIELD_OPTIONS,
  REGIME_BLOCKED_ACTIONS,
  REGIME_CODES,
  toOptionalNumber,
  type StrategyEditorMode
} from '@/features/strategies/lib/strategyDraft';
import { summarizeExitStack } from '@/features/strategies/lib/strategySummary';
import { toast } from 'sonner';

interface StrategyEditorWorkspaceProps {
  mode: StrategyEditorMode;
  sourceStrategyName?: string | null;
  strategy?: StrategyDetail | null;
  isHydrating: boolean;
  errorMessage: string;
  onCancel: () => void;
  onSaved: (strategy: StrategyDetail) => void;
}

const SECTION_IDS = ['metadata', 'config', 'regime', 'exits'] as const;
const SECTION_LABELS: Record<(typeof SECTION_IDS)[number], string> = {
  metadata: 'Desk Identity',
  config: 'Core Setup',
  regime: 'Regime Gates',
  exits: 'Exit Stack'
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
    return 'Author a new strategy record without leaving the desk workspace.';
  }

  if (mode === 'duplicate') {
    return `Seed a new strategy from ${sourceStrategyName || 'the selected record'} while requiring a new name before save.`;
  }

  return `Adjust the saved settings for ${sourceStrategyName || 'the selected strategy'} and keep the payload shape unchanged.`;
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
  const [newRuleType, setNewRuleType] = useState<'stop_loss_fixed' | 'take_profit_fixed' | 'trailing_stop_pct' | 'trailing_stop_atr' | 'time_stop'>('stop_loss_fixed');
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const baselineRef = useRef<StrategyDetail>(buildEmptyStrategy());

  const rankingSchemasQuery = useQuery({
    queryKey: ['ranking-schemas'],
    queryFn: () => rankingApi.listRankingSchemas()
  });
  const universeConfigsQuery = useQuery({
    queryKey: ['universe-configs'],
    queryFn: () => universeApi.listUniverseConfigs()
  });

  const {
    control,
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

  const { fields, append, move, remove, update } = useFieldArray({
    control,
    name: 'config.exits'
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
  const watchedUniverseConfigName = watch('config.universeConfigName');
  const watchedUniverseConfig = watchedUniverseConfigName || '__none__';
  const watchedRebalance = watch('config.rebalance');
  const watchedRankingSchemaName = watch('config.rankingSchemaName');
  const watchedRankingSchema = watchedRankingSchemaName || '__none__';
  const watchedPolicy = watch('config.intrabarConflictPolicy');
  const watchedLongOnly = watch('config.longOnly');
  const watchedRegimePolicy = watch('config.regimePolicy');
  const hasRegimePolicy = Boolean(watchedRegimePolicy);
  const effectiveRegimePolicy = watchedRegimePolicy || buildDefaultRegimePolicy();
  const watchedExits = watch('config.exits') || [];
  const draftName = watch('name');
  const rankingSchemasErrorMessage = formatSystemStatusText(rankingSchemasQuery.error);
  const universeConfigsErrorMessage = formatSystemStatusText(universeConfigsQuery.error);
  const currentUniverseAttachment = getValues('config.universeConfigName')?.trim();
  const currentRankingAttachment = getValues('config.rankingSchemaName')?.trim();
  const fallbackUniverseAttachment =
    currentUniverseAttachment ||
    strategy?.config.universeConfigName ||
    baselineRef.current.config.universeConfigName;
  const fallbackRankingAttachment =
    currentRankingAttachment ||
    strategy?.config.rankingSchemaName ||
    baselineRef.current.config.rankingSchemaName;

  const headerBadge = useMemo(() => {
    if (mode === 'create') {
      return 'Blank draft';
    }

    if (mode === 'duplicate') {
      return 'Duplicate as new';
    }

    return 'Saved record';
  }, [mode]);

  const onSubmit = (data: StrategyDetail) => {
    saveMutation.mutate(data);
  };

  const addExitRule = () => {
    const existingRules = getValues('config.exits') || [];
    const newRuleId = getNextRuleId(newRuleType, existingRules);

    append(
      buildExitRule(newRuleType, newRuleId, {
        priority: existingRules.length
      })
    );
  };

  const changeRuleType = (index: number, nextType: typeof newRuleType) => {
    const currentRule = getValues(`config.exits.${index}` as const);
    update(
      index,
      buildExitRule(nextType, currentRule.id, {
        minHoldBars: currentRule.minHoldBars,
        priority: currentRule.priority
      })
    );
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

  return (
    <>
      <aside className="mcm-panel flex min-h-[680px] flex-col overflow-hidden">
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section id="metadata" className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div>
                <h3 className="font-display text-lg text-foreground">Metadata</h3>
                <p className="text-sm text-muted-foreground">
                  Desk naming and strategy identity should be explicit before any parameter changes.
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

            <section id="config" className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div>
                <h3 className="font-display text-lg text-foreground">Core Configuration</h3>
                <p className="text-sm text-muted-foreground">
                  Universe, ranking attachment, cadence, and portfolio shape stay grouped here.
                </p>
              </div>

              {universeConfigsErrorMessage || rankingSchemasErrorMessage ? (
                <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/10 p-4 text-sm">
                  <p className="font-semibold text-destructive">Attachment catalogs unavailable</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {universeConfigsErrorMessage ? (
                      <p>Universe lookup failed: {universeConfigsErrorMessage}</p>
                    ) : null}
                    {rankingSchemasErrorMessage ? (
                      <p>Ranking lookup failed: {rankingSchemasErrorMessage}</p>
                    ) : null}
                    <p>Existing attachments stay visible, but attachment changes are frozen until the catalogs reload.</p>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="strategy-universe-config">Universe Config</Label>
                  {universeConfigsErrorMessage ? (
                    <>
                      <Input
                        id="strategy-universe-config"
                        readOnly
                        value={fallbackUniverseAttachment || 'No universe config attached'}
                      />
                      <span className="text-xs text-destructive">
                        Universe attachments are read-only until the catalog reloads.
                      </span>
                    </>
                  ) : (
                    <Select
                      value={watchedUniverseConfig}
                      disabled={universeConfigsQuery.isLoading}
                      onValueChange={(value) =>
                        setValue('config.universeConfigName', value === '__none__' ? undefined : value, {
                          shouldDirty: true,
                          shouldTouch: true
                        })
                      }
                    >
                      <SelectTrigger id="strategy-universe-config">
                        <SelectValue
                          placeholder={
                            universeConfigsQuery.isLoading
                              ? 'Loading universe configs...'
                              : 'Select universe config'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No universe config</SelectItem>
                        {(universeConfigsQuery.data || []).map((universe) => (
                          <SelectItem key={universe.name} value={universe.name}>
                            {universe.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ranking-schema">Ranking Schema</Label>
                  {rankingSchemasErrorMessage ? (
                    <>
                      <Input
                        id="ranking-schema"
                        readOnly
                        value={fallbackRankingAttachment || 'No ranking schema attached'}
                      />
                      <span className="text-xs text-destructive">
                        Ranking attachments are read-only until the catalog reloads.
                      </span>
                    </>
                  ) : (
                    <Select
                      value={watchedRankingSchema}
                      disabled={rankingSchemasQuery.isLoading}
                      onValueChange={(value) =>
                        setValue('config.rankingSchemaName', value === '__none__' ? undefined : value, {
                          shouldDirty: true,
                          shouldTouch: true
                        })
                      }
                    >
                      <SelectTrigger id="ranking-schema">
                        <SelectValue
                          placeholder={
                            rankingSchemasQuery.isLoading
                              ? 'Loading ranking schemas...'
                              : 'Select ranking schema'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No ranking schema</SelectItem>
                        {(rankingSchemasQuery.data || []).map((schema) => (
                          <SelectItem key={schema.name} value={schema.name}>
                            {schema.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="rebalance">Rebalance Frequency</Label>
                  <Select
                    value={watchedRebalance}
                    onValueChange={(value) =>
                      setValue('config.rebalance', value, { shouldDirty: true, shouldTouch: true })
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
                  <Label htmlFor="intrabar-policy">Intrabar Conflict Policy</Label>
                  <Select
                    value={watchedPolicy}
                    onValueChange={(value) =>
                      setValue('config.intrabarConflictPolicy', value, {
                        shouldDirty: true,
                        shouldTouch: true
                      })
                    }
                  >
                    <SelectTrigger id="intrabar-policy">
                      <SelectValue placeholder="Select policy" />
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
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="grid gap-2">
                  <Label htmlFor="top-n">Top N</Label>
                  <Input
                    id="top-n"
                    type="number"
                    {...register('config.topN', { valueAsNumber: true })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lookback">Lookback Bars</Label>
                  <Input
                    id="lookback"
                    type="number"
                    {...register('config.lookbackWindow', { valueAsNumber: true })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="holding">Holding Bars</Label>
                  <Input
                    id="holding"
                    type="number"
                    {...register('config.holdingPeriod', { valueAsNumber: true })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cost-model">Cost Model</Label>
                  <Input id="cost-model" {...register('config.costModel')} />
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">Long Only</p>
                    <p className="text-sm text-muted-foreground">
                      Keep the basic execution stance explicit in the draft.
                    </p>
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
            </section>

            <section id="regime" className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg text-foreground">Regime Policy</h3>
                  <p className="text-sm text-muted-foreground">
                    Regime gating stays inspectable so the desk can see where new risk gets blocked.
                  </p>
                </div>

                {hasRegimePolicy ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setValue('config.regimePolicy', undefined, {
                        shouldDirty: true,
                        shouldTouch: true
                      })
                    }
                  >
                    Remove Policy
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() =>
                      setValue('config.regimePolicy', buildDefaultRegimePolicy(), {
                        shouldDirty: true,
                        shouldTouch: true
                      })
                    }
                  >
                    Add Policy
                  </Button>
                )}
              </div>

              {hasRegimePolicy ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="grid gap-2 xl:col-span-2">
                      <Label htmlFor="regime-model-name">Model Name</Label>
                      <Input id="regime-model-name" {...register('config.regimePolicy.modelName')} />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="regime-on-blocked">Blocked Action</Label>
                      <Select
                        value={effectiveRegimePolicy.onBlocked}
                        onValueChange={(value) =>
                          setValue('config.regimePolicy.onBlocked', value, {
                            shouldDirty: true,
                            shouldTouch: true
                          })
                        }
                      >
                        <SelectTrigger id="regime-on-blocked">
                          <SelectValue placeholder="Select blocked action" />
                        </SelectTrigger>
                        <SelectContent>
                          {REGIME_BLOCKED_ACTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Block on Transition</p>
                          <p className="text-sm text-muted-foreground">
                            Stop new risk while the regime is unresolved.
                          </p>
                        </div>
                        <Switch
                          aria-label="Toggle block on transition"
                          checked={Boolean(effectiveRegimePolicy.blockOnTransition)}
                          onCheckedChange={(checked) =>
                            setValue('config.regimePolicy.blockOnTransition', Boolean(checked), {
                              shouldDirty: true,
                              shouldTouch: true
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Block on Unclassified</p>
                          <p className="text-sm text-muted-foreground">
                            Keep the strategy conservative when regime inputs are missing.
                          </p>
                        </div>
                        <Switch
                          aria-label="Toggle block on unclassified"
                          checked={Boolean(effectiveRegimePolicy.blockOnUnclassified)}
                          onCheckedChange={(checked) =>
                            setValue('config.regimePolicy.blockOnUnclassified', Boolean(checked), {
                              shouldDirty: true,
                              shouldTouch: true
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Honor Halt Flag</p>
                          <p className="text-sm text-muted-foreground">
                            Apply the halt overlay before new entries are opened.
                          </p>
                        </div>
                        <Switch
                          aria-label="Toggle honor halt flag"
                          checked={Boolean(effectiveRegimePolicy.honorHaltFlag)}
                          onCheckedChange={(checked) =>
                            setValue('config.regimePolicy.honorHaltFlag', Boolean(checked), {
                              shouldDirty: true,
                              shouldTouch: true
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h4 className="font-display text-base text-foreground">Target Gross Exposure</h4>
                      <p className="text-sm text-muted-foreground">
                        These multipliers scale gross exposure only when the regime is confirmed.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      {REGIME_CODES.map((regime) => (
                        <div key={regime.value} className="grid gap-2">
                          <Label htmlFor={`regime-exposure-${regime.value}`}>{regime.label}</Label>
                          <Input
                            id={`regime-exposure-${regime.value}`}
                            type="number"
                            step="0.05"
                            min="0"
                            {...register(
                              `config.regimePolicy.targetGrossExposureByRegime.${regime.value}` as const,
                              { valueAsNumber: true }
                            )}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
                  No regime policy configured for this draft.
                </div>
              )}
            </section>

            <section id="exits" className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h3 className="font-display text-lg text-foreground">Exit Rules</h3>
                  <p className="text-sm text-muted-foreground">
                    Current stack summary: {summarizeExitStack(getValues())}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={newRuleType} onValueChange={(value) => setNewRuleType(value as typeof newRuleType)}>
                    <SelectTrigger className="min-w-[220px]">
                      <SelectValue placeholder="Choose rule type" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXIT_RULE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={addExitRule}>
                    <Plus className="h-4 w-4" />
                    Add Exit Rule
                  </Button>
                </div>
              </div>

              {fields.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-4 text-sm text-muted-foreground">
                  No exit rules configured yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {fields.map((field, index) => {
                    const currentRule = watchedExits[index];
                    const ruleType = currentRule?.type || field.type;
                    const ruleValueLabel = getRuleValueLabel(ruleType);

                    return (
                      <div
                        key={field.id}
                        className="space-y-4 rounded-[1.6rem] border border-mcm-walnut/25 bg-mcm-cream/65 p-4"
                      >
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="grid gap-2 xl:min-w-[260px]">
                            <Label htmlFor={`exit-rule-type-${index}`}>Rule Type</Label>
                            <Select
                              value={ruleType}
                              onValueChange={(value) => changeRuleType(index, value as typeof newRuleType)}
                            >
                              <SelectTrigger id={`exit-rule-type-${index}`}>
                                <SelectValue placeholder="Select rule type" />
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

                          <div className="flex items-center gap-2 self-end xl:self-auto">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => move(index, index - 1)}
                              disabled={index === 0}
                              aria-label={`Move exit rule ${index + 1} up`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => move(index, index + 1)}
                              disabled={index === fields.length - 1}
                              aria-label={`Move exit rule ${index + 1} down`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => remove(index)}
                              aria-label={`Remove exit rule ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-id-${index}`}>Rule ID</Label>
                            <Input
                              id={`exit-rule-id-${index}`}
                              {...register(`config.exits.${index}.id` as const, { required: true })}
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-priority-${index}`}>Priority</Label>
                            <Input
                              id={`exit-rule-priority-${index}`}
                              type="number"
                              {...register(`config.exits.${index}.priority` as const, {
                                setValueAs: toOptionalNumber
                              })}
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-min-hold-${index}`}>Min Hold Bars</Label>
                            <Input
                              id={`exit-rule-min-hold-${index}`}
                              type="number"
                              {...register(`config.exits.${index}.minHoldBars` as const, {
                                valueAsNumber: true
                              })}
                            />
                          </div>

                          <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-paper/85 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                              Rule Shape
                            </p>
                            <p className="mt-2 text-sm text-foreground">Scope: position | action: exit_full</p>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="grid gap-2">
                            <Label htmlFor={`exit-rule-price-field-${index}`}>Price Field</Label>
                            <Select
                              value={
                                currentRule?.priceField ||
                                (ruleType === 'take_profit_fixed'
                                  ? 'high'
                                  : ruleType === 'time_stop'
                                    ? 'close'
                                    : 'low')
                              }
                              onValueChange={(value) =>
                                setValue(`config.exits.${index}.priceField` as const, value, {
                                  shouldDirty: true,
                                  shouldTouch: true
                                })
                              }
                            >
                              <SelectTrigger id={`exit-rule-price-field-${index}`}>
                                <SelectValue placeholder="Select price field" />
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
                            <Label htmlFor={`exit-rule-value-${index}`}>{ruleValueLabel}</Label>
                            <Input
                              id={`exit-rule-value-${index}`}
                              type="number"
                              step={ruleType === 'time_stop' ? 1 : 0.01}
                              {...register(`config.exits.${index}.value` as const, {
                                setValueAs: toOptionalNumber
                              })}
                            />
                          </div>

                          {ruleType === 'trailing_stop_atr' ? (
                            <div className="grid gap-2 md:col-span-2">
                              <Label htmlFor={`exit-rule-atr-column-${index}`}>ATR Column</Label>
                              <Input
                                id={`exit-rule-atr-column-${index}`}
                                {...register(`config.exits.${index}.atrColumn` as const)}
                              />
                            </div>
                          ) : (
                            <div className="grid gap-2 md:col-span-2">
                              <Label htmlFor={`exit-rule-reference-${index}`}>Reference</Label>
                              <Input
                                id={`exit-rule-reference-${index}`}
                                readOnly
                                value={
                                  currentRule?.reference ||
                                  (ruleType === 'take_profit_fixed' || ruleType === 'stop_loss_fixed'
                                    ? 'entry_price'
                                    : ruleType === 'time_stop'
                                      ? ''
                                      : 'highest_since_entry')
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="border-t border-border/40 bg-mcm-paper/95 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-muted-foreground">
                {isDirty
                  ? 'Draft has unsaved changes.'
                  : 'Draft matches the last loaded baseline.'}
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
                  {saveMutation.isPending ? 'Saving...' : mode === 'edit' ? 'Save Strategy' : 'Save New Strategy'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}
      </aside>

      <AlertDialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
        <AlertDialogContent className="border-2 border-mcm-walnut bg-mcm-paper">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-foreground">
              Discard Draft Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              Close the editor and abandon unsaved strategy changes. The saved strategy record stays
              unchanged until you explicitly save.
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
