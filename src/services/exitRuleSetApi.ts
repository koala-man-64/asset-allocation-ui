import { request } from '@/services/apiService';
import type {
  ConfigMutationResponse,
  ConfigSaveResponse,
  ExitRuleSetDetail,
  ExitRuleSetRevision,
  ExitRuleSetSummary,
  ExitRuleSetUpsertRequest
} from '@/types/strategy';

interface ExitRuleSetListResponse {
  ruleSets: ExitRuleSetSummary[];
}

export const exitRuleSetApi = {
  async listExitRuleSets(signal?: AbortSignal): Promise<ExitRuleSetSummary[]> {
    const response = await request<ExitRuleSetListResponse>('/exit-rule-sets', { signal });
    return response.ruleSets || [];
  },

  async getExitRuleSetDetail(name: string, signal?: AbortSignal): Promise<ExitRuleSetDetail> {
    return request<ExitRuleSetDetail>(`/exit-rule-sets/${encodeURIComponent(name)}/detail`, {
      signal
    });
  },

  async getExitRuleSetRevision(
    name: string,
    version: number,
    signal?: AbortSignal
  ): Promise<ExitRuleSetRevision> {
    return request<ExitRuleSetRevision>(
      `/exit-rule-sets/${encodeURIComponent(name)}/revisions/${encodeURIComponent(String(version))}`,
      { signal }
    );
  },

  async saveExitRuleSet(
    payload: ExitRuleSetUpsertRequest,
    signal?: AbortSignal
  ): Promise<ConfigSaveResponse> {
    return request<ConfigSaveResponse>('/exit-rule-sets', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async archiveExitRuleSet(name: string, signal?: AbortSignal): Promise<ConfigMutationResponse> {
    return request<ConfigMutationResponse>(`/exit-rule-sets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      signal
    });
  }
};
