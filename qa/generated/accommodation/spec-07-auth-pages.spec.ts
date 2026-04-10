/**
 * Accommodation Spec 07 — Auth Page Guards (Playwright E2E)
 *
 * Tests CP-67, CP-68: Page-level auth redirects.
 *
 * These tests check that unauthenticated access to accommodation pages
 * results in a redirect to the login/sign-in page.
 *
 * Prerequisites:
 * - Dev server running (no auth needed — testing the redirect itself)
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.APP_PORT ? `http://localhost:${process.env.APP_PORT}` : 'http://localhost:4000';
const FAKE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';

test.describe('Accommodation Auth Guards', () => {
  // CP-67: List page requires event access
  test('CP-67: accommodation list page redirects unauthenticated user', async ({ page }) => {
    const response = await page.goto(`${BASE}/events/${FAKE_EVENT_ID}/accommodation`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Should redirect to sign-in page (Clerk uses /sign-in by default)
    const url = page.url();
    const redirected = url.includes('sign-in') || url.includes('login') || url.includes('clerk');

    expect(redirected).toBe(true);
  });

  // CP-68: New page requires write access
  test('CP-68: accommodation new page redirects unauthenticated user', async ({ page }) => {
    const response = await page.goto(`${BASE}/events/${FAKE_EVENT_ID}/accommodation/new`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const url = page.url();
    const redirected = url.includes('sign-in') || url.includes('login') || url.includes('clerk');

    expect(redirected).toBe(true);
  });
});
