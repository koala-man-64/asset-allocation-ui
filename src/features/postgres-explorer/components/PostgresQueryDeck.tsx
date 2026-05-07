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
import { PostgresDockWindow } from '@/features/postgres-explorer/components/PostgresDockWindow';
import { Database, Filter as FilterIcon, Plus, X } from 'lucide-react';

interface PostgresQueryDeckProps {
  schemas: string[];
  selectedSchema: string;
  tables: string[];
  selectedTable: string;
  queryFilters: QueryFilterDraft[];
  tableMetadata: PostgresTableMetadata | null;
  tablesLoading: boolean;
  tableMetadataLoading: boolean;
  editingEnabled: boolean;
  editCapabilityLabel: string;
  onSchemaChange: (schema: string) => void;
  onTableChange: (table: string) => void;
  onAddFilter: () => void;
  onClearFilters: () => void;
  onRemoveFilter: (filterId: string) => void;
  onUpdateFilterColumn: (filterId: string, columnName: string) => void;
  onUpdateFilterOperator: (filterId: string, operator: QueryFilterOperator) => void;
  onUpdateFilterValue: (filterId: string, value: string) => void;
}

export function PostgresQueryDeck({
  schemas,
  selectedSchema,
  tables,
  selectedTable,
  queryFilters,
  tableMetadata,
  tablesLoading,
  tableMetadataLoading,
  editingEnabled,
  editCapabilityLabel,
  onSchemaChange,
  onTableChange,
  onAddFilter,
  onClearFilters,
  onRemoveFilter,
  onUpdateFilterColumn,
  onUpdateFilterOperator,
  onUpdateFilterValue
}: PostgresQueryDeckProps) {
  const columns = tableMetadata?.columns || [];
  const canCreateFilter = Boolean(createQueryFilterDraft(tableMetadata));

  return (
    <aside className="postgres-left-stack">
      <PostgresDockWindow
        title="Object Browser"
        subtitle="Schema and table focus"
        icon={<Database className="h-4 w-4" />}
        testId="postgres-object-browser"
        actions={
          <>
            <Badge variant="outline">{schemas.length} schemas</Badge>
            <Badge variant={editingEnabled ? 'default' : 'secondary'}>
              {editingEnabled ? 'Edit' : 'Read'}
            </Badge>
          </>
        }
      >
        <div className="postgres-form-grid">
          <div className="postgres-field-row">
            <label htmlFor="postgres-schema">Schema</label>
            <select
              id="postgres-schema"
              value={selectedSchema}
              onChange={(event) => onSchemaChange(event.target.value)}
              disabled={schemas.length === 0}
              className="postgres-select"
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

          <div className="postgres-field-row">
            <label htmlFor="postgres-table">Table</label>
            <select
              id="postgres-table"
              value={selectedTable}
              onChange={(event) => onTableChange(event.target.value)}
              disabled={tablesLoading || tables.length === 0}
              className="postgres-select"
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

          <div className="postgres-object-list" aria-label="Available tables">
            {tables.length === 0 ? (
              <div className="postgres-filter-empty">No table rows are available.</div>
            ) : (
              tables.map((table) => (
                <button
                  key={table}
                  type="button"
                  className="postgres-object-item"
                  aria-pressed={selectedTable === table}
                  onClick={() => onTableChange(table)}
                  disabled={tablesLoading}
                >
                  <span className="truncate">{table}</span>
                  <Badge variant={selectedTable === table ? 'default' : 'outline'}>
                    {selectedTable === table ? 'Focus' : 'Open'}
                  </Badge>
                </button>
              ))
            )}
          </div>

          <div className="postgres-meta-grid">
            <div className="postgres-meta-row">
              <span>Schema</span>
              <strong>{tableMetadata?.schema_name || selectedSchema || 'n/a'}</strong>
            </div>
            <div className="postgres-meta-row">
              <span>Table</span>
              <strong>{tableMetadata?.table_name || selectedTable || 'n/a'}</strong>
            </div>
            <div className="postgres-meta-row">
              <span>Columns</span>
              <strong>{tableMetadataLoading ? '...' : columns.length}</strong>
            </div>
            <div className="postgres-meta-row">
              <span>Primary key</span>
              <strong>{tableMetadata?.primary_key.length || 0}</strong>
            </div>
          </div>

          <div className="postgres-ticket-note">
            {tableMetadataLoading ? 'Loading table metadata...' : editCapabilityLabel}
          </div>
        </div>
      </PostgresDockWindow>

      <PostgresDockWindow
        title="Filter Matrix"
        subtitle="Server-side AND predicates"
        icon={<FilterIcon className="h-4 w-4" />}
        testId="postgres-filter-matrix"
        actions={<Badge variant="outline">{queryFilters.length} active</Badge>}
      >
        <div className="postgres-filter-toolbar">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddFilter}
            disabled={tableMetadataLoading || !canCreateFilter}
          >
            <Plus className="h-4 w-4" />
            Add Filter
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            disabled={queryFilters.length === 0}
          >
            Clear Filters
          </Button>
        </div>

        {queryFilters.length === 0 ? (
          <div className="postgres-filter-empty">
            No filters configured. Querying uses the selected table and row limit only.
          </div>
        ) : (
          <div className="postgres-filter-matrix">
            {queryFilters.map((filter, index) => {
              const column = columns.find((item) => item.name === filter.columnName) || columns[0];
              const operatorOptions = getFilterOperatorOptions(column?.data_type || '');
              const valueRequired = queryFilterOperatorNeedsValue(filter.operator);
              const columnId = `postgres-filter-column-${filter.id}`;
              const operatorId = `postgres-filter-operator-${filter.id}`;
              const valueId = `postgres-filter-value-${filter.id}`;

              return (
                <div key={filter.id} className="postgres-filter-row">
                  <div className="postgres-field-row">
                    <label htmlFor={columnId}>Column {index + 1}</label>
                    <select
                      id={columnId}
                      value={filter.columnName}
                      onChange={(event) => onUpdateFilterColumn(filter.id, event.target.value)}
                      className="postgres-select"
                    >
                      {columns.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="postgres-field-row">
                    <label htmlFor={operatorId}>Operator</label>
                    <select
                      id={operatorId}
                      value={filter.operator}
                      onChange={(event) =>
                        onUpdateFilterOperator(filter.id, event.target.value as QueryFilterOperator)
                      }
                      className="postgres-select"
                    >
                      {operatorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="postgres-field-row">
                    <label htmlFor={valueId}>Value</label>
                    {valueRequired ? (
                      <Input
                        id={valueId}
                        value={filter.value}
                        onChange={(event) => onUpdateFilterValue(filter.id, event.target.value)}
                        className="postgres-input"
                        placeholder={column?.data_type ? `${column.data_type}` : 'Value'}
                      />
                    ) : (
                      <div className="postgres-input flex items-center text-muted-foreground">
                        No value
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => onRemoveFilter(filter.id)}
                    aria-label={`Remove filter ${index + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </PostgresDockWindow>
    </aside>
  );
}
