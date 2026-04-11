import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { test, expect, type Browser, type Page } from '@playwright/test';

dotenv.config({ path: path.join(process.cwd(), '.env.test.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);
const evidenceDir = path.join(process.cwd(), 'e2e', 'evidence');
const baseEventId = '68ee91f0-6d37-4525-ab1b-393438434402';
const accommodationEventSlug = 'accommodation-qa-e2e';
const accommodationEventName = 'Accommodation QA E2E';
const personEmail = 'accommodation.e2e@gemindia.test';
const personName = 'Accommodation E2E Guest';
const navigationTimeout = 30_000;

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `accommodation-${name}.png`), fullPage: true });
}

async function getSignedInUserId(page: Page) {
  await page.waitForFunction(() => Boolean((window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id));
  return page.evaluate(() => (window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? '');
}

async function ensureEventPeopleTable() {
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
}

async function ensureAccommodationFixtures(authUserId: string) {
  await ensureEventPeopleTable();

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
      created_by,
      updated_by
    )
    VALUES (
      ${baseEvent.organization_id},
      ${accommodationEventSlug},
      ${accommodationEventName},
      ${'2026-06-10T09:00:00Z'},
      ${'2026-06-12T18:00:00Z'},
      ${'Asia/Kolkata'},
      ${'draft'},
      ${'Accommodation QA Venue'},
      ${'Delhi'},
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

  await sql`
    DELETE FROM accommodation_records
    WHERE event_id = ${eventId}
  `;

  const existingPeople = await sql`
    SELECT id
    FROM people
    WHERE email = ${personEmail}
    LIMIT 1
  `;

  let personId = existingPeople[0]?.id as string | undefined;
  if (!personId) {
    const insertedPeople = await sql`
      INSERT INTO people (full_name, email, phone_e164, city, created_by, updated_by)
      VALUES (${personName}, ${personEmail}, '+919877777777', 'Mumbai', ${authUserId}, ${authUserId})
      RETURNING id
    `;
    personId = insertedPeople[0].id as string;
  }

  await sql`
    INSERT INTO event_people (event_id, person_id, source)
    VALUES (${eventId}, ${personId}, 'accommodation')
    ON CONFLICT (event_id, person_id) DO UPDATE
    SET source = EXCLUDED.source, updated_at = now()
  `;

  await sql`
    DELETE FROM travel_records
    WHERE event_id = ${eventId}
      AND person_id = ${personId}
  `;

  await sql`
    INSERT INTO travel_records (
      event_id,
      person_id,
      direction,
      travel_mode,
      from_city,
      to_city,
      departure_at_utc,
      arrival_at_utc,
      carrier_name,
      service_number,
      record_status,
      created_by,
      updated_by
    )
    VALUES (
      ${eventId},
      ${personId},
      'inbound',
      'flight',
      'Mumbai',
      'Delhi',
      ${'2026-06-10T05:00:00Z'},
      ${'2026-06-10T07:00:00Z'},
      'Air India',
      'AI-ACC-101',
      'confirmed',
      ${authUserId},
      ${authUserId}
    )
  `;

  return { eventId, personId };
}

test.beforeAll(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test.describe.configure({ mode: 'serial' });

test('accommodation module supports validation, create, edit, cancel, and persistence', async ({ page }) => {
  test.slow();
  test.setTimeout(150000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  expect(authUserId).toBeTruthy();

  const { eventId } = await ensureAccommodationFixtures(authUserId);

  await page.goto(`/events/${eventId}/accommodation`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Accommodation' })).toBeVisible();
  await expect(page.getByText('No accommodation records')).toBeVisible();
  await capture(page, 'list-empty');

  await page.getByRole('link', { name: 'Add Accommodation' }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/accommodation/new$`));
  await capture(page, 'form-new');

  await page.getByPlaceholder('Search by name or email...').fill('Accommodation');
  await page.getByRole('button', { name: new RegExp(personName) }).click();

  const uniqueSuffix = Date.now().toString().slice(-6);
  const hotelName = `QA Hotel ${uniqueSuffix}`;
  const updatedHotelName = `QA Hotel Updated ${uniqueSuffix}`;
  const roomNumber = `R-${uniqueSuffix}`;
  const updatedRoomNumber = `U-${uniqueSuffix}`;

  await page.locator('input[name="hotelName"]').fill(hotelName);
  await page.locator('input[name="hotelCity"]').fill('Delhi');
  await page.locator('input[name="hotelAddress"]').fill('Accommodation QA Street');
  await page.locator('input[name="checkInDate"]').fill('2026-06-10');
  await page.locator('input[name="checkOutDate"]').fill('2026-06-09');
  await page.locator('select[name="roomType"]').selectOption('single');
  await page.locator('input[name="roomNumber"]').fill(roomNumber);
  await page.locator('input[name="sharedRoomGroup"]').fill(`group-${uniqueSuffix}`);
  await page.locator('input[name="bookingReference"]').fill(`BK-${uniqueSuffix}`);
  await page.locator('textarea[name="specialRequests"]').fill('near elevator');
  await page.locator('textarea[name="notes"]').fill('adversarial create');
  await capture(page, 'form-invalid');

  await page.getByRole('button', { name: 'Create Accommodation' }).click();
  await expect(page.getByText('Check-out must be after check-in')).toBeVisible();
  await capture(page, 'form-invalid-error');

  await page.locator('input[name="checkOutDate"]').fill('2026-06-12');
  await capture(page, 'form-valid');

  await page.getByRole('button', { name: 'Create Accommodation' }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/accommodation$`), {
    timeout: navigationTimeout,
  });
  const accommodationTable = page.getByRole('table');
  const createdRow = accommodationTable.getByRole('link', { name: personName });
  await expect(createdRow).toBeVisible();
  await expect(accommodationTable.getByText(hotelName)).toBeVisible();
  await expect(accommodationTable.getByText(roomNumber)).toBeVisible();
  await capture(page, 'list-created');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(createdRow).toBeVisible();
  await expect(accommodationTable.getByText(hotelName)).toBeVisible();
  await capture(page, 'list-reload-created');

  await createdRow.click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/accommodation/.+`), {
    timeout: navigationTimeout,
  });
  await capture(page, 'form-edit');

  await page.locator('input[name="hotelName"]').fill(updatedHotelName);
  await page.locator('input[name="roomNumber"]').fill(updatedRoomNumber);
  await page.locator('textarea[name="notes"]').fill('adversarial update');
  await capture(page, 'form-edited');

  await page.getByRole('button', { name: 'Update Accommodation' }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/accommodation$`), {
    timeout: navigationTimeout,
  });
  await expect(accommodationTable.getByText(updatedHotelName)).toBeVisible();
  await expect(accommodationTable.getByText(updatedRoomNumber)).toBeVisible();
  await capture(page, 'list-updated');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(accommodationTable.getByText(updatedHotelName)).toBeVisible();
  await capture(page, 'list-reload-updated');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await expect(page.getByText('Cancelled (1)')).toBeVisible();
  await expect(accommodationTable.getByText(updatedHotelName)).toBeVisible();
  await capture(page, 'list-cancelled');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Cancelled (1)')).toBeVisible();
  await expect(accommodationTable.getByText(updatedHotelName)).toBeVisible();
  await capture(page, 'list-reload-cancelled');
});

test('anonymous users are redirected away from the accommodation module', async ({ browser }) => {
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

  await page.goto(`/events/${baseEventId}/accommodation`, {
    waitUntil: 'domcontentloaded',
  });
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
