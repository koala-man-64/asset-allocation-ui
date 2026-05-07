import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

async function expectNoSeriousViolations(page: Page) {
  const accessibilityScan = await new AxeBuilder({ page }).analyze();
  const seriousViolations = accessibilityScan.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact || '')
  );

  expect(
    seriousViolations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length
    }))
  ).toEqual([]);
}

async function expectScopeControlsToFit(page: Page) {
  const controls = page.locator('[aria-label="Account scope"] [data-slot="toggle-group-item"]');
  await expect(controls).toHaveCount(7);

  const boxes = await controls.evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();

      return {
        bottom: rect.bottom,
        clientWidth: item.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: item.scrollWidth,
        text: item.textContent?.trim() ?? '',
        top: rect.top
      };
    })
  );

  for (const box of boxes) {
    expect(
      box.scrollWidth,
      `${box.text} scope filter should fit inside its button`
    ).toBeLessThanOrEqual(box.clientWidth + 1);
  }

  for (const [index, box] of boxes.entries()) {
    for (const next of boxes.slice(index + 1)) {
      const verticallyOverlaps = box.top < next.bottom && next.top < box.bottom;
      const horizontallyOverlaps = box.left < next.right && next.left < box.right;

      expect(
        verticallyOverlaps && horizontallyOverlaps,
        `${box.text} and ${next.text} scope filters should not overlap`
      ).toBe(false);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await registerUiApiMocks(page);
});

test('account operations loads broker accounts without unavailable fallback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const accountListResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/broker-accounts' && response.request().method() === 'GET';
  });

  await page.goto('/accounts');
  const response = await accountListResponse;

  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Account Board' })).toBeVisible();
  await expect(page.getByTestId('account-card-acct-paper')).toBeVisible();
  await expect(page.getByTestId('account-card-acct-live')).toBeVisible();
  await expect(page.getByTestId('account-card-acct-live')).toContainText('reconnect_required');
  await expect(page.getByText('Account Operations Unavailable')).toHaveCount(0);
  await expectScopeControlsToFit(page);

  const boardBox = await page.getByRole('region', { name: 'Account board' }).boundingBox();
  const verdictBox = await page.getByRole('complementary', { name: 'Desk verdict' }).boundingBox();
  expect(boardBox).not.toBeNull();
  expect(verdictBox).not.toBeNull();
  expect(verdictBox!.x).toBeGreaterThan(boardBox!.x + boardBox!.width - 4);
  expect(Math.abs(verdictBox!.y - boardBox!.y)).toBeLessThan(96);
});

test('account operations board filters and action dialog submit audited refresh reasons', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/accounts');

  await page.getByLabel('Account search').fill('Core Paper');
  await expect(page.getByTestId('account-card-acct-paper')).toBeVisible();
  await expect(page.getByTestId('account-card-acct-live')).toHaveCount(0);

  const paperCard = page.getByTestId('account-card-acct-paper');
  await expect(paperCard.getByRole('button', { name: 'Refresh Now' })).toBeEnabled();
  await paperCard.getByRole('button', { name: 'Refresh Now' }).click();

  const submitButton = page.getByRole('button', { name: 'Queue Refresh' });
  await expect(submitButton).toBeDisabled();
  await page.getByRole('button', { name: /Refresh requested before rebalance review/i }).click();

  const refreshRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/broker-accounts/acct-paper/refresh' && request.method() === 'POST'
    );
  });
  await submitButton.click();
  const request = await refreshRequest;

  expect(request.postDataJSON()).toMatchObject({
    scope: 'full',
    force: true,
    reason: 'Refresh requested before rebalance review.'
  });
  await expect(page.getByText('Refresh queued.')).toBeVisible();
});

