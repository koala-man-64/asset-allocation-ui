import { afterEach, describe, expect, it, vi } from 'vitest';

import { accountOperationsApi } from '@/services/accountOperationsApi';
import { request } from '@/services/apiService';

vi.mock('@/services/apiService', () => ({
  request: vi.fn()
}));

const mockedRequest = vi.mocked(request);

describe('accountOperationsApi', () => {
  afterEach(() => {
    mockedRequest.mockReset();
  });

  it('uses broker account endpoints for reads without trade account fallback', async () => {
    mockedRequest.mockResolvedValue({});

    await accountOperationsApi.listAccounts();
    await accountOperationsApi.getAccountDetail('acct/1');
    await accountOperationsApi.getConfiguration('acct/1');

    expect(mockedRequest).toHaveBeenNthCalledWith(1, '/broker-accounts', {
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/broker-accounts/acct%2F1', {
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(
      3,
      '/broker-accounts/acct%2F1/configuration',
      { signal: undefined }
    );
    for (const [path] of mockedRequest.mock.calls) {
      expect(path).not.toContain('/trade-accounts');
    }
  });

  it('uses broker account endpoints and encoded IDs for actions', async () => {
    mockedRequest.mockResolvedValue({});
    const reconnectPayload = { reason: 'manual reconnect' };
    const pausePayload = { paused: true, reason: 'operator pause' };
    const resumePayload = { paused: false, reason: 'operator resume' };
    const refreshPayload = { scope: 'full', force: true, reason: 'manual refresh' } as const;
    const acknowledgePayload = { note: 'reviewed' };

    await accountOperationsApi.reconnectAccount('acct/1', reconnectPayload);
    await accountOperationsApi.setSyncPaused('acct/1', pausePayload);
    await accountOperationsApi.setSyncPaused('acct/1', resumePayload);
    await accountOperationsApi.refreshAccount('acct/1', refreshPayload);
    await accountOperationsApi.acknowledgeAlert('acct/1', 'alert/1', acknowledgePayload);

    expect(mockedRequest).toHaveBeenNthCalledWith(
      1,
      '/broker-accounts/acct%2F1/reconnect',
      {
        method: 'POST',
        body: JSON.stringify(reconnectPayload),
        signal: undefined
      }
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(
      2,
      '/broker-accounts/acct%2F1/sync/pause',
      {
        method: 'POST',
        body: JSON.stringify(pausePayload),
        signal: undefined
      }
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(
      3,
      '/broker-accounts/acct%2F1/sync/resume',
      {
        method: 'POST',
        body: JSON.stringify(resumePayload),
        signal: undefined
      }
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(
      4,
      '/broker-accounts/acct%2F1/refresh',
      {
        method: 'POST',
        body: JSON.stringify(refreshPayload),
        signal: undefined
      }
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(
      5,
      '/broker-accounts/acct%2F1/alerts/alert%2F1/acknowledge',
      {
        method: 'POST',
        body: JSON.stringify(acknowledgePayload),
        signal: undefined
      }
    );
    for (const [path] of mockedRequest.mock.calls) {
      expect(path).not.toContain('/trade-accounts');
    }
  });

  it('uses broker account endpoints for configuration writes', async () => {
    mockedRequest.mockResolvedValue({});
    const policyPayload: Parameters<typeof accountOperationsApi.saveTradingPolicy>[1] = {
      expectedConfigurationVersion: 3,
      requestedPolicy: {
        allowedSides: ['long'],
        allowedAssetClasses: ['equity'],
        requireOrderConfirmation: true
      }
    };
    const allocationPayload: Parameters<typeof accountOperationsApi.saveAllocation>[1] = {
      expectedConfigurationVersion: 3,
      allocationMode: 'percent',
      notes: '',
      items: [
        {
          sleeveId: 'core',
          sleeveName: 'Core',
          strategy: { strategyName: 'quality-trend', strategyVersion: 4 },
          allocationMode: 'percent',
          targetWeightPct: 100,
          enabled: true,
          notes: ''
        }
      ]
    };

    await accountOperationsApi.saveTradingPolicy('acct/1', policyPayload);
    await accountOperationsApi.saveAllocation('acct/1', allocationPayload);

    expect(mockedRequest).toHaveBeenNthCalledWith(
      1,
      '/broker-accounts/acct%2F1/trading-policy',
      {
        method: 'PUT',
        body: JSON.stringify(policyPayload),
        signal: undefined
      }
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(
      2,
      '/broker-accounts/acct%2F1/allocation',
      {
        method: 'PUT',
        body: JSON.stringify(allocationPayload),
        signal: undefined
      }
    );
  });

  it('uses broker account endpoints for onboarding discovery and create', async () => {
    mockedRequest.mockResolvedValue({});
    const payload: Parameters<typeof accountOperationsApi.onboardAccount>[0] = {
      candidateId: 'alpaca:paper:123',
      provider: 'alpaca',
      environment: 'paper',
      displayName: 'Alpaca Paper',
      readiness: 'review',
      executionPosture: 'paper',
      initialRefresh: true,
      reason: 'Create monitored paper account.'
    };

    await accountOperationsApi.listOnboardingCandidates('alpaca', 'paper');
    await accountOperationsApi.onboardAccount(payload);

    expect(mockedRequest).toHaveBeenNthCalledWith(
      1,
      '/broker-accounts/onboarding/candidates',
      {
        params: { provider: 'alpaca', environment: 'paper' },
        signal: undefined
      }
    );
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/broker-accounts/onboarding', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: undefined
    });
  });
});
