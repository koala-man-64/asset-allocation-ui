import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import type { PostgresTableMetadata, QueryFilterOperator } from '@/services/PostgresService';
import {
  createQueryFilterDraft,
  getFilterOperatorOptions,
  queryFilterOperatorNeedsValue,
  type QueryFilterDraft
} from '@/features/postgres-explorer/lib/postgresExplorer';
import { Database, Filter as FilterIcon, Layers3, Plus, X } from 'lucide-react';

interface PostgresQueryDeckProps {
  schemas: string[];
  selectedSchema: string;
  tables: string[];
  selectedTable: string;
  limit: number;
  queryFilters: QueryFilterDraft[];
  tableMetadata: PostgresTableMetadata | null;
  tablesLoading: boolean;
  tableMetadataLoading: boolean;
  editingEnabled: boolean;
  editCapabilityLabel: string;
  onSchemaChange: (schema: string) => void;
  onTableChange: (table: string) => void;
  onLimitChange: (limit: number) => void;
  onAddFilter: () => void;
  onClearFilters: () => void;
  onRemoveFilter: (filterId: string) => void;
  onUpdateFilterColumn: (filterId: string, columnName: string) => void;
  onUpdateFilterOperator: (filterId: string, operator: QueryFilterOperator) => void;
  onUpdateFilterValue: (filterId: string, value: string) => void;
}

function DeckMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
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

export function PostgresQueryDeck({
  schemas,
  selectedSchema,
  tables,
  selectedTable,
  limit,
  queryFilters,
  tableMetadata,
  tablesLoading,
  tableMetadataLoading,
  editingEnabled,
  editCapabilityLabel,
  onSchemaChange,
  onTableChange,
  onLimitChange,
  onAddFilter,
  onClearFilters,
  onRemoveFilter,
  onUpdateFilterColumn,
  onUpdateFilterOperator,
  onUpdateFilterValue
}: PostgresQueryDeckProps) {
  const columns = tableMetadata?.columns || [];

  return (
    <aside className="desk-pane">
      <div className="border-b border-border/40 px-5 py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
          Query Deck
        </p>
        <h2 className="mt-1 font-display text-xl text-foreground">Database Controls</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Define scope and filter posture before sending a table query into the read pane.
        </p>
      </div>

      <div className="desk-pane-scroll space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          <DeckMetric
            label="Schemas"
            value={String(schemas.length)}
            detail="Visible schemas only. System schemas stay suppressed."
          />
          <DeckMetric
            label="Columns"
            value={String(columns.length)}
            detail={
              tableMetadataLoading
                ? 'Loading metadata for the selected table.'
                : selectedTable
                  ? 'Column count for the active table profile.'
                  : 'Select a table to profile its structure.'
            }
          />
        </div>

        <section className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Scope
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick the schema, the table, and the maximum row count before you query.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="postgres-schema">Schema</label>
            <select
              id="postgres-schema"
              value={selectedSchema}
              onChange={(event) => onSchemaChange(event.target.value)}
              disabled={schemas.length === 0}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {schemas.length === 0 ? (
                <option value="">(No visible schemas)</option>
              ) : (
                schemas.map((schema) => (
                  <option key={schema} value={schema}>
                    {schema}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="postgres-table">Table</label>
            <select
              id="postgres-table"
              value={selectedTable}
              onChange={(event) => onTableChange(event.target.value)}
              disabled={tablesLoading || tables.length === 0}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
            >
              {tables.length === 0 ? (
                <option value="">(No tables found)</option>
              ) : (
                tables.map((table) => (
                  <option key={table} value={table}>
                    {table}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="postgres-limit">Limit</label>
            <Input
              id="postgres-limit"
              type="number"
              min={1}
              max={1000}
              value={limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              className="font-mono"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Table Profile
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Current metadata posture for the selected table.
              </p>
            </div>
            <Badge variant={editingEnabled ? 'default' : 'secondary'} className="font-mono">
              {editingEnabled ? 'Editable' : 'Read Only'}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono">
              {tableMetadata?.schema_name || selectedSchema || 'schema'}
            </Badge>
            <Badge variant="outline" className="font-mono">
              {tableMetadata?.table_name || selectedTable || 'table'}
            </Badge>
            <Badge variant="outline" className="font-mono">
              {tableMetadata?.primary_key.length || 0} pk
            </Badge>
            <Badge variant="outline" className="font-mono">
              {columns.length} cols
            </Badge>
          </div>

          <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4 text-sm text-muted-foreground">
            {tableMetadataLoading ? 'Loading table metadata...' : editCapabilityLabel}
          </div>
        </section>

        <section className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                <FilterIcon className="h-3.5 w-3.5" />
                Query Filters
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Filters are combined with AND before the row limit is applied.
              </p>
            </div>
            <Badge variant="secondary">{queryFilters.length} active</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onAddFilter}
              disabled={tableMetadataLoading || !createQueryFilterDraft(tableMetadata)}
              className="h-9 gap-2 px-3"
            >
              <Plus className="h-4 w-4" />
              Add Filter
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClearFilters}
              disabled={queryFilters.length === 0}
              className="h-9 px-3"
            >
              Clear Filters
            </Button>
          </div>

          {queryFilters.length === 0 ? (
            <div className="rounded-[1.4rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/60 p-4 text-sm text-muted-foreground">
              No filters applied. Querying will return the first {limit} rows from the selected
              table.
            </div>
          ) : (
            <div className="space-y-3">
              {queryFilters.map((filter, index) => {
                const column =
                  columns.find((item) => item.name === filter.columnName) || columns[0];
                const operatorOptions = getFilterOperatorOptions(column?.data_type || '');
                const valueRequired = queryFilterOperatorNeedsValue(filter.operator);
                const columnId = `postgres-filter-column-${filter.id}`;
                const operatorId = `postgres-filter-operator-${filter.id}`;
                const valueId = `postgres-filter-value-${filter.id}`;

                return (
                  <div
                    key={filter.id}
                    className="space-y-3 rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                        <Database className="h-3.5 w-3.5" />
                        Filter {index + 1}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onRemoveFilter(filter.id)}
                        className="h-8 px-3"
                        aria-label={`Remove filter ${index + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor={columnId}
                        className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
                      >
                        Column {index + 1}
                      </label>
                      <select
                        id={columnId}
                        value={filter.columnName}
                        onChange={(event) => onUpdateFilterColumn(filter.id, event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {columns.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor={operatorId}
                        className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
                      >
                        Operator
                      </label>
                      <select
                        id={operatorId}
                        value={filter.operator}
                        onChange={(event) =>
                          onUpdateFilterOperator(
                            filter.id,
                            event.target.value as QueryFilterOperator
                          )
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {operatorOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor={valueId}
                        className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
                      >
                        Value
                      </label>
                      {valueRequired ? (
                        <Input
                          id={valueId}
                          value={filter.value}
                          onChange={(event) => onUpdateFilterValue(filter.id, event.target.value)}
                          className="font-mono text-sm"
                          placeholder={column?.data_type ? `${column.data_type}` : 'Value'}
                        />
                      ) : (
                        <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                          No value required
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            <Layers3 className="h-3.5 w-3.5" />
            Desk Notes
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Keep schema and filter definition separate from query execution. That reduces accidental
            table sweeps and makes the result pane easier to read once rows start landing.
          </p>
        </section>
      </div>
    </aside>
  );
}
