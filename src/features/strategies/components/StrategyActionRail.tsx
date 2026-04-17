import { ArrowUpRight, CopyPlus, PencilLine, Play, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import type { StrategyDetail, StrategySummary } from '@/types/strategy';
import {
  describeStrategyExecution,
  describeStrategySelection,
  summarizeExitStack
} from '@/features/strategies/lib/strategySummary';

interface StrategyActionRailProps {
  selectedStrategy: StrategySummary | null;
  selectedDetail: StrategyDetail | undefined;
  detailReady: boolean;
  onCreateStrategy: () => void;
  onEditStrategy: () => void;
  onDuplicateStrategy: () => void;
  onOpenBacktest: () => void;
  onDeleteStrategy: () => void;
}

export function StrategyActionRail({
  selectedStrategy,
  selectedDetail,
  detailReady,
  onCreateStrategy,
  onEditStrategy,
  onDuplicateStrategy,
  onOpenBacktest,
  onDeleteStrategy
}: StrategyActionRailProps) {
  return (
    <aside className="mcm-panel flex min-h-[680px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
          Action Rail
        </p>
        <h2 className="mt-1 font-display text-xl text-foreground">Workflow Control</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create and change strategies here. Destructive actions stay isolated from the read pane.
        </p>
      </div>

      <div className="flex-1 space-y-5 p-5">
        <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Primary action
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a fresh draft without touching an existing saved strategy.
              </p>
            </div>
            <Badge variant="secondary">Create</Badge>
          </div>

          <Button onClick={onCreateStrategy} className="w-full justify-center">
            <Plus className="h-4 w-4" />
            Create Strategy
          </Button>
        </div>

        {selectedStrategy ? (
          <>
            <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-cream/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Selected strategy
                  </p>
                  <p className="mt-1 font-display text-lg text-foreground">{selectedStrategy.name}</p>
                </div>
                <Badge variant={selectedStrategy.type === 'configured' ? 'default' : 'outline'}>
                  {selectedStrategy.type}
                </Badge>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{selectedStrategy.description || 'No desk note recorded.'}</p>
                {selectedDetail ? (
                  <>
                    <p>{describeStrategySelection(selectedDetail)}</p>
                    <p>{describeStrategyExecution(selectedDetail)}</p>
                    <p>{summarizeExitStack(selectedDetail)}</p>
                  </>
                ) : (
                  <p>Load the dossier before opening edit or duplicate actions.</p>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Secondary actions
              </p>

              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={onEditStrategy}
                disabled={!detailReady}
              >
                <PencilLine className="h-4 w-4" />
                Edit Strategy
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={onDuplicateStrategy}
                disabled={!detailReady}
              >
                <CopyPlus className="h-4 w-4" />
                Duplicate As New
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={onOpenBacktest}
                disabled={!selectedStrategy.name}
              >
                <Play className="h-4 w-4" />
                Launch Backtest
              </Button>
            </div>

            <div className="space-y-3 rounded-[1.8rem] border border-destructive/25 bg-destructive/5 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-destructive">
                  Destructive action
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Delete stays hard and backend-backed in this version. The confirmation dialog names
                  the exact strategy and blast radius before anything is removed.
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full justify-start border-destructive/60 text-destructive hover:bg-destructive/10"
                onClick={onDeleteStrategy}
              >
                <Trash2 className="h-4 w-4" />
                Delete Strategy
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-cream/70 p-4">
            <p className="font-display text-lg text-foreground">No strategy in focus</p>
            <p className="text-sm text-muted-foreground">
              Select a strategy to unlock edit, duplicate, backtest, and delete actions.
            </p>
          </div>
        )}

        <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Adjacent surfaces
          </p>

          <Button asChild variant="ghost" className="w-full justify-between">
            <Link to="/universes">
              Universe configurations
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full justify-between">
            <Link to="/rankings">
              Ranking configurations
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full justify-between">
            <Link to="/strategy-exploration">
              Strategy exploration
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </aside>
  );
}
