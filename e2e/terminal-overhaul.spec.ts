import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

const desktopRoutes = [
  ['System Status', '/system-status'],
  ['Data Explorer', '/data-explorer'],
  ['Regime Monitor', '/regimes'],
  ['Intraday Monitor', '/intraday-monitor'],
  ['Data Quality', '/data-quality'],
  ['Data Profiling', '/data-profiling'],
  ['Debug Symbols', '/debug-symbols'],
  ['Runtime Config', '/runtime-config'],
  ['Symbol Purge', '/symbol-purge'],
  ['Symbol Enrichment', '/symbol-enrichment'],
  ['Stock Explorer', '/stock-explorer'],
  ['Live Stock View', '/stock-detail/SPY'],
  ['Configurations', '/strategy-configurations'],
  ['Strategies', '/strategies'],
  ['Backtests', '/backtests'],
  ['Account Operations', '/accounts'],
  ['Trade Desk', '/trade-desk?accountId=acct-paper'],
  ['Trade Monitor', '/trade-monitor?accountId=acct-paper'],
  ['Portfolio Workspace', '/portfolios'],
  ['Universes Redirect', '/universes'],
  ['Rankings Redirect', '/rankings'],
  ['Postgres Explorer', '/postgres-explorer']
] as const;

const denseMobileRoutes = [
  '/trade-desk?accountId=acct-paper',
  '/trade-monitor?accountId=acct-paper',
  '/portfolios',
  '/stock-explorer',
  '/system-status',
  '/data-quality'
] as const;

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

async function expectNoSeriousViolations(page: Page) {
  await page.waitForTimeout(350);
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

test('terminal desktop shell renders every registered route without document overflow', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [name, path] of desktopRoutes) {
    await test.step(name, async () => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Asset Allocation Terminal')).toBeVisible();
      await expect(page.locator('[data-app-scroll-container="true"]')).toBeVisible();
      await expectNoDocumentOverflow(page);
    });
  }
});

test('terminal mobile layout contains dense routes without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of denseMobileRoutes) {
    await test.step(path, async () => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
      await expect(page.locator('[data-app-scroll-container="true"]')).toBeVisible();
      await expectNoDocumentOverflow(page);
    });
  }
});

test('terminal representative pages have no serious accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const path of ['/system-status', '/trade-desk?accountId=acct-paper', '/data-quality']) {
    await test.step(path, async () => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Asset Allocation Terminal')).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }
});
