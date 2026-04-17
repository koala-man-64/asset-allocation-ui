import { Plus, Search } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import { PageLoader } from '@/app/components/common/PageLoader';
import { cn } from '@/app/components/ui/utils';
import type { StrategySummary } from '@/types/strategy';
import {
  formatStrategyTimestamp,
  formatStrategyType,
  STRATEGY_SORT_OPTIONS,
  type StrategyLibrarySort
} from '@/features/strategies/lib/strategySummary';

interface StrategyLibraryRailProps {
  strategies: StrategySummary[];
  selectedStrategyName: string | null;
  searchText: string;
  sortOrder: StrategyLibrarySort;
  isLoading: boolean;
  errorMessage: string;
  onSearchChange: (value: string) => void;
  onSortOrderChange: (value: StrategyLibrarySort) => void;
  onSelectStrategy: (name: string) => void;
  onCreateStrategy: () => void;
}

export function StrategyLibraryRail({
  strategies,
  selectedStrategyName,
  searchText,
  sortOrder,
  isLoading,
  errorMessage,
  onSearchChange,
  onSortOrderChange,
  onSelectStrategy,
  onCreateStrategy
}: StrategyLibraryRailProps) {
  return (
    <section className="mcm-panel flex min-h-[680px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Strategy Library
            </p>
            <h2 className="font-display text-xl text-foreground">Desk Inventory</h2>
            <p className="text-sm text-muted-foreground">
              Search and sort saved strategies before opening the dossier.
            </p>
          </div>
          <Badge variant="secondary">{strategies.length} visible</Badge>
        </div>

        <div className="mt-5 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search strategies"
              value={searchText}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search name, type, or note"
              className="pl-9"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={sortOrder} onValueChange={(value) => onSortOrderChange(value as StrategyLibrarySort)}>
              <SelectTrigger aria-label="Sort strategies">
                <SelectValue placeholder="Sort strategies" />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={onCreateStrategy} className="sm:ml-auto">
              <Plus className="h-4 w-4" />
              Create Strategy
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {isLoading ? (
            <PageLoader text="Loading strategies..." className="h-56" />
          ) : errorMessage ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : strategies.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/75 p-6">
              <p className="font-display text-lg text-foreground">No strategies found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Start a new strategy draft or loosen the search filter to restore the library.
              </p>
              <Button onClick={onCreateStrategy} className="mt-5">
                <Plus className="h-4 w-4" />
                New Strategy
              </Button>
            </div>
          ) : (
            strategies.map((strategy) => {
              const isSelected = strategy.name === selectedStrategyName;

              return (
                <button
                  key={strategy.name}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Open strategy ${strategy.name}`}
                  onClick={() => onSelectStrategy(strategy.name)}
                  className={cn(
                    'w-full rounded-[1.6rem] border-2 px-4 py-4 text-left transition-colors',
                    isSelected
                      ? 'border-mcm-teal bg-mcm-paper shadow-[6px_6px_0px_0px_rgba(0,128,128,0.12)]'
                      : 'border-mcm-walnut/25 bg-mcm-cream/70 hover:bg-mcm-paper'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="truncate font-display text-lg text-foreground">
                        {strategy.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {strategy.description || 'No desk note recorded.'}
                      </div>
                    </div>
                    <Badge variant={strategy.type === 'configured' ? 'default' : 'outline'}>
                      {formatStrategyType(strategy.type)}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span>{formatStrategyTimestamp(strategy.updated_at)}</span>
                    <span className="text-mcm-walnut/45">|</span>
                    <span>{strategy.type}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
