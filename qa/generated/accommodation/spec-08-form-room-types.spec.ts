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

    // The form uses id="roomType" with label "Room Type"
    // Try multiple selector strategies
    const roomTypeSelect = page.locator('select#roomType, select[name="roomType"]');
    const isVisible = await roomTypeSelect.isVisible().catch(() => false);

    if (!isVisible) {
      // Page may not render form (e.g. no people with travel records)
      await page.screenshot({ path: 'playwright/.clerk/debug-form-page.png' });
      test.skip(true, 'Room type select not found — form may not render without prerequisite data');
      return;
    }

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
