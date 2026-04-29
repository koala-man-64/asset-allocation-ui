import { expect, test } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

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
  await expect(page.getByText('Account Operations Unavailable')).toHaveCount(0);
});

test('account operations saves trading policy with expected configuration version', async ({ page }) => {
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
