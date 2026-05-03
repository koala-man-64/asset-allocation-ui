import { request } from '@/services/apiService';
import type {
  ConfigMutationResponse,
  ConfigSaveResponse,
  RebalancePolicyDetail,
  RebalancePolicyRevision,
  RebalancePolicySummary,
  RebalancePolicyUpsertRequest
} from '@/types/strategy';

interface RebalancePolicyListResponse {
  policies: RebalancePolicySummary[];
}

export const rebalancePolicyApi = {
  async listRebalancePolicies(signal?: AbortSignal): Promise<RebalancePolicySummary[]> {
    const response = await request<RebalancePolicyListResponse>('/rebalance-policies/', { signal });
    return response.policies || [];
  },

  async getRebalancePolicyDetail(
    name: string,
    signal?: AbortSignal
  ): Promise<RebalancePolicyDetail> {
    return request<RebalancePolicyDetail>(`/rebalance-policies/${encodeURIComponent(name)}/detail`, {
      signal
    });
  },

  async getRebalancePolicyRevision(
    name: string,
    version: number,
    signal?: AbortSignal
  ): Promise<RebalancePolicyRevision> {
    return request<RebalancePolicyRevision>(
      `/rebalance-policies/${encodeURIComponent(name)}/revisions/${encodeURIComponent(String(version))}`,
      { signal }
    );
  },

  async saveRebalancePolicy(
    payload: RebalancePolicyUpsertRequest,
    signal?: AbortSignal
  ): Promise<ConfigSaveResponse> {
    return request<ConfigSaveResponse>('/rebalance-policies/', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async archiveRebalancePolicy(name: string, signal?: AbortSignal): Promise<ConfigMutationResponse> {
    return request<ConfigMutationResponse>(`/rebalance-policies/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      signal
    });
  }
};