test('account operations mobile viewports do not introduce horizontal overflow', async ({
  page
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 700 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/accounts');
    await expect(page.getByRole('heading', { name: 'Account Board' })).toBeVisible();
    await expectScopeControlsToFit(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('account operations empty state can onboard a discovered broker account', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const generatedAt = '2026-04-18T14:30:00Z';
  const freshness = {
    balancesState: 'unknown',
    positionsState: 'unknown',
    ordersState: 'unknown',
    balancesAsOf: null,
    positionsAsOf: null,
    ordersAsOf: null,
    maxAgeSeconds: 300,
    staleReason: 'Seeded through broker onboarding; initial refresh pending.'
  };
  const tradeAccount = {
    accountId: 'alpaca-paper',
    name: 'Alpaca Paper',
    provider: 'alpaca',
    environment: 'paper',
    accountNumberMasked: '***6789',
    baseCurrency: 'USD',
    readiness: 'review',
    readinessReason: 'Seeded through broker onboarding; refresh required.',
    capabilities: {
      canReadAccount: true,
      canReadPositions: true,
      canReadOrders: true,
      canReadHistory: true,
      canPreview: true,
      canSubmitPaper: true,
      canSubmitSandbox: false,
      canSubmitLive: false,
      canCancel: true,
      supportsMarketOrders: true,
      supportsLimitOrders: true,
      supportsStopOrders: false,
      supportsFractionalQuantity: false,
      supportsNotionalOrders: false,
      supportsEquities: true,
      supportsEtfs: true,
      supportsOptions: false,
      readOnly: false,
      unsupportedReason: null
    },
    cash: 0,
    buyingPower: 0,
    equity: 0,
    openOrderCount: 0,
    positionCount: 0,
    unresolvedAlertCount: 0,
    killSwitchActive: false,
    confirmationRequired: false,
    lastSyncedAt: null,
    snapshotAsOf: generatedAt,
    freshness,
    pnl: null,
    lastTradeAt: null
  };
  const brokerAccount = {
    accountId: tradeAccount.accountId,
    broker: tradeAccount.provider,
    name: tradeAccount.name,
    accountNumberMasked: tradeAccount.accountNumberMasked,
    baseCurrency: tradeAccount.baseCurrency,
    overallStatus: 'warning',
    tradeReadiness: tradeAccount.readiness,
    tradeReadinessReason: tradeAccount.readinessReason,
    highestAlertSeverity: null,
    connectionHealth: {
      overallStatus: 'warning',
      authStatus: 'authenticated',
      connectionState: 'degraded',
      syncStatus: 'never_synced',
      lastCheckedAt: generatedAt,
      lastSuccessfulSyncAt: null,
      lastFailedSyncAt: null,
      authExpiresAt: null,
      staleReason: freshness.staleReason,
      failureMessage: null,
      syncPaused: false
    },
    equity: 0,
    cash: 0,
    buyingPower: 0,
    openPositionCount: 0,
    openOrderCount: 0,
    lastSyncedAt: null,
    snapshotAsOf: generatedAt,
    activePortfolioName: null,
    strategyLabel: null,
    configurationVersion: null,
    allocationSummary: null,
    alertCount: 0
  };
  const brokerDetail = {
    account: brokerAccount,
    capabilities: {
      canReadBalances: true,
      canReadPositions: true,
      canReadOrders: true,
      canTrade: true,
      canReconnect: false,
      canPauseSync: true,
      canRefresh: true,
      canAcknowledgeAlerts: false,
      canReadTradingPolicy: true,
      canWriteTradingPolicy: true,
      canReadAllocation: true,
      canWriteAllocation: true,
      canReleaseTradeConfirmation: false,
      readOnlyReason: null
    },
    accountType: 'paper',
    tradingBlocked: false,
    tradingBlockedReason: null,
    unsettledFunds: null,
    dayTradeBuyingPower: null,
    maintenanceExcess: null,
    alerts: [],
    syncRuns: [],
    recentActivity: [],
    configuration: null
  };
  const tradeDetail = {
    account: tradeAccount,
    restrictions: [],
    riskLimits: {
      maxOrderNotional: 50000,
      maxDailyNotional: 100000,
      maxShareQuantity: 1000,
      allowedAssetClasses: ['equity'],
      allowedOrderTypes: ['market', 'limit'],
      liveTradingAllowed: false,
      liveTradingReason: null
    },
    unresolvedAlerts: [],
    recentAuditEvents: [],
    alerts: []
  };
  const onboardingCandidate = {
    candidateId: 'alpaca:paper:123',
    provider: 'alpaca',
    environment: 'paper',
    suggestedAccountId: tradeAccount.accountId,
    displayName: tradeAccount.name,
    accountNumberMasked: tradeAccount.accountNumberMasked,
    baseCurrency: tradeAccount.baseCurrency,
    state: 'available',
    stateReason: null,
    existingAccountId: null,
    allowedExecutionPostures: ['monitor_only', 'paper'],
    blockedExecutionPostureReasons: {
      live: 'Live posture requires environment=live.'
    },
    canOnboard: true
  };
  let onboarded = false;

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname.replace(/\/api/, '').replace(/\/+$/, '');

    if (apiPath === '/broker-accounts') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accounts: onboarded ? [brokerAccount] : [], generatedAt })
      });
    }
    if (apiPath === '/trade-accounts') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accounts: onboarded ? [tradeAccount] : [], generatedAt })
      });
    }
    if (apiPath === '/broker-accounts/onboarding/candidates') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [onboardingCandidate],
          discoveryStatus: 'completed',
          message: '',
          generatedAt
        })
      });
    }
    if (apiPath === '/broker-accounts/onboarding') {
      onboarded = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          account: brokerAccount,
          configuration: null,
          created: true,
          reenabled: false,
          refreshAction: null,
          audit: null,
          message: 'Broker account onboarded.',
          generatedAt
        })
      });
    }
    if (apiPath === '/broker-accounts/alpaca-paper') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(brokerDetail)
      });
    }
    if (apiPath === '/trade-accounts/alpaca-paper') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tradeDetail)
      });
    }
    if (apiPath === '/trade-accounts/alpaca-paper/positions') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accountId: tradeAccount.accountId, positions: [], generatedAt, freshness })
      });
    }
    if (apiPath === '/trade-accounts/alpaca-paper/orders') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accountId: tradeAccount.accountId, orders: [], generatedAt })
      });
    }
    if (apiPath === '/trade-accounts/alpaca-paper/history') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accountId: tradeAccount.accountId, orders: [], generatedAt })
      });
    }
    if (apiPath === '/trade-accounts/alpaca-paper/blotter') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accountId: tradeAccount.accountId, rows: [], generatedAt })
      });
    }

    return route.fallback();
  });

  await page.goto('/accounts');
  await expect(page.getByText(/No configured accounts/i)).toBeVisible();

  await page.getByRole('button', { name: /add account/i }).first().click();
  await page.getByRole('button', { name: /discover accounts/i }).click();
  await page.getByRole('button', { name: /alpaca paper/i }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /paper execution posture/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByLabel(/operator reason/i).fill('Create paper account for monitoring.');

  const onboardingRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/broker-accounts/onboarding' && request.method() === 'POST';
  });
  await page.getByRole('button', { name: /onboard account/i }).click();
  expect((await onboardingRequest).postDataJSON()).toMatchObject({
    candidateId: onboardingCandidate.candidateId,
    displayName: tradeAccount.name,
    readiness: 'review',
    executionPosture: 'paper',
    initialRefresh: true,
    reason: 'Create paper account for monitoring.'
  });

  await expect(page.getByTestId('account-card-alpaca-paper')).toContainText('Alpaca Paper');
});

