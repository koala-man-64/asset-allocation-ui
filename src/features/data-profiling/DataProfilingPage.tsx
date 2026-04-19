import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Database, RefreshCw } from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { StatePanel } from '@/app/components/common/StatePanel';
import { StatCard } from '@/app/components/common/StatCard';
import { Button } from '@/app/components/ui/button';
import { DataService } from '@/services/DataService';
import type { DataProfilingResponse } from '@/services/apiService';

type ContainerLayer = 'bronze' | 'silver' | 'gold';

interface DomainOption {
  value: string;
  label: string;
}

const containerOptions: ContainerLayer[] = ['bronze', 'silver', 'gold'];
const domainOptionsByLayer: Record<ContainerLayer, DomainOption[]> = {
  bronze: [
    { value: 'market', label: 'Market' },
    { value: 'finance', label: 'Finance' },
    { value: 'earnings', label: 'Earnings' },
    { value: 'price-target', label: 'Price Target' }
  ],
  silver: [
    { value: 'market', label: 'Market' },
    { value: 'finance', label: 'Finance' },
    { value: 'earnings', label: 'Earnings' },
    { value: 'price-target', label: 'Price Target' }
  ],
  gold: [
    { value: 'market', label: 'Market' },
    { value: 'finance', label: 'Finance' },
    { value: 'earnings', label: 'Earnings' },
    { value: 'price-target', label: 'Price Target' },
    { value: 'regime/inputs', label: 'Regime Inputs' },
    { value: 'regime/history', label: 'Regime History' },
    { value: 'regime/latest', label: 'Regime Latest' },
    { value: 'regime/transitions', label: 'Regime Transitions' }
  ]
};

const controlClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/40';

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function toInputSafeNumber(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function DataProfilingPage() {
  const [layer, setLayer] = useState<ContainerLayer>('gold');
  const [domain, setDomain] = useState<string>('market');
  const domainOptions = useMemo(() => domainOptionsByLayer[layer], [layer]);
  const [column, setColumn] = useState<string>('');
  const [bins, setBins] = useState<number>(20);
  const [sampleRows, setSampleRows] = useState<number>(12000);
  const [topValues, setTopValues] = useState<number>(20);

  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [columnsLoading, setColumnsLoading] = useState<boolean>(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);

  const [profile, setProfile] = useState<DataProfilingResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (domainOptions.some((option) => option.value === domain)) {
      return;
    }
    setDomain(domainOptions[0]?.value ?? 'market');
  }, [domain, domainOptions]);

  const loadColumns = useCallback(async () => {
    setColumnsLoading(true);
    setColumnsError(null);
    setProfile(null);
    setProfileError(null);

    try {
      const data = await DataService.getGenericData(layer, domain, undefined, 500);
      if (!data.length) {
        setAvailableColumns([]);
        setColumn('');
        setColumnsError(`No data available for ${layer}/${domain}.`);
        return;
      }

      const keys = Object.keys(data[0] ?? {});
      setAvailableColumns(keys);

      if (!column || !keys.includes(column)) {
        setColumn(keys[0] ?? '');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setColumnsError(message || 'Unable to load columns.');
      setAvailableColumns([]);
      setColumn('');
    } finally {
      setColumnsLoading(false);
    }
  }, [column, domain, layer]);

  useEffect(() => {
    void loadColumns();
  }, [loadColumns]);

  const analyze = useCallback(async () => {
    if (!column) {
      setProfileError('Select a column first.');
      return;
    }

    setProfileLoading(true);
    setProfileError(null);
    try {
      const response = await DataService.getDataProfile(layer, domain, column, {
        bins,
        sampleRows,
        topValues
      });
      setProfile(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setProfileError(message || 'Failed to compute profile.');
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, [bins, column, domain, layer, sampleRows, topValues]);

  const chartData = profile?.bins ?? [];
  const topBuckets = useMemo(() => profile?.topValues ?? [], [profile?.topValues]);
  const showChart = Boolean(profile && chartData.length > 0 && profile.kind !== 'string');
  const isStringProfile = profile?.kind === 'string';
  const profileStateLabel = profileLoading
    ? 'Running'
    : profile
      ? profile.kind.toUpperCase()
      : 'Ready';

  const maxTopCount = useMemo(() => {
    if (!topBuckets.length) return 1;
    return Math.max(...topBuckets.map((item) => item.count), 1);
  }, [topBuckets]);

  return (
    <div className="page-shell">
      <PageHero
        kicker="Data Exploration"
        title={
          <span className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-mcm-olive" />
            Data Profiling
          </span>
        }
        subtitle="Choose a container and domain, then inspect a column distribution. Numeric and date columns render as bucketed histograms; string columns show cardinality and top frequencies."
        metrics={[
          {
            label: 'Dataset',
            value: `${layer} / ${domain}`,
            detail: 'Current medallion layer and domain.'
          },
          {
            label: 'Column',
            value: column || 'Awaiting column',
            detail: columnsLoading
              ? 'Refreshing available fields.'
              : `${availableColumns.length} column options discovered.`
          },
          {
            label: 'Profile State',
            value: profileStateLabel,
            detail: profile
              ? `${formatNumber(profile.sampleRows)} rows sampled.`
              : 'Run a profile to populate the dossier.'
          }
        ]}
      />

      <div className="mcm-panel p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="space-y-2">
            <label htmlFor="dp-layer">Container</label>
            <select
              id="dp-layer"
              value={layer}
              onChange={(event) => setLayer(event.target.value as ContainerLayer)}
              className={controlClass}
            >
              {containerOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="dp-domain">Domain</label>
            <select
              id="dp-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              className={controlClass}
            >
              {domainOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="dp-column">Column</label>
            <select
              id="dp-column"
              value={column}
              onChange={(event) => setColumn(event.target.value)}
              disabled={columnsLoading || !availableColumns.length}
              className={controlClass}
            >
              <option value="" disabled>
                {columnsLoading ? 'Loading columns...' : 'Select a column'}
              </option>
              {availableColumns.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="dp-bins">Bins (numeric/date)</label>
            <input
              id="dp-bins"
              type="number"
              min={3}
              max={200}
              value={bins}
              onChange={(event) => setBins(toInputSafeNumber(event.target.value) || 3)}
              className={controlClass}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="dp-sample">Sample rows</label>
            <input
              id="dp-sample"
              type="number"
              min={10}
              max={100000}
              value={sampleRows}
              onChange={(event) => setSampleRows(toInputSafeNumber(event.target.value) || 10)}
              className={controlClass}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="dp-top">Top string values</label>
            <input
              id="dp-top"
              type="number"
              min={1}
              max={200}
              value={topValues}
              onChange={(event) => setTopValues(toInputSafeNumber(event.target.value) || 1)}
              className={controlClass}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void analyze()}
            className="h-10 gap-2"
            disabled={profileLoading || columnsLoading || !column}
          >
            {profileLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
            {profileLoading ? 'Profiling...' : 'Run Profile'}
          </Button>

          <Button
            variant="outline"
            className="h-10"
            onClick={() => void loadColumns()}
            disabled={columnsLoading}
          >
            {columnsLoading ? 'Refreshing columns...' : 'Refresh Columns'}
          </Button>

          <p className="text-xs font-mono text-muted-foreground">
            Domain columns fetched via {layer}/{domain} (sample 500 rows).
          </p>
        </div>

        {columnsError && (
          <StatePanel
            tone="error"
            title="Column Retrieval Failed"
            message={columnsError}
            className="mt-4 rounded-xl p-4"
          />
        )}
      </div>

      {(profileError || profile) && (
        <section className="mcm-panel p-4 sm:p-5">
          {profileError && (
            <StatePanel
              tone="error"
              title="Profile Failed"
              message={<span className="font-mono text-xs">{profileError}</span>}
            />
          )}

          {profile && (
            <>
              <div className="page-kicker mb-1">Profile Summary</div>
              <div className="grid gap-1 sm:grid-cols-2 sm:items-end sm:justify-between">
                <h2 className="text-xl font-black uppercase tracking-tight">{profile.column}</h2>
                <div className="text-xs font-mono text-muted-foreground">
                  {profile.kind.toUpperCase()} | {layer.toUpperCase()} | {domain}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                  label="Total Rows"
                  value={formatNumber(profile.totalRows)}
                  detail="Rows considered in the sample."
                  valueClassName="font-mono"
                />
                <StatCard
                  label="Non-Null"
                  value={formatNumber(profile.nonNullCount)}
                  detail={`Nulls: ${formatNumber(profile.nullCount)}`}
                  valueClassName="font-mono"
                />
                <StatCard
                  label="Unique"
                  value={formatNumber(profile.uniqueCount ?? 0)}
                  detail="Distinct values."
                  valueClassName="font-mono"
                />
                <StatCard
                  label="Duplicates"
                  value={formatNumber(profile.duplicateCount ?? 0)}
                  detail="Repeated values."
                  valueClassName="font-mono"
                />
                <StatCard
                  label="Sample Rows"
                  value={formatNumber(profile.sampleRows)}
                  detail="Rows fetched for analysis."
                  valueClassName="font-mono"
                />
              </div>

              {showChart && (
                <div className="mt-5 rounded-xl border border-border/40 bg-background/80 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-mono">
                    <Database className="h-4 w-4" />
                    {profile.kind === 'date' ? 'Monthly buckets' : 'Numeric histogram'}
                  </div>
                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ left: 8, right: 8, bottom: 54 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          angle={-30}
                          textAnchor="end"
                          height={60}
                          interval={0}
                        />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="var(--mcm-olive)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {isStringProfile && (
                <div className="mt-5 rounded-xl border border-border/40 bg-background/80 p-3">
                  <div className="mb-2 text-sm font-mono">Top string values</div>
                  {topBuckets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No string values to rank in this sample.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {topBuckets.map((entry) => {
                        const widthPercent = Math.max(
                          12,
                          Math.round((entry.count / maxTopCount) * 100)
                        );

                        return (
                          <div
                            key={`${entry.value}-${entry.count}`}
                            className="rounded-lg border border-border/30 p-2"
                          >
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="max-w-[65%] truncate">
                                {entry.value || '(blank)'}
                              </span>
                              <span className="text-muted-foreground">
                                {formatNumber(entry.count)}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                              <div
                                className="h-full bg-mcm-olive"
                                style={{ width: `${widthPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
