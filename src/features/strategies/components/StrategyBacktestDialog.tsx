import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';

export interface StrategyBacktestDraft {
  runName: string;
  startTs: string;
  endTs: string;
  barSize: string;
}

interface StrategyBacktestDialogProps {
  open: boolean;
  strategyName: string | null;
  draft: StrategyBacktestDraft;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: StrategyBacktestDraft) => void;
  onSubmit: () => void;
}

export function StrategyBacktestDialog({
  open,
  strategyName,
  draft,
  isPending,
  onOpenChange,
  onDraftChange,
  onSubmit
}: StrategyBacktestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-2 border-mcm-walnut bg-mcm-paper sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-foreground">
            Launch Backtest
          </DialogTitle>
          <DialogDescription>
            Submit a secondary backtest run for{' '}
            <span className="font-semibold text-foreground">{strategyName || 'the selected strategy'}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="run-name">Run name</Label>
            <Input
              id="run-name"
              value={draft.runName}
              onChange={(event) => onDraftChange({ ...draft, runName: event.target.value })}
              placeholder="Optional desk label for this run"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="run-start">Start timestamp</Label>
              <Input
                id="run-start"
                type="datetime-local"
                value={draft.startTs}
                onChange={(event) => onDraftChange({ ...draft, startTs: event.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="run-end">End timestamp</Label>
              <Input
                id="run-end"
                type="datetime-local"
                value={draft.endTs}
                onChange={(event) => onDraftChange({ ...draft, endTs: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bar-size">Bar size</Label>
            <Input
              id="bar-size"
              value={draft.barSize}
              onChange={(event) => onDraftChange({ ...draft, barSize: event.target.value })}
              placeholder="5m"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isPending || !strategyName}>
            {isPending ? 'Submitting...' : 'Submit Backtest'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
