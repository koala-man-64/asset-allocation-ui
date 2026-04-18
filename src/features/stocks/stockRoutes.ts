export const STOCK_DETAIL_BASE_PATH = '/stock-detail';
export const STOCK_DETAIL_ROUTE = `${STOCK_DETAIL_BASE_PATH}/:ticker?`;

export function buildStockDetailPath(ticker?: string | null): string {
  const normalizedTicker = ticker?.trim().toUpperCase();
  if (!normalizedTicker) {
    return STOCK_DETAIL_BASE_PATH;
  }

  return `${STOCK_DETAIL_BASE_PATH}/${encodeURIComponent(normalizedTicker)}`;
}
