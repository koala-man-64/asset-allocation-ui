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

test('trade desk supports preview, warning acknowledgement, submit, and cancel with mock API', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/trade-desk?accountId=acct-paper');

  await expect(page.getByRole('heading', { name: 'Trade Desk' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Trade account' })).toContainText('Core Paper');
  await expect(page.getByRole('link', { name: 'View in Trade Monitor' })).toHaveAttribute(
    'href',
    '/trade-monitor?accountId=acct-paper'
  );

  await page.locator('#trade-symbol').fill('msft');
  await page.locator('#trade-quantity').fill('1');
  await page.getByRole('button', { name: 'Preview' }).click();

  await expect(page.getByText('Preview Ready')).toBeVisible();
  await expect(page.getByText('Price band', { exact: true })).toBeVisible();

  const submitButton = page.getByRole('button', { name: 'Submit' });
  await expect(submitButton).toBeDisabled();

  await page.getByRole('checkbox').click();
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await expect(page.getByText('Order Submitted')).toBeVisible();
  await expect(page.getByText('The order was accepted for execution.')).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Cancel Requested')).toBeVisible();
  await expect(page.getByText('The cancel request was accepted.')).toBeVisible();
});

test('trade desk mobile layout stays accessible without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/trade-desk?accountId=acct-paper');

  await expect(page.getByRole('heading', { name: 'Trade Desk' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
  await expectNoSeriousViolations(page);
});
