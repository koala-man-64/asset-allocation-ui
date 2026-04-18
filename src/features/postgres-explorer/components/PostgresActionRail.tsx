import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Database, Pencil, Play, Trash2 } from 'lucide-react';

interface PostgresActionRailProps {
  selectedSchema: string;
  selectedTable: string;
  dataCount: number;
  queryFiltersCount: number;
  editingEnabled: boolean;
  editCapabilityLabel: string;
  loading: boolean;
  purging: boolean;
  tablesLoading: boolean;
  tableMetadataLoading: boolean;
  onQuery: () => void;
  onPurge: () => void;
}

export function PostgresActionRail({
  selectedSchema,
  selectedTable,
  dataCount,
  queryFiltersCount,
  editingEnabled,
  editCapabilityLabel,
  loading,
  purging,
  tablesLoading,
  tableMetadataLoading,
  onQuery,
  onPurge
}: PostgresActionRailProps) {
  const actionDisabled = !selectedTable || tablesLoading || tableMetadataLoading;

  return (
    <aside className="mcm-panel flex min-h-[720px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
          Action Rail
        </p>
        <h2 className="mt-1 font-display text-xl text-foreground">Execution Control</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Keep read flow in the center and isolate operational actions on the side.
        </p>
      </div>

      <div className="flex-1 space-y-5 p-5">
        <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Primary action
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Send the current scope and filter set to the result dossier.
              </p>
            </div>
            <Badge variant="secondary">Query</Badge>
          </div>

          <Button
            onClick={onQuery}
            disabled={loading || purging || actionDisabled}
            className="w-full justify-center gap-2"
          >
            <Play className="h-4 w-4" />
            {loading ? 'Querying...' : 'Query Table'}
          </Button>
        </div>

        <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-cream/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Selected scope
              </p>
              <p className="mt-1 font-display text-lg text-foreground">
                {selectedSchema && selectedTable ? `${selectedSchema}.${selectedTable}` : 'No table in focus'}
              </p>
            </div>
            <Badge variant="outline">{dataCount} rows</Badge>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{queryFiltersCount} filter{queryFiltersCount === 1 ? '' : 's'} configured.</p>
            <p>{editingEnabled ? 'Row editing is enabled for the current table.' : editCapabilityLabel}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Edit posture
          </p>

          <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Pencil className="h-4 w-4" />
              {editingEnabled ? 'Editable table' : 'Read-only table'}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{editCapabilityLabel}</p>
          </div>

          <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-paper/75 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              Workflow note
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Query first, then edit from the result pane. That keeps table mutations anchored to
              an explicit result set instead of guesswork.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-[1.8rem] border border-destructive/25 bg-destructive/5 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-destructive">
              Destructive action
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Purge stays isolated from ordinary querying. Confirmation still happens through the
              existing browser prompt before any rows are removed.
            </p>
          </div>

          <Button
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
    </aside>
  );
}
