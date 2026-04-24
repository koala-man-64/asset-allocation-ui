import { afterEach, describe, expect, it, vi } from 'vitest';

import { tradeDeskApi } from '@/services/tradeDeskApi';
import { request } from '@/services/apiService';

vi.mock('@/services/apiService', () => ({
  request: vi.fn()
}));

const mockedRequest = vi.mocked(request);

describe('tradeDeskApi', () => {
  afterEach(() => {
    mockedRequest.mockReset();
  });

  it('uses unified trade account endpoints for reads', async () => {
    mockedRequest.mockResolvedValue({});

    await tradeDeskApi.listAccounts();
    await tradeDeskApi.getAccountDetail('acct/1');
    await tradeDeskApi.listPositions('acct/1');
    await tradeDeskApi.listOrders('acct/1');
    await tradeDeskApi.listHistory('acct/1');

    expect(mockedRequest).toHaveBeenNthCalledWith(1, '/trade-accounts', { signal: undefined });
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/trade-accounts/acct%2F1', {
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(3, '/trade-accounts/acct%2F1/positions', {
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(4, '/trade-accounts/acct%2F1/orders', {
      signal: undefined
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(5, '/trade-accounts/acct%2F1/history', {
      signal: undefined
    });
  });

  it('disables status retries for trade mutations', async () => {
    mockedRequest.mockResolvedValue({});
    const previewPayload = {
      accountId: 'acct-1',
      environment: 'paper',
      clientRequestId: 'client-1',
      symbol: 'MSFT',
      side: 'buy',
      orderType: 'market',
      timeInForce: 'day',
      assetClass: 'equity',
      quantity: 1,
      allowExtendedHours: false,
      source: 'manual'
    } as const;
    const placePayload = {
      ...previewPayload,
      idempotencyKey: 'idem-000000000001',
      previewId: 'preview-1',
      confirmedAt: '2026-04-24T15:00:00Z',
      confirmedRiskCheckIds: []
    };
    const cancelPayload = {
      accountId: 'acct-1',
      orderId: 'order-1',
      clientRequestId: 'client-2',
      idempotencyKey: 'idem-000000000002',
      reason: 'Operator cancel.'
    };

    await tradeDeskApi.previewOrder('acct-1', previewPayload);
    await tradeDeskApi.placeOrder('acct-1', placePayload);
    await tradeDeskApi.cancelOrder('acct-1', 'order-1', cancelPayload);

    for (const call of mockedRequest.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          method: 'POST',
          retryOnStatusCodes: false,
          retryAttempts: 1
        })
      );
    }
    expect(mockedRequest.mock.calls[1][1]?.body).toContain('idem-000000000001');
    expect(mockedRequest.mock.calls[2][1]?.body).toContain('idem-000000000002');
  });
});
