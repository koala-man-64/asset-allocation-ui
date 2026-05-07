import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';

import type { SymbolPurgeController } from '../hooks/useSymbolPurgeController';
import {
  aggregationOptions,
  domainOptions,
  formFieldClass,
  formInputClass,
  formLabelClass,
  formSelectClass,
  layerOptions,
  operatorOptions
} from '../lib/symbolPurge';

type Props = {
  controller: SymbolPurgeController;
};

export function SymbolPurgeCriteriaPanel({ controller }: Props) {
  const { criteria, columns, derived, candidate, actions } = controller;

  return (
    <section className="mcm-panel p-4 sm:p-5">
      <div className="mb-3">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Rule Builder
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Define the rule criteria that will produce the candidate purge list.
        </p>
      </div>

      <div className="space-y-3">
        <div className={formFieldClass}>
          <label htmlFor="symbol-purge-layer" className={formLabelClass}>
            Medallion layer
          </label>
          <Select
            value={criteria.layer}
            onValueChange={(value) => actions.setLayer(value as typeof criteria.layer)}
          >
            <SelectTrigger id="symbol-purge-layer" className={formSelectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {layerOptions.map((layerKey) => (
                <SelectItem key={layerKey} value={layerKey}>
                  {layerKey.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {derived.showBronzeWarning ? (
            <p className="text-[11px] leading-relaxed text-amber-600">
              Bronze-wide criteria are approximated from the silver preview layer. Silver/gold is
              recommended.
            </p>
          ) : null}
        </div>

        <div className={formFieldClass}>
          <label htmlFor="symbol-purge-domain" className={formLabelClass}>
            Domain
          </label>
          <Select
            value={criteria.domain}
            onValueChange={(value) => actions.setDomain(value as typeof criteria.domain)}
          >
            <SelectTrigger id="symbol-purge-domain" className={formSelectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {domainOptions.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={formFieldClass}>
          <label htmlFor="symbol-purge-column" className={formLabelClass}>
            Column
          </label>
          <Select
            value={criteria.column}
            disabled={columns.columnsLoading}
            onValueChange={actions.setColumn}
          >
            <SelectTrigger id="symbol-purge-column" className={formSelectClass}>
              <SelectValue
                placeholder={columns.columnsLoading ? 'Loading columns...' : 'Select a column'}
              />
            </SelectTrigger>
            <SelectContent>
              {columns.availableColumns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => void actions.refreshColumns()}
              disabled={columns.columnsLoading}
            >
              {columns.columnsLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {columns.columnsRequireRetrieve ? 'Retrieve Columns' : 'Refresh Columns'}
            </Button>
            <p className="text-[11px] text-muted-foreground">Source: common ADLS cache</p>
          </div>
          {columns.columnsRequireRetrieve ? (
            <p className="text-[11px] text-amber-600">
              Columns are not cached for this layer/domain yet.
            </p>
          ) : null}
          {columns.columnsError ? (
            <p className="text-[11px] text-destructive">{columns.columnsError}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className={formFieldClass}>
            <label htmlFor="symbol-purge-operator" className={formLabelClass}>
              Rule type
            </label>
            <Select
              value={criteria.operator}
              onValueChange={(value) => actions.setOperator(value as typeof criteria.operator)}
            >
              <SelectTrigger id="symbol-purge-operator" className={formSelectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operatorOptions.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={formFieldClass}>
            <label className={formLabelClass}>
              {derived.isPercentMode ? 'Percent (1-100)' : 'Numeric value'}
            </label>
            <Input
              type="text"
              value={criteria.value}
              onChange={(event) => actions.setValue(event.target.value)}
              className={formInputClass}
              placeholder={derived.isPercentMode ? 'e.g. 90' : 'e.g. 100'}
            />
            {!derived.isValueValid || !derived.isPercentValid ? (
              <p className="text-[11px] text-destructive">
                {derived.isValueValid
                  ? 'Percentile must be between 1 and 100.'
                  : 'Numeric value must be finite.'}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className={formFieldClass}>
            <label htmlFor="symbol-purge-aggregation" className={formLabelClass}>
              Aggregation
            </label>
            <Select
              value={criteria.aggregation}
              onValueChange={(value) =>
                actions.setAggregation(value as typeof criteria.aggregation)
              }
            >
              <SelectTrigger id="symbol-purge-aggregation" className={formSelectClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aggregationOptions.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={formFieldClass}>
            <label className={formLabelClass}>Recent Row Count</label>
            <Input
              type="number"
              min={1}
              value={criteria.recentRows}
              onChange={(event) => actions.setRecentRows(Number(event.target.value) || 1)}
              className={formInputClass}
            />
          </div>
        </div>

        <Button
          onClick={() => void actions.runPreview()}
          disabled={!derived.canPreview || candidate.loading}
          className="h-10 w-full gap-2"
        >
          <Loader2 className={`h-4 w-4 ${candidate.loading ? 'animate-spin' : 'opacity-0'}`} />
          {candidate.loading ? 'Previewing...' : 'Preview symbols'}
        </Button>

        {candidate.validationError ? (
          <p className="text-[11px] text-destructive">{candidate.validationError}</p>
        ) : null}

        <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Rule summary</p>
          <p className="mt-1 break-words font-mono">
            {derived.previewExpression || 'No valid rule yet.'}
          </p>
        </div>
      </div>
    </section>
  );
}
