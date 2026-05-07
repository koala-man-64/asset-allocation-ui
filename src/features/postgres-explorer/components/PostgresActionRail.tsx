import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { PostgresDockWindow } from '@/features/postgres-explorer/components/PostgresDockWindow';
import { AlertTriangle, Database, Pencil, Play, Trash2 } from 'lucide-react';

interface PostgresActionRailProps {
  selectedSchema: string;
  selectedTable: string;
  limit: number;
  dataCount: number;
  queryFiltersCount: number;
  editingEnabled: boolean;
  editCapabilityLabel: string;
  loading: boolean;
  purging: boolean;
  tablesLoading: boolean;
  tableMetadataLoading: boolean;
  onLimitChange: (limit: number) => void;
  onQuery: () => void;
  onPurge: () => void;
}

export function PostgresActionRail({
  selectedSchema,
  selectedTable,
  limit,
  dataCount,
  queryFiltersCount,
  editingEnabled,
  editCapabilityLabel,
  loading,
  purging,
  tablesLoading,
  tableMetadataLoading,
  onLimitChange,
  onQuery,
  onPurge
}: PostgresActionRailProps) {
  const actionDisabled = !selectedTable || tablesLoading || tableMetadataLoading;
  const scopeLabel =
    selectedSchema && selectedTable ? `${selectedSchema}.${selectedTable}` : 'No table in focus';

  return (
    <PostgresDockWindow
      title="Query Ticket"
      subtitle="Execution controls"
      icon={<Play className="h-4 w-4" />}
      className="postgres-ticket-pane"
      testId="postgres-query-ticket"
      actions={
        <Badge variant={editingEnabled ? 'default' : 'secondary'}>
          {editingEnabled ? 'Live' : 'Read'}
        </Badge>
      }
    >
      <div className="postgres-form-grid">
        <div className="postgres-ticket-grid">
          <div className="postgres-ticket-row">
            <span>Scope</span>
            <strong title={scopeLabel}>{scopeLabel}</strong>
          </div>
          <div className="postgres-ticket-row">
            <span>Rows</span>
            <strong>{dataCount}</strong>
          </div>
          <div className="postgres-ticket-row">
            <span>Filters</span>
            <strong>{queryFiltersCount}</strong>
          </div>
        </div>

        <div className="postgres-field-row">
          <label htmlFor="postgres-limit">Limit</label>
          <Input
            id="postgres-limit"
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="postgres-input"
          />
        </div>

        <div className="postgres-ticket-actions">
          <Button
            type="button"
            onClick={onQuery}
            disabled={loading || purging || actionDisabled}
            className="w-full justify-center"
          >
            <Play className="h-4 w-4" />
            {loading ? 'Querying...' : 'Query Table'}
          </Button>
        </div>

        <div className="postgres-ticket-note">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Pencil className="h-4 w-4" />
            {editingEnabled ? 'Editable table' : 'Read-only table'}
          </div>
          {editCapabilityLabel}
        </div>

        <div className="postgres-ticket-note">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Database className="h-4 w-4" />
            Ticket discipline
          </div>
          Query first, then edit from rows visible in the result matrix.
        </div>

        <div className="postgres-danger-zone">
          <div className="mb-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <div className="font-semibold text-destructive">Destructive action</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Purge remains isolated and still requires explicit confirmation.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={onPurge}
            disabled={loading || purging || actionDisabled}
            variant="outline"
            className="w-full justify-start border-destructive/60 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            {purging ? 'Purging...' : 'Purge Table'}
          </Button>
        </div>
      </div>
    </PostgresDockWindow>
  );
}
