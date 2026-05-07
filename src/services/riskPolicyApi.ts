import { request } from '@/services/apiService';
import type {
  ConfigMutationResponse,
  ConfigSaveResponse,
  RiskPolicyConfigDetail,
  RiskPolicyConfigRevision,
  RiskPolicyConfigSummary,
  RiskPolicyConfigUpsertRequest
} from '@/types/strategy';

interface RiskPolicyListResponse {
  policies: RiskPolicyConfigSummary[];
}

export const riskPolicyApi = {
  async listRiskPolicies(signal?: AbortSignal): Promise<RiskPolicyConfigSummary[]> {
    const response = await request<RiskPolicyListResponse>('/risk-policies/', { signal });
    return response.policies || [];
  },

  async getRiskPolicyDetail(name: string, signal?: AbortSignal): Promise<RiskPolicyConfigDetail> {
    return request<RiskPolicyConfigDetail>(`/risk-policies/${encodeURIComponent(name)}/detail`, {
      signal
    });
  },

  async getRiskPolicyRevision(
    name: string,
    version: number,
    signal?: AbortSignal
  ): Promise<RiskPolicyConfigRevision> {
    return request<RiskPolicyConfigRevision>(
      `/risk-policies/${encodeURIComponent(name)}/revisions/${encodeURIComponent(String(version))}`,
      { signal }
    );
  },

  async saveRiskPolicy(
    payload: RiskPolicyConfigUpsertRequest,
    signal?: AbortSignal
  ): Promise<ConfigSaveResponse> {
    return request<ConfigSaveResponse>('/risk-policies/', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async archiveRiskPolicy(name: string, signal?: AbortSignal): Promise<ConfigMutationResponse> {
    return request<ConfigMutationResponse>(`/risk-policies/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      signal
    });
  }
};
