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
  layout?: 'rail' | 'stacked';
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
  layout = 'rail',
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
  const isStacked = layout === 'stacked';

  return (
    <section
      className={cn(
        'mcm-panel flex flex-col overflow-hidden',
        isStacked ? 'min-h-0' : 'min-h-[680px]'
      )}
    >
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

        <div
          className={cn(
            'mt-5 grid gap-3',
            isStacked ? 'lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center' : 'grid-cols-1'
          )}
        >
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search strategies"
              value={searchText}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search name, type, or note"
              className="pl-9"
            />
          </div>

          <div className={cn(isStacked ? 'contents' : 'flex flex-col gap-3')}>
            <Select
              value={sortOrder}
              onValueChange={(value) => onSortOrderChange(value as StrategyLibrarySort)}
            >
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

            <Button
              onClick={onCreateStrategy}
              className={cn('w-full', isStacked && 'lg:w-auto lg:px-5')}
            >
              <Plus className="h-4 w-4" />
              Create Strategy
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className={cn(isStacked ? 'max-h-[360px]' : 'flex-1')}>
        <div
          className={cn(
            'p-4',
            isStacked ? 'grid gap-3 md:grid-cols-2 2xl:grid-cols-3' : 'space-y-3'
          )}
        >
          {isLoading ? (
            <PageLoader
              text="Loading strategies..."
              className={cn('h-56', isStacked && 'md:col-span-2 2xl:col-span-3')}
            />
          ) : errorMessage ? (
            <div
              className={cn(
                'rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive',
                isStacked && 'md:col-span-2 2xl:col-span-3'
              )}
            >
              {errorMessage}
            </div>
          ) : strategies.length === 0 ? (
            <div
              className={cn(
                'rounded-3xl border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/75 p-6',
                isStacked && 'md:col-span-2 2xl:col-span-3'
              )}
            >
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
                    'h-full w-full rounded-[1.6rem] border-2 px-4 py-4 text-left transition-colors',
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
