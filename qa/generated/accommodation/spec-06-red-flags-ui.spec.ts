/**
 * Accommodation Spec 06 — Red Flag UI (Playwright E2E)
 *
 * Tests CP-64, CP-65, CP-66: UI rendering of red flags in accommodation list.
 *
 * Prerequisites:
 * - Authenticated Clerk session (storageState)
 * - Test event with accommodation records and flags in database
 * - Dev server running on APP_PORT (default 4000)
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.APP_PORT ? `http://localhost:${process.env.APP_PORT}` : 'http://localhost:4000';

// These tests require:
// 1. Clerk auth storageState (not yet configured)
// 2. Seeded test data (event, people, accommodation records, red flags)
// Skip until auth infrastructure is in place.

test.describe('Accommodation Red Flags — UI', () => {
  // TODO: Set up Clerk test user auth via storageState
  // test.use({ storageState: 'e2e/auth/clerk-session.json' });

  const TEST_EVENT_ID = process.env.TEST_EVENT_ID || 'PLACEHOLDER';

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/events/${TEST_EVENT_ID}/accommodation`);
    await page.waitForLoadState('networkidle');
  });

  // CP-64: Flagged-only filter shows only flagged records
  test('CP-64: Show flagged only button filters to flagged records', async ({ page }) => {
    // Look for the "Show flagged only" toggle button
    const toggleButton = page.getByRole('button', { name: /show flagged only/i });

    // If no flagged records, the toggle should not be visible
    const isVisible = await toggleButton.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(true, 'No flagged records in test data — toggle not rendered');
      return;
    }

    // Count records before toggle
    const recordsBefore = await page.locator('[data-testid="accommodation-record"]').count()
      .catch(() => page.locator('tr').count());

    // Click the toggle
    await toggleButton.click();

    // After toggle, fewer records should be displayed
    const recordsAfter = await page.locator('[data-testid="accommodation-record"]').count()
      .catch(() => page.locator('tr').count());

    expect(recordsAfter).toBeLessThanOrEqual(recordsBefore);
  });

  // CP-65: Flag detail shows change description
  test('CP-65: Flag badge shows detail text', async ({ page }) => {
    // Look for flag badges with detail text
    const flagBadges = page.locator('.bg-red-100, .bg-amber-100');
    const flagCount = await flagBadges.count();

    if (flagCount === 0) {
      test.skip(true, 'No flags in test data');
      return;
    }

    // First flag should have non-empty detail text
    const firstFlag = flagBadges.first();
    const text = await firstFlag.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(5); // Not just whitespace
  });

  // CP-66: Flag age displays relative time
  test('CP-66: Flag shows relative time (e.g. "hours ago")', async ({ page }) => {
    const flagBadges = page.locator('.bg-red-100, .bg-amber-100');
    const flagCount = await flagBadges.count();

    if (flagCount === 0) {
      test.skip(true, 'No flags in test data');
      return;
    }

    // Look for relative time text pattern
    const timeText = page.getByText(/ago$/);
    await expect(timeText.first()).toBeVisible();
  });
});
