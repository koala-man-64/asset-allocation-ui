import { request } from '@/services/apiService';
import type {
  ConfigMutationResponse,
  ConfigSaveResponse,
  RegimePolicyConfigDetail,
  RegimePolicyConfigRevision,
  RegimePolicyConfigSummary,
  RegimePolicyConfigUpsertRequest
} from '@/types/strategy';

interface RegimePolicyListResponse {
  policies: RegimePolicyConfigSummary[];
}

export const regimePolicyApi = {
  async listRegimePolicies(signal?: AbortSignal): Promise<RegimePolicyConfigSummary[]> {
    const response = await request<RegimePolicyListResponse>('/regime-policies/', { signal });
    return response.policies || [];
  },

  async getRegimePolicyDetail(
    name: string,
    signal?: AbortSignal
  ): Promise<RegimePolicyConfigDetail> {
    return request<RegimePolicyConfigDetail>(`/regime-policies/${encodeURIComponent(name)}/detail`, {
      signal
    });
  },

  async getRegimePolicyRevision(
    name: string,
    version: number,
    signal?: AbortSignal
  ): Promise<RegimePolicyConfigRevision> {
    return request<RegimePolicyConfigRevision>(
      `/regime-policies/${encodeURIComponent(name)}/revisions/${encodeURIComponent(String(version))}`,
      { signal }
    );
  },

  async saveRegimePolicy(
    payload: RegimePolicyConfigUpsertRequest,
    signal?: AbortSignal
  ): Promise<ConfigSaveResponse> {
    return request<ConfigSaveResponse>('/regime-policies/', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async archiveRegimePolicy(name: string, signal?: AbortSignal): Promise<ConfigMutationResponse> {
    return request<ConfigMutationResponse>(`/regime-policies/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      signal
    });
  }
};
