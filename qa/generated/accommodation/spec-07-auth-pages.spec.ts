/**
 * Accommodation Spec 07 — Auth Page Guards (Playwright E2E)
 *
 * Tests CP-67, CP-68: Page-level auth redirects for unauthenticated users.
 *
 * These tests run WITHOUT storageState (no auth) to verify redirects.
 */
import { test, expect } from '@playwright/test';

const FAKE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';

test.describe('Accommodation Auth Guards', () => {
  // Override: clear storageState so we're unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } });

  // CP-67: List page requires event access
  test('CP-67: accommodation list redirects unauthenticated user to login', async ({ page }) => {
    await page.goto(`/events/${FAKE_EVENT_ID}/accommodation`, {
      waitUntil: 'domcontentloaded',
    });

    // Should redirect to /login (Clerk sign-in page)
    await page.waitForURL(/\/(login|sign-in)/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/(login|sign-in)/);
  });

  // CP-68: New page requires write access
  test('CP-68: accommodation new page redirects unauthenticated user to login', async ({ page }) => {
    await page.goto(`/events/${FAKE_EVENT_ID}/accommodation/new`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForURL(/\/(login|sign-in)/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/(login|sign-in)/);
  });
});
