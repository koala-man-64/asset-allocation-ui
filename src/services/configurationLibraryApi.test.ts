import { afterEach, describe, expect, it, vi } from 'vitest';

import { exitRuleSetApi } from '@/services/exitRuleSetApi';
import { rankingApi } from '@/services/rankingApi';
import { rebalancePolicyApi } from '@/services/rebalancePolicyApi';
import { regimePolicyApi } from '@/services/regimePolicyApi';
import { request } from '@/services/apiService';
import { riskPolicyApi } from '@/services/riskPolicyApi';
import { universeApi } from '@/services/universeApi';
import type { RiskPolicyConfigUpsertRequest } from '@/types/strategy';

vi.mock('@/services/apiService', () => ({
  request: vi.fn()
}));

const mockedRequest = vi.mocked(request);

describe('configuration library APIs', () => {
  afterEach(() => {
    mockedRequest.mockReset();
  });

  it('uses canonical collection routes for configuration library lists', async () => {
    mockedRequest
      .mockResolvedValueOnce([{ name: 'universe', version: 1 }])
      .mockResolvedValueOnce([{ name: 'ranking', version: 1 }])
      .mockResolvedValueOnce({ policies: [{ name: 'regime', version: 1 }] })
      .mockResolvedValueOnce({ policies: [{ name: 'risk', version: 2 }] })
      .mockResolvedValueOnce({ policies: [{ name: 'monthly-last', version: 1 }] })
      .mockResolvedValueOnce({ ruleSets: [{ name: 'exits', version: 3 }] });

    await expect(universeApi.listUniverseConfigs()).resolves.toEqual([
      { name: 'universe', version: 1 }
    ]);
    await expect(rankingApi.listRankingSchemas()).resolves.toEqual([
      { name: 'ranking', version: 1 }
    ]);
    await expect(regimePolicyApi.listRegimePolicies()).resolves.toEqual([
      { name: 'regime', version: 1 }
    ]);
    await expect(riskPolicyApi.listRiskPolicies()).resolves.toEqual([{ name: 'risk', version: 2 }]);
    await expect(rebalancePolicyApi.listRebalancePolicies()).resolves.toEqual([
      { name: 'monthly-last', version: 1 }
    ]);
    await expect(exitRuleSetApi.listExitRuleSets()).resolves.toEqual([
      { name: 'exits', version: 3 }
    ]);

    expect(mockedRequest).toHaveBeenNthCalledWith(1, '/universes/', { signal: undefined });
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/rankings/', { signal: undefined });
    expect(mockedRequest).toHaveBeenNthCalledWith(3, '/regime-policies/', { signal: undefined });
    expect(mockedRequest).toHaveBeenNthCalledWith(4, '/risk-policies/', { signal: undefined });
    expect(mockedRequest).toHaveBeenNthCalledWith(5, '/rebalance-policies/', { signal: undefined });
    expect(mockedRequest).toHaveBeenNthCalledWith(6, '/exit-rule-sets/', { signal: undefined });
  });

  it('uses revision-aware detail and archive endpoints', async () => {
    mockedRequest.mockResolvedValue({});

    await regimePolicyApi.getRegimePolicyRevision('regime/a', 4);
    await riskPolicyApi.archiveRiskPolicy('risk/a');
    await rebalancePolicyApi.getRebalancePolicyRevision('monthly/a', 2);
    await exitRuleSetApi.getExitRuleSetDetail('exit/a');

    expect(mockedRequest).toHaveBeenNthCalledWith(1, '/regime-policies/regime%2Fa/revisions/4', {
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/risk-policies/risk%2Fa', {
      method: 'DELETE',
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(3, '/rebalance-policies/monthly%2Fa/revisions/2', {
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(4, '/exit-rule-sets/exit%2Fa/detail', {
      signal: undefined
    });
  });

  it('posts save payloads through control-plane APIs', async () => {
    mockedRequest.mockResolvedValue({ status: 'success', message: 'ok', version: 1 });
    const riskPayload: RiskPolicyConfigUpsertRequest = {
      name: 'balanced-risk',
      description: '',
      config: {
        policy: {
          enabled: true,
          scope: 'strategy',
          stopLoss: {
            id: 'strategy-stop-loss',
            enabled: true,
            basis: 'strategy_nav_drawdown',
            thresholdPct: 0.1,
            action: 'reduce_exposure',
            reductionPct: 0.5
          },
          takeProfit: null,
          reentry: {
            cooldownBars: 5,
            requireApproval: false
          }
        }
      }
    };

    await riskPolicyApi.saveRiskPolicy(riskPayload);
    await rebalancePolicyApi.saveRebalancePolicy({
      name: 'monthly-last-trading-day',
      description: '',
      config: {
        frequency: 'every_bar',
        executionTiming: 'next_bar_open',
        cadence: 'monthly',
        dayRule: 'last_trading_day',
        anchor: 'next_open',
        tradeDelayBars: 0,
        minTradeNotional: 0,
        cashBufferPct: 0,
        allowPartialRebalance: true,
        closeRemovedPositions: true
      }
    });

    expect(mockedRequest).toHaveBeenNthCalledWith(1, '/risk-policies/', {
      method: 'POST',
      body: JSON.stringify(riskPayload),
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/rebalance-policies/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'monthly-last-trading-day',
        description: '',
        config: {
          frequency: 'every_bar',
          executionTiming: 'next_bar_open',
          cadence: 'monthly',
          dayRule: 'last_trading_day',
          anchor: 'next_open',
          tradeDelayBars: 0,
          minTradeNotional: 0,
          cashBufferPct: 0,
          allowPartialRebalance: true,
          closeRemovedPositions: true
        }
      }),
      signal: undefined
    });
  });
});
