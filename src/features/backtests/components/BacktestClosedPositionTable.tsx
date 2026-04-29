import { Badge } from '@/app/components/ui/badge';
import { StatePanel } from '@/app/components/common/StatePanel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import type { ClosedPositionListResponse } from '@/services/backtestApi';
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatTimestamp
} from '@/features/backtests/lib/backtestPresentation';

interface BacktestClosedPositionTableProps {
  data?: ClosedPositionListResponse;
  loading?: boolean;
  error?: string;
}

export function BacktestClosedPositionTable({
  data,
  loading,
  error
}: BacktestClosedPositionTableProps) {
  if (error) {
    return <StatePanel tone="error" title="Positions Unavailable" message={error} />;
  }

  if (loading) {
    return (
      <StatePanel tone="empty" title="Loading Positions" message="Fetching closed positions." />
    );
  }

  const positions = data?.positions ?? [];
  if (!positions.length) {
    return (
      <StatePanel
        tone="empty"
        title="No Closed Positions"
        message="The published closed-position ledger has no rows for this run."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Closed Positions
        </div>
        <Badge variant="secondary">{formatInteger(data?.total)} rows</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Opened</TableHead>
            <TableHead>Closed</TableHead>
            <TableHead className="text-right">Bars</TableHead>
            <TableHead className="text-right">Pnl</TableHead>
            <TableHead className="text-right">Return</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Exit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => (
            <TableRow key={position.position_id}>
              <TableCell className="font-semibold">{position.symbol}</TableCell>
              <TableCell>{formatTimestamp(position.opened_at)}</TableCell>
              <TableCell>{formatTimestamp(position.closed_at)}</TableCell>
              <TableCell className="text-right">{formatInteger(position.holding_period_bars)}</TableCell>
              <TableCell className="text-right">{formatCurrency(position.realized_pnl)}</TableCell>
              <TableCell className="text-right">{formatPercent(position.realized_return)}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(position.total_transaction_cost)}
              </TableCell>
              <TableCell>{position.exit_reason || position.exit_rule_id || 'n/a'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

