import { request } from '@/services/apiService';
import type {
  TradeAccountDetailView,
  TradeAccountListResponseView,
  TradeBlotterResponse
} from '@/services/tradeDeskModels';
import type {
  TradeOrderCancelRequest,
  TradeOrderCancelResponse,
  TradeOrderHistoryResponse,
  TradeOrderPlaceRequest,
  TradeOrderPlaceResponse,
  TradeOrderPreviewRequest,
  TradeOrderPreviewResponse,
  TradePositionListResponse
} from '@asset-allocation/contracts';

const tradeAccountPath = (accountId: string) => `/trade-accounts/${encodeURIComponent(accountId)}`;

export const tradeDeskKeys = {
  all: () => ['trade-desk'] as const,
  accounts: () => [...tradeDeskKeys.all(), 'accounts'] as const,
  detail: (accountId: string | null) =>
    [...tradeDeskKeys.all(), 'detail', accountId ?? 'none'] as const,
  positions: (accountId: string | null) =>
    [...tradeDeskKeys.all(), 'positions', accountId ?? 'none'] as const,
  orders: (accountId: string | null) =>
    [...tradeDeskKeys.all(), 'orders', accountId ?? 'none'] as const,
  history: (accountId: string | null) =>
    [...tradeDeskKeys.all(), 'history', accountId ?? 'none'] as const,
  blotter: (accountId: string | null) =>
    [...tradeDeskKeys.all(), 'blotter', accountId ?? 'none'] as const
};

export const tradeDeskApi = {
  listAccounts(signal?: AbortSignal): Promise<TradeAccountListResponseView> {
    return request<TradeAccountListResponseView>('/trade-accounts', { signal });
  },

  getAccountDetail(accountId: string, signal?: AbortSignal): Promise<TradeAccountDetailView> {
    return request<TradeAccountDetailView>(tradeAccountPath(accountId), { signal });
  },

  listPositions(accountId: string, signal?: AbortSignal): Promise<TradePositionListResponse> {
    return request<TradePositionListResponse>(`${tradeAccountPath(accountId)}/positions`, {
      signal
    });
  },

  listOrders(accountId: string, signal?: AbortSignal): Promise<TradeOrderHistoryResponse> {
    return request<TradeOrderHistoryResponse>(`${tradeAccountPath(accountId)}/orders`, {
      signal
    });
  },

  listHistory(accountId: string, signal?: AbortSignal): Promise<TradeOrderHistoryResponse> {
    return request<TradeOrderHistoryResponse>(`${tradeAccountPath(accountId)}/history`, {
      signal
    });
  },

  listBlotter(accountId: string, signal?: AbortSignal): Promise<TradeBlotterResponse> {
    return request<TradeBlotterResponse>(`${tradeAccountPath(accountId)}/blotter`, {
      signal
    });
  },

  previewOrder(
    accountId: string,
    payload: TradeOrderPreviewRequest,
    signal?: AbortSignal
  ): Promise<TradeOrderPreviewResponse> {
    return request<TradeOrderPreviewResponse>(`${tradeAccountPath(accountId)}/orders/preview`, {
      method: 'POST',
      body: JSON.stringify(payload),
      retryOnStatusCodes: false,
      retryAttempts: 1,
      signal
    });
  },

  placeOrder(
    accountId: string,
    payload: TradeOrderPlaceRequest,
    signal?: AbortSignal
  ): Promise<TradeOrderPlaceResponse> {
    return request<TradeOrderPlaceResponse>(`${tradeAccountPath(accountId)}/orders`, {
      method: 'POST',
      body: JSON.stringify(payload),
      retryOnStatusCodes: false,
      retryAttempts: 1,
      signal
    });
  },

  cancelOrder(
    accountId: string,
    orderId: string,
    payload: TradeOrderCancelRequest,
    signal?: AbortSignal
  ): Promise<TradeOrderCancelResponse> {
    return request<TradeOrderCancelResponse>(
      `${tradeAccountPath(accountId)}/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        retryOnStatusCodes: false,
        retryAttempts: 1,
        signal
      }
    );
  }
};

export function createTradeDeskIdempotencyKey(prefix = 'trade-desk'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
