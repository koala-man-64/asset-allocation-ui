import { request } from '@/services/apiService';
import type {
  AcknowledgeBrokerAlertRequest,
  BrokerAccountActionResponse,
  BrokerAccountAllocationUpdateRequest,
  BrokerAccountConfiguration,
  BrokerAccountDetail,
  BrokerAccountListResponse,
  BrokerTradingPolicyUpdateRequest,
  PauseBrokerSyncRequest,
  ReconnectBrokerAccountRequest,
  RefreshBrokerAccountRequest
} from '@/types/brokerAccounts';

export const accountOperationsKeys = {
  all: () => ['account-operations'] as const,
  list: () => [...accountOperationsKeys.all(), 'list'] as const,
  detail: (accountId: string | null) =>
    [...accountOperationsKeys.all(), 'detail', accountId ?? 'none'] as const,
  configuration: (accountId: string | null) =>
    [...accountOperationsKeys.all(), 'configuration', accountId ?? 'none'] as const
};

export const accountOperationsApi = {
  async listAccounts(signal?: AbortSignal): Promise<BrokerAccountListResponse> {
    return request<BrokerAccountListResponse>('/broker-accounts', { signal });
  },

  async getAccountDetail(accountId: string, signal?: AbortSignal): Promise<BrokerAccountDetail> {
    return request<BrokerAccountDetail>(`/broker-accounts/${encodeURIComponent(accountId)}`, {
      signal
    });
  },

  async getConfiguration(
    accountId: string,
    signal?: AbortSignal
  ): Promise<BrokerAccountConfiguration> {
    return request<BrokerAccountConfiguration>(
      `/broker-accounts/${encodeURIComponent(accountId)}/configuration`,
      { signal }
    );
  },

  async reconnectAccount(
    accountId: string,
    payload: ReconnectBrokerAccountRequest,
    signal?: AbortSignal
  ): Promise<BrokerAccountActionResponse> {
    return request<BrokerAccountActionResponse>(
      `/broker-accounts/${encodeURIComponent(accountId)}/reconnect`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        signal
      }
    );
  },

  async setSyncPaused(
    accountId: string,
    payload: PauseBrokerSyncRequest,
    signal?: AbortSignal
  ): Promise<BrokerAccountActionResponse> {
    const verb = payload.paused ? 'pause' : 'resume';
    return request<BrokerAccountActionResponse>(
      `/broker-accounts/${encodeURIComponent(accountId)}/sync/${verb}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        signal
      }
    );
  },

  async refreshAccount(
    accountId: string,
    payload: RefreshBrokerAccountRequest,
    signal?: AbortSignal
  ): Promise<BrokerAccountActionResponse> {
    return request<BrokerAccountActionResponse>(
      `/broker-accounts/${encodeURIComponent(accountId)}/refresh`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        signal
      }
    );
  },

  async acknowledgeAlert(
    accountId: string,
    alertId: string,
    payload: AcknowledgeBrokerAlertRequest,
    signal?: AbortSignal
  ): Promise<BrokerAccountActionResponse> {
    return request<BrokerAccountActionResponse>(
      `/broker-accounts/${encodeURIComponent(accountId)}/alerts/${encodeURIComponent(alertId)}/acknowledge`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        signal
      }
    );
  },

  async saveTradingPolicy(
    accountId: string,
    payload: BrokerTradingPolicyUpdateRequest,
    signal?: AbortSignal
  ): Promise<BrokerAccountConfiguration> {
    return request<BrokerAccountConfiguration>(
      `/broker-accounts/${encodeURIComponent(accountId)}/trading-policy`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
        signal
      }
    );
  },

  async saveAllocation(
    accountId: string,
    payload: BrokerAccountAllocationUpdateRequest,
    signal?: AbortSignal
  ): Promise<BrokerAccountConfiguration> {
    return request<BrokerAccountConfiguration>(
      `/broker-accounts/${encodeURIComponent(accountId)}/allocation`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
        signal
      }
    );
  }
};
