import { DataTable } from '@/app/components/common/DataTable';
import { Badge } from '@/app/components/ui/badge';
import type { PostgresTableMetadata } from '@/services/PostgresService';
import type { RowData } from '@/features/postgres-explorer/lib/postgresExplorer';
import { Database, Pencil } from 'lucide-react';

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

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
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
  return (
    <section className="desk-pane">
      <div className="border-b border-border/40 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Result Dossier
            </p>
            <h2 className="font-display text-xl text-foreground">Table Readout</h2>
            <p className="text-sm text-muted-foreground">
              Read the selected table as a dossier, then edit only from rows you can see and verify.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedSchema && selectedTable ? (
              <Badge variant="secondary" className="font-mono">
                {selectedSchema}.{selectedTable}
              </Badge>
            ) : null}
            <Badge variant="outline" className="font-mono">
              {queryFiltersCount} filter{queryFiltersCount === 1 ? '' : 's'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="desk-pane-scroll space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryTile
            label="Rows Visible"
            value={String(data.length)}
            detail="Rows currently loaded into the sortable result surface."
          />
          <SummaryTile
            label="Columns"
            value={String(tableMetadata?.columns.length || 0)}
            detail="Column count from the active table metadata profile."
          />
          <SummaryTile
            label="Primary Key"
            value={String(tableMetadata?.primary_key.length || 0)}
            detail="Primary-key columns used to anchor row updates."
          />
        </div>

        {statusMessage ? (
          <div className="rounded-[1.5rem] border border-mcm-teal/30 bg-mcm-teal/10 p-4 text-sm text-mcm-walnut">
            <strong>Status:</strong> {statusMessage}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        <div className="rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                Result surface
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Column sorting stays client-side after the query lands. Row editing remains tied to
                the visible result set.
              </p>
            </div>
            <Badge variant={editingEnabled ? 'default' : 'outline'} className="font-mono">
              {editingEnabled ? 'Row click edits enabled' : 'Read only'}
            </Badge>
          </div>

          <div className="mt-5 flex min-h-[420px] flex-col overflow-hidden">
            {loading ? (
              <div className="flex h-full min-h-[420px] items-center justify-center rounded-[1.6rem] border border-mcm-walnut/20 bg-mcm-cream/60 text-sm text-muted-foreground">
                Querying selected table...
              </div>
            ) : (
              <DataTable
                data={data}
                className="flex-1"
                emptyMessage="Select a table and run Query Table to view data."
                onRowClick={editingEnabled ? onRowClick : undefined}
                enableColumnSorting
              />
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
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
            <span>{data.length > 0 ? `Showing ${data.length} rows.` : 'Ready.'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
