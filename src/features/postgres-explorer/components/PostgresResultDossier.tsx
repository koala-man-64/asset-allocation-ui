import { DataTable } from '@/app/components/common/DataTable';
import { Badge } from '@/app/components/ui/badge';
import type { PostgresTableMetadata } from '@/services/PostgresService';
import type { RowData } from '@/features/postgres-explorer/lib/postgresExplorer';
import { PostgresDockWindow } from '@/features/postgres-explorer/components/PostgresDockWindow';
import { Database, Pencil, Rows3 } from 'lucide-react';

interface PostgresResultDossierProps {
  selectedSchema: string;
  selectedTable: string;
  tableMetadata: PostgresTableMetadata | null;
  data: RowData[];
  loading: boolean;
  error: string | null;
  statusMessage: string | null;
  queryFiltersCount: number;
  editingEnabled: boolean;
  editCapabilityLabel: string;
  onRowClick?: (row: RowData) => void;
}

export function PostgresResultDossier({
  selectedSchema,
  selectedTable,
  tableMetadata,
  data,
  loading,
  error,
  statusMessage,
  queryFiltersCount,
  editingEnabled,
  editCapabilityLabel,
  onRowClick
}: PostgresResultDossierProps) {
  const scopeLabel =
    selectedSchema && selectedTable ? `${selectedSchema}.${selectedTable}` : 'No table in focus';
  const rowStatus = loading ? 'Querying...' : data.length > 0 ? `Showing ${data.length}` : 'Ready';

  return (
    <PostgresDockWindow
      title="Result Matrix"
      subtitle={scopeLabel}
      icon={<Rows3 className="h-4 w-4" />}
      className="postgres-result-pane"
      bodyClassName="flex flex-col gap-2"
      testId="postgres-result-matrix"
      actions={
        <>
          <Badge variant="secondary" className="font-mono">
            {data.length} rows
          </Badge>
          <Badge variant="outline" className="font-mono">
            {tableMetadata?.columns.length || 0} cols
          </Badge>
          <Badge variant="outline" className="font-mono">
            {queryFiltersCount} filter{queryFiltersCount === 1 ? '' : 's'}
          </Badge>
        </>
      }
      footer={
        <div className="postgres-status-bar" data-testid="postgres-status-bar">
          <span>
            {data.length > 0 && editingEnabled ? (
              <span className="inline-flex items-center gap-1">
                <Pencil className="h-3.5 w-3.5" />
                Click a row to edit it.
              </span>
            ) : (
              editCapabilityLabel
            )}
          </span>
          <span>{rowStatus}</span>
        </div>
      }
    >
      <div className="postgres-result-toolbar">
        <span className="postgres-chip">
          <Database className="h-3.5 w-3.5" />
          {scopeLabel}
        </span>
        <span className="postgres-chip">PK {tableMetadata?.primary_key.length || 0}</span>
        <span className="postgres-chip" data-tone={editingEnabled ? 'live' : 'read'}>
          {editingEnabled ? 'Row Edit Enabled' : 'Read Only'}
        </span>
      </div>

      {statusMessage ? (
        <div className="postgres-status-strip" data-tone="success" role="status">
          <strong>Status:</strong> {statusMessage}
        </div>
      ) : null}

      {error ? (
        <div className="postgres-status-strip" data-tone="error" role="alert">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div className="postgres-result-surface">
        {loading ? (
          <div className="flex min-h-[24rem] flex-1 items-center justify-center text-sm text-muted-foreground">
            Querying selected table...
          </div>
        ) : (
          <DataTable
            data={data}
            className="postgres-result-table"
            emptyMessage="Select a table and run Query Table to view data."
            onRowClick={editingEnabled ? onRowClick : undefined}
            enableColumnSorting
          />
        )}
      </div>
    </PostgresDockWindow>
  );
}
