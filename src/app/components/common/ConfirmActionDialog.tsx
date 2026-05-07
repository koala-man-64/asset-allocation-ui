import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';

interface ConfirmActionOptions {
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  tone?: 'default' | 'destructive';
  requiredConfirmationText?: string;
  confirmationLabel?: string;
  children?: ReactNode;
}

interface ConfirmActionDialogProps extends ConfirmActionOptions {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmActionDialog({
  open,
  busy = false,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  requiredConfirmationText,
  confirmationLabel,
  children,
  onOpenChange,
  onCancel,
  onConfirm
}: ConfirmActionDialogProps) {
  const [confirmationValue, setConfirmationValue] = useState('');
  const confirmationInputId = 'confirm-action-confirmation';
  const requiresTypedConfirmation = Boolean(requiredConfirmationText);
  const confirmationMatches =
    !requiresTypedConfirmation || confirmationValue.trim() === requiredConfirmationText;

  useEffect(() => {
    if (open) {
      setConfirmationValue('');
    }
  }, [open, requiredConfirmationText]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-2 border-mcm-walnut bg-mcm-paper">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl text-foreground">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}

        {requiredConfirmationText ? (
          <div className="grid gap-2 rounded-sm border border-destructive/25 bg-destructive/5 p-3">
            <Label htmlFor={confirmationInputId}>
              {confirmationLabel ?? `Type ${requiredConfirmationText} to confirm`}
            </Label>
            <Input
              id={confirmationInputId}
              value={confirmationValue}
              disabled={busy}
              aria-invalid={!confirmationMatches}
              onChange={(event) => setConfirmationValue(event.target.value)}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            type="button"
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            disabled={busy || !confirmationMatches}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useConfirmAction() {
  const [pendingOptions, setPendingOptions] = useState<ConfirmActionOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setPendingOptions(null);
  }, []);

  const confirmAction = useCallback((options: ConfirmActionOptions): Promise<boolean> => {
    resolverRef.current?.(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setPendingOptions(options);
    });
  }, []);

  const confirmationDialog = useMemo(() => {
    if (!pendingOptions) {
      return null;
    }

    return (
      <ConfirmActionDialog
        {...pendingOptions}
        open
        onOpenChange={(open) => {
          if (!open) {
            settle(false);
          }
        }}
        onCancel={() => settle(false)}
        onConfirm={() => settle(true)}
      />
    );
  }, [pendingOptions, settle]);

  return { confirmAction, confirmationDialog };
}
