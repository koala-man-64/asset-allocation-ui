import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';

interface StrategyDeleteDialogProps {
  open: boolean;
  strategyName: string | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function StrategyDeleteDialog({
  open,
  strategyName,
  isPending,
  onOpenChange,
  onConfirm
}: StrategyDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-2 border-mcm-walnut bg-mcm-paper">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl text-foreground">
            Delete Strategy
          </AlertDialogTitle>
          <AlertDialogDescription>
            Delete <span className="font-semibold text-foreground">{strategyName}</span> from
            Postgres. This permanently removes the saved strategy record from the library and the
            desk dossier view.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-[1.5rem] border border-destructive/25 bg-destructive/5 p-4 text-sm text-muted-foreground">
          This action is hard delete because that is the current backend contract. It is intentionally
          isolated behind this confirmation step.
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? 'Deleting...' : 'Delete from Postgres'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
