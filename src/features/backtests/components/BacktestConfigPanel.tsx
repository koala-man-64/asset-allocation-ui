import { AlertCircle, CheckCircle2, CopyCheck, Play, ShieldAlert } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import type {
  BacktestRunDetailResponse,
  BacktestValidationReport
} from '@/services/backtestApi';
import type { BacktestDraft } from '@/features/backtests/lib/backtestDraft';
import {
  formatNumber,
  validationBadgeVariant
} from '@/features/backtests/lib/backtestPresentation';

interface BacktestConfigPanelProps {
  draft: BacktestDraft;
  detail?: BacktestRunDetailResponse;
  validation?: BacktestValidationReport | null;
  validationError?: string;
  validatePending: boolean;
  runPending: boolean;
  onDraftChange: (draft: BacktestDraft) => void;
  onValidate: () => void;
  onRun: () => void;
}

function Field({
  id,
  label,
  value,
  placeholder,
  type = 'text',
  onChange
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function BacktestConfigPanel({
  draft,
  detail,
  validation,
  validationError,
  validatePending,
  runPending,
  onDraftChange,
  onValidate,
  onRun
}: BacktestConfigPanelProps) {
  const update = <Key extends keyof BacktestDraft>(key: Key, value: BacktestDraft[Key]) =>
    onDraftChange({ ...draft, [key]: value });

  const provenance = detail?.provenance;
  const assumptions = detail?.assumptions;

  return (
    <aside className="mcm-panel flex min-h-[760px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
          Configuration
        </p>
        <h2 className="text-lg">Run Builder</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-4 rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Run Definition
          </div>
          <Field
            id="backtest-draft-run-name"
            label="Run name"
            value={draft.runName}
            placeholder="Desk review label"
            onChange={(value) => update('runName', value)}
          />
          <Field
            id="backtest-draft-strategy"
            label="Strategy"
            value={draft.strategyName}
            placeholder="quality-trend"
            onChange={(value) => update('strategyName', value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="backtest-draft-version"
              label="Version"
              value={draft.strategyVersion}
              placeholder="latest"
              onChange={(value) => update('strategyVersion', value)}
            />
            <Field
              id="backtest-draft-bar-size"
              label="Bar size"
              value={draft.barSize}
              placeholder="5m"
              onChange={(value) => update('barSize', value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="backtest-draft-start"
              label="Start"
              type="datetime-local"
              value={draft.startTs}
              onChange={(value) => update('startTs', value)}
            />
            <Field
              id="backtest-draft-end"
              label="End"
              type="datetime-local"
              value={draft.endTs}
              onChange={(value) => update('endTs', value)}
            />
          </div>
        </section>

        <section className="space-y-4 rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Execution Assumptions
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="backtest-draft-capital"
              label="Capital"
              value={draft.initialCapital}
              placeholder="1000000"
              onChange={(value) => update('initialCapital', value)}
            />
            <Field
              id="backtest-draft-benchmark"
              label="Benchmark"
              value={draft.benchmarkSymbol}
              placeholder="SPY"
              onChange={(value) => update('benchmarkSymbol', value)}
            />
            <Field
              id="backtest-draft-cost-model"
              label="Cost model"
              value={draft.costModel}
              placeholder="desk-default"
              onChange={(value) => update('costModel', value)}
            />
            <Field
              id="backtest-draft-participation"
              label="Participation cap"
              value={draft.participationCapPct}
              placeholder="0.1"
              onChange={(value) => update('participationCapPct', value)}
            />
            <Field
              id="backtest-draft-commission"
              label="Commission bps"
              value={draft.commissionBps}
              onChange={(value) => update('commissionBps', value)}
            />
            <Field
              id="backtest-draft-slippage"
              label="Slippage bps"
              value={draft.slippageBps}
              onChange={(value) => update('slippageBps', value)}
            />
            <Field
              id="backtest-draft-spread"
              label="Spread bps"
              value={draft.spreadBps}
              onChange={(value) => update('spreadBps', value)}
            />
            <Field
              id="backtest-draft-impact"
              label="Impact bps"
              value={draft.marketImpactBps}
              onChange={(value) => update('marketImpactBps', value)}
            />
            <Field
              id="backtest-draft-borrow"
              label="Borrow bps"
              value={draft.borrowCostBps}
              onChange={(value) => update('borrowCostBps', value)}
            />
            <Field
              id="backtest-draft-financing"
              label="Financing bps"
              value={draft.financingCostBps}
              onChange={(value) => update('financingCostBps', value)}
            />
            <Field
              id="backtest-draft-latency"
              label="Latency bars"
              value={draft.latencyBars}
              onChange={(value) => update('latencyBars', value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="backtest-draft-liquidity">Liquidity filters</Label>
            <Textarea
              id="backtest-draft-liquidity"
              value={draft.liquidityFilters}
              placeholder='{"minAdvUsd": 5000000}'
              onChange={(event) => update('liquidityFilters', event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="backtest-draft-notes">Notes</Label>
            <Textarea
              id="backtest-draft-notes"
              value={draft.notes}
              onChange={(event) => update('notes', event.target.value)}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Validation
            </div>
            {validation ? (
              <Badge variant={validationBadgeVariant(validation.verdict)}>
                {validation.verdict}
              </Badge>
            ) : null}
          </div>
          {validationError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {validationError}
            </div>
          ) : null}
          {validation ? (
            <div className="space-y-2">
              {validation.checks.slice(0, 5).map((check) => (
                <div
                  key={check.code}
                  className="rounded-xl border border-mcm-walnut/15 bg-mcm-paper/75 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{check.label}</span>
                    <Badge variant={validationBadgeVariant(check.verdict)}>{check.verdict}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{check.message}</p>
                </div>
              ))}
              {validation.duplicateRun ? (
                <div className="flex items-center gap-2 rounded-xl border border-mcm-mustard/30 bg-mcm-mustard/10 p-3 text-sm">
                  <CopyCheck className="h-4 w-4" />
                  Completed duplicate {validation.duplicateRun.run_id}
                </div>
              ) : null}
              {validation.reusedInflightRun ? (
                <div className="flex items-center gap-2 rounded-xl border border-mcm-teal/30 bg-accent/20 p-3 text-sm">
                  <ShieldAlert className="h-4 w-4" />
                  Inflight run {validation.reusedInflightRun.run_id}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Validate before launching to check pins, duplicate runs, and inflight work.
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={onValidate} disabled={validatePending}>
              {validatePending ? 'Validating...' : 'Validate'}
            </Button>
            <Button
              type="button"
              onClick={onRun}
              disabled={runPending || validation?.verdict === 'block'}
            >
              <Play className="h-4 w-4" />
              {runPending ? 'Queuing...' : 'Queue Run'}
            </Button>
          </div>
        </section>

        <section className="space-y-3 rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            {provenance?.quality === 'complete' ? (
              <CheckCircle2 className="h-4 w-4 text-mcm-teal" />
            ) : (
              <AlertCircle className="h-4 w-4 text-mcm-olive" />
            )}
            Provenance
          </div>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Quality</span>
              <span>{provenance?.quality || 'n/a'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Source</span>
              <span>{provenance?.source || 'n/a'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Snapshot</span>
              <span>{provenance?.dataSnapshotId || 'n/a'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Coverage</span>
              <span>{formatNumber(provenance?.coveragePct, 3)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Selected cost model</span>
              <span>{assumptions?.costModel || 'n/a'}</span>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}

