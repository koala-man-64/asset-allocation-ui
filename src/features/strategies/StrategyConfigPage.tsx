import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/app/components/ui/button';
import { strategyApi } from '@/services/strategyApi';
import { backtestApi } from '@/services/backtestApi';
import type { StrategyDetail, StrategySummary } from '@/types/strategy';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import {
  StrategyBacktestDialog,
  type StrategyBacktestDraft
} from '@/features/strategies/components/StrategyBacktestDialog';
import { StrategyDeleteDialog } from '@/features/strategies/components/StrategyDeleteDialog';
import { StrategyEditorPanel } from '@/features/strategies/components/StrategyEditorPanel';
import { StrategyEditorWorkspace } from '@/features/strategies/components/StrategyEditorWorkspace';
import { StrategyExplorerPanel } from '@/features/strategies/components/StrategyExplorerPanel';
import { StrategyLibraryRail } from '@/features/strategies/components/StrategyLibraryRail';
import type { StrategyEditorMode } from '@/features/strategies/lib/strategyDraft';
import {
  getStrategySearchText,
  sortStrategies,
  type StrategyLibrarySort
} from '@/features/strategies/lib/strategySummary';
import { toast } from 'sonner';

interface StrategyEditorState {
  mode: StrategyEditorMode;
  strategyName?: string | null;
}

const DEFAULT_BACKTEST_DRAFT: StrategyBacktestDraft = {
  runName: '',
  startTs: '',
  endTs: '',
  barSize: '5m'
};

