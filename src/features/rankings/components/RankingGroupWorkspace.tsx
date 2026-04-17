import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { cn } from '@/app/components/ui/utils';
import type { RankingCatalogColumn, RankingFactor, RankingGroup, RankingTransform } from '@/types/strategy';
import { formatDirectionLabel, formatMissingPolicyLabel } from './rankingEditorUtils';
import { RankingFactorInspector } from './RankingFactorInspector';
import { RankingTransformSequenceEditor } from './RankingTransformSequenceEditor';

interface RankingGroupWorkspaceProps {
  group: RankingGroup | null;
  groupIndex: number;
  activeFactorIndex: number;
  catalogByTable: Map<string, RankingCatalogColumn[]>;
  tableNames: string[];
  onChangeGroup: (nextGroup: RankingGroup) => void;
  onChangeGroupTransforms: (nextTransforms: RankingTransform[]) => void;
  onAddFactor: () => void;
  onSelectFactor: (index: number) => void;
  onDuplicateFactor: (index: number) => void;
  onMoveFactor: (index: number, direction: 'up' | 'down') => void;
  onRemoveFactor: (index: number) => void;
  onChangeFactor: (index: number, nextFactor: RankingFactor) => void;
  onChangeFactorTransforms: (index: number, nextTransforms: RankingTransform[]) => void;
}

export function RankingGroupWorkspace({
  group,
  groupIndex,
  activeFactorIndex,
  catalogByTable,
  tableNames,
  onChangeGroup,
  onChangeGroupTransforms,
  onAddFactor,
  onSelectFactor,
  onDuplicateFactor,
  onMoveFactor,
  onRemoveFactor,
  onChangeFactor,
  onChangeFactorTransforms
}: RankingGroupWorkspaceProps) {
  if (!group) {
    return (
      <Card>
        <CardHeader className="border-b border-border/40">
          <div className="space-y-1">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              3. Active Group
            </div>
            <CardTitle className="text-xl">Group workspace</CardTitle>
            <CardDescription>
              Pick a group from the overview to edit its weighting, group transforms, and factor roster.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/70 p-6 text-sm text-muted-foreground">
            There is no active group yet. Add a group in the section above to continue building the schema.
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeFactor = group.factors[activeFactorIndex] || null;

  return (
    <Card>
      <CardHeader className="border-b border-border/40">
        <div className="space-y-1">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            3. Active Group
          </div>
          <CardTitle className="text-xl">{group.name || `Group ${groupIndex + 1}`}</CardTitle>
          <CardDescription>
            Edit one group at a time so factor details stay readable instead of cascading into a single long form.
          </CardDescription>
        </div>
        <CardAction className="flex items-center gap-2">
          <Badge variant="secondary">{group.factors.length} factors</Badge>
          <Badge variant="outline">Weight {group.weight}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              value={group.name}
              onChange={(event) => onChangeGroup({ ...group, name: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-weight">Group Weight</Label>
            <Input
              id="group-weight"
              type="number"
              step="0.1"
              value={group.weight}
              onChange={(event) =>
                onChangeGroup({
                  ...group,
                  weight: Number(event.target.value) || 0
                })
              }
            />
          </div>
        </div>

        <RankingTransformSequenceEditor
          title="Group Transforms"
          description="Run these after factor scores are aggregated for the group."
          transforms={group.transforms}
          onChange={onChangeGroupTransforms}
        />

        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Factor Roster
              </div>
              <p className="text-sm text-muted-foreground">
                Keep the roster compact on the left and drive detailed edits from the inspector on the right.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={onAddFactor}>
              <Plus className="h-4 w-4" />
              Add Factor
            </Button>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
            <div className="space-y-3">
              {group.factors.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/70 p-5 text-sm text-muted-foreground">
                  No factors yet. Add one to connect this group to a numeric gold column.
                </div>
              ) : (
                group.factors.map((factor, factorIndex) => {
                  const isActive = factorIndex === activeFactorIndex;

                  return (
                    <div
                      key={`${factor.name}-${factorIndex}`}
                      className={cn(
                        'rounded-3xl border border-mcm-walnut/20 bg-card/85 p-4 shadow-[4px_4px_0px_0px_rgba(119,63,26,0.08)] transition-colors',
                        isActive && 'border-mcm-walnut bg-mcm-cream'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          className="flex flex-1 flex-col items-start gap-2 text-left"
                          onClick={() => onSelectFactor(factorIndex)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-display text-lg text-foreground">
                              {factor.name || `Factor ${factorIndex + 1}`}
                            </span>
                            {isActive ? <Badge variant="secondary">Inspecting</Badge> : null}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {factor.table}.{factor.column}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Weight {factor.weight} · {formatDirectionLabel(factor.direction)} ·{' '}
                            {formatMissingPolicyLabel(factor.missingValuePolicy)}
                          </p>
                        </button>
                        <Badge variant="outline">#{factorIndex + 1}</Badge>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Move factor ${factor.name || factorIndex + 1} up`}
                          onClick={() => onMoveFactor(factorIndex, 'up')}
                          disabled={factorIndex === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Move factor ${factor.name || factorIndex + 1} down`}
                          onClick={() => onMoveFactor(factorIndex, 'down')}
                          disabled={factorIndex === group.factors.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onDuplicateFactor(factorIndex)}
                        >
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onRemoveFactor(factorIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <RankingFactorInspector
              factor={activeFactor}
              catalogByTable={catalogByTable}
              tableNames={tableNames}
              onChange={(nextFactor) => onChangeFactor(activeFactorIndex, nextFactor)}
              onChangeTransforms={(nextTransforms) =>
                onChangeFactorTransforms(activeFactorIndex, nextTransforms)
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
