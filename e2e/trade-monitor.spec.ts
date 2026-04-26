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

test('trade monitor supports account drill-in and handoff into the desk', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/trade-monitor?accountId=acct-live');

  await expect(page.getByRole('heading', { name: 'Trade Monitor' })).toBeVisible();
  await expect(page.getByText('Core Paper')).toBeVisible();
  await expect(page.getByText('Live Alpha')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in Trade Desk' }).first()).toHaveAttribute(
    'href',
    '/trade-desk?accountId=acct-live'
  );

  await page.getByRole('tab', { name: 'Blotter' }).click();
  await expect(page.getByText('TSLA', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Awaiting margin review before expanding live exposure.')
  ).toBeVisible();

  await page.getByRole('link', { name: 'Open in Trade Desk' }).first().click();
  await expect(page).toHaveURL(/\/trade-desk\?accountId=acct-live$/);
  await expect(page.getByRole('heading', { name: 'Trade Desk' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Trade account' })).toContainText('Live Alpha');
});

test('trade monitor mobile layout stays accessible without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/trade-monitor?accountId=acct-paper');

  await expect(page.getByRole('heading', { name: 'Trade Monitor' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
  await expectNoSeriousViolations(page);
});
