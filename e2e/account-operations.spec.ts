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
