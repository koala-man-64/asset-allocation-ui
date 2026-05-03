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
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
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
