import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import { PostgresActionRail } from '@/features/postgres-explorer/components/PostgresActionRail';
import { PostgresQueryDeck } from '@/features/postgres-explorer/components/PostgresQueryDeck';
import { PostgresResultDossier } from '@/features/postgres-explorer/components/PostgresResultDossier';
import {
  buildEditState,
  coerceFieldValue,
  createQueryFilterDraft,
  getDefaultFilterOperator,
  getFilterOperatorOptions,
  isVisibleSchema,
  normalizeFieldValue,
  shouldUseTextarea,
  type EditState,
  type QueryFilterDraft,
  type RowData,
  queryFilterOperatorNeedsValue
} from '@/features/postgres-explorer/lib/postgresExplorer';
import {
  PostgresService,
  type QueryFilter,
  type PostgresTableMetadata,
  type QueryFilterOperator
} from '@/services/PostgresService';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import { Database, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';

function HeaderMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-2xl text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

export const PostgresExplorerPage: React.FC = () => {
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);
  const [data, setData] = useState<RowData[]>([]);
  const [tableMetadata, setTableMetadata] = useState<PostgresTableMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [purging, setPurging] = useState<boolean>(false);
  const [tablesLoading, setTablesLoading] = useState<boolean>(false);
  const [tableMetadataLoading, setTableMetadataLoading] = useState<boolean>(false);
  const [rowSaving, setRowSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [queryFilters, setQueryFilters] = useState<QueryFilterDraft[]>([]);

  const resetSelectionState = useCallback(() => {
    setError(null);
    setStatusMessage(null);
    setData([]);
    setEditState(null);
    setQueryFilters([]);
  }, []);

  const handleSchemaChange = useCallback(
    (schema: string) => {
      resetSelectionState();
      setTables([]);
      setSelectedTable('');
      setTableMetadata(null);
      setSelectedSchema(schema);
    },
    [resetSelectionState]
  );

  const handleTableChange = useCallback(
    (table: string) => {
      resetSelectionState();
      setTableMetadata(null);
      setSelectedTable(table);
    },
    [resetSelectionState]
  );

  const fetchData = useCallback(async () => {
    if (!selectedSchema || !selectedTable) {
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMessage(null);
    try {
      const filters: QueryFilter[] = queryFilters.map((filter) => {
        const column = tableMetadata?.columns.find((item) => item.name === filter.columnName);
        if (!column) {
          throw new Error(`Unknown filter column "${filter.columnName}".`);
        }
        if (queryFilterOperatorNeedsValue(filter.operator) && !filter.value.trim()) {
          throw new Error(`Filter "${filter.columnName}" requires a value.`);
        }

        return queryFilterOperatorNeedsValue(filter.operator)
          ? {
              column_name: filter.columnName,
              operator: filter.operator,
              value: filter.value.trim()
            }
          : {
              column_name: filter.columnName,
              operator: filter.operator
            };
      });

      const result = await PostgresService.queryTable({
        schema_name: selectedSchema,
        table_name: selectedTable,
        limit,
        filters
      });
      setData(result);
      setEditState(null);
    } catch (err) {
      setError(formatSystemStatusText(err));
    } finally {
      setLoading(false);
    }
  }, [limit, queryFilters, selectedSchema, selectedTable, tableMetadata]);

  const purgeData = useCallback(async () => {
    if (!selectedSchema || !selectedTable) {
      return;
    }

    const confirmed = window.confirm(
      `Purge all rows from ${selectedSchema}.${selectedTable}? This action cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setPurging(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await PostgresService.purgeTable({
        schema_name: selectedSchema,
        table_name: selectedTable
      });
      setData([]);
      setEditState(null);
      setStatusMessage(
        `Purged ${result.row_count} rows from ${result.schema_name}.${result.table_name}.`
      );
    } catch (err) {
      setError(formatSystemStatusText(err));
    } finally {
      setPurging(false);
    }
  }, [selectedSchema, selectedTable]);

  const openEditor = useCallback(
    (row: RowData) => {
      if (!tableMetadata?.can_edit) {
        setError(tableMetadata?.edit_reason || 'Row editing is unavailable for this table.');
        return;
      }
      setError(null);
      setStatusMessage(null);
      setEditState(buildEditState(row, tableMetadata));
    },
    [tableMetadata]
  );

  const closeEditor = useCallback(() => {
    setEditState(null);
  }, []);

  const addQueryFilter = useCallback(() => {
    const nextFilter = createQueryFilterDraft(tableMetadata);
    if (!nextFilter) {
      return;
    }
    setQueryFilters((current) => [...current, nextFilter]);
  }, [tableMetadata]);

  const removeQueryFilter = useCallback((filterId: string) => {
    setQueryFilters((current) => current.filter((filter) => filter.id !== filterId));
  }, []);

  const clearQueryFilters = useCallback(() => {
    setQueryFilters([]);
  }, []);

  const updateQueryFilterColumn = useCallback(
    (filterId: string, columnName: string) => {
      const column = tableMetadata?.columns.find((item) => item.name === columnName);
      if (!column) {
        return;
      }

      setQueryFilters((current) =>
        current.map((filter) =>
          filter.id === filterId
            ? {
                ...filter,
                columnName,
                operator: getFilterOperatorOptions(column.data_type)
                  .map((option) => option.value)
                  .includes(filter.operator)
                  ? filter.operator
                  : getDefaultFilterOperator(column.data_type)
              }
            : filter
        )
      );
    },
    [tableMetadata]
  );

  const updateQueryFilterOperator = useCallback(
    (filterId: string, operator: QueryFilterOperator) => {
      setQueryFilters((current) =>
        current.map((filter) => (filter.id === filterId ? { ...filter, operator } : filter))
      );
    },
    []
  );

  const updateQueryFilterValue = useCallback((filterId: string, value: string) => {
    setQueryFilters((current) =>
      current.map((filter) => (filter.id === filterId ? { ...filter, value } : filter))
    );
  }, []);

  const updateFieldRaw = useCallback((columnName: string, raw: string) => {
    setEditState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        fields: {
          ...current.fields,
          [columnName]: {
            ...current.fields[columnName],
            raw
          }
        }
      };
    });
  }, []);

  const updateFieldNull = useCallback((columnName: string, isNull: boolean) => {
    setEditState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        fields: {
          ...current.fields,
          [columnName]: {
            ...current.fields[columnName],
            isNull
          }
        }
      };
    });
  }, []);

  const saveRow = useCallback(async () => {
    if (!selectedSchema || !selectedTable || !tableMetadata || !editState) {
      return;
    }

    const values: Record<string, unknown> = {};
    try {
      for (const column of tableMetadata.columns) {
        if (!column.editable) {
          continue;
        }
        const field = editState.fields[column.name];
        if (!field) {
          continue;
        }
        values[column.name] = coerceFieldValue(column, field);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to validate row values before saving.'
      );
      return;
    }

    if (Object.keys(values).length === 0) {
      toast.error('This table has no editable columns.');
      return;
    }

    setRowSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await PostgresService.updateRow({
        schema_name: selectedSchema,
        table_name: selectedTable,
        match: editState.match,
        values
      });
      closeEditor();
      await fetchData();
      setStatusMessage(
        `Updated ${result.row_count} row in ${result.schema_name}.${result.table_name}.`
      );
      toast.success(`Updated ${result.updated_columns.length} field(s) on the selected row.`);
    } catch (err) {
      const message = formatSystemStatusText(err);
      setError(message);
      toast.error(`Failed to update row: ${message}`);
    } finally {
      setRowSaving(false);
    }
  }, [closeEditor, editState, fetchData, selectedSchema, selectedTable, tableMetadata]);

  useEffect(() => {
    let isActive = true;

    const loadSchemas = async () => {
      try {
        const loadedSchemas = (await PostgresService.listSchemas()).filter(isVisibleSchema);
        if (!isActive) {
          return;
        }
        setSchemas(loadedSchemas);
        setSelectedSchema((current) => {
          if (current && loadedSchemas.includes(current)) {
            return current;
          }
          return loadedSchemas[0] ?? '';
        });
      } catch (err) {
        console.error('Failed to load schemas', err);
        const message = formatSystemStatusText(err);
        setError(message ? `Failed to load schemas: ${message}` : 'Failed to load schemas.');
      }
    };

    void loadSchemas();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadTables = async () => {
      if (!selectedSchema) {
        setTables([]);
        setSelectedTable('');
        setTableMetadata(null);
        return;
      }

      setTablesLoading(true);
      setError(null);
      setStatusMessage(null);
      setTables([]);
      setSelectedTable('');
      setTableMetadata(null);
      setData([]);
      setEditState(null);
      try {
        const loadedTables = await PostgresService.listTables(selectedSchema);
        if (!isActive) {
          return;
        }
        setTables(loadedTables);
        if (loadedTables.length > 0) {
          setSelectedTable(loadedTables[0]);
        }
      } catch (err) {
        if (!isActive) {
          return;
        }
        console.error('Failed to load tables', err);
        const message = formatSystemStatusText(err);
        setError(
          message
            ? `Failed to load tables for schema ${selectedSchema}: ${message}`
            : `Failed to load tables for schema ${selectedSchema}`
        );
      } finally {
        if (isActive) {
          setTablesLoading(false);
        }
      }
    };

    void loadTables();
    return () => {
      isActive = false;
    };
  }, [selectedSchema]);

  useEffect(() => {
    let isActive = true;

    const loadTableMetadata = async () => {
      if (!selectedSchema || !selectedTable) {
        setTableMetadata(null);
        return;
      }

      setTableMetadataLoading(true);
      setError(null);
      setStatusMessage(null);
      setTableMetadata(null);
      setEditState(null);
      try {
        const metadata = await PostgresService.getTableMetadata(selectedSchema, selectedTable);
        if (!isActive) {
          return;
        }
        setTableMetadata(metadata);
      } catch (err) {
        if (!isActive) {
          return;
        }
        console.error('Failed to load table metadata', err);
        const message = formatSystemStatusText(err);
        setError(
          message
            ? `Failed to load table metadata for ${selectedSchema}.${selectedTable}: ${message}`
            : `Failed to load table metadata for ${selectedSchema}.${selectedTable}`
        );
      } finally {
        if (isActive) {
          setTableMetadataLoading(false);
        }
      }
    };

    void loadTableMetadata();
    return () => {
      isActive = false;
    };
  }, [selectedSchema, selectedTable]);

  const editingEnabled = Boolean(tableMetadata?.can_edit);
  const editCapabilityLabel = tableMetadataLoading
    ? 'Loading table metadata...'
    : editingEnabled
      ? 'Row editing enabled. Click a row to edit its fields.'
      : tableMetadata?.edit_reason || 'Row editing unavailable.';

  return (
    <div className="page-shell">
      <div className="page-header-row items-start gap-6">
        <div className="page-header min-w-0 flex-1">
          <p className="page-kicker">Live Operations</p>
          <h1 className="page-title flex items-center gap-2">
            <Database className="h-5 w-5 text-mcm-teal" />
            Postgres Explorer
          </h1>
          <p className="page-subtitle max-w-3xl">
            Review schema scope, query live tables, and edit primary-key-backed rows from a
            structured result dossier instead of a loose control slab.
          </p>
        </div>

        <div className="grid w-full max-w-[48rem] gap-3 sm:grid-cols-3">
          <HeaderMetric
            label="Desk Focus"
            value={selectedSchema && selectedTable ? `${selectedSchema}.${selectedTable}` : 'No table'}
            detail="Current schema and table selection."
          />
          <HeaderMetric
            label="Filters"
            value={String(queryFilters.length).padStart(2, '0')}
            detail="Server-side filters staged before query execution."
          />
          <HeaderMetric
            label="Edit Status"
            value={editingEnabled ? 'Live' : 'Read Only'}
            detail={tableMetadataLoading ? 'Metadata still loading.' : editCapabilityLabel}
          />
        </div>
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <PostgresQueryDeck
          schemas={schemas}
          selectedSchema={selectedSchema}
          tables={tables}
          selectedTable={selectedTable}
          limit={limit}
          queryFilters={queryFilters}
          tableMetadata={tableMetadata}
          tablesLoading={tablesLoading}
          tableMetadataLoading={tableMetadataLoading}
          editingEnabled={editingEnabled}
          editCapabilityLabel={editCapabilityLabel}
          onSchemaChange={handleSchemaChange}
          onTableChange={handleTableChange}
          onLimitChange={setLimit}
          onAddFilter={addQueryFilter}
          onClearFilters={clearQueryFilters}
          onRemoveFilter={removeQueryFilter}
          onUpdateFilterColumn={updateQueryFilterColumn}
          onUpdateFilterOperator={updateQueryFilterOperator}
          onUpdateFilterValue={updateQueryFilterValue}
        />

        <PostgresResultDossier
          selectedSchema={selectedSchema}
          selectedTable={selectedTable}
          tableMetadata={tableMetadata}
          data={data}
          loading={loading}
          error={error}
          statusMessage={statusMessage}
          queryFiltersCount={queryFilters.length}
          editingEnabled={editingEnabled}
          editCapabilityLabel={editCapabilityLabel}
          onRowClick={openEditor}
        />

        <PostgresActionRail
          selectedSchema={selectedSchema}
          selectedTable={selectedTable}
          dataCount={data.length}
          queryFiltersCount={queryFilters.length}
          editingEnabled={editingEnabled}
          editCapabilityLabel={editCapabilityLabel}
          loading={loading}
          purging={purging}
          tablesLoading={tablesLoading}
          tableMetadataLoading={tableMetadataLoading}
          onQuery={() => void fetchData()}
          onPurge={() => void purgeData()}
        />
      </div>

      <Dialog
        open={Boolean(editState)}
        onOpenChange={(open) => {
          if (!open) {
            closeEditor();
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Row</DialogTitle>
            <DialogDescription>
              Editing {selectedSchema}.{selectedTable}. Primary-key columns identify the row being
              updated.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto pr-2">
            <div className="mb-4 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
              <div className="font-mono uppercase tracking-wide text-muted-foreground">
                Row Match
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(tableMetadata?.primary_key || []).map((columnName) => (
                  <Badge key={columnName} variant="outline" className="font-mono">
                    {columnName}={normalizeFieldValue(editState?.match[columnName]) || 'null'}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {(tableMetadata?.columns || []).map((column) => {
                const field = editState?.fields[column.name] || { raw: '', isNull: false };
                const disabled = rowSaving || !column.editable;
                const useTextarea = shouldUseTextarea(column, field.raw);
                const fieldId = `postgres-edit-${column.name}`;

                return (
                  <div
                    key={column.name}
                    className="space-y-2 rounded-lg border border-border/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label htmlFor={fieldId} className="space-y-1">
                        <div className="font-mono text-xs uppercase tracking-wide text-foreground">
                          {column.name}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {column.data_type}
                        </div>
                      </label>
                      <div className="flex flex-wrap justify-end gap-2">
                        {column.primary_key ? (
                          <Badge variant="default" className="font-mono text-[10px]">
                            PK
                          </Badge>
                        ) : null}
                        {!column.editable ? (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            Read Only
                          </Badge>
                        ) : null}
                        {column.nullable ? (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            Nullable
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            Required
                          </Badge>
                        )}
                      </div>
                    </div>

                    {useTextarea ? (
                      <Textarea
                        id={fieldId}
                        value={field.raw}
                        onChange={(event) => updateFieldRaw(column.name, event.target.value)}
                        disabled={disabled || field.isNull}
                        rows={6}
                        className="font-mono text-xs"
                      />
                    ) : (
                      <Input
                        id={fieldId}
                        value={field.raw}
                        onChange={(event) => updateFieldRaw(column.name, event.target.value)}
                        disabled={disabled || field.isNull}
                        className="font-mono text-xs"
                      />
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {column.edit_reason || 'Editable field'}
                      </span>
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={field.isNull}
                          onCheckedChange={(checked) =>
                            updateFieldNull(column.name, Boolean(checked))
                          }
                          disabled={disabled || !column.nullable}
                        />
                        NULL
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditor} disabled={rowSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveRow()}
              disabled={rowSaving || !editState}
              className="gap-2"
            >
              {rowSaving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {rowSaving ? 'Saving...' : 'Save Row'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
