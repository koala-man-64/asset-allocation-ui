import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { StatePanel } from '@/app/components/common/StatePanel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import type { TradeDeskAuditEvent, TradeOrder, TradePosition } from '@asset-allocation/contracts';
import type { TradeBlotterRow } from '@/services/tradeDeskModels';
import {
  formatCurrency,
  formatMetadataValue,
  formatNumber,
  formatTimestamp,
  orderStatusVariant,
  titleCase
} from '@/features/trade-desk/tradeDeskUtils';

const TERMINAL_ORDER_STATUSES = ['filled', 'cancelled', 'rejected', 'expired'] as const;

export function PositionsTable({
  positions,
  variant = 'monitor'
}: {
  positions: readonly TradePosition[];
  variant?: 'monitor' | 'desk';
}) {
  if (!positions.length) {
    return (
      <StatePanel
        tone="empty"
        title="No Positions"
        message="This account has no position rows in the current trade snapshot."
      />
    );
  }

  const deskView = variant === 'desk';

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Class</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          {!deskView ? <TableHead className="text-right">Avg</TableHead> : null}
          <TableHead className="text-right">Last</TableHead>
          <TableHead className="text-right">Value</TableHead>
          {!deskView ? <TableHead className="text-right">Day P&L</TableHead> : null}
          <TableHead className="text-right">Unrealized</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position) => (
          <TableRow key={position.symbol}>
            <TableCell className="font-mono font-semibold">{position.symbol}</TableCell>
            <TableCell>{titleCase(position.assetClass)}</TableCell>
            <TableCell className="text-right font-mono">
              {formatNumber(position.quantity)}
            </TableCell>
            {!deskView ? (
              <TableCell className="text-right font-mono">
                {formatCurrency(position.averageEntryPrice)}
              </TableCell>
            ) : null}
            <TableCell className="text-right font-mono">
              {formatCurrency(position.lastPrice)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(position.marketValue)}
            </TableCell>
            {!deskView ? (
              <TableCell className="text-right font-mono">
                {formatCurrency(position.dayPnl)}
              </TableCell>
            ) : null}
            <TableCell className="text-right font-mono">
              {formatCurrency(position.unrealizedPnl)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function OrdersTable({
  orders,
  onCancel,
  cancellingOrderId,
  cancelUnavailableReason,
  emptyTitle = 'No Orders',
  emptyMessage = 'No order rows match this view.'
}: {
  orders: readonly TradeOrder[];
  onCancel?: (order: TradeOrder) => void;
  cancellingOrderId?: string | null;
  cancelUnavailableReason?: string | null;
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  if (!orders.length) {
    return <StatePanel tone="empty" title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Notional</TableHead>
          <TableHead>Updated</TableHead>
          {onCancel || cancelUnavailableReason ? (
            <TableHead className="text-right">Action</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const canCancel =
            onCancel &&
            !cancelUnavailableReason &&
            !TERMINAL_ORDER_STATUSES.includes(
              order.status as (typeof TERMINAL_ORDER_STATUSES)[number]
            );
          return (
            <TableRow key={order.orderId}>
              <TableCell className="max-w-[12rem] truncate font-mono text-xs">
                {order.orderId}
              </TableCell>
              <TableCell className="font-mono font-semibold">{order.symbol}</TableCell>
              <TableCell>
                <Badge variant={order.side === 'buy' ? 'default' : 'secondary'}>
                  {order.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell>{titleCase(order.orderType)}</TableCell>
              <TableCell>
                <Badge variant={orderStatusVariant(order.status)}>{titleCase(order.status)}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{formatNumber(order.quantity)}</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(order.estimatedNotional ?? order.notional)}
              </TableCell>
              <TableCell>{formatTimestamp(order.updatedAt ?? order.createdAt)}</TableCell>
              {onCancel || cancelUnavailableReason ? (
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canCancel || cancellingOrderId === order.orderId}
                    title={cancelUnavailableReason ?? undefined}
                    onClick={() => onCancel?.(order)}
                  >
                    Cancel
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function BlotterTable({ rows }: { rows: readonly TradeBlotterRow[] }) {
  if (!rows.length) {
    return (
      <StatePanel
        tone="empty"
        title="No Blotter Rows"
        message="Executed fills, fees, and cash adjustments will appear here once they are posted."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Timestamp</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Fees</TableHead>
          <TableHead className="text-right">Realized P&L</TableHead>
          <TableHead className="text-right">Cash Impact</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.rowId}>
            <TableCell>{formatTimestamp(row.occurredAt)}</TableCell>
            <TableCell>{titleCase(row.eventType)}</TableCell>
            <TableCell className="font-mono font-semibold">{row.symbol ?? 'n/a'}</TableCell>
            <TableCell>{row.side ? row.side.toUpperCase() : 'n/a'}</TableCell>
            <TableCell className="text-right font-mono">{formatNumber(row.quantity)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(row.price)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(row.fees)}</TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(row.realizedPnl)}
            </TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(row.cashImpact)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ActivityTimeline({
  events,
  compact = false
}: {
  events: readonly TradeDeskAuditEvent[];
  compact?: boolean;
}) {
  if (!events.length) {
    return <div className="text-sm text-muted-foreground">No trade desk activity recorded.</div>;
  }

  return (
    <div className="space-y-3">
      {events.slice(0, compact ? 4 : 12).map((event) => (
        <div
          key={event.eventId}
          className="rounded-xl border border-mcm-walnut/15 bg-background/30 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={event.severity === 'critical' ? 'destructive' : 'outline'}>
              {titleCase(event.eventType)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(event.occurredAt)}
            </span>
          </div>
          <p className="mt-2 text-sm">{event.summary || titleCase(event.eventType)}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {event.actor ? <span>Actor: {event.actor}</span> : null}
            {event.orderId ? <span>Order: {event.orderId}</span> : null}
            {event.clientRequestId ? <span>Client request: {event.clientRequestId}</span> : null}
            {event.statusAfter ? <span>Status: {titleCase(event.statusAfter)}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RiskCheckEvidence({
  message,
  metadata
}: {
  message: string;
  metadata: Record<string, unknown>;
}) {
  const entries = Object.entries(metadata);
  return (
    <div className="space-y-2">
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      {entries.length ? (
        <div className="flex flex-wrap gap-2">
          {entries.map(([key, value]) => (
            <Badge key={key} variant="outline" className="normal-case">
              {titleCase(key)}: {formatMetadataValue(value)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
