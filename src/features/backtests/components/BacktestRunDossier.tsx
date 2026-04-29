import { AlertTriangle, BadgeDollarSign, Gauge, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/app/components/ui/badge';
import { StatePanel } from '@/app/components/common/StatePanel';
import type {
  BacktestAttributionExposureResponse,
  BacktestRunDetailResponse,
  BacktestSummary
} from '@/services/backtestApi';
import {
  compactRunLabel,
  compactStrategyLabel,
  formatBps,
  formatCurrency,
  formatInteger,
  formatNumber,
  formatPercent,
  formatWindow,
  statusBadgeVariant,
  validationBadgeVariant
} from '@/features/backtests/lib/backtestPresentation';

function MetricTile({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        {icon}
      </div>
      <div className="mt-3 font-display text-2xl text-foreground">{value}</div>
      <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

interface BacktestRunDossierProps {
  detail?: BacktestRunDetailResponse;
  summary?: BacktestSummary;
  attribution?: BacktestAttributionExposureResponse;
  loading: boolean;
  error?: string;
}

export function BacktestRunDossier({
  detail,
  summary,
  attribution,
  loading,
  error
}: BacktestRunDossierProps) {
  const run = detail?.run;
  const warnings = [
    ...(detail?.warnings ?? []),
    ...(detail?.validation?.warnings ?? []),
    ...(detail?.provenance?.warnings ?? []),
    ...(attribution?.warnings ?? [])
  ];

  if (loading) {
    return (
      <StatePanel
        tone="empty"
        title="Loading Run"
        message="Retrieving run detail, summary, attribution, and provenance evidence."
      />
    );
  }

  if (error) {
    return <StatePanel tone="error" title="Run Unavailable" message={error} />;
  }

  if (!run) {
    return (
      <StatePanel
        tone="empty"
        title="No Run Selected"
        message="Select a run from the inventory or validate a configuration from the right rail."
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border-2 border-mcm-walnut bg-mcm-paper/90 p-5 shadow-[8px_8px_0px_0px_rgba(119,63,26,0.10)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
              {detail.validation ? (
                <Badge variant={validationBadgeVariant(detail.validation.verdict)}>
                  {detail.validation.verdict}
                </Badge>
              ) : null}
              {detail.provenance ? (
                <Badge variant={detail.provenance.quality === 'complete' ? 'default' : 'secondary'}>
                  provenance {detail.provenance.quality}
                </Badge>
              ) : null}
            </div>
            <h2 className="mt-3 font-display text-3xl tracking-[0.04em] text-foreground">
              {compactRunLabel(run)}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {compactStrategyLabel(run)} · {formatWindow(run)}
            </p>
          </div>
          <div className="grid min-w-[14rem] gap-2 text-sm text-muted-foreground xl:text-right">
            <span>Run ID {run.run_id}</span>
            <span>Schema v{run.results_schema_version ?? summary?.metadata?.results_schema_version ?? 'n/a'}</span>
            <span>{detail.owner || 'owner n/a'}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Net Return"
          value={formatPercent(summary?.total_return)}
          detail={`Gross ${formatPercent(summary?.gross_total_return)} after cost drag.`}
          icon={<TrendingUp className="h-4 w-4 text-mcm-teal" />}
        />
        <MetricTile
          label="Max Drawdown"
          value={formatPercent(summary?.max_drawdown)}
          detail="Drawdown is backend-published, not recomputed in the browser."
          icon={<TrendingDown className="h-4 w-4 text-destructive" />}
        />
        <MetricTile
          label="Sharpe / Sortino"
          value={`${formatNumber(summary?.sharpe_ratio)} / ${formatNumber(summary?.sortino_ratio)}`}
          detail={`Calmar ${formatNumber(summary?.calmar_ratio)}.`}
          icon={<Gauge className="h-4 w-4 text-mcm-olive" />}
        />
        <MetricTile
          label="Cost Drag"
          value={formatBps(summary?.cost_drag_bps)}
          detail={`${formatCurrency(summary?.total_transaction_cost)} total transaction cost.`}
          icon={<BadgeDollarSign className="h-4 w-4 text-mcm-mustard" />}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Exposure"
          value={`${formatPercent(summary?.avg_gross_exposure)} / ${formatPercent(summary?.avg_net_exposure)}`}
          detail="Average gross and net exposure."
          icon={<ShieldAlert className="h-4 w-4 text-mcm-walnut" />}
        />
        <MetricTile
          label="Turnover"
          value={attribution?.turnover === null || attribution?.turnover === undefined ? 'n/a' : formatPercent(attribution.turnover)}
          detail="Turnover remains backend-owned when available."
          icon={<Gauge className="h-4 w-4 text-mcm-olive" />}
        />
        <MetricTile
          label="Hit Rate"
          value={formatPercent(summary?.hit_rate)}
          detail={`${formatInteger(summary?.winning_positions)} winners / ${formatInteger(summary?.closed_positions)} closed.`}
          icon={<TrendingUp className="h-4 w-4 text-mcm-teal" />}
        />
        <MetricTile
          label="Payoff / Expectancy"
          value={`${formatNumber(summary?.payoff_ratio)} / ${formatCurrency(summary?.expectancy_pnl)}`}
          detail={`Profit factor ${formatNumber(summary?.profit_factor)}.`}
          icon={<BadgeDollarSign className="h-4 w-4 text-mcm-mustard" />}
        />
      </section>

      {warnings.length ? (
        <StatePanel
          tone="warning"
          title="Desk Warnings"
          icon={<AlertTriangle className="h-4 w-4" />}
          message={
            <ul className="space-y-1">
              {warnings.slice(0, 5).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          }
        />
      ) : null}
    </div>
  );
}
