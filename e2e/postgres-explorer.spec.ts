import { expect, test, type Page } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

async function expectNoDocumentOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));

  expect(Math.max(layout.bodyScrollWidth, layout.docScrollWidth)).toBeLessThanOrEqual(
    layout.innerWidth + 1
  );
}

test.beforeEach(async ({ page }) => {
  await registerUiApiMocks(page);
});

test('queries, sorts, edits, and guards purge in the TradeStation-style Postgres explorer', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/postgres-explorer', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('postgres-workstation')).toBeVisible();
  await expect(page.getByTestId('postgres-command-strip')).toContainText('Postgres Explorer');
  await expect(page.getByRole('combobox', { name: 'Schema' })).toHaveValue('core');
  await expect(page.getByRole('combobox', { name: 'Table' })).toHaveValue(
    'backtest_closed_positions'
  );

  await page.getByRole('button', { name: 'Query Table' }).click();
  await expect(page.getByText('SPY')).toBeVisible();
  await expect(page.getByText('QQQ')).toBeVisible();

  const resultMatrix = page.getByTestId('postgres-result-matrix');
  await resultMatrix.getByRole('button', { name: /^symbol/i }).click();
  const firstRows = resultMatrix.getByRole('button', { name: /open row/i });
  await expect(firstRows.first()).toContainText('QQQ');

  await firstRows.first().press('Enter');
  await expect(page.getByTestId('postgres-edit-ticket')).toBeVisible();
  await page.getByLabel('exit_reason').fill('manual_review');
  await page.getByRole('button', { name: 'Save Row' }).click();
  await expect(page.getByText(/Updated 1 row in core\.backtest_closed_positions/i)).toBeVisible();

  await page.getByRole('button', { name: 'Purge Table' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Purge Postgres Table' })).toBeVisible();
  await expect(page.getByLabel(/type core\.backtest_closed_positions to confirm/i)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expectNoDocumentOverflow(page);
});
