import { Search, Trash2 } from 'lucide-react';

import { PageHero } from '@/app/components/common/PageHero';
import { Button } from '@/app/components/ui/button';
import { SymbolPurgeCandidateReview } from './components/SymbolPurgeCandidateReview';
import { SymbolPurgeCriteriaPanel } from './components/SymbolPurgeCriteriaPanel';
import { SymbolPurgeExecutionPanel } from './components/SymbolPurgeExecutionPanel';
import { useSymbolPurgeController } from './hooks/useSymbolPurgeController';

export function SymbolPurgeByCriteriaPage() {
  const controller = useSymbolPurgeController();
  const { candidate, execution, derived, actions } = controller;
  const estimatedTargets = candidate.response?.summary.estimatedDeletionTargets ?? 0;
  const operationStatusLabel = execution.operationStatus
    ? execution.operationStatus.toUpperCase()
    : 'Idle';

  return (
    <div className="page-shell">
      <PageHero
        kicker="Live Operations"
        title="Symbol Purge Console"
        subtitle="Build a rule, review candidate symbols, and then execute a destructive bulk purge with explicit confirmation."
        actions={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void actions.runPreview()}
            disabled={!derived.canPreview || candidate.loading}
          >
            {candidate.loading ? (
              <Trash2 className="h-4 w-4 animate-pulse" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {candidate.loading ? 'Previewing...' : 'Preview Candidates'}
          </Button>
        }
        metrics={[
          {
            label: 'Selected Symbols',
            value: String(candidate.selectedCount),
            detail: 'Symbols currently staged for purge.'
          },
          {
            label: 'Estimated Targets',
            value: String(estimatedTargets),
            detail: 'Approximate deletion targets from the latest preview.'
          },
          {
            label: 'Execution State',
            value: operationStatusLabel,
            detail: execution.operationId
              ? `Operation ${execution.operationId}`
              : 'No purge operation is currently running.'
          }
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[390px_1fr]">
        <SymbolPurgeCriteriaPanel controller={controller} />
        <section className="space-y-4">
          <SymbolPurgeCandidateReview controller={controller} />
          <SymbolPurgeExecutionPanel controller={controller} />
        </section>
      </div>
    </div>
  );
}
