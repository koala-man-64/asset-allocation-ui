import { expect, test, type Page } from '@playwright/test';

import { registerUiApiMocks } from './support/mockApi';

const FIXED_NOW = '2026-04-18T14:30:00Z';

const desktopViewport = { width: 1440, height: 900 } as const;
const mobileViewport = { width: 390, height: 844 } as const;

type VisualViewport = typeof desktopViewport | typeof mobileViewport;

const visualStabilityCss = `
  *,
  *::before,
  *::after {
    animation-delay: 0s !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }

  [data-testid="route-transition-indicator"] {
    opacity: 0 !important;
  }
`;

async function prepareVisualPage(page: Page, viewport: VisualViewport) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

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

async function waitForVisualReady(page: Page) {
  await expect(page.locator('[data-app-scroll-container="true"]')).toBeVisible();
  await page.addStyleTag({ content: visualStabilityCss });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
  await expect(page.getByText(/Loading .*\.\.\./)).toHaveCount(0);
}

async function expectVisualSnapshot(page: Page, name: string) {
  await waitForVisualReady(page);
  await expectNoDocumentOverflow(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
    maxDiffPixelRatio: 0.01,
    scale: 'css',
    threshold: 0.2
  });
}

async function expectScopeControlsToFit(page: Page) {
  const controls = page.locator('[aria-label="Account scope"] [data-slot="toggle-group-item"]');
  await expect(controls).toHaveCount(7);

  const boxes = await controls.evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();

      return {
        bottom: rect.bottom,
        clientWidth: item.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: item.scrollWidth,
        text: item.textContent?.trim() ?? '',
        top: rect.top
      };
    })
  );

  for (const box of boxes) {
    expect(
      box.scrollWidth,
      `${box.text} scope filter should fit inside its button`
    ).toBeLessThanOrEqual(box.clientWidth + 1);
  }

  for (const [index, box] of boxes.entries()) {
    for (const next of boxes.slice(index + 1)) {
      const verticallyOverlaps = box.top < next.bottom && next.top < box.bottom;
      const horizontallyOverlaps = box.left < next.right && next.left < box.right;

      expect(
        verticallyOverlaps && horizontallyOverlaps,
        `${box.text} and ${next.text} scope filters should not overlap`
      ).toBe(false);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await registerUiApiMocks(page);
});

test('@visual terminal shell desktop', async ({ page }) => {
  await prepareVisualPage(page, desktopViewport);
  await page.goto('/system-status', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Asset Allocation Terminal')).toBeVisible();
  await expect(page.getByRole('link', { name: 'System Status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operations Command Deck' })).toBeVisible();
  await expect(page.getByText('Open Positions 0')).toBeVisible();
  await expectVisualSnapshot(page, 'terminal-shell-desktop');
});

test('@visual terminal shell mobile', async ({ page }) => {
  await prepareVisualPage(page, mobileViewport);
  await page.goto('/system-status', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  await expect(page.getByText('Asset Allocation', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operations Command Deck' })).toBeVisible();
  await expectVisualSnapshot(page, 'terminal-shell-mobile');
});

test('@visual account operations desktop', async ({ page }) => {
  await prepareVisualPage(page, desktopViewport);
  await page.goto('/accounts', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Account Board' })).toBeVisible();
  await expect(page.getByTestId('account-card-acct-paper')).toBeVisible();
  await expect(page.getByTestId('account-card-acct-live')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Desk verdict' })).toBeVisible();
  await expectScopeControlsToFit(page);
  await expectVisualSnapshot(page, 'account-operations-desktop');
});

test('@visual account operations mobile', async ({ page }) => {
  await prepareVisualPage(page, mobileViewport);
  await page.goto('/accounts', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Account Board' })).toBeVisible();
  await expect(page.getByTestId('account-card-acct-paper')).toBeVisible();
  await expect(page.getByTestId('account-card-acct-live')).toBeVisible();
  await expectScopeControlsToFit(page);
  await expectVisualSnapshot(page, 'account-operations-mobile');
});

test('@visual trade desk passive desktop', async ({ page }) => {
  await prepareVisualPage(page, desktopViewport);
  await page.goto('/trade-desk?accountId=acct-paper', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Trade Desk' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Trade account' })).toContainText('Core Paper');
  await expect(page.getByRole('tab', { name: 'Open Orders' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Positions' })).toBeVisible();
  await expect(page.getByText('Risk Limits')).toBeVisible();
  await expectVisualSnapshot(page, 'trade-desk-passive-desktop');
});

test('@visual trade monitor passive desktop', async ({ page }) => {
  await prepareVisualPage(page, desktopViewport);
  await page.goto('/trade-monitor?accountId=acct-live', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Trade Monitor' })).toBeVisible();
  await expect(page.getByText('Core Paper')).toBeVisible();
  await expect(page.getByText('Live Alpha')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All Accounts' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Positions' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Blotter' })).toBeVisible();
  await expectVisualSnapshot(page, 'trade-monitor-passive-desktop');
});

test('@visual postgres explorer workstation desktop', async ({ page }) => {
  await prepareVisualPage(page, desktopViewport);
  await page.goto('/postgres-explorer', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('postgres-workstation')).toBeVisible();
  await page.getByRole('button', { name: 'Query Table' }).click();
  await expect(page.getByText('SPY')).toBeVisible();
  await expect(page.getByTestId('postgres-result-matrix')).toBeVisible();
  await expectVisualSnapshot(page, 'postgres-explorer-workstation-desktop');
});

test('@visual postgres explorer workstation mobile', async ({ page }) => {
  await prepareVisualPage(page, mobileViewport);
  await page.goto('/postgres-explorer', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('postgres-workstation')).toBeVisible();
  await page.getByRole('button', { name: 'Query Table' }).click();
  await expect(page.getByText('SPY')).toBeVisible();
  await expect(page.getByTestId('postgres-result-matrix')).toBeVisible();
  await expectVisualSnapshot(page, 'postgres-explorer-workstation-mobile');
});

const configurationTabs = [
  {
    path: '/strategy-configurations?tab=ranking',
    heading: 'Saved ranking schemas',
    absentHeading: 'Universe Library',
    snapshot: 'configuration-library-ranking'
  },
  {
    path: '/strategy-configurations?tab=universe',
    heading: 'Universe Library',
    absentHeading: 'Saved ranking schemas',
    snapshot: 'configuration-library-universe'
  },
  {
    path: '/strategy-configurations?tab=exit-rules',
    heading: 'Exit Rule Set Library',
    absentHeading: 'Universe Library',
    snapshot: 'configuration-library-exit-rules'
  }
] as const;

test('@visual configuration library tabs by URL', async ({ page }) => {
  await prepareVisualPage(page, desktopViewport);

  for (const tab of configurationTabs) {
    await test.step(tab.snapshot, async () => {
      await page.goto(tab.path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Configuration Library' })).toBeVisible();
      await expect(page.getByRole('heading', { name: tab.heading })).toBeVisible();
      await expect(page.getByRole('heading', { name: tab.absentHeading })).toHaveCount(0);
      await expectVisualSnapshot(page, tab.snapshot);
    });
  }
});
