import { ArrowDown, ArrowUp, Copy, Layers3, Trash2 } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { cn } from '@/app/components/ui/utils';
import type { RankingGroup } from '@/types/strategy';

interface RankingGroupOverviewProps {
  groups: RankingGroup[];
  activeGroupIndex: number;
  onSelectGroup: (index: number) => void;
  onAddGroup: () => void;
  onDuplicateGroup: (index: number) => void;
  onMoveGroup: (index: number, direction: 'up' | 'down') => void;
  onRemoveGroup: (index: number) => void;
}

export function RankingGroupOverview({
  groups,
  activeGroupIndex,
  onSelectGroup,
  onAddGroup,
  onDuplicateGroup,
  onMoveGroup,
  onRemoveGroup
}: RankingGroupOverviewProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border/40">
        <div className="space-y-1">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            2. Groups
          </div>
          <CardTitle className="text-xl">Scoring stack</CardTitle>
          <CardDescription>
            Use group cards as the table of contents. Pick one to edit in depth, then duplicate or reorder without reopening nested forms.
          </CardDescription>
        </div>
        <CardAction>
          <Button type="button" variant="secondary" onClick={onAddGroup}>
            <Layers3 className="h-4 w-4" />
            Add Group
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="pt-6">
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/70 p-5 text-sm text-muted-foreground">
            No groups yet. Add one to start defining a weighted ranking stack.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((group, index) => {
              const isActive = index === activeGroupIndex;

              return (
                <div
                  key={`${group.name}-${index}`}
                  className={cn(
                    'rounded-3xl border border-mcm-walnut/20 bg-card/85 p-4 shadow-[4px_4px_0px_0px_rgba(119,63,26,0.08)] transition-colors',
                    isActive && 'border-mcm-walnut bg-mcm-cream'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex flex-1 flex-col items-start gap-2 text-left"
                      onClick={() => onSelectGroup(index)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-display text-lg text-foreground">
                          {group.name || `Group ${index + 1}`}
                        </span>
                        {isActive ? <Badge variant="secondary">Active</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Weight {group.weight} · {group.factors.length} factor{group.factors.length === 1 ? '' : 's'} ·{' '}
                        {group.transforms.length} transform{group.transforms.length === 1 ? '' : 's'}
                      </p>
                    </button>
                    <Badge variant="outline">#{index + 1}</Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move group ${group.name || index + 1} up`}
                      onClick={() => onMoveGroup(index, 'up')}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move group ${group.name || index + 1} down`}
                      onClick={() => onMoveGroup(index, 'down')}
                      disabled={index === groups.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onDuplicateGroup(index)}>
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onRemoveGroup(index)}>
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
