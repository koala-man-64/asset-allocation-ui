import type {
  BrokerAlertStatus,
  TradeAccountDetail,
  TradeAccountListResponse,
  TradeAccountSummary,
  TradeAuditSeverity,
  TradeEnvironment,
  TradeOrderSide,
  TradeOrderStatus,
  TradeProvider
} from '@asset-allocation/contracts';

export interface TradePnlSnapshot {
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  dayPnl?: number | null;
  grossExposure?: number | null;
  netExposure?: number | null;
  asOf?: string | null;
}

export interface TradeDeskAlert {
  alertId: string;
  accountId: string;
  severity: TradeAuditSeverity;
  status: BrokerAlertStatus;
  code: string;
  title: string;
  message: string;
  blocking: boolean;
  observedAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedAt?: string | null;
  asOfDate?: string | null;
}

export type TradeBlotterEventType =
  | 'fill'
  | 'cancel'
  | 'fee'
  | 'cash_adjustment'
  | 'dividend'
  | 'interest'
  | 'journal';

export interface TradeBlotterRow {
  rowId: string;
  accountId: string;
  provider: TradeProvider;
  environment: TradeEnvironment;
  eventType: TradeBlotterEventType;
  occurredAt: string;
  orderId?: string | null;
  providerOrderId?: string | null;
  clientRequestId?: string | null;
  symbol?: string | null;
  side?: TradeOrderSide | null;
  status?: TradeOrderStatus | null;
  quantity?: number | null;
  price?: number | null;
  fees?: number | null;
  realizedPnl?: number | null;
  cashImpact?: number | null;
  note?: string | null;
}

export interface TradeBlotterResponse {
  accountId: string;
  rows: TradeBlotterRow[];
  generatedAt?: string | null;
  nextCursor?: string | null;
}

export type TradeAccountSummaryView = TradeAccountSummary & {
  pnl?: TradePnlSnapshot | null;
  lastTradeAt?: string | null;
};

export interface TradeAccountDetailView extends Omit<TradeAccountDetail, 'account'> {
  account: TradeAccountSummaryView;
  alerts: TradeDeskAlert[];
}

export interface TradeAccountListResponseView
  extends Omit<TradeAccountListResponse, 'accounts'> {
  accounts: TradeAccountSummaryView[];
}
