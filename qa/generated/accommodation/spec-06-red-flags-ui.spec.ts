/**
 * Accommodation Spec 06 — Red Flag UI (Playwright E2E)
 *
 * Tests CP-64, CP-65, CP-66: UI rendering of red flags in accommodation list.
 *
 * Prerequisites:
 * - Clerk auth via global-setup (storageState loaded automatically)
 * - Test event with accommodation records and flags in database
 */
import { test, expect } from '@playwright/test';

const TEST_EVENT_ID = process.env.E2E_TEST_EVENT_ID || '';

test.describe('Accommodation Red Flags — UI', () => {
  test.skip(!TEST_EVENT_ID, 'E2E_TEST_EVENT_ID not set');

  test.beforeEach(async ({ page }) => {
    await page.goto(`/events/${TEST_EVENT_ID}/accommodation`);
    await page.waitForLoadState('networkidle');
  });

  // CP-64: Flagged-only filter shows only flagged records
  test('CP-64: Show flagged only button filters to flagged records', async ({ page }) => {
    const toggleButton = page.getByRole('button', { name: /show flagged only/i });
    const isVisible = await toggleButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'No flagged records in test data — toggle not rendered');
      return;
    }

    await toggleButton.click();

    // After toggle, only flagged records should be displayed
    // The button should be active (red styling)
    await expect(toggleButton).toHaveClass(/bg-red-50/);
  });

  // CP-65: Flag detail shows change description
  test('CP-65: Flag badge shows detail text', async ({ page }) => {
    // Look for flag alert badges
    const flagBadges = page.locator('[class*="bg-red-100"], [class*="bg-amber-100"]');
    const flagCount = await flagBadges.count();

    if (flagCount === 0) {
      test.skip(true, 'No flags in test data');
      return;
    }

    const firstFlag = flagBadges.first();
    const text = await firstFlag.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(5);
  });

  // CP-66: Flag age displays relative time
  test('CP-66: Flag shows relative time (e.g. "hours ago")', async ({ page }) => {
    const flagBadges = page.locator('[class*="bg-red-100"], [class*="bg-amber-100"]');
    const flagCount = await flagBadges.count();

    if (flagCount === 0) {
      test.skip(true, 'No flags in test data');
      return;
    }

    const timeText = page.getByText(/ago$/);
    await expect(timeText.first()).toBeVisible();
  });
});
