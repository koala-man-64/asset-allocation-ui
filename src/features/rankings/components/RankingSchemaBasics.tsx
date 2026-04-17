import { Badge } from '@/app/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import { Textarea } from '@/app/components/ui/textarea';
import type { RankingSchemaDetail, UniverseConfigSummary } from '@/types/strategy';
import { countFactors } from './rankingEditorUtils';

interface RankingSchemaBasicsProps {
  draft: RankingSchemaDetail;
  selectedSchemaName: string | null;
  hasUnsavedChanges: boolean;
  universeConfigs: UniverseConfigSummary[];
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onUniverseConfigChange: (value?: string) => void;
}

function BasicsMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-mcm-walnut/25 bg-mcm-paper/70 p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-xl text-foreground">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function RankingSchemaBasics({
  draft,
  selectedSchemaName,
  hasUnsavedChanges,
  universeConfigs,
  onNameChange,
  onDescriptionChange,
  onUniverseConfigChange
}: RankingSchemaBasicsProps) {
  const factorCount = countFactors(draft.config.groups);

  return (
    <Card>
      <CardHeader className="border-b border-border/40">
        <div className="space-y-1">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            1. Basics
          </div>
          <CardTitle className="text-xl">Schema foundation</CardTitle>
          <CardDescription>
            Name the schema, describe what it is optimizing for, and bind the ranking universe it should score against.
          </CardDescription>
        </div>
        <CardAction className="flex items-center gap-2">
          <Badge variant={hasUnsavedChanges ? 'default' : 'secondary'}>
            {hasUnsavedChanges ? 'Unsaved changes' : 'Saved state'}
          </Badge>
          <Badge variant="outline">v{draft.version || 1}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ranking-name">Schema Name</Label>
            <Input
              id="ranking-name"
              readOnly={Boolean(selectedSchemaName)}
              value={draft.name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g. quality-momentum"
            />
            <p className="text-xs text-muted-foreground">
              {selectedSchemaName
                ? 'Saved schema names stay locked. Start a new draft if you need to publish a renamed variant.'
                : 'Use a stable, API-friendly slug. This becomes the saved schema identifier.'}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ranking-universe-config">Ranking Universe Config</Label>
            <Select
              value={draft.config.universeConfigName || '__none__'}
              onValueChange={(value) => onUniverseConfigChange(value === '__none__' ? undefined : value)}
            >
              <SelectTrigger id="ranking-universe-config">
                <SelectValue placeholder="Select ranking universe config" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No universe config</SelectItem>
                {universeConfigs.map((universe) => (
                  <SelectItem key={universe.name} value={universe.name}>
                    {universe.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Materialization intersects this ranking universe with the strategy universe attached to the selected strategy.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ranking-description">Description</Label>
          <Textarea
            id="ranking-description"
            value={draft.description || ''}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Describe what signals this schema emphasizes and when to use it."
            className="min-h-[112px]"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <BasicsMetric
            label="Groups"
            value={String(draft.config.groups.length)}
            detail="Weighted scoring groups currently in the draft."
          />
          <BasicsMetric
            label="Factors"
            value={String(factorCount)}
            detail="Total factors referenced across all groups."
          />
          <BasicsMetric
            label="Universe"
            value={draft.config.universeConfigName || 'Unset'}
            detail="Ranking universe attached to this schema."
          />
        </div>
      </CardContent>
    </Card>
  );
}
