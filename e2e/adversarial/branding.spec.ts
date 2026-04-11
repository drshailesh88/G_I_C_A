import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { test, expect, type Browser, type Page } from '@playwright/test';

dotenv.config({ path: path.join(process.cwd(), '.env.test.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);
const evidenceDir = path.join(process.cwd(), 'e2e', 'evidence');
const assetDir = path.join(os.tmpdir(), 'gem-india-branding-e2e');
const logoPath = path.join(assetDir, 'branding-logo.svg');
const headerPath = path.join(assetDir, 'branding-letterhead.svg');
const baseEventId = '68ee91f0-6d37-4525-ab1b-393438434402';
const brandingEventSlug = 'branding-qa-e2e';
const brandingEventName = 'Branding QA E2E';
const senderName = 'GEM Branding QA';
const footerText = 'Branding QA footer rendered in previews.';
const whatsappPrefix = '[Branding QA]';
const navigationTimeout = 45_000;

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `branding-${name}.png`), fullPage: true });
}

async function getSignedInUserId(page: Page) {
  await page.waitForFunction(() => Boolean((window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id));
  return page.evaluate(() => (window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? '');
}

async function ensureBrandingFixtures(authUserId: string) {
  const [baseEvent] = await sql`
    SELECT organization_id
    FROM events
    WHERE id = ${baseEventId}
    LIMIT 1
  `;

  if (!baseEvent?.organization_id) {
    throw new Error(`Base event ${baseEventId} not found`);
  }

  const [event] = await sql`
    INSERT INTO events (
      organization_id,
      slug,
      name,
      start_date,
      end_date,
      timezone,
      status,
      venue_name,
      venue_city,
      branding,
      created_by,
      updated_by
    )
    VALUES (
      ${baseEvent.organization_id},
      ${brandingEventSlug},
      ${brandingEventName},
      ${'2026-10-10T09:00:00Z'},
      ${'2026-10-12T18:00:00Z'},
      ${'Asia/Kolkata'},
      ${'draft'},
      ${'Branding QA Venue'},
      ${'Delhi'},
      ${JSON.stringify({})}::jsonb,
      ${authUserId},
      ${authUserId}
    )
    ON CONFLICT (organization_id, slug)
    DO UPDATE SET
      name = EXCLUDED.name,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      timezone = EXCLUDED.timezone,
      status = EXCLUDED.status,
      venue_name = EXCLUDED.venue_name,
      venue_city = EXCLUDED.venue_city,
      branding = EXCLUDED.branding,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING id
  `;

  const eventId = event.id as string;

  await sql`
    INSERT INTO event_user_assignments (event_id, auth_user_id, assignment_type, is_active, assigned_by)
    VALUES (${eventId}, ${authUserId}, 'owner', true, ${authUserId})
    ON CONFLICT (event_id, auth_user_id)
    DO UPDATE SET
      assignment_type = EXCLUDED.assignment_type,
      is_active = EXCLUDED.is_active,
      assigned_by = EXCLUDED.assigned_by,
      updated_at = now()
  `;

  return { eventId };
}

async function getStoredBranding(eventId: string) {
  const [event] = await sql`
    SELECT branding
    FROM events
    WHERE id = ${eventId}
    LIMIT 1
  `;

  return event?.branding as Record<string, string>;
}

test.beforeAll(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(
    logoPath,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0F766E"/><text x="48" y="56" text-anchor="middle" font-size="28" fill="white">G</text></svg>',
  );
  fs.writeFileSync(
    headerPath,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><rect width="600" height="200" fill="#1D4ED8"/><text x="300" y="112" text-anchor="middle" font-size="42" fill="white">GEM Letterhead</text></svg>',
  );
});

test.describe.configure({ mode: 'serial' });

test('branding module supports logo management, letterhead upload, and preview rendering', async ({ page }) => {
  test.slow();
  test.setTimeout(180000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  expect(authUserId).toBeTruthy();
  const { eventId } = await ensureBrandingFixtures(authUserId);

  await page.goto(`/events/${eventId}/branding`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();
  await expect(page.getByText(brandingEventName)).toBeVisible();
  await capture(page, 'initial');

  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByPlaceholder('#1E40AF').fill('#0F766E');
  await page.getByPlaceholder('#9333EA').fill('#7C3AED');
  await page.getByPlaceholder('e.g., GEM India 2026').fill(senderName);
  await page.getByPlaceholder('e.g., Organized by GEM India Foundation...').fill(footerText);
  await page.getByPlaceholder('e.g., [GEM India 2026]').fill(whatsappPrefix);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Branding saved successfully')).toBeVisible({ timeout: navigationTimeout });
  await capture(page, 'saved');

  await page
    .locator('section')
    .filter({ hasText: 'Event Logo' })
    .locator('input[type="file"]')
    .setInputFiles(logoPath);
  await expect(page.getByAltText('Event logo')).toBeVisible({ timeout: navigationTimeout });
  await capture(page, 'logo-uploaded');

  await page
    .locator('section')
    .filter({ hasText: 'Header Image' })
    .locator('input[type="file"]')
    .setInputFiles(headerPath);
  await expect(page.getByAltText('Header image')).toBeVisible({ timeout: navigationTimeout });
  await capture(page, 'letterhead-uploaded');

  await expect(page.getByText(senderName).first()).toBeVisible();
  await expect(page.getByText(footerText).first()).toBeVisible();
  await expect(page.getByText(whatsappPrefix).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'Logo', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Header', exact: true })).toBeVisible();
  await capture(page, 'preview-rendered');

  await page
    .locator('section')
    .filter({ hasText: 'Event Logo' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.getByText('Click to upload logo')).toBeVisible({ timeout: navigationTimeout });
  await capture(page, 'logo-removed');

  const branding = await getStoredBranding(eventId);
  expect(branding.primaryColor).toBe('#0F766E');
  expect(branding.secondaryColor).toBe('#7C3AED');
  expect(branding.emailSenderName).toBe(senderName);
  expect(branding.emailFooterText).toBe(footerText);
  expect(branding.whatsappPrefix).toBe(whatsappPrefix);
  expect(branding.logoStorageKey).toBe('');
  expect(branding.headerImageStorageKey).toContain(`/header/`);
});

test('anonymous users are redirected away from the branding admin module', async ({ browser }) => {
  test.slow();
  test.setTimeout(60000);

  const context = await createAnonymousContext(browser);
  const page = await context.newPage();
  await page.goto(`/events/${baseEventId}/branding`, { waitUntil: 'domcontentloaded' });
  await capture(page, 'anon-redirect');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('Conference Management Platform')).toBeVisible();
  await context.close();
});

async function createAnonymousContext(browser: Browser) {
  return browser.newContext({
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:4000',
    storageState: { cookies: [], origins: [] },
  });
}
