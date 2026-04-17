import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import type { RankingCatalogColumn, RankingFactor, RankingTransform } from '@/types/strategy';
import { DIRECTION_OPTIONS, MISSING_POLICY_OPTIONS } from './rankingEditorUtils';
import { RankingTransformSequenceEditor } from './RankingTransformSequenceEditor';

interface RankingFactorInspectorProps {
  factor: RankingFactor | null;
  catalogByTable: Map<string, RankingCatalogColumn[]>;
  tableNames: string[];
  onChange: (nextFactor: RankingFactor) => void;
  onChangeTransforms: (nextTransforms: RankingTransform[]) => void;
}

export function RankingFactorInspector({
  factor,
  catalogByTable,
  tableNames,
  onChange,
  onChangeTransforms
}: RankingFactorInspectorProps) {
  if (!factor) {
    return (
      <div className="rounded-3xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/70 p-6 text-sm text-muted-foreground">
        Select a factor from the roster to inspect its source column, direction, missing-value policy, and transform chain.
      </div>
    );
  }

  const availableColumns = catalogByTable.get(factor.table) || [];

  return (
    <div className="space-y-5 rounded-3xl border border-border/60 bg-card/85 p-5">
      <div className="space-y-1">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Factor Inspector
        </div>
        <h3 className="text-lg">{factor.name || 'Unnamed factor'}</h3>
        <p className="text-sm text-muted-foreground">
          Tune the factor source and scoring rules without expanding the entire page.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="factor-name">Factor Name</Label>
          <Input
            id="factor-name"
            value={factor.name}
            onChange={(event) => onChange({ ...factor, name: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="factor-weight">Weight</Label>
          <Input
            id="factor-weight"
            type="number"
            step="0.1"
            value={factor.weight}
            onChange={(event) =>
              onChange({
                ...factor,
                weight: Number(event.target.value) || 0
              })
            }
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="factor-table">Gold Table</Label>
          <Select
            value={factor.table}
            onValueChange={(value) => {
              const nextColumns = catalogByTable.get(value) || [];

              onChange({
                ...factor,
                table: value,
                column: nextColumns[0]?.name || factor.column
              });
            }}
          >
            <SelectTrigger id="factor-table">
              <SelectValue placeholder="Select table" />
            </SelectTrigger>
            <SelectContent>
              {tableNames.map((tableName) => (
                <SelectItem key={tableName} value={tableName}>
                  {tableName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="factor-column">Column</Label>
          <Select value={factor.column} onValueChange={(value) => onChange({ ...factor, column: value })}>
            <SelectTrigger id="factor-column">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map((column) => (
                <SelectItem key={column.name} value={column.name}>
                  {column.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {availableColumns.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No numeric columns</AlertTitle>
          <AlertDescription>
            The selected table does not expose any ranking-ready numeric columns in the current catalog.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="factor-direction">Direction</Label>
          <Select
            value={factor.direction}
            onValueChange={(value) => onChange({ ...factor, direction: value as 'asc' | 'desc' })}
          >
            <SelectTrigger id="factor-direction">
              <SelectValue placeholder="Select direction" />
            </SelectTrigger>
            <SelectContent>
              {DIRECTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="factor-missing-policy">Missing Policy</Label>
          <Select
            value={factor.missingValuePolicy}
            onValueChange={(value) =>
              onChange({
                ...factor,
                missingValuePolicy: value as 'exclude' | 'zero'
              })
            }
          >
            <SelectTrigger id="factor-missing-policy">
              <SelectValue placeholder="Select policy" />
            </SelectTrigger>
            <SelectContent>
              {MISSING_POLICY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <RankingTransformSequenceEditor
        title="Factor Transforms"
        description="Apply factor-level transforms before the group aggregation step."
        transforms={factor.transforms}
        onChange={onChangeTransforms}
      />
    </div>
  );
}
