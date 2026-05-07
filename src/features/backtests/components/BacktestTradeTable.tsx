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
import type { TradeListResponse } from '@/services/backtestApi';
import {
  formatCurrency,
  formatInteger,
  formatTimestamp
} from '@/features/backtests/lib/backtestPresentation';

interface BacktestTradeTableProps {
  data?: TradeListResponse;
  loading?: boolean;
  error?: string;
}

export function BacktestTradeTable({ data, loading, error }: BacktestTradeTableProps) {
  if (error) {
    return <StatePanel tone="error" title="Trades Unavailable" message={error} />;
  }

  if (loading) {
    return <StatePanel tone="empty" title="Loading Trades" message="Fetching trade ledger rows." />;
  }

  const trades = data?.trades ?? [];
  if (!trades.length) {
    return (
      <StatePanel
        tone="empty"
        title="No Trades"
        message="The published trade ledger has no rows for this run."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Trade Ledger
        </div>
        <Badge variant="secondary">{formatInteger(data?.total)} rows</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Notional</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Cash After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade, index) => (
            <TableRow key={`${trade.execution_date}-${trade.symbol}-${index}`}>
              <TableCell>{formatTimestamp(trade.execution_date)}</TableCell>
              <TableCell className="font-semibold">{trade.symbol}</TableCell>
              <TableCell>{trade.trade_role || 'n/a'}</TableCell>
              <TableCell className="text-right">{formatInteger(trade.quantity)}</TableCell>
              <TableCell className="text-right">{formatCurrency(trade.price)}</TableCell>
              <TableCell className="text-right">{formatCurrency(trade.notional)}</TableCell>
              <TableCell className="text-right">
                {formatCurrency((trade.commission || 0) + (trade.slippage_cost || 0))}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(trade.cash_after)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

