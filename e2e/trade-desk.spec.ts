import { expect, test } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

test.beforeEach(async ({ page }) => {
  await registerUiApiMocks(page);
});

test('trade desk supports account selection, preview, submit, and cancel with mock API', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/trade-desk');

  await expect(page.getByRole('heading', { name: 'Account Trading' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Trade account' })).toContainText('Core Paper');
  await expect(page.getByText('PAPER').first()).toBeVisible();

  await page.locator('#trade-symbol').fill('msft');
  await page.locator('#trade-quantity').fill('1');
  await page.getByRole('button', { name: /preview/i }).click();
  await expect(page.getByText('Clear')).toBeVisible();

  await page.getByRole('button', { name: /submit/i }).click();
  await expect(page.getByText('Order submitted.')).toBeVisible();

  await page.getByRole('tab', { name: 'Open Orders' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Cancel requested.')).toBeVisible();
});
