import { AlertTriangle, Loader2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

import { StatCard } from '@/app/components/common/StatCard';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Input } from '@/app/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';

import type { SymbolPurgeController } from '../hooks/useSymbolPurgeController';
import { formInputClass, formatNumber, statusClass } from '../lib/symbolPurge';

type Props = {
  controller: SymbolPurgeController;
};

export function SymbolPurgeExecutionPanel({ controller }: Props) {
  const { candidate, execution, derived, actions } = controller;

  return (
    <>
      <div className="mcm-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-black uppercase">Execution panel</h2>
          {candidate.response ? (
            <p className="text-xs text-muted-foreground">
              Filter: <span className="font-mono">{candidate.response.expression}</span>
            </p>
          ) : null}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatCard
            label="Selected Symbols"
            value={candidate.selectedCount}
            detail="Symbols currently staged for destructive work."
            className="rounded-md border border-border/70 bg-muted/30 p-3 shadow-none"
            valueClassName="font-mono text-2xl font-black"
          />
          <StatCard
            label="Estimated Purge Target"
            value={
              candidate.response
                ? formatNumber(candidate.response.summary.estimatedDeletionTargets)
                : '-'
            }
            detail="Approximate delete targets from the latest preview."
            className="rounded-md border border-border/70 bg-muted/30 p-3 shadow-none"
            valueClassName="font-mono text-2xl font-black"
          />
        </div>

        {candidate.response?.note ? (
          <p className="mt-3 rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {candidate.response.note}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="inline-flex w-full items-start gap-3 text-xs font-semibold uppercase tracking-wide">
            <Checkbox
              checked={execution.confirmChecked}
              onCheckedChange={(next) => actions.setConfirmChecked(Boolean(next))}
            />
            <span className="leading-snug">
              I understand this is destructive and cannot be undone.
            </span>
          </label>

          <div className="grid gap-3 xl:grid-cols-[auto_200px_minmax(0,1fr)] xl:items-center">
            <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">
              Type PURGE to confirm
            </span>
            <Input
              value={execution.confirmText}
              onChange={(event) => actions.setConfirmText(event.target.value)}
              placeholder="PURGE"
              className={`${formInputClass} h-9 w-full xl:w-[200px]`}
            />
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button
                onClick={actions.resetPurgeList}
                className="h-9 w-full shrink-0 gap-2 sm:w-auto"
                disabled={
                  !execution.hasPurgeListState ||
                  execution.isSubmitting ||
                  execution.operationStatus === 'running'
                }
                variant="outline"
              >
                <RotateCcw className="h-4 w-4" />
                Reset purge list
              </Button>
              <Button
                onClick={() => void actions.runPurge()}
                className="h-9 w-full shrink-0 gap-2 sm:w-auto"
                disabled={!derived.canSubmit}
                variant="destructive"
              >
                {execution.isSubmitting || execution.operationStatus === 'running' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {execution.isSubmitting || execution.operationStatus === 'running'
                  ? 'Running purge...'
                  : 'Run purge for selected symbols'}
              </Button>
              <Button
                onClick={() => void actions.runBlacklistPurge()}
                className="h-9 w-full shrink-0 gap-2 sm:w-auto"
                disabled={!derived.canSubmitBlacklist}
                variant="destructive"
              >
                {execution.isSubmitting || execution.operationStatus === 'running' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {execution.isSubmitting || execution.operationStatus === 'running'
                  ? 'Running purge...'
                  : 'Run purge for blacklist symbols'}
              </Button>
            </div>
          </div>
        </div>

        {execution.operationId ? (
          <p className="mt-2 text-xs text-muted-foreground">Operation: {execution.operationId}</p>
        ) : null}

        {execution.operationStatus ? (
          <p
            className={`mt-3 text-xs ${
              execution.operationStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {execution.operationStatus === 'running'
              ? execution.completionSummary
                ? `Purge running: ${execution.completionSummary.completed}/${execution.completionSummary.requested} completed (${formatNumber(execution.completionSummary.progressPct)}%). Succeeded ${execution.completionSummary.succeeded}, failed ${execution.completionSummary.failed}, in progress ${execution.completionSummary.inProgress}, pending ${execution.completionSummary.pending}.`
                : 'Purge is running. Polling status updates from /system/purge/{operationId}.'
              : execution.operationStatus === 'succeeded'
                ? `Purge completed successfully.${execution.completionSummary ? ` Deleted ${formatNumber(execution.completionSummary.totalDeleted)}` : ''}`
                : execution.operationError || 'Purge failed.'}
          </p>
        ) : null}

        {execution.completionSummary ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Requested"
              value={execution.completionSummary.requested}
              className="rounded-md border border-border/70 bg-muted/30 p-2 shadow-none"
              valueClassName="font-mono text-lg font-black"
            />
            <StatCard
              label="Completed"
              value={execution.completionSummary.completed}
              className="rounded-md border border-border/70 bg-muted/30 p-2 shadow-none"
              valueClassName="font-mono text-lg font-black"
            />
            <StatCard
              label="In Progress"
              value={execution.completionSummary.inProgress}
              className="rounded-md border border-border/70 bg-muted/30 p-2 shadow-none"
              valueClassName="font-mono text-lg font-black text-amber-600"
            />
            <StatCard
              label="Succeeded"
              value={execution.completionSummary.succeeded}
              className="rounded-md border border-border/70 bg-muted/30 p-2 shadow-none"
              valueClassName="font-mono text-lg font-black text-emerald-600"
            />
            <StatCard
              label="Failed"
              value={execution.completionSummary.failed}
              className="rounded-md border border-border/70 bg-muted/30 p-2 shadow-none"
              valueClassName="font-mono text-lg font-black text-destructive"
            />
            <StatCard
              label="Deleted"
              value={formatNumber(execution.completionSummary.totalDeleted)}
              className="rounded-md border border-border/70 bg-muted/30 p-2 shadow-none"
              valueClassName="font-mono text-lg font-black"
            />
          </div>
        ) : null}
      </div>

      {execution.symbolExecutionResults.length > 0 ? (
        <div className="mcm-panel p-4 sm:p-5">
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Symbol execution status
          </h3>
          <div className="overflow-x-auto rounded-md border border-border/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deleted rows</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {execution.symbolExecutionResults.map((row) => (
                  <TableRow key={row.symbol}>
                    <TableCell className="font-mono">{row.symbol}</TableCell>
                    <TableCell className={`font-semibold ${statusClass(row)}`}>
                      {row.status.toUpperCase()}
                    </TableCell>
                    <TableCell>{formatNumber(row.deleted || 0)}</TableCell>
                    <TableCell>{row.error || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </>
  );
}
