import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { UniverseRuleBuilder } from '@/features/universes/components/UniverseRuleBuilder';
import {
  buildEmptyUniverse,
  collectUniverseFields,
  countUniverseConditions,
  summarizeUniverse
} from '@/features/universes/lib/universeUtils';
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
import { Textarea } from '@/app/components/ui/textarea';
import { cn } from '@/app/components/ui/utils';
import { universeApi } from '@/services/universeApi';
import type { UniverseConfigDetail } from '@/types/strategy';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

function buildEmptyUniverseConfig(): UniverseConfigDetail {
  return {
    name: '',
    description: '',
    version: 1,
    config: buildEmptyUniverse()
  };
}

function formatTimestamp(value?: string): string {
  if (!value) return 'Never updated';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

interface UniverseConfigPageProps {
  embedded?: boolean;
}

export function UniverseConfigPage({ embedded = false }: UniverseConfigPageProps = {}) {
  const queryClient = useQueryClient();
  const [selectedUniverseName, setSelectedUniverseName] = useState<string | null>(null);
  const [draft, setDraft] = useState<UniverseConfigDetail>(buildEmptyUniverseConfig());

  const {
    data: universes = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ['universe-configs'],
    queryFn: () => universeApi.listUniverseConfigs()
  });

  const detailQuery = useQuery({
    queryKey: ['universe-configs', 'detail', selectedUniverseName],
    queryFn: () => universeApi.getUniverseConfigDetail(String(selectedUniverseName)),
    enabled: Boolean(selectedUniverseName)
  });

  useEffect(() => {
    if (!selectedUniverseName && universes.length > 0) {
      setSelectedUniverseName(universes[0].name);
    }
  }, [selectedUniverseName, universes]);

  useEffect(() => {
    if (detailQuery.data) {
      setDraft(detailQuery.data);
    }
  }, [detailQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      universeApi.saveUniverseConfig({
        name: draft.name,
        description: draft.description,
        config: draft.config
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['universe-configs'] }),
        queryClient.invalidateQueries({ queryKey: ['universe-configs', 'detail', draft.name] }),
        queryClient.invalidateQueries({ queryKey: ['ranking-schemas'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      setSelectedUniverseName(draft.name);
      setDraft((current) => ({ ...current, version: result.version }));
      toast.success(`Universe config ${draft.name} saved`);
    },
    onError: (saveError) => {
      toast.error(`Failed to save universe config: ${formatSystemStatusText(saveError)}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => universeApi.deleteUniverseConfig(name),
    onSuccess: async (_, name) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['universe-configs'] }),
        queryClient.invalidateQueries({ queryKey: ['universe-configs', 'detail', name] }),
        queryClient.invalidateQueries({ queryKey: ['ranking-schemas'] }),
        queryClient.invalidateQueries({ queryKey: ['strategies'] })
      ]);
      setSelectedUniverseName(null);
      setDraft(buildEmptyUniverseConfig());
      toast.success(`Universe config ${name} archived`);
    },
    onError: (deleteError) => {
      toast.error(`Failed to delete universe config: ${formatSystemStatusText(deleteError)}`);
    }
  });

  const handleCreateNew = () => {
    setSelectedUniverseName(null);
    setDraft(buildEmptyUniverseConfig());
  };

  const listError = formatSystemStatusText(error);
  const detailError = formatSystemStatusText(detailQuery.error);
  const selectedUniverseLabel = selectedUniverseName || draft.name || 'New Universe Configuration';
  const fieldCount = collectUniverseFields(draft.config.root).length;
  const conditionCount = countUniverseConditions(draft.config.root);
  const draftSummary = summarizeUniverse(draft.config);

  return (
    <div className={embedded ? 'space-y-6' : 'page-shell space-y-6'}>
      {!embedded && (
        <PageHero
          kicker="Universe Control Plane"
          title="Universe Configurations"
          subtitle="Define reusable symbol eligibility logic from Postgres gold data, validate the current matching set, and publish versioned definitions used by run configurations and ranking schemas."
          actions={
            <>
              <Button variant="outline" onClick={handleCreateNew}>
                <Plus className="h-4 w-4" />
                New Universe Configuration
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !draft.name.trim()}
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Universe Configuration'}
              </Button>
            </>
          }
          metrics={[
            {
              label: 'Saved Definitions',
              value: String(universes.length),
              detail: 'Versioned universes available for reuse.'
            },
            {
              label: 'Current Version',
              value: `v${draft.version || 1}`,
              detail: selectedUniverseName
                ? 'Published revision loaded in the editor.'
                : 'Draft version for a new universe.'
            },
            {
              label: 'Conditions',
              value: String(conditionCount),
              detail: 'Individual eligibility checks in the active rule tree.'
            },
            {
              label: 'Referenced Fields',
              value: String(fieldCount),
              detail: 'Public field ids currently used by the active definition.'
            }
          ]}
          metricsClassName="sm:grid-cols-2 xl:grid-cols-4"
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="mcm-panel border border-border/60 bg-card shadow-sm">
          <CardHeader className="border-b border-border/60">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">Universe Library</CardTitle>
              <CardDescription>
                Review published definitions and load one into the editor.
              </CardDescription>
            </div>
            <CardAction>
              <Badge variant="outline">{universes.length} total</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {isLoading ? (
              <PageLoader text="Loading universe configurations..." variant="panel" />
            ) : listError ? (
              <StatePanel tone="error" title="Universe Library Unavailable" message={listError} />
            ) : universes.length === 0 ? (
              <StatePanel
                tone="empty"
                title="No Universe Configurations"
                message="Create a universe to reuse eligibility logic across strategies and rankings."
              />
            ) : (
              <div className="space-y-3">
                {universes.map((universe) => {
                  const isSelected = universe.name === selectedUniverseName;
                  return (
                    <button
                      key={universe.name}
                      type="button"
                      className={cn(
                        'w-full rounded-xl border px-4 py-4 text-left transition-colors',
                        isSelected
                          ? 'border-primary/40 bg-accent/30 shadow-sm'
                          : 'border-border/60 bg-background hover:bg-muted/25'
                      )}
                      onClick={() => setSelectedUniverseName(universe.name)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="truncate font-mono text-sm font-semibold text-foreground">
                            {universe.name}
                          </div>
                          <div className="text-sm leading-5 text-muted-foreground">
                            {universe.description || 'No description provided.'}
                          </div>
                        </div>
                        <Badge variant={isSelected ? 'default' : 'outline'} className="shrink-0">
                          v{universe.version}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Updated {formatTimestamp(universe.updated_at)}</span>
                        {isSelected && (
                          <span className="font-medium text-foreground">Selected</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mcm-panel border border-border/60 bg-card shadow-sm">
          <CardHeader className="gap-4 border-b border-border/60">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold">Universe Editor</CardTitle>
                <CardDescription>
                  Maintain the active definition, inspect its structure, and publish a versioned
                  update.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit gap-1.5 font-mono">
                <Globe className="h-3.5 w-3.5" />
                {selectedUniverseLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {detailQuery.isLoading && selectedUniverseName ? (
              <PageLoader text="Loading universe configuration..." variant="panel" />
            ) : detailError ? (
              <StatePanel tone="error" title="Universe Detail Unavailable" message={detailError} />
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="universe-name">Universe Name</Label>
                        <Input
                          id="universe-name"
                          readOnly={Boolean(selectedUniverseName)}
                          value={draft.name}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="e.g. large-cap-quality"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="universe-description">Description</Label>
                        <Input
                          id="universe-description"
                          value={draft.description || ''}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              description: event.target.value
                            }))
                          }
                          placeholder="Describe the eligible symbol set."
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Definition summary
                      </div>
                      <div className="mt-2 text-sm font-medium text-foreground">{draftSummary}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Saved universes are reused by run configurations and ranking schemas after
                        publish.
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Version
                      </div>
                      <div className="mt-2 font-mono text-lg font-semibold text-foreground">
                        v{draft.version || 1}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Source
                      </div>
                      <div className="mt-2 font-mono text-lg font-semibold text-foreground">
                        {draft.config.source}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Current scope
                      </div>
                      <div className="mt-2 text-sm font-medium text-foreground">
                        {conditionCount} conditions across {fieldCount} fields
                      </div>
                    </div>
                  </div>
                </div>

                <UniverseRuleBuilder
                  value={draft.config}
                  onChange={(nextValue) =>
                    setDraft((current) => ({ ...current, config: nextValue }))
                  }
                />

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                  <div className="space-y-2">
                    <Label htmlFor="universe-config-preview">Serialized Definition</Label>
                    <Textarea
                      id="universe-config-preview"
                      readOnly
                      className="min-h-[220px] border-border/70 bg-background font-mono text-xs leading-5"
                      value={JSON.stringify(draft.config, null, 2)}
                    />
                  </div>

                  {selectedUniverseName && (
                    <div className="flex justify-end xl:pt-8">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => deleteMutation.mutate(selectedUniverseName)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleteMutation.isPending ? 'Archiving...' : 'Archive Universe Configuration'}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
