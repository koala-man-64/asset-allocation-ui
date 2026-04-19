import type { PortfolioLedgerEventRow } from '@/types/portfolio';

export interface PortfolioBlotterRow {
  rowId: string;
  effectiveAt: string;
  eventType: string;
  eventLabel: string;
  symbol: string;
  quantity: number | null;
  price: number | null;
  commission: number | null;
  slippageCost: number | null;
  cashImpact: number;
  description: string;
}

function humanizeEventType(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildPortfolioBlotter(
  events: readonly PortfolioLedgerEventRow[]
): PortfolioBlotterRow[] {
  return [...events]
    .sort((left, right) => Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt))
    .map((event, index) => ({
      rowId: event.eventId || `${event.effectiveAt}-${event.eventType}-${event.symbol || index}`,
      effectiveAt: event.effectiveAt,
      eventType: event.eventType,
      eventLabel: humanizeEventType(event.eventType),
      symbol: event.symbol || 'Cash',
      quantity: event.quantity ?? null,
      price: event.price ?? null,
      commission: event.commission ?? null,
      slippageCost: event.slippageCost ?? null,
      cashImpact: event.cashAmount,
      description: event.description || ''
    }));
}
