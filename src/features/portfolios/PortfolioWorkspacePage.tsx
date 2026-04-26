import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Briefcase, Clock3, Layers3, TrendingUp } from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
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
import { PortfolioLibraryRail } from '@/features/portfolios/components/PortfolioLibraryRail';
import { PortfolioOverviewTab } from '@/features/portfolios/components/PortfolioOverviewTab';
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

const PortfolioConstructionTab = lazy(() =>
  import('@/features/portfolios/components/PortfolioConstructionTab').then((module) => ({
    default: module.PortfolioConstructionTab
  }))
);

const PortfolioPerformanceTab = lazy(() =>
  import('@/features/portfolios/components/PortfolioPerformanceTab').then((module) => ({
    default: module.PortfolioPerformanceTab
  }))
);

const PortfolioTradingTab = lazy(() =>
  import('@/features/portfolios/components/PortfolioTradingTab').then((module) => ({
    default: module.PortfolioTradingTab
  }))
);

function buildDefaultPreviewDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function TabPanelLoader() {
  return <PageLoader text="Loading workspace panel..." variant="panel" className="min-h-[32rem]" />;
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
              <span className="font-medium">
                {monitorSnapshot?.accountName || draft.name || 'Unsaved draft'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Portfolio</span>
              <span className="font-medium">
                {draft.portfolioName || draft.name || 'Unassigned'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">
                v{monitorSnapshot?.activeVersion ?? draft.version}
              </span>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={onPreview}
                  disabled={previewDisabled}
                >
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
                        <Badge
                          variant={
                            previewResult.previewSource === 'live-proposal'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {previewResult.previewSource === 'live-proposal'
                            ? 'Live proposal'
                            : 'Inferred'}
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
                      <div className="mt-2 font-display text-xl">
                        {previewResult.warnings.length}
                      </div>
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
                    {titleCaseWords(
                      monitorSnapshot?.buildHealth || draft.buildStatus || draft.status
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                  <div className="text-sm text-muted-foreground">Alerts</div>
                  <div className="mt-2 font-display text-xl">
                    {monitorSnapshot?.alerts.length ?? 0}
                  </div>
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
        nextDraft.config.sleeves
          .reduce((total, sleeve) => total + sleeve.targetWeightPct, 0)
          .toFixed(2)
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
  const currentRegimeCode = currentRegimeQuery.data?.active_regimes?.[0] ?? null;
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
      icon:
        activeTab === 'trading' ? (
          <Clock3 className="h-4 w-4 text-mcm-rust" />
        ) : (
          <Layers3 className="h-4 w-4 text-mcm-olive" />
        )
    },
    {
      label: 'Headline Return',
      value: formatPercent(
        benchmarkComparison.activeHeadlineReturnPct ??
          monitorSnapshot?.sinceInceptionReturnPct ??
          null
      ),
      detail:
        benchmarkComparison.activeHeadlineReturnPct !== null
          ? `Active return vs ${benchmarkSymbol}.`
          : 'Fallback to absolute since-inception return until benchmark history aligns.',
      icon: <TrendingUp className="h-4 w-4 text-mcm-teal" />
    }
  ];

  const renderTabContent = () => {
    if (
      selectedPortfolioName &&
      detailQuery.isLoading &&
      !detailQuery.data &&
      activeTab !== 'construction'
    ) {
      return (
        <PageLoader
          text="Loading portfolio workspace..."
          variant="panel"
          className="min-h-[32rem]"
        />
      );
    }

    if (
      selectedPortfolioName &&
      detailErrorMessage &&
      !detailQuery.data &&
      activeTab !== 'construction'
    ) {
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
        <Suspense fallback={<TabPanelLoader />}>
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
        </Suspense>
      );
    }

    if (activeTab === 'performance') {
      return (
        <Suspense fallback={<TabPanelLoader />}>
          <PortfolioPerformanceTab
            monitorSnapshot={monitorSnapshot}
            benchmarkComparison={benchmarkComparison}
            benchmarkError={benchmarkErrorMessage || undefined}
            regimeHistory={regimeHistoryQuery.data?.rows ?? []}
            regimeHistoryError={regimeHistoryErrorMessage || undefined}
            currentRegimeCode={currentRegimeCode}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<TabPanelLoader />}>
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
      </Suspense>
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
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as PortfolioWorkspaceTab)}
            >
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
      </div>
    </div>
  );
}
