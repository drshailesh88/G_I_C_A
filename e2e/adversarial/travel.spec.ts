import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { test, expect, type Browser, type Page } from '@playwright/test';

dotenv.config({ path: path.join(process.cwd(), '.env.test.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);
const evidenceDir = path.join(process.cwd(), 'e2e', 'evidence');
const eventLinkSelector = 'a[href^="/events/"]:not([href="/events/new"])';
const eventId = '68ee91f0-6d37-4525-ab1b-393438434402';
const personEmail = 'travel.e2e@gemindia.test';
const personName = 'Travel E2E Delegate';
const navigationTimeout = 30_000;

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `travel-${name}.png`), fullPage: true });
}

async function getSignedInUserId(page: Page) {
  await page.waitForFunction(() => Boolean((window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id));
  return page.evaluate(() => (window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? '');
}

async function ensureTravelFixtures(authUserId: string) {
  await sql`
    CREATE TABLE IF NOT EXISTS event_people (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_event_people UNIQUE (event_id, person_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_people_event_id ON event_people (event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_event_people_person_id ON event_people (person_id)`;

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

  const existing = await sql`
    SELECT id
    FROM people
    WHERE email = ${personEmail}
    LIMIT 1
  `;

  let personId = existing[0]?.id as string | undefined;
  if (!personId) {
    const inserted = await sql`
      INSERT INTO people (full_name, email, phone_e164, city, created_by, updated_by)
      VALUES (${personName}, ${personEmail}, '+919999999999', 'Mumbai', ${authUserId}, ${authUserId})
      RETURNING id
    `;
    personId = inserted[0].id as string;
  }

  await sql`
    INSERT INTO event_people (event_id, person_id, source)
    VALUES (${eventId}, ${personId}, 'travel')
    ON CONFLICT (event_id, person_id) DO UPDATE
    SET source = EXCLUDED.source, updated_at = now()
  `;

  await sql`
    DELETE FROM transport_passenger_assignments
    WHERE event_id = ${eventId}
      AND person_id = ${personId}
  `;
  await sql`
    DELETE FROM travel_records
    WHERE event_id = ${eventId}
      AND person_id = ${personId}
  `;

  return { personId };
}

test.beforeAll(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test.describe.configure({ mode: 'serial' });

test('travel module supports create, edit, cancel, and persistence for an assigned owner', async ({ page }) => {
  test.slow();
  test.setTimeout(120000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  expect(authUserId).toBeTruthy();

  await ensureTravelFixtures(authUserId);

  await page.goto(`/events/${eventId}/travel`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Travel' })).toBeVisible();
  await capture(page, 'list-empty');

  await expect(page.getByText('No travel records')).toBeVisible();

  await page.getByRole('link', { name: 'Add Travel Record' }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/travel/new$`));
  await capture(page, 'form-new');

  await page.getByPlaceholder('Search by name or email...').fill('Travel');
  await page.getByRole('button', { name: new RegExp(personName) }).click();

  const uniqueSuffix = Date.now().toString().slice(-6);
  const initialServiceNumber = `AI-${uniqueSuffix}`;
  const updatedServiceNumber = `AI-${uniqueSuffix}-X`;
  const createdRow = page.getByRole('button', { name: new RegExp(personName) }).first();

  await page.locator('select[name="direction"]').selectOption('inbound');
  await page.locator('select[name="travelMode"]').selectOption('flight');
  await page.locator('input[name="fromCity"]').fill('Mumbai');
  await page.locator('input[name="toCity"]').fill('Delhi');
  await page.locator('input[name="fromLocation"]').fill('BOM T2');
  await page.locator('input[name="toLocation"]').fill('Hotel Venue');
  await page.locator('input[name="departureAtUtc"]').fill('2026-05-14T08:15');
  await page.locator('input[name="arrivalAtUtc"]').fill('2026-05-14T10:40');
  await page.locator('input[name="carrierName"]').fill('Air India');
  await page.locator('input[name="serviceNumber"]').fill(initialServiceNumber);
  await page.locator('input[name="pnrOrBookingRef"]').fill(`PNR${uniqueSuffix}`);
  await page.locator('input[name="terminalOrGate"]').fill('Gate 12');
  await page.locator('textarea[name="notes"]').fill('adversarial create');
  await capture(page, 'form-filled');

  await page.getByRole('button', { name: 'Create Travel Record' }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/travel$`), {
    timeout: navigationTimeout,
  });
  await expect(createdRow).toBeVisible();
  await expect(page.getByText(initialServiceNumber)).toBeVisible();
  await capture(page, 'list-created');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(createdRow).toBeVisible();
  await expect(page.getByText(initialServiceNumber)).toBeVisible();
  await capture(page, 'list-reload-created');

  await createdRow.click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/travel/.+`));
  await capture(page, 'form-edit');

  await page.locator('input[name="serviceNumber"]').fill(updatedServiceNumber);
  await page.locator('input[name="toCity"]').fill('New Delhi');
  await page.locator('textarea[name="notes"]').fill('adversarial update');
  await capture(page, 'form-edited');

  const updatedRow = page.getByRole('button', {
    name: new RegExp(`${personName}.*${updatedServiceNumber}`),
  }).first();

  await page.getByRole('button', { name: 'Update Travel Record' }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/travel$`), {
    timeout: navigationTimeout,
  });
  await expect(updatedRow).toBeVisible();
  await capture(page, 'list-updated');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(updatedRow).toBeVisible();
  await capture(page, 'list-reload-updated');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await expect(page.getByText('Cancelled (1)')).toBeVisible();
  await expect(page.getByText(updatedServiceNumber)).toBeVisible();
  await capture(page, 'list-cancelled');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Cancelled (1)')).toBeVisible();
  await expect(page.getByText(updatedServiceNumber)).toBeVisible();
  await capture(page, 'list-reload-cancelled');
});

test('advertised events do not dead-end on the travel module', async ({ page }) => {
  test.slow();
  test.setTimeout(150000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  await ensureTravelFixtures(authUserId);

  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
  await capture(page, 'events');

  const eventLinks = await page
    .locator(eventLinkSelector)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')).filter(Boolean) as string[]);

  if (eventLinks.length === 0) {
    await expect(page.getByText('No events yet')).toBeVisible();
    await capture(page, 'events-empty');
    return;
  }

  const firstEventHref = eventLinks[0];
  await page.goto(`${firstEventHref}/travel`, { waitUntil: 'commit' });
  await capture(page, 'travel-route');

  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Travel' })).toBeVisible();
});

test('anonymous users are redirected away from the travel module', async ({ browser }) => {
  test.slow();
  test.setTimeout(60000);

  const context = await createAnonymousContext(browser);
  const page = await context.newPage();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('input[name="identifier"], input[type="email"]').first()).toBeVisible();
  await page.waitForFunction(
    () => !(window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id,
  );
  await capture(page, 'login-anonymous');

  await page.goto(`/events/${eventId}/travel`, {
    waitUntil: 'domcontentloaded',
  });
  await capture(page, 'travel-anon-redirect');

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