test('account operations dossier monitoring is keyboard reachable and accessible', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/accounts');

  await page
    .getByTestId('account-card-acct-paper')
    .getByRole('button', { name: 'Open Dossier' })
    .click();
  await page.getByRole('tab', { name: 'Monitoring' }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByText(/Positions, orders, fills, P&L/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in Trade Desk' })).toHaveAttribute(
    'href',
    '/trade-desk?accountId=acct-paper'
  );
  await expect(page.getByText('MSFT')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Account Board' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('account operations saves trading policy with expected configuration version', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/accounts');

  await page
    .getByTestId('account-card-acct-paper')
    .getByRole('button', { name: 'Open Dossier' })
    .click();
  await page.getByRole('tab', { name: 'Configuration' }).click();
  await expect(page.getByRole('heading', { name: 'Execution Guardrails' })).toBeVisible();

  await page.getByLabel('Max open positions').fill('24');

  const policyRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/broker-accounts/acct-paper/trading-policy' &&
      request.method() === 'PUT'
    );
  });
  const policyResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/broker-accounts/acct-paper/trading-policy' &&
      response.request().method() === 'PUT'
    );
  });

  await page.getByRole('button', { name: 'Save Trading Policy' }).click();

  const request = await policyRequest;
  const response = await policyResponse;
  const payload = request.postDataJSON();

  expect(response.status()).toBe(200);
  expect(payload).toMatchObject({
    expectedConfigurationVersion: 1,
    requestedPolicy: {
      maxOpenPositions: 24
    }
  });
  await expect(page.locator('[aria-label="Effective trading policy"]')).toContainText(
    'Max 24 positions'
  );
});
