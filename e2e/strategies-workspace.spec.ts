import { expect, test } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

test.beforeEach(async ({ page }) => {
  await registerUiApiMocks(page);
});

test('strategies workspace owns editor, explorer, hidden legacy nav, and analytics evidence', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/strategies');

  await expect(page.getByRole('heading', { name: 'Strategy Workspace' })).toBeVisible();
  await expect(page.getByText('Strategy Editor Panel')).toBeVisible();
  await expect(page.getByText('Strategy Explorer Panel')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Strategy Exploration' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Universe Configurations' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ranking Configurations' })).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Universe Configuration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ranking Configuration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Risk Configuration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current Allocations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trade History' })).toBeVisible();
  await expect(page.getByText('Core Paper Portfolio').first()).toBeVisible();
  await expect(page.getByText('portfolio_ledger')).toBeVisible();

  await page.getByRole('button', { name: 'Compare Strategies' }).click();
  await expect(page.getByText('Sharpe').first()).toBeVisible();
  await expect(page.getByText('winner quality-trend')).toBeVisible();

  await page.getByRole('button', { name: 'Request Forecast' }).click();
  await expect(page.getByText('12 samples')).toBeVisible();
  await expect(page.getByText('regime_conditioned')).toBeVisible();
  await expect(page.getByText('Matched historical regime windows.')).toBeVisible();
});
