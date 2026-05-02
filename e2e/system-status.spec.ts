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
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary
      }))
    }))
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await registerUiApiMocks(page);
});

test('desktop smoke covers shell navigation, collapse state, and system-status accessibility', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/');

  await expect(page).toHaveURL(/\/system-status$/);
  await expect(page.getByRole('heading', { name: 'Operations Command Deck' })).toBeVisible();
  const operationalJobsHeading = 'Operational Workflows and Control Jobs';
  await expect(page.getByRole('heading', { name: operationalJobsHeading })).toBeVisible();
  const operationalJobs = page.getByRole('region', {
    name: operationalJobsHeading
  });
  await expect(operationalJobs.getByText('aca-job-backtest-runner').first()).toBeVisible();
  await expect(operationalJobs.getByText('aca-job-market-bronze')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand market details' })).toBeVisible();

  const collapseButton = page.getByRole('button', { name: 'Collapse navigation' });
  await collapseButton.click();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand navigation' }).click();

  const dataProfilingLink = page.getByRole('link', { name: 'Data Profiling' });
  await dataProfilingLink.focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/data-profiling$/);
  await expect(page.getByRole('heading', { name: 'Data Profiling' })).toBeVisible();
  await expect(page.getByTestId('route-transition-indicator')).toBeVisible();

  await page.getByRole('link', { name: 'System Status' }).click();
  await expect(page).toHaveURL(/\/system-status$/);

  await expectNoSeriousViolations(page);
});
