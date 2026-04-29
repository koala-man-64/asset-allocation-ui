import {
  AlertTriangle,
  Gauge,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Zap
} from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Slider } from '@/app/components/ui/slider';
import type { BacktestReplayEvent } from '@/services/backtestApi';
import { formatCurrency, formatTimestamp } from '@/features/backtests/lib/backtestPresentation';

interface BacktestReplayPanelProps {
  events: BacktestReplayEvent[];
  total: number;
  currentIndex: number;
  playing: boolean;
  speed: number;
  symbolFilter: string;
  loading?: boolean;
  error?: string;
  warnings?: string[];
  onCurrentIndexChange: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
  onSymbolFilterChange: (symbol: string) => void;
}

function clampIndex(index: number, events: BacktestReplayEvent[]): number {
  if (!events.length) {
    return 0;
  }
  return Math.min(Math.max(index, 0), events.length - 1);
}

function findLargestCostIndex(events: BacktestReplayEvent[]): number {
  let targetIndex = 0;
  let targetCost = Number.NEGATIVE_INFINITY;
  events.forEach((event, index) => {
    const cost = Number(event.transactionCost ?? 0);
    if (cost > targetCost) {
      targetCost = cost;
      targetIndex = index;
    }
  });
  return targetIndex;
}

export function BacktestReplayPanel({
  events,
  total,
  currentIndex,
  playing,
  speed,
  symbolFilter,
  loading,
  error,
  warnings = [],
  onCurrentIndexChange,
  onPlayingChange,
  onSpeedChange,
  onSymbolFilterChange
}: BacktestReplayPanelProps) {
  const currentEvent = events[clampIndex(currentIndex, events)];
  const disabled = loading || events.length === 0;
  const maxIndex = Math.max(0, events.length - 1);
  const sliderDisabled = disabled || events.length <= 1;
  const sliderMax = Math.max(1, maxIndex);

  return (
    <section className="space-y-4 rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Replay
          </div>
          <div className="text-sm text-muted-foreground">
            {events.length} loaded / {total} events
          </div>
        </div>
        <Badge variant={currentEvent?.source === 'broker_fill' ? 'default' : 'secondary'}>
          {currentEvent?.source || 'no source'}
        </Badge>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="replay-symbol-filter">Symbol filter</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="replay-symbol-filter"
            className="pl-9"
            value={symbolFilter}
            onChange={(event) => onSymbolFilterChange(event.target.value.toUpperCase())}
            placeholder="MSFT"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Jump to first replay event"
          disabled={disabled}
          onClick={() => onCurrentIndexChange(0)}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous replay event"
          disabled={disabled}
          onClick={() => onCurrentIndexChange(clampIndex(currentIndex - 1, events))}
        >
          <StepBack className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          aria-label={playing ? 'Pause replay' : 'Play replay'}
          disabled={disabled}
          onClick={() => onPlayingChange(!playing)}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next replay event"
          disabled={disabled}
          onClick={() => onCurrentIndexChange(clampIndex(currentIndex + 1, events))}
        >
          <StepForward className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Jump to last replay event"
          disabled={disabled}
          onClick={() => onCurrentIndexChange(maxIndex)}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Cursor</span>
          <span>
            {events.length ? currentIndex + 1 : 0} / {events.length}
          </span>
        </div>
        <Slider
          min={0}
          max={sliderMax}
          step={1}
          value={[clampIndex(currentIndex, events)]}
          disabled={sliderDisabled}
          onValueChange={(value) => onCurrentIndexChange(value[0] ?? 0)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="replay-speed">Speed</Label>
        <div className="flex items-center gap-3">
          <Gauge className="h-4 w-4 text-mcm-olive" />
          <Input
            id="replay-speed"
            type="number"
            min="0.25"
            max="4"
            step="0.25"
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value) || 1)}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => onCurrentIndexChange(findLargestCostIndex(events))}
        >
          <Zap className="h-4 w-4" />
          Cost Spike
        </Button>
        <Button type="button" variant="outline" disabled>
          <AlertTriangle className="h-4 w-4" />
          Limit Breach
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {currentEvent ? (
        <div className="rounded-xl border border-mcm-walnut/15 bg-mcm-paper/75 p-3 text-sm">
          <div className="font-semibold">{currentEvent.summary}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatTimestamp(currentEvent.timestamp)} · {currentEvent.eventType}
          </div>
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
            <span>Cash after {formatCurrency(currentEvent.afterCash)}</span>
            <span>Transaction cost {formatCurrency(currentEvent.transactionCost)}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-mcm-walnut/30 bg-mcm-paper/55 p-3 text-sm text-muted-foreground">
          {loading ? 'Loading replay events...' : 'No replay events for the current selection.'}
        </div>
      )}

      {warnings.length ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          {warnings.slice(0, 3).map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
