import { Badge } from '@/app/components/ui/badge';
import type { RunStatusResponse } from '@/services/backtestApi';
import { getRunStatusTone } from '@/features/backtests/lib/presentation';

export function BacktestStatusBadge({
  run,
  className
}: {
  run?: Pick<RunStatusResponse, 'status' | 'results_ready_at'> | null;
  className?: string;
}) {
  const tone = getRunStatusTone(run);

  return (
    <Badge variant={tone.variant} className={className}>
      {tone.label}
    </Badge>
  );
}
