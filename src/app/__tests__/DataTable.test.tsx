import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from '@/app/components/common/DataTable';

describe('DataTable', () => {
  it('preserves cell casing and supports keyboard row activation', () => {
    const onRowClick = vi.fn();

    render(
      <DataTable
        data={[
          { ticker: 'AaBb', status: 'Ready' },
          { ticker: 'XyZ', status: 'Pending' }
        ]}
        columns={[
          { header: 'Ticker', accessorKey: 'ticker' },
          { header: 'Status', accessorKey: 'status' }
        ]}
        onRowClick={onRowClick}
        getRowAriaLabel={(row) => `Open ${row.ticker as string}`}
      />
    );

    expect(screen.getByText('AaBb')).toBeInTheDocument();

    const firstRow = screen.getByRole('button', { name: 'Open AaBb' });

    fireEvent.keyDown(firstRow, { key: 'Enter' });
    fireEvent.keyDown(firstRow, { key: ' ' });

    expect(onRowClick).toHaveBeenNthCalledWith(1, { ticker: 'AaBb', status: 'Ready' });
    expect(onRowClick).toHaveBeenNthCalledWith(2, { ticker: 'AaBb', status: 'Ready' });
  });
});
