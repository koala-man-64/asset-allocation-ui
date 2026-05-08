import { expect, test } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

const PAGE_READY_TIMEOUT_BUFFER_MS = 30000;

function parseHoldMs(value: string | undefined): number {
  if (!value) {
    return 15000;
  }

  const holdMs = Number(value);
  if (!Number.isFinite(holdMs) || holdMs < 0) {
    throw new Error(
      `PLAYWRIGHT_MANUAL_HOLD_MS must be a non-negative number, received '${value}'.`
    );
  }

  return holdMs;
}

test('opens the selected page for manual observation', async ({ page }, testInfo) => {
  const pagePath = process.env.PLAYWRIGHT_MANUAL_PAGE_PATH;
  test.skip(!pagePath, 'Run this test through `pnpm test:e2e:manual` to choose a page.');

  const holdMs = parseHoldMs(process.env.PLAYWRIGHT_MANUAL_HOLD_MS);
  const minimumTimeoutMs = holdMs + PAGE_READY_TIMEOUT_BUFFER_MS;
  if (minimumTimeoutMs > testInfo.timeout) {
    test.setTimeout(minimumTimeoutMs);
  }

  await registerUiApiMocks(page);
  await page.goto(pagePath, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();

  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);

  const pageLabel = process.env.PLAYWRIGHT_MANUAL_PAGE_LABEL ?? pagePath;
  console.log(`Manual Playwright page ready: ${pageLabel} (${page.url()}).`);

  if (holdMs > 0) {
    console.log(`Keeping the headed browser open for ${holdMs}ms.`);
    await page.waitForTimeout(holdMs);
  }
});
