import React, { useMemo, useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';

interface DataTableProps<T> {
  data: T[];
  className?: string;
  emptyMessage?: string;
  columns?: { header: string; accessorKey: keyof T | string }[];
  onRowClick?: (item: T) => void;
  getRowAriaLabel?: (item: T) => string;
  enableColumnSorting?: boolean;
}

export const DataTable = <T extends Record<string, unknown>>({
  data,
  className = '',
  emptyMessage = 'No data available.',
  columns: propColumns,
  onRowClick,
  getRowAriaLabel,
  enableColumnSorting = false
}: DataTableProps<T>) => {
  const [sortState, setSortState] = useState<{
    accessorKey: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const tableColumns = useMemo(() => {
    if (propColumns) {
      return propColumns;
    }
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]).map((key) => ({ header: key, accessorKey: key }));
  }, [data, propColumns]);

  const sortedData = useMemo(() => {
    if (!sortState) {
      return data;
    }

    return [...data].sort((leftRow, rightRow) => {
      const leftValue = leftRow[sortState.accessorKey as keyof T];
      const rightValue = rightRow[sortState.accessorKey as keyof T];

      if (leftValue == null && rightValue == null) return 0;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;

      const leftComparable =
        typeof leftValue === 'number'
          ? leftValue
          : typeof leftValue === 'boolean'
            ? Number(leftValue)
            : String(leftValue).toLowerCase();
      const rightComparable =
        typeof rightValue === 'number'
          ? rightValue
          : typeof rightValue === 'boolean'
            ? Number(rightValue)
            : String(rightValue).toLowerCase();

      if (leftComparable < rightComparable) return sortState.direction === 'asc' ? -1 : 1;
      if (leftComparable > rightComparable) return sortState.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortState]);

  const toggleColumnSort = (accessorKey: string) => {
    if (!enableColumnSorting) {
      return;
    }

    setSortState((current) => {
      if (!current || current.accessorKey !== accessorKey) {
        return { accessorKey, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { accessorKey, direction: 'desc' };
      }
      return null;
    });
  };

  if (!data || data.length === 0) {
    return (
      <div className={`terminal-panel p-3 font-body text-xs text-muted-foreground ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            {tableColumns.map((col) => {
              const accessorKey = String(col.accessorKey);
              const sortLabel =
                sortState?.accessorKey === accessorKey
                  ? sortState.direction === 'asc'
                    ? 'Asc'
                    : 'Desc'
                  : null;

              return (
                <TableHead key={accessorKey}>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 ${
                      enableColumnSorting
                        ? 'rounded-sm px-0.5 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
                        : 'cursor-default'
                    }`}
                    onClick={() => toggleColumnSort(accessorKey)}
                    disabled={!enableColumnSorting}
                  >
                    <span>{col.header}</span>
                    {sortLabel ? <span>{sortLabel}</span> : null}
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row, idx) => (
            <TableRow
              key={idx}
              className={
                onRowClick
                  ? 'cursor-pointer focus-visible:outline-none focus-visible:[&>td]:bg-[#14213a]'
                  : undefined
              }
              onClick={() => onRowClick?.(row)}
              onKeyDown={(event) => {
                if (!onRowClick) return;

                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRowClick(row);
                }
              }}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              aria-label={
                onRowClick ? (getRowAriaLabel?.(row) ?? `Open row ${idx + 1}`) : undefined
              }
            >
              <TableCell className="bg-[#10172b] text-right text-[11px] font-semibold text-muted-foreground select-none">
                {idx + 1}
              </TableCell>
              {tableColumns.map((col) => {
                const value = row[col.accessorKey as keyof T];
                let displayValue: React.ReactNode = '-';

                if (value !== null && value !== undefined) {
                  if (typeof value === 'object') {
                    displayValue = JSON.stringify(value);
                  } else if (typeof value === 'boolean') {
                    displayValue = value ? 'true' : 'false';
                  } else {
                    displayValue = String(value);
                  }
                }

                return <TableCell key={String(col.accessorKey)}>{displayValue}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
