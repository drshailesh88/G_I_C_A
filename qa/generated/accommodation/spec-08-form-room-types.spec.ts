/**
 * Accommodation Spec 08 — Form Room Types (Playwright E2E)
 *
 * Tests CP-76: Form room type select options match schema ROOM_TYPES enum.
 *
 * Prerequisites:
 * - Clerk auth via global-setup (storageState loaded automatically)
 * - Test event exists in database
 */
import { test, expect } from '@playwright/test';

const TEST_EVENT_ID = process.env.E2E_TEST_EVENT_ID || '';

test.describe('Accommodation Form — Room Types', () => {
  test.skip(!TEST_EVENT_ID, 'E2E_TEST_EVENT_ID not set');

  // CP-76: Form room types match schema room types
  test('CP-76: form room type options include all 7 schema types', async ({ page }) => {
    await page.goto(`/events/${TEST_EVENT_ID}/accommodation/new`);
    await page.waitForLoadState('networkidle');

    // Find the room type select
    const roomTypeSelect = page.getByLabel(/room type/i);
    await expect(roomTypeSelect).toBeVisible({ timeout: 5000 });

    // Get all option texts
    const options = await roomTypeSelect.locator('option').allTextContents();
    const normalizedOptions = options.map(o => o.toLowerCase().trim());

    // Must include all 7 room types from the schema
    const expectedTypes = ['single', 'double', 'twin', 'triple', 'suite', 'dormitory', 'other'];
    for (const type of expectedTypes) {
      expect(normalizedOptions).toContain(type);
    }
  });
});