function toIsoTimestamp(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function StrategyConfigPage() {
  const queryClient = useQueryClient();
  const [selectedStrategyName, setSelectedStrategyName] = useState<string | null>(null);
  const [librarySearchText, setLibrarySearchText] = useState('');
  const [librarySortOrder, setLibrarySortOrder] = useState<StrategyLibrarySort>('updated-desc');
  const [editorState, setEditorState] = useState<StrategyEditorState | null>(null);
  const [strategyPendingDelete, setStrategyPendingDelete] = useState<StrategySummary | null>(null);
  const [isBacktestOpen, setIsBacktestOpen] = useState(false);
  const [backtestDraft, setBacktestDraft] = useState<StrategyBacktestDraft>(DEFAULT_BACKTEST_DRAFT);
  const deferredSearchText = useDeferredValue(librarySearchText);

  const {
    data: strategies = [],
    isLoading: isStrategiesLoading,
    error: strategiesError
  } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => strategyApi.listStrategies()
  });

  const selectedStrategy =
    strategies.find((strategy) => strategy.name === selectedStrategyName) || null;

  const detailQuery = useQuery({
    queryKey: ['strategies', 'detail', selectedStrategyName],
    queryFn: () => strategyApi.getStrategyDetail(String(selectedStrategyName)),
    enabled: Boolean(selectedStrategyName)
  });

  const recentRunsQuery = useQuery({
    queryKey: ['backtest', 'runs', selectedStrategyName],
    queryFn: () =>
      backtestApi.listRuns({
        q: String(selectedStrategyName),
        limit: 6,
        offset: 0
      }),
    enabled: Boolean(selectedStrategyName)
  });
  const filteredStrategies = useMemo(() => {
    const query = deferredSearchText.trim().toLowerCase();
    const matchingStrategies = query
      ? strategies.filter((strategy) => getStrategySearchText(strategy).includes(query))
      : strategies;

    return sortStrategies(matchingStrategies, librarySortOrder);
  }, [deferredSearchText, librarySortOrder, strategies]);

  useEffect(() => {
    if (!strategies.length) {
      setSelectedStrategyName(null);
      return;
    }

    if (!selectedStrategyName || !strategies.some((strategy) => strategy.name === selectedStrategyName)) {
      const fallbackStrategy = sortStrategies(strategies, 'updated-desc')[0];
      setSelectedStrategyName(fallbackStrategy?.name || strategies[0].name);
    }
  }, [selectedStrategyName, strategies]);

  const deleteMutation = useMutation({
    mutationFn: (name: string) => strategyApi.deleteStrategy(name),
    onSuccess: async (_, name) => {
      await queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setStrategyPendingDelete(null);
      setEditorState((current) => (current?.strategyName === name ? null : current));
      setSelectedStrategyName((current) => (current === name ? null : current));
      toast.success(`Strategy ${name} deleted from Postgres`);
    },
    onError: (error) => {
      toast.error(`Failed to delete strategy: ${formatSystemStatusText(error)}`);
    }
  });

  const submitRunMutation = useMutation({
    mutationFn: () => {
      const startTs = toIsoTimestamp(backtestDraft.startTs);
      const endTs = toIsoTimestamp(backtestDraft.endTs);

      if (!selectedStrategyName) {
        throw new Error('Select a strategy before submitting a backtest.');
      }

      if (!startTs || !endTs) {
        throw new Error('Enter valid start and end timestamps.');
      }

      return backtestApi.submitRun({
        strategyName: selectedStrategyName,
        startTs,
        endTs,
        barSize: backtestDraft.barSize.trim() || '5m',
        runName: backtestDraft.runName.trim() || undefined
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['backtest'] });
      setIsBacktestOpen(false);
      setBacktestDraft(DEFAULT_BACKTEST_DRAFT);
      toast.success('Strategy backtest submitted to the queue');
    },
    onError: (error) => {
      toast.error(`Failed to submit backtest: ${formatSystemStatusText(error)}`);
    }
  });

  const strategiesErrorMessage = formatSystemStatusText(strategiesError);
  const detailErrorMessage = formatSystemStatusText(detailQuery.error);
  const recentRunsErrorMessage = formatSystemStatusText(recentRunsQuery.error);

  const editorSourceDetail =
    editorState?.strategyName && editorState.strategyName === selectedStrategyName
      ? detailQuery.data
      : undefined;
  const editorHydrating =
    Boolean(editorState?.strategyName) &&
    editorState?.strategyName === selectedStrategyName &&
    detailQuery.isLoading;
  const editorErrorMessage =
    editorState?.strategyName && editorState.strategyName === selectedStrategyName
      ? detailErrorMessage
      : '';

  const openEditor = (mode: StrategyEditorMode) => {
    if (mode === 'create') {
      setEditorState({ mode });
      return;
    }

    if (!selectedStrategyName) {
      return;
    }

    setEditorState({
      mode,
      strategyName: selectedStrategyName
    });
  };

  const handleSaved = (strategy: StrategyDetail) => {
    setSelectedStrategyName(strategy.name);
    setEditorState(null);
  };

  return (
    <div className="page-shell">
      <div className="page-header-row">
        <div className="page-header">
          <p className="page-kicker">Strategies</p>
          <h1 className="page-title">Strategy Workspace</h1>
          <p className="page-subtitle">
            A single trading-desk workspace for strategy editing, universe and ranking drafts,
            portfolio-backed allocations, historical evidence, and server-backed comparisons.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => openEditor('create')}>Create Strategy</Button>
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[320px_minmax(0,1fr)_minmax(420px,1fr)]">
        <StrategyLibraryRail
          strategies={filteredStrategies}
          selectedStrategyName={selectedStrategyName}
          searchText={librarySearchText}
          sortOrder={librarySortOrder}
          isLoading={isStrategiesLoading}
          errorMessage={strategiesErrorMessage}
          onSearchChange={setLibrarySearchText}
          onSortOrderChange={setLibrarySortOrder}
          onSelectStrategy={setSelectedStrategyName}
          onCreateStrategy={() => openEditor('create')}
        />

        {editorState ? (
          <StrategyEditorWorkspace
            mode={editorState.mode}
            sourceStrategyName={editorState.strategyName}
            strategy={editorState.mode === 'create' ? null : editorSourceDetail}
            isHydrating={editorHydrating}
            errorMessage={editorErrorMessage}
            onCancel={() => setEditorState(null)}
            onSaved={handleSaved}
          />
        ) : (
          <StrategyEditorPanel
            selectedStrategyName={selectedStrategyName}
            selectedStrategy={selectedStrategy}
            strategy={detailQuery.data}
            isLoading={detailQuery.isLoading}
            errorMessage={detailErrorMessage}
            detailReady={Boolean(detailQuery.data) && !detailQuery.isLoading && !detailErrorMessage}
            recentRuns={recentRunsQuery.data?.runs || []}
            recentRunsLoading={recentRunsQuery.isLoading}
            recentRunsError={recentRunsErrorMessage}
            onCreateStrategy={() => openEditor('create')}
            onEditStrategy={() => openEditor('edit')}
            onDuplicateStrategy={() => openEditor('duplicate')}
            onOpenBacktest={() => setIsBacktestOpen(true)}
            onDeleteStrategy={() => selectedStrategy && setStrategyPendingDelete(selectedStrategy)}
          />
        )}

        <StrategyExplorerPanel
          selectedStrategyName={selectedStrategyName}
          strategy={detailQuery.data}
          strategies={strategies}
          recentRuns={recentRunsQuery.data?.runs || []}
        />
      </div>

      <StrategyBacktestDialog
        open={isBacktestOpen}
        strategyName={selectedStrategyName}
        draft={backtestDraft}
        isPending={submitRunMutation.isPending}
        onOpenChange={setIsBacktestOpen}
        onDraftChange={setBacktestDraft}
        onSubmit={() => submitRunMutation.mutate()}
      />

      <StrategyDeleteDialog
        open={Boolean(strategyPendingDelete)}
        strategyName={strategyPendingDelete?.name || null}
        isPending={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setStrategyPendingDelete(null);
          }
        }}
        onConfirm={() => {
          if (strategyPendingDelete?.name) {
            deleteMutation.mutate(strategyPendingDelete.name);
          }
        }}
      />
    </div>
  );
}
