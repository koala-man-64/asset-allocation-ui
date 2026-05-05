import { expect, test } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

test.beforeEach(async ({ page }) => {
  await registerUiApiMocks(page);
});

test('configuration library tabs keep rendering after visiting Universe', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/strategy-configurations?tab=ranking');

  await expect(page.getByRole('heading', { name: 'Saved ranking schemas' })).toBeVisible();

  await page.getByRole('tab', { name: 'Universe' }).click();
  await expect(page).toHaveURL(/\/strategy-configurations\?tab=universe$/);
  await expect(page.getByRole('heading', { name: 'Universe Library' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved ranking schemas' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Exit Rules' }).click();
  await expect(page).toHaveURL(/\/strategy-configurations\?tab=exit-rules$/);
  await expect(page.getByRole('heading', { name: 'Exit Rule Set Library' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Universe Library' })).toHaveCount(0);
});
