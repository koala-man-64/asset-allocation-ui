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

test('mobile smoke covers drawer open-close, keyboard route activation, and profiling accessibility', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');

  const openNavigationButton = page.getByRole('button', { name: 'Open navigation' });
  await openNavigationButton.click();
  await expect(page.getByRole('link', { name: 'Data Profiling' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'Data Profiling' })).toBeHidden();

  await openNavigationButton.click();
  const profilingLink = page.getByRole('link', { name: 'Data Profiling' });
  await profilingLink.focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/data-profiling$/);
  await expect(page.getByRole('heading', { name: 'Data Profiling' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run Profile' })).toBeVisible();

  await page.getByRole('button', { name: 'Run Profile' }).click();
  await expect(page.getByText('Profile Summary')).toBeVisible();

  await expectNoSeriousViolations(page);
});
