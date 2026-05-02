import { afterEach, describe, expect, it, vi } from 'vitest';

import { exitRuleSetApi } from '@/services/exitRuleSetApi';
import { regimePolicyApi } from '@/services/regimePolicyApi';
import { request } from '@/services/apiService';
import { riskPolicyApi } from '@/services/riskPolicyApi';

vi.mock('@/services/apiService', () => ({
  request: vi.fn()
}));

const mockedRequest = vi.mocked(request);

describe('configuration library APIs', () => {
  afterEach(() => {
    mockedRequest.mockReset();
  });

  it('unwraps list responses for new configuration families', async () => {
    mockedRequest
      .mockResolvedValueOnce({ policies: [{ name: 'regime', version: 1 }] })
      .mockResolvedValueOnce({ policies: [{ name: 'risk', version: 2 }] })
      .mockResolvedValueOnce({ ruleSets: [{ name: 'exits', version: 3 }] });

    await expect(regimePolicyApi.listRegimePolicies()).resolves.toEqual([
      { name: 'regime', version: 1 }
    ]);
    await expect(riskPolicyApi.listRiskPolicies()).resolves.toEqual([{ name: 'risk', version: 2 }]);
    await expect(exitRuleSetApi.listExitRuleSets()).resolves.toEqual([
      { name: 'exits', version: 3 }
    ]);

    expect(mockedRequest).toHaveBeenNthCalledWith(1, '/regime-policies', { signal: undefined });
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/risk-policies', { signal: undefined });
    expect(mockedRequest).toHaveBeenNthCalledWith(3, '/exit-rule-sets', { signal: undefined });
  });

  it('uses revision-aware detail and archive endpoints', async () => {
    mockedRequest.mockResolvedValue({});

    await regimePolicyApi.getRegimePolicyRevision('regime/a', 4);
    await riskPolicyApi.archiveRiskPolicy('risk/a');
    await exitRuleSetApi.getExitRuleSetDetail('exit/a');

    expect(mockedRequest).toHaveBeenNthCalledWith(
      1,
      '/regime-policies/regime%2Fa/revisions/4',
      { signal: undefined }
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/risk-policies/risk%2Fa', {
      method: 'DELETE',
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(3, '/exit-rule-sets/exit%2Fa/detail', {
      signal: undefined
    });
  });

  it('posts save payloads through control-plane APIs', async () => {
    mockedRequest.mockResolvedValue({ status: 'success', message: 'ok', version: 1 });
    const riskPayload = {
      name: 'balanced-risk',
      description: '',
      config: { policy: { notes: '', grossExposureLimit: 1.2 } }
    };

    await riskPolicyApi.saveRiskPolicy(riskPayload);

    expect(mockedRequest).toHaveBeenCalledWith('/risk-policies', {
      method: 'POST',
      body: JSON.stringify(riskPayload),
      signal: undefined
    });
  });
});
