import React, { useMemo, useState } from 'react';

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

      if (leftValue == null && rightValue == null) {
        return 0;
      }
      if (leftValue == null) {
        return 1;
      }
      if (rightValue == null) {
        return -1;
      }

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

      if (leftComparable < rightComparable) {
        return sortState.direction === 'asc' ? -1 : 1;
      }
      if (leftComparable > rightComparable) {
        return sortState.direction === 'asc' ? 1 : -1;
      }
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
      <div className={`terminal-panel p-3 text-xs text-muted-foreground font-body ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-sm border border-border bg-card ${className}`}>
      <table className="min-w-full border-collapse text-xs font-mono">
        <thead>
          <tr>
            <th className="w-12 border-b border-r border-border bg-[#121c32] px-2 py-1.5 text-left text-[10px] font-bold uppercase text-muted-foreground">
              #
            </th>
            {tableColumns.map((col) => (
              <th
                key={String(col.accessorKey)}
                className="border-b border-r border-border bg-[#121c32] px-2 py-1.5 text-left text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap last:border-r-0"
              >
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 ${enableColumnSorting ? 'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm px-0.5 py-0.5' : 'cursor-default'}`}
                  onClick={() => toggleColumnSort(String(col.accessorKey))}
                  disabled={!enableColumnSorting}
                >
                  <span>{col.header}</span>
                  {enableColumnSorting &&
                    sortState?.accessorKey === String(col.accessorKey) &&
                    (sortState.direction === 'asc' ? <span>↑</span> : <span>↓</span>)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => (
            <tr
              key={idx}
              className={`group border-b border-border/80 transition-colors hover:[&>td]:bg-[#14213a] ${
                onRowClick
                  ? 'cursor-pointer focus-visible:outline-none focus-visible:[&>td]:bg-[#14213a]'
                  : ''
              }`}
              onClick={() => onRowClick?.(row)}
              onKeyDown={(event) => {
                if (!onRowClick) {
                  return;
                }

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
              <td className="border-r border-border bg-[#10172b] px-2 py-1.5 text-right text-[11px] font-semibold text-muted-foreground select-none">
                {idx + 1}
              </td>
              {tableColumns.map((col) => {
                const val = row[col.accessorKey as keyof T];
                let displayVal: React.ReactNode = '-';

                if (val !== null && val !== undefined) {
                  if (typeof val === 'object') {
                    displayVal = JSON.stringify(val);
                  } else if (typeof val === 'boolean') {
                    displayVal = val ? 'true' : 'false';
                  } else {
                    displayVal = String(val);
                  }
                }

                return (
                  <td
                    key={String(col.accessorKey)}
                    className="border-r border-border/80 bg-card px-2 py-1.5 text-foreground whitespace-nowrap last:border-r-0"
                  >
                    {displayVal}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
