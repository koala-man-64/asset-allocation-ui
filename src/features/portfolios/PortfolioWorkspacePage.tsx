import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Briefcase, Clock3, Layers3, TrendingUp } from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  buildEmptyPortfolioDetail,
  getPortfolioSearchText,
  getRemainingWeightPct,
  getTargetWeightTotal,
  serializePortfolioDetail,
  sortPortfolios
} from '@/features/portfolios/lib/portfolioDraft';
import { buildPortfolioBenchmarkComparison } from '@/features/portfolios/lib/portfolioBenchmark';
import {
  compactMetricToneClass,
  formatDate,
  formatPercent,
  formatTimestamp,
  statusBadgeVariant,
  titleCaseWords
} from '@/features/portfolios/lib/portfolioPresentation';
import { deriveNextRebalanceWindow } from '@/features/portfolios/lib/portfolioRebalance';
import { PortfolioConstructionTab } from '@/features/portfolios/components/PortfolioConstructionTab';
import { PortfolioLibraryRail } from '@/features/portfolios/components/PortfolioLibraryRail';
import { PortfolioOverviewTab } from '@/features/portfolios/components/PortfolioOverviewTab';
import { PortfolioPerformanceTab } from '@/features/portfolios/components/PortfolioPerformanceTab';
import { PortfolioTradingTab } from '@/features/portfolios/components/PortfolioTradingTab';
import { DataService } from '@/services/DataService';
import { portfolioApi } from '@/services/portfolioApi';
import { regimeApi } from '@/services/regimeApi';
import { strategyApi } from '@/services/strategyApi';
import type {
  PortfolioDetail,
  PortfolioMonitorSnapshot,
  PortfolioPreviewResponse
} from '@/types/portfolio';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import { toast } from 'sonner';

type PortfolioWorkspaceTab = 'overview' | 'construction' | 'performance' | 'trading';

function buildDefaultPreviewDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function syncPortfolioSummaryFields(detail: PortfolioDetail): PortfolioDetail {
  return {
    ...detail,
    benchmarkSymbol: detail.config.benchmarkSymbol,
    baseCurrency: detail.config.baseCurrency,
    sleeveCount: detail.config.sleeves.length,
    targetGrossExposurePct: detail.config.targetGrossExposurePct,
    cashReservePct: detail.config.cashReservePct
  };
}

