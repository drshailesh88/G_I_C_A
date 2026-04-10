import { test, expect } from "@playwright/test";

/**
 * Spec: Certificate Download & Verification
 * Module: certificates
 * Area: Download URLs, Verification Flow
 *
 * UI-testable checkpoints: CP-48, CP-51, CP-53
 * CODE-ONLY (blocked for Playwright): CP-43 through CP-47, CP-49, CP-50, CP-52
 */

test.describe("certificates — spec-04-download-verify (public /verify page)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/verify", { timeout: 30000, waitUntil: "domcontentloaded" });
  });

  // ─── CP-53: Verification is public (no auth required) ───
  test("CP-53: Verification page loads without auth", async ({ page }) => {
    // The /verify page should be accessible without any authentication
    await expect(
      page.getByRole("heading", { name: /certificate verification/i })
    ).toBeVisible();

    await expect(
      page.getByText(/verify the authenticity/i)
    ).toBeVisible();

    // Verify the input field is present and accessible
    await expect(
      page.getByLabel(/verification code/i)
    ).toBeVisible();

    // Verify the submit button is present
    await expect(
      page.getByRole("button", { name: /verify/i })
    ).toBeVisible();
  });

  // ─── CP-51: Verify non-existent token returns invalid ───
  test("CP-51: Non-existent token shows verification failed", async ({
    page,
  }) => {
    const fakeToken = "00000000-0000-0000-0000-000000000000";

    // Enter a fake UUID token
    await page.getByLabel(/verification code/i).fill(fakeToken);
    await page.getByRole("button", { name: /verify/i }).click();

    // Wait for the result to appear (server action call)
    await expect(page.getByText(/verification failed/i)).toBeVisible({
      timeout: 10000,
    });

    // Should show an error — not an exception/crash
    // The page should NOT show "Certificate Verified" (green success)
    await expect(
      page.getByText(/certificate verified/i)
    ).not.toBeVisible();
  });

  // ─── CP-48: Verify valid certificate by token (URL param auto-verify) ───
  test("CP-48: Auto-verify via URL token param triggers verification", async ({
    page,
  }) => {
    // Navigate with a token param — should auto-trigger verification
    const fakeToken = "11111111-1111-1111-1111-111111111111";
    await page.goto(`/verify?token=${fakeToken}`);
    await page.waitForLoadState("domcontentloaded");

    // The token input should be pre-filled from URL
    await expect(page.getByLabel(/verification code/i)).toHaveValue(fakeToken);

    // Auto-verification should trigger — wait for result (valid or invalid)
    // With a fake token we expect "Verification Failed"
    await expect(
      page.getByText(/verification failed/i).or(page.getByText(/certificate verified/i))
    ).toBeVisible({ timeout: 15000 });
  });

  // ─── UI interaction: Enter key triggers verify ───
  test("CP-53b: Enter key in input triggers verification", async ({
    page,
  }) => {
    const fakeToken = "22222222-2222-2222-2222-222222222222";

    await page.getByLabel(/verification code/i).fill(fakeToken);
    await page.getByLabel(/verification code/i).press("Enter");

    // Should trigger verification — wait for either result
    await expect(
      page.getByText(/verification failed/i)
    ).toBeVisible({ timeout: 10000 });
  });

  // ─── UI interaction: Empty input disables verify button ───
  test("CP-53c: Verify button disabled when input empty", async ({ page }) => {
    // Clear the input
    await page.getByLabel(/verification code/i).fill("");

    // Button should be disabled
    await expect(
      page.getByRole("button", { name: /verify/i })
    ).toBeDisabled();
  });

  // ─── UI interaction: Verifying state shows spinner ───
  test("CP-53d: Verifying state shows loading indicator", async ({ page }) => {
    const fakeToken = "33333333-3333-3333-3333-333333333333";

    await page.getByLabel(/verification code/i).fill(fakeToken);
    await page.getByRole("button", { name: /verify/i }).click();

    // During verification, button should show "Verifying" text
    await expect(page.getByText(/verifying/i)).toBeVisible();
  });
});
