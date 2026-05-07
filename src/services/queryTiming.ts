export const queryTiming = {
  tradeDesk: {
    accountsMs: 30_000,
    detailMs: 30_000,
    positionsMs: 30_000,
    ordersMs: 15_000,
    historyMs: 30_000,
    blotterMs: 30_000
  },
  systemHealth: {
    healthyMs: 30_000,
    degradedMs: 15_000,
    criticalMs: 10_000
  }
} as const;
