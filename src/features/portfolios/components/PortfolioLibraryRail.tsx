import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import {
  formatPercent,
  formatTimestamp,
  statusBadgeVariant
} from '@/features/portfolios/lib/portfolioPresentation';
import type { PortfolioSummary } from '@/types/portfolio';

interface PortfolioLibraryRailProps {
  portfolios: readonly PortfolioSummary[];
  filteredPortfolios: readonly PortfolioSummary[];
  selectedPortfolioName: string | null;
  draftName: string;
  loading: boolean;
  errorMessage?: string;
  librarySearchText: string;
  onLibrarySearchTextChange: (value: string) => void;
  onSelectPortfolio: (portfolioName: string) => void;
  onOpenNewDraft: () => void;
}

export function PortfolioLibraryRail({
  portfolios,
  filteredPortfolios,
  selectedPortfolioName,
  draftName,
  loading,
  errorMessage,
  librarySearchText,
  onLibrarySearchTextChange,
  onSelectPortfolio,
  onOpenNewDraft
}: PortfolioLibraryRailProps) {
  return (
    <section className="mcm-panel flex min-h-[720px] flex-col overflow-hidden">
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
            onChange={(event) => onLibrarySearchTextChange(event.target.value)}
          />
        </div>
        <Button type="button" variant="outline" className="mt-4 w-full" onClick={onOpenNewDraft}>
          New Portfolio
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <PageLoader text="Loading portfolios..." variant="panel" className="min-h-[12rem]" />
        ) : errorMessage ? (
          <StatePanel tone="error" title="Portfolio Library Unavailable" message={errorMessage} />
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
              (!selectedPortfolioName && draftName.trim() === portfolio.name);

            return (
              <button
                key={portfolio.name}
                type="button"
                onClick={() => onSelectPortfolio(portfolio.name)}
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
                  <Badge variant={statusBadgeVariant(portfolio.status)}>{portfolio.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    Benchmark{' '}
                    <span className="font-medium text-foreground">{portfolio.benchmarkSymbol}</span>
                  </div>
                  <div>
                    Sleeves <span className="font-medium text-foreground">{portfolio.sleeveCount}</span>
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
  );
}