function ContextRail({
  activeTab,
  draft,
  monitorSnapshot,
  previewAsOfDate,
  previewResult,
  previewStale,
  readinessItems,
  currentRegimeCode,
  nextRebalanceLabel,
  saveDisabled,
  savePending,
  previewDisabled,
  previewPending,
  triggerBuildDisabled,
  triggerBuildPending,
  onPreviewAsOfDateChange,
  onSave,
  onPreview,
  onTriggerBuild
}: {
  activeTab: PortfolioWorkspaceTab;
  draft: PortfolioDetail;
  monitorSnapshot: PortfolioMonitorSnapshot | null;
  previewAsOfDate: string;
  previewResult: PortfolioPreviewResponse | null;
  previewStale: boolean;
  readinessItems: Array<{ label: string; detail: string; ready: boolean }>;
  currentRegimeCode?: string | null;
  nextRebalanceLabel: string;
  saveDisabled: boolean;
  savePending: boolean;
  previewDisabled: boolean;
  previewPending: boolean;
  triggerBuildDisabled: boolean;
  triggerBuildPending: boolean;
  onPreviewAsOfDateChange: (value: string) => void;
  onSave: () => void;
  onPreview: () => void;
  onTriggerBuild: () => void;
}) {
  return (
    <aside className="mcm-panel flex min-h-[720px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Context Rail
        </div>
        <h2 className="text-lg">{titleCaseWords(activeTab)}</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Account Identity
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Workspace</span>
              <span className="font-medium">{monitorSnapshot?.accountName || draft.name || 'Unsaved draft'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Portfolio</span>
              <span className="font-medium">{draft.portfolioName || draft.name || 'Unassigned'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">v{monitorSnapshot?.activeVersion ?? draft.version}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Assignment date</span>
              <span className="font-medium">
                {formatDate(draft.activeAssignment?.effectiveFrom || draft.inceptionDate)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Desk Context
          </div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
              <div className="text-sm text-muted-foreground">Current regime</div>
              <div className="mt-2 font-display text-xl">
                {titleCaseWords(currentRegimeCode || 'unclassified')}
              </div>
            </div>
            <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
              <div className="text-sm text-muted-foreground">Next rebalance</div>
              <div className="mt-2 font-display text-xl">{nextRebalanceLabel}</div>
            </div>
          </div>
        </div>

        {activeTab === 'construction' ? (
          <>
            <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Build Controls
              </div>
              <div className="mt-4 grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="portfolio-preview-date">Preview / Build As Of</Label>
                  <Input
                    id="portfolio-preview-date"
                    type="date"
                    value={previewAsOfDate}
                    onChange={(event) => onPreviewAsOfDateChange(event.target.value)}
                  />
                </div>
                <Button type="button" onClick={onSave} disabled={saveDisabled}>
                  {savePending ? 'Saving...' : 'Save Workspace'}
                </Button>
                <Button type="button" variant="outline" onClick={onPreview} disabled={previewDisabled}>
                  {previewPending ? 'Previewing...' : 'Preview Allocation Stack'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onTriggerBuild}
                  disabled={triggerBuildDisabled}
                >
                  {triggerBuildPending ? 'Submitting...' : 'Queue Materialization'}
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Readiness
              </div>
              <div className="mt-4 space-y-3">
                {readinessItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{item.label}</span>
                      <Badge variant={item.ready ? 'default' : 'secondary'}>
                        {item.ready ? 'Ready' : 'Review'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Preview Status
              </div>
              <div className="mt-4 space-y-3">
                {!previewResult ? (
                  <StatePanel
                    tone="empty"
                    title="No preview yet"
                    message="Run a preview to publish projected exposures and proposed trades."
                  />
                ) : (
                  <>
                    <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">Preview source</span>
                        <Badge variant={previewResult.previewSource === 'live-proposal' ? 'default' : 'secondary'}>
                          {previewResult.previewSource === 'live-proposal' ? 'Live proposal' : 'Inferred'}
                        </Badge>
                      </div>
                      {previewStale ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          The draft has changed since the last preview run.
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                      <div className="text-sm text-muted-foreground">Warnings</div>
                      <div className="mt-2 font-display text-xl">{previewResult.warnings.length}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Operator Snapshot
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                  <div className="text-sm text-muted-foreground">Build health</div>
                  <div className="mt-2 font-display text-xl">
                    {titleCaseWords(monitorSnapshot?.buildHealth || draft.buildStatus || draft.status)}
                  </div>
                </div>
                <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                  <div className="text-sm text-muted-foreground">Alerts</div>
                  <div className="mt-2 font-display text-xl">{monitorSnapshot?.alerts.length ?? 0}</div>
                </div>
                <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                  <div className="text-sm text-muted-foreground">Snapshot as of</div>
                  <div className="mt-2 font-display text-xl">
                    {monitorSnapshot ? formatDate(monitorSnapshot.asOfDate) : 'n/a'}
                  </div>
                </div>
              </div>
            </div>

            {monitorSnapshot?.freshness?.length ? (
              <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Freshness
                </div>
                <div className="mt-4 space-y-3">
                  {monitorSnapshot.freshness.map((item) => (
                    <div
                      key={`${item.domain}-${item.checkedAt || item.asOf || 'freshness'}`}
                      className={`rounded-2xl border p-3 ${compactMetricToneClass(
                        item.state === 'error'
                          ? 'critical'
                          : item.state === 'stale' || item.state === 'missing'
                            ? 'warning'
                            : 'healthy'
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium capitalize">{item.domain}</span>
                        <Badge variant={statusBadgeVariant(item.state)}>{item.state}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {item.reason || 'No freshness exceptions are currently flagged.'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
function statusBadgeVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'failed' || status === 'critical') {
    return 'destructive';
  }

  if (status === 'running' || status === 'warning' || status === 'partial') {
    return 'secondary';
  }

  if (!status || status === 'draft' || status === 'staged') {
    return 'outline';
  }

  return 'default';
}

function alertToneClass(severity: PortfolioAlert['severity']): string {
  if (severity === 'critical') {
    return 'border-destructive/30 bg-destructive/10';
  }

  if (severity === 'warning') {
    return 'border-mcm-mustard/30 bg-mcm-mustard/10';
  }

  return 'border-mcm-teal/20 bg-mcm-teal/8';
}

function compactMetricToneClass(tone: PortfolioHealthTone): string {
  if (tone === 'critical') {
    return 'border-destructive/25 bg-destructive/8';
  }

  if (tone === 'warning') {
    return 'border-mcm-mustard/25 bg-mcm-mustard/10';
  }

  return 'border-mcm-teal/20 bg-mcm-teal/8';
}

function buildDefaultPreviewDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function updateSleeveField(
  sleeve: PortfolioSleeveDefinition,
  field: keyof PortfolioSleeveDefinition,
  value: string
): PortfolioSleeveDefinition {
  const numericFields = new Set<keyof PortfolioSleeveDefinition>([
    'targetWeightPct',
    'minWeightPct',
    'maxWeightPct',
    'rebalanceBandPct',
    'expectedHoldings'
  ]);

  if (numericFields.has(field)) {
    return {
      ...sleeve,
      [field]: Number(value || 0)
    };
  }

  return {
    ...sleeve,
    [field]: value
  };
}

export function PortfolioWorkspacePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PortfolioWorkspaceTab>('overview');
  const [selectedPortfolioName, setSelectedPortfolioName] = useState<string | null>(null);
  const [librarySearchText, setLibrarySearchText] = useState('');
  const [previewAsOfDate, setPreviewAsOfDate] = useState(buildDefaultPreviewDate);
  const [draft, setDraft] = useState<PortfolioDetail>(() => buildEmptyPortfolioDetail());
  const [baselineSnapshot, setBaselineSnapshot] = useState(() =>
    serializePortfolioDetail(buildEmptyPortfolioDetail())
  );
  const [lastPreviewSignature, setLastPreviewSignature] = useState<string | null>(null);
  const deferredSearchText = useDeferredValue(librarySearchText);

  const {
    data: portfolios = [],
    isLoading: portfoliosLoading,
    error: portfoliosError
  } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.listPortfolios()
  });

  useEffect(() => {
    if (!portfolios.length) {
      setSelectedPortfolioName(null);
      return;
    }

    if (
      !selectedPortfolioName ||
      !portfolios.some((portfolio) => portfolio.name === selectedPortfolioName)
    ) {
      setSelectedPortfolioName(sortPortfolios(portfolios)[0]?.name ?? portfolios[0]?.name ?? null);
    }
  }, [portfolios, selectedPortfolioName]);

  const detailQuery = useQuery({
    queryKey: ['portfolios', 'detail', selectedPortfolioName],
    queryFn: () => portfolioApi.getPortfolioDetail(String(selectedPortfolioName)),
    enabled: Boolean(selectedPortfolioName)
  });

  const monitorQuery = useQuery({
    queryKey: ['portfolios', 'monitor', selectedPortfolioName],
    queryFn: () => portfolioApi.getMonitorSnapshot(String(selectedPortfolioName)),
    enabled: Boolean(selectedPortfolioName)
  });

  const buildRunsQuery = useQuery({
    queryKey: ['portfolios', 'builds', selectedPortfolioName],
    queryFn: () =>
      portfolioApi.listBuildRuns({
        portfolioName: String(selectedPortfolioName),
        limit: 8,
        offset: 0
      }),
    enabled: Boolean(selectedPortfolioName)
  });

  const strategiesQuery = useQuery({
    queryKey: ['portfolios', 'strategies'],
    queryFn: () => strategyApi.listStrategies()
  });

  const currentRegimeQuery = useQuery({
    queryKey: ['portfolios', 'regime', 'current', draft.config.overlays.regimeModelName],
    queryFn: () =>
      regimeApi.getCurrent({
        modelName: draft.config.overlays.regimeModelName || undefined
      }),
    retry: false
  });

  const monitorSnapshot = monitorQuery.data ?? null;
  const historyStartDate = monitorSnapshot?.history.at(0)?.asOfDate;
  const historyEndDate = monitorSnapshot?.history.at(-1)?.asOfDate;

  const regimeHistoryQuery = useQuery({
    queryKey: [
      'portfolios',
      'regime',
      'history',
      draft.config.overlays.regimeModelName,
      historyStartDate,
      historyEndDate
    ],
    queryFn: () =>
      regimeApi.getHistory({
        modelName: draft.config.overlays.regimeModelName || undefined,
        startDate: historyStartDate,
        endDate: historyEndDate,
        limit: 400
      }),
    enabled: Boolean(historyStartDate && historyEndDate),
    retry: false
  });

  const benchmarkSymbol = monitorSnapshot?.benchmarkSymbol || draft.config.benchmarkSymbol;
  const benchmarkQuery = useQuery({
    queryKey: ['portfolios', 'benchmark', selectedPortfolioName, benchmarkSymbol],
    queryFn: ({ signal }) => DataService.getMarketData(benchmarkSymbol, 'silver', signal),
    enabled: Boolean(monitorSnapshot && benchmarkSymbol),
    retry: false
  });

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }

    const nextDraft = syncPortfolioSummaryFields(detailQuery.data);
    setDraft(nextDraft);
    setBaselineSnapshot(serializePortfolioDetail(nextDraft));
    setLastPreviewSignature(null);
    setActiveTab('overview');
  }, [detailQuery.data]);

  const updateDraft = (updater: (current: PortfolioDetail) => PortfolioDetail) => {
    setDraft((current) => {
      const nextDraft = syncPortfolioSummaryFields(updater(current));
      const targetWeightPct = Number(
        nextDraft.config.sleeves.reduce((total, sleeve) => total + sleeve.targetWeightPct, 0).toFixed(2)
      );
      nextDraft.config.targetGrossExposurePct = targetWeightPct;
      nextDraft.config.cashReservePct = Number(Math.max(0, 100 - targetWeightPct).toFixed(2));
      nextDraft.targetGrossExposurePct = nextDraft.config.targetGrossExposurePct;
      nextDraft.cashReservePct = nextDraft.config.cashReservePct;
      return nextDraft;
    });
  };

  const sortedPortfolios = useMemo(() => sortPortfolios(portfolios), [portfolios]);
  const filteredPortfolios = useMemo(() => {
    const query = deferredSearchText.trim().toLowerCase();
    if (!query) {
      return sortedPortfolios;
    }

    return sortedPortfolios.filter((portfolio) =>
      getPortfolioSearchText(portfolio).includes(query)
    );
  }, [deferredSearchText, sortedPortfolios]);

  const previewSignature = serializePortfolioDetail(draft);
  const hasUnsavedChanges = previewSignature !== baselineSnapshot;
  const targetWeightTotal = getTargetWeightTotal(draft);
  const residualWeightPct = getRemainingWeightPct(draft);
  const buildRuns = buildRunsQuery.data?.runs ?? [];
  const listErrorMessage = formatSystemStatusText(portfoliosError);
  const detailErrorMessage = formatSystemStatusText(detailQuery.error);
  const monitorErrorMessage = formatSystemStatusText(monitorQuery.error);
  const buildRunsErrorMessage = formatSystemStatusText(buildRunsQuery.error);
  const strategiesErrorMessage = formatSystemStatusText(strategiesQuery.error);
  const benchmarkErrorMessage = formatSystemStatusText(benchmarkQuery.error);
  const regimeHistoryErrorMessage = formatSystemStatusText(regimeHistoryQuery.error);
  const currentRegimeCode = currentRegimeQuery.data?.regime_code ?? null;
  const benchmarkComparison = useMemo(
    () =>
      buildPortfolioBenchmarkComparison(monitorSnapshot?.history ?? [], benchmarkQuery.data ?? []),
    [benchmarkQuery.data, monitorSnapshot?.history]
  );
  const nextRebalance = useMemo(
    () =>
      deriveNextRebalanceWindow({
        cadence: draft.config.rebalanceCadence,
        rebalanceAnchor: draft.config.rebalanceAnchor,
        lastBuiltAt: draft.lastBuiltAt,
        effectiveFrom: draft.activeAssignment?.effectiveFrom,
        asOfDate: monitorSnapshot?.asOfDate
      }),
    [
      draft.activeAssignment?.effectiveFrom,
      draft.config.rebalanceAnchor,
      draft.config.rebalanceCadence,
      draft.lastBuiltAt,
      monitorSnapshot?.asOfDate
    ]
  );

  const confirmDiscardDraft = (): boolean => {
    if (!hasUnsavedChanges) {
      return true;
    }

    return window.confirm('Discard the current unsaved portfolio changes and switch workspaces?');
  };

  const openNewDraft = () => {
    if (!confirmDiscardDraft()) {
      return;
    }

    const emptyDraft = buildEmptyPortfolioDetail();
    setSelectedPortfolioName(null);
    setDraft(emptyDraft);
    setBaselineSnapshot(serializePortfolioDetail(emptyDraft));
    setLastPreviewSignature(null);
    setActiveTab('construction');
  };

  const selectPortfolio = (portfolioName: string) => {
    if (selectedPortfolioName === portfolioName) {
      return;
    }

    if (!confirmDiscardDraft()) {
      return;
    }

    setSelectedPortfolioName(portfolioName);
    setActiveTab('overview');
  };

  const saveMutation = useMutation({
    mutationFn: () => portfolioApi.savePortfolio(syncPortfolioSummaryFields(draft)),
    onSuccess: async (result) => {
      const savedDraft = syncPortfolioSummaryFields({
        ...draft,
        ...result.portfolio
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portfolios'] }),
        queryClient.invalidateQueries({ queryKey: ['portfolios', 'detail'] }),
        queryClient.invalidateQueries({ queryKey: ['portfolios', 'monitor'] }),
        queryClient.invalidateQueries({ queryKey: ['portfolios', 'builds'] })
      ]);

      setSelectedPortfolioName(result.portfolio.name);
      setDraft(savedDraft);
      setBaselineSnapshot(serializePortfolioDetail(savedDraft));
      setLastPreviewSignature(null);
      setActiveTab('overview');
      toast.success(`Workspace ${result.portfolio.name} saved`);
    },
    onError: (error) => {
      toast.error(`Failed to save portfolio: ${formatSystemStatusText(error)}`);
    }
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      portfolioApi.previewPortfolio({
        portfolio: syncPortfolioSummaryFields(draft),
        asOfDate: previewAsOfDate
      }),
    onSuccess: () => {
      setLastPreviewSignature(previewSignature);
    },
    onError: (error) => {
      toast.error(`Failed to preview portfolio: ${formatSystemStatusText(error)}`);
    }
  });
  const previewErrorMessage = formatSystemStatusText(previewMutation.error);

  const triggerBuildMutation = useMutation({
    mutationFn: () => {
      const portfolioName = selectedPortfolioName || draft.name.trim();
      if (!portfolioName) {
        throw new Error('Save the portfolio before triggering a build.');
      }

      return portfolioApi.triggerBuild(portfolioName, {
        asOfDate: previewAsOfDate,
        buildScope: 'rebalance'
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portfolios', 'monitor'] }),
        queryClient.invalidateQueries({ queryKey: ['portfolios', 'builds'] }),
        queryClient.invalidateQueries({ queryKey: ['portfolios'] })
      ]);

      setActiveTab('trading');
      toast.success(`Materialization ${result.run.runId} queued`);
    },
    onError: (error) => {
      toast.error(`Failed to trigger portfolio build: ${formatSystemStatusText(error)}`);
    }
  });

  const previewResult = previewMutation.data;
  const previewStale = Boolean(previewResult) && lastPreviewSignature !== previewSignature;
  const saveDisabled = saveMutation.isPending || !draft.name.trim();
  const previewDisabled =
    previewMutation.isPending ||
    !draft.name.trim() ||
    draft.config.sleeves.length === 0 ||
    draft.config.sleeves.some((sleeve) => !sleeve.strategyName.trim());
  const triggerBuildDisabled = triggerBuildMutation.isPending || !selectedPortfolioName;

  const readinessItems = [
    {
      label: 'Portfolio name',
      detail: draft.name.trim()
        ? 'The draft has a stable identifier for save and build workflows.'
        : 'Name the portfolio before saving or triggering a build.',
      ready: Boolean(draft.name.trim())
    },
    {
      label: 'Account setup',
      detail:
        draft.mandate.trim() && draft.inceptionDate && (draft.openingCash ?? 0) > 0
          ? 'Mandate, inception date, and opening balance are set for the internal account shell.'
          : 'Set the mandate, inception date, and opening balance before publish.',
      ready:
        Boolean(draft.mandate.trim()) &&
        Boolean(draft.inceptionDate) &&
        (draft.openingCash ?? 0) > 0
    },
    {
      label: 'Sleeve coverage',
      detail:
        draft.config.sleeves.length > 0 &&
        draft.config.sleeves.every((sleeve) => Boolean(sleeve.strategyName.trim()))
          ? 'Each sleeve points at a strategy and can be previewed.'
          : 'Every sleeve should attach to a strategy before preview.',
      ready:
        draft.config.sleeves.length > 0 &&
        draft.config.sleeves.every((sleeve) => Boolean(sleeve.strategyName.trim()))
    },
    {
      label: 'Weight balance',
      detail:
        residualWeightPct <= draft.config.cashReservePct
          ? 'Residual weight stays within the configured cash reserve.'
          : 'Residual weight currently exceeds the configured cash reserve.',
      ready: residualWeightPct <= draft.config.cashReservePct
    },
    {
      label: 'Risk envelope',
      detail:
        draft.config.riskLimits.singleNameMaxPct <= draft.config.riskLimits.sectorMaxPct
          ? 'Single-name and sector limits are internally consistent.'
          : 'Sector max should not be tighter than the single-name max.',
      ready: draft.config.riskLimits.singleNameMaxPct <= draft.config.riskLimits.sectorMaxPct
    }
  ];

  const heroMetrics = [
    {
      label: 'Saved Portfolios',
      value: String(portfolios.length),
      detail: 'Saved portfolio workspaces available in this control plane.',
      icon: <Briefcase className="h-4 w-4 text-mcm-teal" />
    },
    {
      label: 'Current Tab',
      value: titleCaseWords(activeTab),
      detail:
        activeTab === 'overview'
          ? 'Desk verdict, current allocation, and account identity.'
          : activeTab === 'construction'
            ? 'Sleeve stack, grouped controls, and rebalance preview.'
            : activeTab === 'performance'
              ? 'Benchmark-relative performance, attribution, and model outlook.'
              : 'Rebalance workflow, blotter, build runs, and drift.',
      icon: activeTab === 'trading' ? <Clock3 className="h-4 w-4 text-mcm-rust" /> : <Layers3 className="h-4 w-4 text-mcm-olive" />
    },
    {
      label: 'Headline Return',
      value: formatPercent(
        benchmarkComparison.activeHeadlineReturnPct ?? monitorSnapshot?.sinceInceptionReturnPct ?? null
      ),
      detail:
        benchmarkComparison.activeHeadlineReturnPct !== null
          ? `Active return vs ${benchmarkSymbol}.`
          : 'Fallback to absolute since-inception return until benchmark history aligns.',
      icon: <TrendingUp className="h-4 w-4 text-mcm-teal" />
    }
  ];

  const renderTabContent = () => {
    if (selectedPortfolioName && detailQuery.isLoading && !detailQuery.data && activeTab !== 'construction') {
      return <PageLoader text="Loading portfolio workspace..." variant="panel" className="min-h-[32rem]" />;
    }

    if (selectedPortfolioName && detailErrorMessage && !detailQuery.data && activeTab !== 'construction') {
      return (
        <StatePanel
          tone="error"
          title="Portfolio Workspace Unavailable"
          message={detailErrorMessage}
        />
      );
    }

    if (activeTab === 'overview') {
      if (selectedPortfolioName && monitorErrorMessage && !monitorSnapshot) {
        return (
          <StatePanel
            tone="error"
            title="Monitor Snapshot Unavailable"
            message={monitorErrorMessage}
          />
        );
      }

      return (
        <PortfolioOverviewTab
          draft={draft}
          monitorSnapshot={monitorSnapshot}
          benchmarkComparison={benchmarkComparison}
          currentRegimeCode={currentRegimeCode}
          nextRebalance={nextRebalance}
        />
      );
    }

    if (activeTab === 'construction') {
      return (
        <PortfolioConstructionTab
          draft={draft}
          targetWeightTotal={targetWeightTotal}
          residualWeightPct={residualWeightPct}
          strategies={strategiesQuery.data ?? []}
          strategiesLoading={strategiesQuery.isLoading}
          strategiesError={strategiesErrorMessage || undefined}
          previewResult={previewResult ?? null}
          previewPending={previewMutation.isPending}
          previewError={previewErrorMessage || undefined}
          previewStale={previewStale}
          onUpdateDraft={updateDraft}
        />
      );
    }

    if (activeTab === 'performance') {
      return (
        <PortfolioPerformanceTab
          monitorSnapshot={monitorSnapshot}
          benchmarkComparison={benchmarkComparison}
          benchmarkError={benchmarkErrorMessage || undefined}
          regimeHistory={regimeHistoryQuery.data?.rows ?? []}
          regimeHistoryError={regimeHistoryErrorMessage || undefined}
          currentRegimeCode={currentRegimeCode}
        />
      );
    }

    return (
      <PortfolioTradingTab
        monitorSnapshot={monitorSnapshot}
        buildRuns={buildRuns}
        buildRunsError={buildRunsErrorMessage || undefined}
        nextRebalance={nextRebalance}
        previewResult={previewResult ?? null}
        triggerBuildPending={triggerBuildMutation.isPending}
        triggerBuildDisabled={triggerBuildDisabled}
        onTriggerBuild={() => triggerBuildMutation.mutate()}
      />
    );
  };

  return (
    <div className="page-shell">
      <PageHero
        kicker="Portfolio Construction"
        title={
          <span className="flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-mcm-teal" />
            Portfolio Workspace
          </span>
        }
        subtitle="A professional desk workspace for combining sleeve strategies, monitoring benchmark-relative performance, validating rebalance proposals, and acting on the next rebalance window without leaving the warm-paper control plane."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">
              <Activity className="mr-1 h-3.5 w-3.5" />
              {selectedPortfolioName ? selectedPortfolioName : 'Unsaved draft'}
            </Badge>
            <Button type="button" variant="outline" onClick={openNewDraft}>
              New Portfolio
            </Button>
          </div>
        }
        metrics={heroMetrics}
      />

      <div className="grid gap-6 2xl:grid-cols-[320px_minmax(0,1.08fr)_360px]">
        <PortfolioLibraryRail
          portfolios={portfolios}
          filteredPortfolios={filteredPortfolios}
          selectedPortfolioName={selectedPortfolioName}
          draftName={draft.name}
          loading={portfoliosLoading}
          errorMessage={listErrorMessage || undefined}
          librarySearchText={librarySearchText}
          onLibrarySearchTextChange={setLibrarySearchText}
          onSelectPortfolio={selectPortfolio}
          onOpenNewDraft={openNewDraft}
        />

        <section className="mcm-panel min-h-[720px] overflow-hidden">
          <div className="border-b border-border/40 px-5 py-4">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PortfolioWorkspaceTab)}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="construction">Construction</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="trading">Trading</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="p-5">{renderTabContent()}</div>
        </section>

        <ContextRail
          activeTab={activeTab}
          draft={draft}
          monitorSnapshot={monitorSnapshot}
          previewAsOfDate={previewAsOfDate}
          previewResult={previewResult ?? null}
          previewStale={previewStale}
          readinessItems={readinessItems}
          currentRegimeCode={currentRegimeCode}
          nextRebalanceLabel={nextRebalance.windowLabel}
          saveDisabled={saveDisabled}
          savePending={saveMutation.isPending}
          previewDisabled={previewDisabled}
          previewPending={previewMutation.isPending}
          triggerBuildDisabled={triggerBuildDisabled}
          triggerBuildPending={triggerBuildMutation.isPending}
          onPreviewAsOfDateChange={setPreviewAsOfDate}
          onSave={() => saveMutation.mutate()}
          onPreview={() => previewMutation.mutate()}
          onTriggerBuild={() => triggerBuildMutation.mutate()}
        />
        mode === 'builder'
          ? 'Configure sleeves, risk limits, and execution controls.'
          : 'Track live drift, build health, and recent rebalance runs.'
    },
    {
      label: 'Target Mix',
      value: `${formatPercent(targetWeightTotal)} / ${formatPercent(draft.config.cashReservePct)}`,
      detail: 'Sleeve target weight versus configured cash reserve.'
    }
  ];

  return (
    <div className="page-shell">
      <PageHero
        kicker="Portfolio Construction"
        title={
          <span className="flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-mcm-teal" />
            Portfolio Workspace
          </span>
        }
        subtitle="A dense operator console for building portfolio sleeves, previewing weight stacks, and monitoring rebalance health without leaving the warm-paper control plane."
        actions={
          <>
            <div className="flex items-center gap-2 rounded-2xl border border-mcm-walnut/20 bg-mcm-paper/80 p-1">
              <Button
                type="button"
                variant={mode === 'builder' ? 'default' : 'ghost'}
                className="px-4"
                onClick={() => setMode('builder')}
              >
                <WandSparkles className="h-4 w-4" />
                Builder Mode
              </Button>
              <Button
                type="button"
                variant={mode === 'monitor' ? 'default' : 'ghost'}
                className="px-4"
                onClick={() => setMode('monitor')}
              >
                <Radar className="h-4 w-4" />
                Monitor Mode
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={openNewDraft}>
              New Portfolio
            </Button>
          </>
        }
        metrics={heroMetrics}
      />

      <div className="desk-grid-portfolio">
        <section className="desk-pane">
          <div className="border-b border-border/40 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Library
                </div>
                <h2 className="text-lg">Saved Portfolios</h2>
              </div>
              <Badge variant="outline">{portfolios.length}</Badge>
            </div>
            <div className="mt-4 grid gap-2">
              <Label htmlFor="portfolio-library-search">Search</Label>
              <Input
                id="portfolio-library-search"
                placeholder="Search saved portfolios"
                value={librarySearchText}
                onChange={(event) => setLibrarySearchText(event.target.value)}
              />
            </div>
          </div>

          <div className="desk-pane-scroll space-y-3 p-4">
            {portfoliosLoading ? (
              <PageLoader text="Loading portfolios..." variant="panel" className="min-h-[12rem]" />
            ) : listErrorMessage ? (
              <StatePanel
                tone="error"
                title="Portfolio Library Unavailable"
                message={listErrorMessage}
              />
            ) : filteredPortfolios.length === 0 ? (
              <StatePanel
                tone="empty"
                title="No Portfolios Found"
                message="Save a portfolio draft or change the library search to see available workspaces."
              />
            ) : (
              filteredPortfolios.map((portfolio) => {
                const isActive =
                  (selectedPortfolioName && portfolio.name === selectedPortfolioName) ||
                  (!selectedPortfolioName && draft.name.trim() === portfolio.name);

                return (
                  <button
                    key={portfolio.name}
                    type="button"
                    onClick={() => selectPortfolio(portfolio.name)}
                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                      isActive
                        ? 'border-mcm-teal bg-mcm-teal/8'
                        : 'border-mcm-walnut/15 bg-background/35 hover:bg-background/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-display text-base">{portfolio.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {portfolio.description || 'No desk note'}
                        </div>
                      </div>
                      <Badge variant={statusBadgeVariant(portfolio.status)}>
                        {portfolio.status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        Benchmark{' '}
                        <span className="font-medium text-foreground">
                          {portfolio.benchmarkSymbol}
                        </span>
                      </div>
                      <div>
                        Sleeves{' '}
                        <span className="font-medium text-foreground">{portfolio.sleeveCount}</span>
                      </div>
                      <div>
                        Gross{' '}
                        <span className="font-medium text-foreground">
                          {formatPercent(portfolio.targetGrossExposurePct)}
                        </span>
                      </div>
                      <div>
                        Last build{' '}
                        <span className="font-medium text-foreground">
                          {portfolio.lastBuiltAt ? formatTimestamp(portfolio.lastBuiltAt) : 'Never'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {mode === 'builder' ? (
          <section className="desk-pane">
            <div className="border-b border-border/40 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Builder
                  </div>
                  <h2 className="text-lg">
                    {draft.name.trim() || selectedPortfolioName || 'New Portfolio Draft'}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadgeVariant(draft.status)}>{draft.status}</Badge>
                  {hasUnsavedChanges ? <Badge variant="secondary">Unsaved</Badge> : null}
                </div>
              </div>
            </div>

            <div className="desk-pane-scroll space-y-6 p-5">
              {detailQuery.isLoading && selectedPortfolioName ? (
                <PageLoader text="Loading portfolio..." variant="panel" className="min-h-[18rem]" />
              ) : detailErrorMessage ? (
                <StatePanel
                  tone="error"
                  title="Portfolio Detail Unavailable"
                  message={detailErrorMessage}
                />
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-4 rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Basics
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Internal account identity, funding start point, and the pinned strategy
                          mix for this workspace.
                        </p>
                      </div>
                      {draft.accountId ? (
                        <div className="rounded-2xl border border-mcm-teal/20 bg-mcm-teal/8 px-3 py-2 text-xs text-muted-foreground">
                          Account ID{' '}
                          <span className="font-medium text-foreground">{draft.accountId}</span>
                        </div>
                      ) : null}
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-name">Portfolio Name</Label>
                          <Input
                            id="portfolio-name"
                            value={draft.name}
                            onChange={(event) =>
                              updateDraft((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="e.g. macro-core"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-description">Desk Note</Label>
                          <Textarea
                            id="portfolio-description"
                            rows={4}
                            value={draft.description || ''}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                description: event.target.value
                              }))
                            }
                            placeholder="Short operator note"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-mandate">Mandate</Label>
                          <Textarea
                            id="portfolio-mandate"
                            rows={3}
                            value={draft.mandate}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                mandate: event.target.value
                              }))
                            }
                            placeholder="Describe the account objective, benchmark posture, and any standing desk constraints."
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor="portfolio-inception-date">Inception Date</Label>
                            <Input
                              id="portfolio-inception-date"
                              type="date"
                              value={draft.inceptionDate}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  inceptionDate: event.target.value
                                }))
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="portfolio-opening-cash">Opening Balance</Label>
                            <Input
                              id="portfolio-opening-cash"
                              type="number"
                              value={draft.openingCash ?? 0}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  openingCash: Number(event.target.value || 0)
                                }))
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Applied when the internal account is first created; later funding
                              belongs in ledger events.
                            </p>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor="portfolio-benchmark">Benchmark</Label>
                            <Input
                              id="portfolio-benchmark"
                              value={draft.config.benchmarkSymbol}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  config: {
                                    ...current.config,
                                    benchmarkSymbol: event.target.value.toUpperCase()
                                  }
                                }))
                              }
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="portfolio-base-currency">Base Currency</Label>
                            <Input
                              id="portfolio-base-currency"
                              value={draft.config.baseCurrency}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  config: {
                                    ...current.config,
                                    baseCurrency: event.target.value.toUpperCase()
                                  }
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <Label htmlFor="portfolio-cadence">Rebalance Cadence</Label>
                            <select
                              id="portfolio-cadence"
                              value={draft.config.rebalanceCadence}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  config: {
                                    ...current.config,
                                    rebalanceCadence: event.target
                                      .value as PortfolioDetail['config']['rebalanceCadence']
                                  }
                                }))
                              }
                              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="portfolio-anchor">Rebalance Anchor</Label>
                            <Input
                              id="portfolio-anchor"
                              value={draft.config.rebalanceAnchor}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  config: {
                                    ...current.config,
                                    rebalanceAnchor: event.target.value
                                  }
                                }))
                              }
                              placeholder="e.g. Wednesday close"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Construction
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Gross, cash, and execution settings that drive the build envelope.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-gross-target">Target Gross Exposure %</Label>
                          <Input
                            id="portfolio-gross-target"
                            type="number"
                            value={draft.config.targetGrossExposurePct}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  targetGrossExposurePct: Number(event.target.value || 0)
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-cash-reserve">Cash Reserve %</Label>
                          <Input
                            id="portfolio-cash-reserve"
                            type="number"
                            value={draft.config.cashReservePct}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  cashReservePct: Number(event.target.value || 0)
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-max-names">Max Names</Label>
                          <Input
                            id="portfolio-max-names"
                            type="number"
                            value={draft.config.maxNames}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  maxNames: Number(event.target.value || 0)
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-max-notional">Max Trade Notional</Label>
                          <Input
                            id="portfolio-max-notional"
                            type="number"
                            value={draft.config.executionPolicy.maxTradeNotionalUsd}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  executionPolicy: {
                                    ...current.config.executionPolicy,
                                    maxTradeNotionalUsd: Number(event.target.value || 0)
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-participation">Participation Rate %</Label>
                          <Input
                            id="portfolio-participation"
                            type="number"
                            value={draft.config.executionPolicy.participationRatePct}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  executionPolicy: {
                                    ...current.config.executionPolicy,
                                    participationRatePct: Number(event.target.value || 0)
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-stagger">Stagger Minutes</Label>
                          <Input
                            id="portfolio-stagger"
                            type="number"
                            value={draft.config.executionPolicy.staggerMinutes}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  executionPolicy: {
                                    ...current.config.executionPolicy,
                                    staggerMinutes: Number(event.target.value || 0)
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4 rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                            Sleeves
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Manage sleeve-level weights, strategy attachments, and rebalance bands.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            updateDraft((current) => ({
                              ...current,
                              config: {
                                ...current.config,
                                sleeves: [
                                  ...current.config.sleeves,
                                  buildEmptyPortfolioSleeve(current.config.sleeves.length)
                                ]
                              }
                            }))
                          }
                        >
                          Add Sleeve
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {draft.config.sleeves.map((sleeve, index) => (
                          <div
                            key={sleeve.sleeveId}
                            className="rounded-2xl border border-mcm-walnut/15 bg-mcm-paper/60 p-4"
                          >
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                              <div className="font-display text-base">
                                {sleeve.label || `Sleeve ${index + 1}`}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={statusBadgeVariant(sleeve.status)}>
                                  {sleeve.status}
                                </Badge>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={draft.config.sleeves.length <= 1}
                                  onClick={() =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.filter(
                                          (_, sleeveIndex) => sleeveIndex !== index
                                        )
                                      }
                                    }))
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="grid gap-2">
                                <Label htmlFor={`portfolio-sleeve-label-${index}`}>Label</Label>
                                <Input
                                  id={`portfolio-sleeve-label-${index}`}
                                  value={sleeve.label}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? updateSleeveField(item, 'label', event.target.value)
                                            : item
                                        )
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`portfolio-sleeve-strategy-${index}`}>
                                  Strategy
                                </Label>
                                <Input
                                  id={`portfolio-sleeve-strategy-${index}`}
                                  value={sleeve.strategyName}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? updateSleeveField(
                                                item,
                                                'strategyName',
                                                event.target.value
                                              )
                                            : item
                                        )
                                      }
                                    }))
                                  }
                                  placeholder="strategy-name"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`portfolio-sleeve-status-${index}`}>Status</Label>
                                <select
                                  id={`portfolio-sleeve-status-${index}`}
                                  value={sleeve.status}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                status: event.target
                                                  .value as PortfolioSleeveDefinition['status']
                                              }
                                            : item
                                        )
                                      }
                                    }))
                                  }
                                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                  <option value="active">Active</option>
                                  <option value="staged">Staged</option>
                                  <option value="paused">Paused</option>
                                </select>
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`portfolio-sleeve-holdings-${index}`}>
                                  Expected Holdings
                                </Label>
                                <Input
                                  id={`portfolio-sleeve-holdings-${index}`}
                                  type="number"
                                  value={sleeve.expectedHoldings}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? updateSleeveField(
                                                item,
                                                'expectedHoldings',
                                                event.target.value
                                              )
                                            : item
                                        )
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`portfolio-sleeve-target-${index}`}>Target %</Label>
                                <Input
                                  id={`portfolio-sleeve-target-${index}`}
                                  type="number"
                                  value={sleeve.targetWeightPct}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? updateSleeveField(
                                                item,
                                                'targetWeightPct',
                                                event.target.value
                                              )
                                            : item
                                        )
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`portfolio-sleeve-min-${index}`}>Min %</Label>
                                <Input
                                  id={`portfolio-sleeve-min-${index}`}
                                  type="number"
                                  value={sleeve.minWeightPct}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? updateSleeveField(
                                                item,
                                                'minWeightPct',
                                                event.target.value
                                              )
                                            : item
                                        )
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`portfolio-sleeve-max-${index}`}>Max %</Label>
                                <Input
                                  id={`portfolio-sleeve-max-${index}`}
                                  type="number"
                                  value={sleeve.maxWeightPct}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? updateSleeveField(
                                                item,
                                                'maxWeightPct',
                                                event.target.value
                                              )
                                            : item
                                        )
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`portfolio-sleeve-band-${index}`}>Band %</Label>
                                <Input
                                  id={`portfolio-sleeve-band-${index}`}
                                  type="number"
                                  value={sleeve.rebalanceBandPct}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      config: {
                                        ...current.config,
                                        sleeves: current.config.sleeves.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? updateSleeveField(
                                                item,
                                                'rebalanceBandPct',
                                                event.target.value
                                              )
                                            : item
                                        )
                                      }
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4 rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Risk Envelope
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Limits and overlays that the monitor will enforce against live posture.
                        </p>
                      </div>
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-single-name-max">Single Name Max %</Label>
                          <Input
                            id="portfolio-single-name-max"
                            type="number"
                            value={draft.config.riskLimits.singleNameMaxPct}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  riskLimits: {
                                    ...current.config.riskLimits,
                                    singleNameMaxPct: Number(event.target.value || 0)
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-sector-max">Sector Max %</Label>
                          <Input
                            id="portfolio-sector-max"
                            type="number"
                            value={draft.config.riskLimits.sectorMaxPct}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  riskLimits: {
                                    ...current.config.riskLimits,
                                    sectorMaxPct: Number(event.target.value || 0)
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-turnover-budget">Turnover Budget %</Label>
                          <Input
                            id="portfolio-turnover-budget"
                            type="number"
                            value={draft.config.riskLimits.turnoverBudgetPct}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  riskLimits: {
                                    ...current.config.riskLimits,
                                    turnoverBudgetPct: Number(event.target.value || 0)
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-drift-threshold">Drift Threshold %</Label>
                          <Input
                            id="portfolio-drift-threshold"
                            type="number"
                            value={draft.config.riskLimits.driftRebalanceThresholdPct}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  riskLimits: {
                                    ...current.config.riskLimits,
                                    driftRebalanceThresholdPct: Number(event.target.value || 0)
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-regime-model">Regime Model</Label>
                          <Input
                            id="portfolio-regime-model"
                            value={draft.config.overlays.regimeModelName || ''}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  overlays: {
                                    ...current.config.overlays,
                                    regimeModelName: event.target.value
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-risk-model">Risk Model</Label>
                          <Input
                            id="portfolio-risk-model"
                            value={draft.config.overlays.riskModelName || ''}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                config: {
                                  ...current.config,
                                  overlays: {
                                    ...current.config.overlays,
                                    riskModelName: event.target.value
                                  }
                                }
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="portfolio-notes">Operator Notes</Label>
                          <Textarea
                            id="portfolio-notes"
                            rows={4}
                            value={draft.notes || ''}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                notes: event.target.value
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="desk-pane">
            <div className="border-b border-border/40 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Monitor
                  </div>
                  <h2 className="text-lg">
                    {selectedPortfolioName || draft.name.trim() || 'Portfolio Monitor'}
                  </h2>
                </div>
                {monitorSnapshot ? (
                  <Badge variant={statusBadgeVariant(monitorSnapshot.buildHealth)}>
                    {monitorSnapshot.buildHealth}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="desk-pane-scroll space-y-6 p-5">
              {!selectedPortfolioName ? (
                <StatePanel
                  tone="empty"
                  title="No Saved Portfolio Selected"
                  message="Save or load a portfolio before switching into monitor mode."
                />
              ) : monitorQuery.isLoading ? (
                <PageLoader
                  text="Loading portfolio monitor..."
                  variant="panel"
                  className="min-h-[18rem]"
                />
              ) : monitorErrorMessage ? (
                <StatePanel
                  tone="error"
                  title="Monitor Unavailable"
                  message={monitorErrorMessage}
                />
              ) : monitorSnapshot ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      {
                        label: 'NAV',
                        value: formatCurrency(monitorSnapshot.nav, monitorSnapshot.baseCurrency),
                        tone: monitorSnapshot.buildHealth
                      },
                      {
                        label: 'Since Inception',
                        value: formatPercent(monitorSnapshot.sinceInceptionReturnPct),
                        tone: monitorSnapshot.buildHealth
                      },
                      {
                        label: 'Current Drawdown',
                        value: formatPercent(monitorSnapshot.currentDrawdownPct),
                        tone:
                          Math.abs(monitorSnapshot.currentDrawdownPct) >= 5
                            ? 'warning'
                            : monitorSnapshot.buildHealth
                      },
                      {
                        label: 'Gross Exposure',
                        value: formatPercent(monitorSnapshot.grossExposurePct),
                        tone: monitorSnapshot.buildHealth
                      },
                      {
                        label: 'Cash',
                        value: formatPercent(monitorSnapshot.cashPct),
                        tone: monitorSnapshot.buildHealth
                      },
                      {
                        label: 'Open Alerts',
                        value: String(monitorSnapshot.alerts.length),
                        tone: monitorSnapshot.buildHealth
                      },
                      {
                        label: 'Drift',
                        value: formatPercent(monitorSnapshot.driftPct),
                        tone:
                          monitorSnapshot.driftPct >=
                          draft.config.riskLimits.driftRebalanceThresholdPct
                            ? 'warning'
                            : monitorSnapshot.buildHealth
                      }
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className={`rounded-3xl border p-4 ${compactMetricToneClass(metric.tone)}`}
                      >
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          {metric.label}
                        </div>
                        <div className="mt-2 font-display text-2xl">{metric.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Performance History
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Historical NAV, return path, and turnover for the active internal account.
                        </p>
                      </div>
                      <Badge variant="outline">{monitorSnapshot.history.length}</Badge>
                    </div>

                    <div className="mt-4">
                      {monitorSnapshot.history.length === 0 ? (
                        <StatePanel
                          tone="empty"
                          title="No Performance History"
                          message="Materialize the account once to populate the monitored return path."
                        />
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>NAV</TableHead>
                              <TableHead>Cash</TableHead>
                              <TableHead>Return</TableHead>
                              <TableHead>Drawdown</TableHead>
                              <TableHead className="text-right">Turnover</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monitorSnapshot.history
                              .slice(-8)
                              .reverse()
                              .map((point) => (
                                <TableRow key={point.asOfDate}>
                                  <TableCell>{point.asOfDate}</TableCell>
                                  <TableCell>
                                    {formatCurrency(point.nav, monitorSnapshot.baseCurrency)}
                                  </TableCell>
                                  <TableCell>
                                    {formatCurrency(point.cash, monitorSnapshot.baseCurrency)}
                                  </TableCell>
                                  <TableCell>{formatPercent(point.cumulativeReturnPct)}</TableCell>
                                  <TableCell>{formatPercent(point.drawdownPct)}</TableCell>
                                  <TableCell className="text-right">
                                    {formatPercent(point.turnoverPct)}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Current Positions
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Live look-through positions and sleeve contributors from the last
                          materialization.
                        </p>
                      </div>
                      <Badge variant="outline">{monitorSnapshot.positions.length}</Badge>
                    </div>

                    <div className="mt-4">
                      {monitorSnapshot.positions.length === 0 ? (
                        <StatePanel
                          tone="empty"
                          title="No Positions"
                          message="The current account snapshot does not include materialized positions yet."
                        />
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Symbol</TableHead>
                              <TableHead>Weight</TableHead>
                              <TableHead>Market Value</TableHead>
                              <TableHead>Last Price</TableHead>
                              <TableHead>PnL</TableHead>
                              <TableHead>Contributors</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monitorSnapshot.positions.slice(0, 12).map((position) => (
                              <TableRow key={position.symbol}>
                                <TableCell>
                                  <div className="font-medium">{position.symbol}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {position.quantity.toFixed(2)} shares
                                  </div>
                                </TableCell>
                                <TableCell>{formatPercent(position.weightPct)}</TableCell>
                                <TableCell>
                                  {formatCurrency(
                                    position.marketValue,
                                    monitorSnapshot.baseCurrency
                                  )}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(position.lastPrice, monitorSnapshot.baseCurrency)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(
                                    (position.unrealizedPnl ?? 0) + (position.realizedPnl ?? 0),
                                    monitorSnapshot.baseCurrency
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {position.contributors.length === 0
                                    ? 'Direct'
                                    : position.contributors
                                        .map((contributor) => contributor.strategyName)
                                        .join(', ')}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Recent Build Runs
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Latest rebalance and drift-check activity for the selected portfolio.
                        </p>
                      </div>
                      <Badge variant="outline">{buildRuns.length}</Badge>
                    </div>

                    <div className="mt-4">
                      {buildRunsQuery.isLoading ? (
                        <PageLoader
                          text="Loading build runs..."
                          variant="panel"
                          className="min-h-[12rem]"
                        />
                      ) : buildRunsErrorMessage ? (
                        <StatePanel
                          tone="error"
                          title="Build History Unavailable"
                          message={buildRunsErrorMessage}
                        />
                      ) : buildRuns.length === 0 ? (
                        <StatePanel
                          tone="empty"
                          title="No Build Runs"
                          message="No portfolio builds have been recorded for this workspace yet."
                        />
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Run</TableHead>
                              <TableHead>Scope</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>As Of</TableHead>
                              <TableHead>Drift</TableHead>
                              <TableHead className="text-right">Trades</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {buildRuns.map((run) => (
                              <TableRow key={run.runId}>
                                <TableCell>
                                  <div className="font-medium">{run.runId}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {run.triggeredBy}
                                  </div>
                                </TableCell>
                                <TableCell className="capitalize">{run.buildScope}</TableCell>
                                <TableCell>
                                  <Badge variant={statusBadgeVariant(run.status)}>
                                    {run.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{run.asOfDate}</TableCell>
                                <TableCell>{formatPercent(run.driftPct)}</TableCell>
                                <TableCell className="text-right">
                                  {run.tradeCount ?? 'n/a'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <StatePanel
                  tone="empty"
                  title="Monitor Snapshot Missing"
                  message="No monitor snapshot is available for the selected portfolio."
                />
              )}
            </div>
          </section>
        )}

        <aside className="desk-pane">
          <div className="border-b border-border/40 px-5 py-4">
            <div className="flex items-center gap-2">
              {mode === 'builder' ? (
                <Workflow className="h-5 w-5 text-mcm-olive" />
              ) : (
                <Activity className="h-5 w-5 text-mcm-teal" />
              )}
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {mode === 'builder' ? 'Preview Rail' : 'Operator Rail'}
                </div>
                <h2 className="text-lg">
                  {mode === 'builder' ? 'Readiness & Preview' : 'Freshness, Alerts & Sleeves'}
                </h2>
              </div>
            </div>
          </div>

          <div className="desk-pane-scroll space-y-5 p-5">
            {mode === 'builder' ? (
              <>
                <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-mcm-teal" />
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      Readiness
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {readinessItems.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/65 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{item.label}</span>
                          <Badge variant={item.ready ? 'default' : 'secondary'}>
                            {item.ready ? 'Ready' : 'Review'}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Build Controls
                  </div>
                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="portfolio-preview-date">Preview / Build As Of</Label>
                      <Input
                        id="portfolio-preview-date"
                        type="date"
                        value={previewAsOfDate}
                        onChange={(event) => setPreviewAsOfDate(event.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveDisabled}
                    >
                      {saveMutation.isPending ? 'Saving...' : 'Save Workspace'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => previewMutation.mutate()}
                      disabled={previewDisabled}
                    >
                      {previewMutation.isPending ? 'Previewing...' : 'Preview Allocation Stack'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => triggerBuildMutation.mutate()}
                      disabled={triggerBuildDisabled}
                    >
                      {triggerBuildMutation.isPending ? 'Submitting...' : 'Queue Materialization'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                  <div className="flex items-center gap-2">
                    <WandSparkles className="h-4 w-4 text-mcm-mustard" />
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      Preview
                    </div>
                  </div>
                  <div className="mt-4">
                    {previewMutation.isPending ? (
                      <PageLoader
                        text="Rendering preview..."
                        variant="panel"
                        className="min-h-[10rem]"
                      />
                    ) : previewResult ? (
                      <BuilderPreviewSummary preview={previewResult} isStale={previewStale} />
                    ) : (
                      <StatePanel
                        tone="empty"
                        title="No Preview Yet"
                        message="Run the allocation preview to validate sleeve weights, cash residual, and projected turnover."
                      />
                    )}
                  </div>
                </div>
              </>
            ) : !selectedPortfolioName ? (
              <StatePanel
                tone="empty"
                title="Monitor Needs A Saved Portfolio"
                message="Save or load a portfolio before relying on alerts and sleeve drift telemetry."
              />
            ) : monitorSnapshot ? (
              <>
                <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                        Build Window
                      </div>
                      <div className="mt-2 font-display text-lg">
                        {monitorSnapshot.buildWindowLabel}
                      </div>
                    </div>
                    <Badge variant={statusBadgeVariant(monitorSnapshot.buildHealth)}>
                      {monitorSnapshot.buildHealth}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                    <div>
                      Active Version{' '}
                      <span className="font-medium text-foreground">
                        v{monitorSnapshot.activeVersion ?? 'n/a'}
                      </span>
                    </div>
                    <div>
                      Snapshot As Of{' '}
                      <span className="font-medium text-foreground">
                        {monitorSnapshot.asOfDate}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <Button
                      type="button"
                      onClick={() => triggerBuildMutation.mutate()}
                      disabled={triggerBuildDisabled}
                    >
                      <Play className="h-4 w-4" />
                      {triggerBuildMutation.isPending ? 'Submitting...' : 'Refresh Materialization'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Freshness
                  </div>
                  <div className="mt-4 space-y-3">
                    {monitorSnapshot.freshness.length === 0 ? (
                      <StatePanel
                        tone="info"
                        title="No Freshness Signals"
                        message="Materialization freshness markers have not been published yet."
                      />
                    ) : (
                      monitorSnapshot.freshness.map((item) => (
                        <div
                          key={`${item.domain}-${item.checkedAt || item.asOf || 'freshness'}`}
                          className={`rounded-2xl border p-3 ${
                            item.state === 'error'
                              ? 'border-destructive/30 bg-destructive/10'
                              : item.state === 'stale' || item.state === 'missing'
                                ? 'border-mcm-mustard/30 bg-mcm-mustard/10'
                                : 'border-mcm-teal/20 bg-mcm-teal/8'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium capitalize">{item.domain}</span>
                            <Badge variant={statusBadgeVariant(item.state)}>{item.state}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.reason || 'No freshness exceptions are currently flagged.'}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-mcm-rust" />
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      Alerts
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {monitorSnapshot.alerts.length === 0 ? (
                      <StatePanel
                        tone="info"
                        title="No Active Alerts"
                        message="The current portfolio snapshot is not carrying actionable desk alerts."
                      />
                    ) : (
                      monitorSnapshot.alerts.map((alert) => (
                        <div
                          key={`${alert.title}-${alert.observedAt}`}
                          className={`rounded-2xl border p-3 ${alertToneClass(alert.severity)}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{alert.title}</span>
                            <Badge variant={statusBadgeVariant(alert.severity)}>
                              {alert.severity}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{alert.message}</p>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {formatTimestamp(alert.observedAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Recent Ledger
                  </div>
                  <div className="mt-4 space-y-3">
                    {monitorSnapshot.ledgerEvents.length === 0 ? (
                      <StatePanel
                        tone="empty"
                        title="No Ledger Events"
                        message="Funding, fee, and rebalance events will appear here once posted."
                      />
                    ) : (
                      monitorSnapshot.ledgerEvents.slice(0, 6).map((event) => (
                        <div
                          key={`${event.eventId || event.effectiveAt}-${event.eventType}`}
                          className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/65 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">
                              {event.eventType.replaceAll('_', ' ')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(event.effectiveAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {event.description || event.symbol || 'Ledger event'}
                          </p>
                          <div className="mt-2 text-sm font-medium">
                            {formatCurrency(event.cashAmount, event.currency)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Sleeve Drift
                  </div>
                  <div className="mt-4 space-y-3">
                    {monitorSnapshot.sleeves.map((sleeve) => (
                      <div
                        key={sleeve.sleeveId}
                        className={`rounded-2xl border p-3 ${compactMetricToneClass(sleeve.status)}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{sleeve.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {sleeve.strategyName}
                            </div>
                          </div>
                          <Badge variant={statusBadgeVariant(sleeve.status)}>{sleeve.status}</Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                          <div>
                            Target{' '}
                            <span className="font-medium text-foreground">
                              {formatPercent(sleeve.targetWeightPct)}
                            </span>
                          </div>
                          <div>
                            Live{' '}
                            <span className="font-medium text-foreground">
                              {formatPercent(sleeve.liveWeightPct)}
                            </span>
                          </div>
                          <div>
                            Drift{' '}
                            <span className="font-medium text-foreground">
                              {formatPercent(sleeve.driftPct)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <StatePanel
                tone="empty"
                title="Monitor Snapshot Missing"
                message="No live operator snapshot is available for this portfolio."
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function BuilderPreviewSummary({
  preview,
  isStale
}: {
  preview: PortfolioPreviewResponse;
  isStale: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-mcm-walnut/15 bg-mcm-paper/65 p-3">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Weight Stack
          </div>
          <div className="mt-2 font-display text-2xl">
            {formatPercent(preview.summary.targetWeightPct)}
          </div>
          <div className="text-xs text-muted-foreground">
            Residual cash {formatPercent(preview.summary.residualCashPct)}
          </div>
        </div>
        <div className="rounded-2xl border border-mcm-walnut/15 bg-mcm-paper/65 p-3">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Projected Turnover
          </div>
          <div className="mt-2 font-display text-2xl">
            {formatPercent(preview.summary.projectedTurnoverPct)}
          </div>
          <div className="text-xs text-muted-foreground">
            {preview.summary.projectedPositionCount} projected positions
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-mcm-walnut/15 bg-background/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Exposure Forecast
          </div>
          {isStale ? <Badge variant="secondary">Draft changed</Badge> : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
          <div>
            Gross{' '}
            <span className="font-medium text-foreground">
              {formatPercent(preview.summary.projectedGrossExposurePct)}
            </span>
          </div>
          <div>
            Net{' '}
            <span className="font-medium text-foreground">
              {formatPercent(preview.summary.projectedNetExposurePct)}
            </span>
          </div>
        </div>
      </div>

      {preview.warnings.length > 0 ? (
        <div className="rounded-2xl border border-mcm-mustard/30 bg-mcm-mustard/10 p-3">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Preview Warnings
          </div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-2xl border border-mcm-walnut/15 bg-background/30 p-3">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Sleeve Preview
        </div>
        <div className="mt-3 space-y-3">
          {preview.allocations.map((allocation) => (
            <div
              key={allocation.sleeveId}
              className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/65 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{allocation.label}</div>
                  <div className="text-xs text-muted-foreground">{allocation.strategyName}</div>
                </div>
                <Badge variant={statusBadgeVariant(allocation.status)}>{allocation.status}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  Target{' '}
                  <span className="font-medium text-foreground">
                    {formatPercent(allocation.targetWeightPct)}
                  </span>
                </div>
                <div>
                  Projected{' '}
                  <span className="font-medium text-foreground">
                    {formatPercent(allocation.projectedWeightPct)}
                  </span>
                </div>
                <div>
                  Gross{' '}
                  <span className="font-medium text-foreground">
                    {formatPercent(allocation.projectedGrossExposurePct)}
                  </span>
                </div>
                <div>
                  Holdings{' '}
                  <span className="font-medium text-foreground">{allocation.expectedHoldings}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
