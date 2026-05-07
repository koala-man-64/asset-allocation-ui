import { AlertTriangle, Database, Fingerprint, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/app/components/ui/badge';
import { StatePanel } from '@/app/components/common/StatePanel';
import type {
  BacktestAttributionExposureResponse,
  BacktestRunDetailResponse,
  BacktestValidationReport
} from '@/services/backtestApi';
import {
  formatBps,
  formatCurrency,
  formatNumber,
  formatPercent,
  validationBadgeVariant
} from '@/features/backtests/lib/backtestPresentation';

interface BacktestDiagnosticsPanelProps {
  detail?: BacktestRunDetailResponse;
  validation?: BacktestValidationReport | null;
  attribution?: BacktestAttributionExposureResponse;
  loading?: boolean;
  error?: string;
}

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-mcm-walnut/10 py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function BacktestDiagnosticsPanel({
  detail,
  validation,
  attribution,
  loading,
  error
}: BacktestDiagnosticsPanelProps) {
  const report = validation ?? detail?.validation ?? null;

  if (error) {
    return <StatePanel tone="error" title="Diagnostics Unavailable" message={error} />;
  }

  if (loading) {
    return (
      <StatePanel
        tone="empty"
        title="Loading Diagnostics"
        message="Fetching validation, provenance, and attribution diagnostics."
      />
    );
  }

  if (!detail) {
    return (
      <StatePanel
        tone="empty"
        title="No Diagnostics"
        message="Select a run to inspect validation and provenance evidence."
      />
    );
  }

  const provenance = detail.provenance;
  const bridge = attribution?.grossToNet;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Validation
          </div>
          {report ? <Badge variant={validationBadgeVariant(report.verdict)}>{report.verdict}</Badge> : null}
        </div>
        {report ? (
          <div className="space-y-2">
            {report.checks.map((check) => (
              <div
                key={check.code}
                className="rounded-xl border border-mcm-walnut/15 bg-mcm-paper/75 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{check.label}</span>
                  <Badge variant={validationBadgeVariant(check.verdict)}>{check.verdict}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{check.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No validation report returned.</div>
        )}
      </section>

      <section className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          <Database className="h-4 w-4" />
          Data Provenance
        </div>
        <FactRow label="Quality" value={provenance?.quality || 'n/a'} />
        <FactRow label="Snapshot" value={provenance?.dataSnapshotId || 'n/a'} />
        <FactRow label="Source" value={provenance?.source || 'n/a'} />
        <FactRow label="Coverage" value={formatNumber(provenance?.coveragePct, 3)} />
        <FactRow label="Quarantined" value={provenance?.quarantined ? 'yes' : 'no'} />
        {provenance?.warnings?.length ? (
          <div className="mt-3 rounded-xl border border-mcm-mustard/30 bg-mcm-mustard/10 p-3 text-xs text-muted-foreground">
            {provenance.warnings.join(' ')}
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          <Fingerprint className="h-4 w-4" />
          Hashes
        </div>
        <FactRow label="Config" value={detail.configHash || 'n/a'} />
        <FactRow label="Request" value={detail.requestHash || 'n/a'} />
        <FactRow label="Execution" value={detail.run.execution_name || 'n/a'} />
        <FactRow label="Owner" value={detail.owner || 'n/a'} />
      </section>

      <section className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          Gross To Net
        </div>
        <FactRow label="Gross return" value={formatPercent(bridge?.grossReturn)} />
        <FactRow label="Net return" value={formatPercent(bridge?.netReturn)} />
        <FactRow label="Commission drag" value={formatPercent(bridge?.commissionDrag)} />
        <FactRow label="Slippage drag" value={formatPercent(bridge?.slippageDrag)} />
        <FactRow label="Cost drag" value={formatBps(bridge?.costDragBps)} />
        {attribution?.concentration?.length ? (
          <div className="mt-3 space-y-2">
            {attribution.concentration.slice(0, 5).map((slice) => (
              <div
                key={`${slice.kind}-${slice.name}`}
                className="flex items-center justify-between rounded-xl border border-mcm-walnut/15 bg-mcm-paper/75 p-3 text-sm"
              >
                <span>{slice.name}</span>
                <span>{formatCurrency(slice.contributionPnl)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
