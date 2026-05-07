import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StrategyDeleteDialog } from './StrategyDeleteDialog';

describe('StrategyDeleteDialog', () => {
  it('requires typing the exact strategy name before hard delete', () => {
    const onConfirm = vi.fn();

    render(
      <StrategyDeleteDialog
        open
        strategyName="quality-momentum"
        isPending={false}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete from Postgres' });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type quality-momentum to confirm'), {
      target: { value: 'quality' }
    });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type quality-momentum to confirm'), {
      target: { value: 'quality-momentum' }
    });
    expect(deleteButton).toBeEnabled();

    fireEvent.click(deleteButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
