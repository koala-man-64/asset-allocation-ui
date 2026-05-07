import { ConfirmActionDialog } from '@/app/components/common/ConfirmActionDialog';

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
  const confirmationName = strategyName ?? '';

  return (
    <ConfirmActionDialog
      open={open}
      busy={isPending}
      tone="destructive"
      title="Delete Strategy"
      description={
        <>
          Delete <span className="font-semibold text-foreground">{strategyName}</span> from
          Postgres. This permanently removes the saved strategy record from the library and the desk
          dossier view.
        </>
      }
      confirmLabel={isPending ? 'Deleting...' : 'Delete from Postgres'}
      requiredConfirmationText={confirmationName}
      confirmationLabel={`Type ${confirmationName} to confirm`}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      onConfirm={onConfirm}
    >
      <div className="rounded-sm border border-destructive/25 bg-destructive/5 p-4">
        This action is hard delete because that is the current backend contract. It is intentionally
        isolated behind this typed confirmation step.
      </div>
    </ConfirmActionDialog>
  );
}
