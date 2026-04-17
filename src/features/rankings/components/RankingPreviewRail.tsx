import { AlertTriangle, CheckCircle2, Eye, RefreshCcw, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import type { RankingPreviewResponse, RankingSchemaDetail, StrategySummary } from '@/types/strategy';
import { countFactors } from './rankingEditorUtils';

interface ReadinessItem {
  label: string;
  detail: string;
  ready: boolean;
}

interface RankingPreviewRailProps {
  draft: RankingSchemaDetail;
  schemaLabel: string;
  strategies: StrategySummary[];
  previewStrategyName: string;
  previewDate: string;
  onPreviewStrategyNameChange: (value: string) => void;
  onPreviewDateChange: (value: string) => void;
  onSave: () => void;
  saveDisabled: boolean;
  savePending: boolean;
  onPreview: () => void;
  previewDisabled: boolean;
  previewPending: boolean;
  onMaterialize: () => void;
  materializeDisabled: boolean;
  materializePending: boolean;
  previewResult?: RankingPreviewResponse;
  previewIsStale: boolean;
  readinessItems: ReadinessItem[];
  attachedSchemaName?: string | null;
  strategyDetailLoading: boolean;
  strategyDetailError?: string;
  materializeBlockingReason?: string | null;
  hasUnsavedChanges: boolean;
}

export function RankingPreviewRail({
  draft,
  schemaLabel,
  strategies,
  previewStrategyName,
  previewDate,
  onPreviewStrategyNameChange,
  onPreviewDateChange,
  onSave,
  saveDisabled,
  savePending,
  onPreview,
  previewDisabled,
  previewPending,
  onMaterialize,
  materializeDisabled,
  materializePending,
  previewResult,
  previewIsStale,
  readinessItems,
  attachedSchemaName,
  strategyDetailLoading,
  strategyDetailError,
  materializeBlockingReason,
  hasUnsavedChanges
}: RankingPreviewRailProps) {
  const groupCount = draft.config.groups.length;
  const factorCount = countFactors(draft.config.groups);

  return (
    <Card className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
      <CardHeader className="border-b border-border/40">
        <div className="space-y-1">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Preview + Actions
          </div>
          <CardTitle className="text-xl">{schemaLabel}</CardTitle>
          <CardDescription>
            Preview uses the draft on this page. Materialize runs the ranking schema attached to the selected strategy.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6 xl:overflow-y-auto">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="rounded-2xl border border-mcm-walnut/25 bg-mcm-paper/70 p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Status
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={hasUnsavedChanges ? 'default' : 'secondary'}>
                {hasUnsavedChanges ? 'Unsaved draft' : 'Saved draft'}
              </Badge>
            </div>
          </div>
          <div className="rounded-2xl border border-mcm-walnut/25 bg-mcm-paper/70 p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Structure
            </div>
            <div className="mt-2 font-display text-lg text-foreground">
              {groupCount} groups / {factorCount} factors
            </div>
          </div>
          <div className="rounded-2xl border border-mcm-walnut/25 bg-mcm-paper/70 p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Strategy Attachment
            </div>
            <div className="mt-2 text-sm text-foreground">
              {strategyDetailLoading ? 'Checking attachment...' : attachedSchemaName || 'No ranking schema attached'}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-3xl border border-border/60 bg-background/45 p-4">
          <div className="space-y-1">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Readiness Checklist
            </div>
            <p className="text-sm text-muted-foreground">
              Make the draft explicit before saving or promoting it into a strategy-backed materialization run.
            </p>
          </div>
          <div className="space-y-2">
            {readinessItems.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-2xl border border-mcm-walnut/15 bg-card/80 px-3 py-3"
              >
                {item.ready ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-mcm-teal" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-mcm-mustard" />
                )}
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{item.label}</div>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Button type="button" className="w-full" onClick={onSave} disabled={saveDisabled}>
            <Save className="h-4 w-4" />
            {savePending ? 'Saving draft...' : 'Save Ranking Schema'}
          </Button>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="grid gap-2">
              <Label htmlFor="preview-strategy">Preview Strategy</Label>
              <Select value={previewStrategyName} onValueChange={onPreviewStrategyNameChange}>
                <SelectTrigger id="preview-strategy">
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((strategy) => (
                    <SelectItem key={strategy.name} value={strategy.name}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="preview-date">As Of Date</Label>
              <Input
                id="preview-date"
                type="date"
                value={previewDate}
                onChange={(event) => onPreviewDateChange(event.target.value)}
              />
            </div>
          </div>

          <Button type="button" variant="secondary" className="w-full" onClick={onPreview} disabled={previewDisabled}>
            <Eye className="h-4 w-4" />
            {previewPending ? 'Previewing draft...' : 'Preview Current Draft'}
          </Button>

          <Button type="button" className="w-full" onClick={onMaterialize} disabled={materializeDisabled}>
            <RefreshCcw className="h-4 w-4" />
            {materializePending ? 'Materializing...' : 'Materialize Attached Schema'}
          </Button>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Materialize is strategy-driven</AlertTitle>
          <AlertDescription>
            Preview ignores the saved strategy attachment and uses this draft directly. Materialize does not; it uses the ranking schema bound to the selected strategy.
          </AlertDescription>
        </Alert>

        {strategyDetailError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Strategy lookup failed</AlertTitle>
            <AlertDescription>{strategyDetailError}</AlertDescription>
          </Alert>
        ) : null}

        {materializeBlockingReason ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Materialize blocked</AlertTitle>
            <AlertDescription>{materializeBlockingReason}</AlertDescription>
          </Alert>
        ) : null}

        {previewResult ? (
          <div className="space-y-3 rounded-3xl border border-border/60 bg-background/45 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Preview Result
                </div>
                <div className="font-display text-lg text-foreground">
                  {previewResult.strategyName} on {previewResult.asOfDate}
                </div>
                <p className="text-sm text-muted-foreground">
                  {previewResult.rowCount} symbols ranked against the current draft.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{previewResult.rows.length} shown</Badge>
                {previewIsStale ? <Badge variant="outline">Stale</Badge> : null}
              </div>
            </div>

            {previewIsStale ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Preview needs refresh</AlertTitle>
                <AlertDescription>
                  The draft or preview controls changed after the last preview. Run preview again before trusting these rows.
                </AlertDescription>
              </Alert>
            ) : null}

            {previewResult.warnings.length > 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Preview warnings</AlertTitle>
                <AlertDescription>{previewResult.warnings.join(' ')}</AlertDescription>
              </Alert>
            ) : null}

            <ScrollArea className="max-h-64 pr-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewResult.rows.map((row) => (
                    <TableRow key={`${row.symbol}-${row.rank}`}>
                      <TableCell>{row.rank}</TableCell>
                      <TableCell className="font-semibold">{row.symbol}</TableCell>
                      <TableCell>{row.score.toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/70 p-5 text-sm text-muted-foreground">
            Choose a strategy and date, then preview the current draft before promoting the saved schema into a materialization run.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
