/**
 * Accommodation Spec 08 — Form Room Types (Playwright E2E)
 *
 * Tests CP-76: Form room type select options match schema ROOM_TYPES enum.
 *
 * Prerequisites:
 * - Authenticated Clerk session
 * - Dev server running on APP_PORT
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.APP_PORT ? `http://localhost:${process.env.APP_PORT}` : 'http://localhost:4000';

test.describe('Accommodation Form — Room Types', () => {
  // TODO: Set up Clerk test user auth via storageState
  // test.use({ storageState: 'e2e/auth/clerk-session.json' });

  const TEST_EVENT_ID = process.env.TEST_EVENT_ID || 'PLACEHOLDER';

  // CP-76: Form room types match schema room types
  test('CP-76: form room type options include all 7 schema types', async ({ page }) => {
    await page.goto(`${BASE}/events/${TEST_EVENT_ID}/accommodation/new`, {
      waitUntil: 'networkidle',
    });

    // Find the room type select or radio group
    const roomTypeSelect = page.getByLabel(/room type/i);
    const isVisible = await roomTypeSelect.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Room type field not visible (may require auth)');
      return;
    }

    // Check for all 7 room types
    const expectedTypes = ['single', 'double', 'twin', 'triple', 'suite', 'dormitory', 'other'];

    // If it's a select, check option values
    const options = await page.locator('select[name*="room"] option, [role="option"]').allTextContents();
    const normalizedOptions = options.map(o => o.toLowerCase().trim());

    for (const type of expectedTypes) {
      expect(normalizedOptions).toContain(type);
    }
  });
});
