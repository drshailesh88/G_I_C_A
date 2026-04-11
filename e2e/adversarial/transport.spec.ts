import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';

dotenv.config({ path: path.join(process.cwd(), '.env.test.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);
const evidenceDir = path.join(process.cwd(), 'e2e', 'evidence');
const baseEventId = '68ee91f0-6d37-4525-ab1b-393438434402';
const transportEventSlug = 'transport-qa-e2e';
const transportEventName = 'Transport QA E2E';
const personEmail = 'transport.e2e@gemindia.test';
const personName = 'Transport E2E Passenger';

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `transport-${name}.png`), fullPage: true });
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

async function ensureTransportFixtures(authUserId: string) {
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
      ${transportEventSlug},
      ${transportEventName},
      ${'2026-05-20T09:00:00Z'},
      ${'2026-05-21T18:00:00Z'},
      ${'Asia/Kolkata'},
      ${'draft'},
      ${'QA Venue'},
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
    DELETE FROM transport_passenger_assignments
    WHERE event_id = ${eventId}
  `;
  await sql`
    DELETE FROM vehicle_assignments
    WHERE event_id = ${eventId}
  `;
  await sql`
    DELETE FROM transport_batches
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
      VALUES (${personName}, ${personEmail}, '+919888888888', 'Mumbai', ${authUserId}, ${authUserId})
      RETURNING id
    `;
    personId = insertedPeople[0].id as string;
  }

  await sql`
    INSERT INTO event_people (event_id, person_id, source)
    VALUES (${eventId}, ${personId}, 'transport')
    ON CONFLICT (event_id, person_id) DO UPDATE
    SET source = EXCLUDED.source, updated_at = now()
  `;

  await sql`
    DELETE FROM travel_records
    WHERE event_id = ${eventId}
      AND person_id = ${personId}
  `;

  const [travelRecord] = await sql`
    INSERT INTO travel_records (
      event_id,
      person_id,
      direction,
      travel_mode,
      from_city,
      from_location,
      to_city,
      to_location,
      departure_at_utc,
      arrival_at_utc,
      carrier_name,
      service_number,
      record_status,
      notes,
      created_by,
      updated_by
    )
    VALUES (
      ${eventId},
      ${personId},
      'inbound',
      'flight',
      'Mumbai',
      'BOM T2',
      'Delhi',
      'QA Venue',
      ${'2026-05-20T05:00:00Z'},
      ${'2026-05-20T07:00:00Z'},
      'Air India',
      'AI-QA-101',
      'confirmed',
      'transport fixture',
      ${authUserId},
      ${authUserId}
    )
    RETURNING id
  `;

  return {
    eventId,
    personId,
    travelRecordId: travelRecord.id as string,
  };
}

async function findCreatedBatchId(eventId: string, pickupHub: string, dropHub: string) {
  const rows = await sql`
    SELECT id
    FROM transport_batches
    WHERE event_id = ${eventId}
      AND pickup_hub = ${pickupHub}
      AND drop_hub = ${dropHub}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const batchId = rows[0]?.id as string | undefined;
  if (!batchId) {
    throw new Error(`Transport batch not found for ${pickupHub} -> ${dropHub}`);
  }

  return batchId;
}

async function seedPassengerAssignment(eventId: string, batchId: string, personId: string, travelRecordId: string) {
  await sql`
    DELETE FROM transport_passenger_assignments
    WHERE event_id = ${eventId}
      AND batch_id = ${batchId}
      AND person_id = ${personId}
  `;

  await sql`
    INSERT INTO transport_passenger_assignments (
      event_id,
      batch_id,
      vehicle_assignment_id,
      person_id,
      travel_record_id,
      assignment_status
    )
    VALUES (${eventId}, ${batchId}, NULL, ${personId}, ${travelRecordId}, 'pending')
  `;
}

function getColumn(page: Page, title: string): Locator {
  return page.locator(`xpath=//span[normalize-space()="${title}"]/ancestor::div[contains(@class,"rounded-xl")][1]`);
}

async function dragBetween(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('Unable to resolve drag source or target');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 10, sourceBox.y + sourceBox.height / 2 + 10, { steps: 5 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.mouse.up();
}

test.beforeAll(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test.describe.configure({ mode: 'serial' });

test('transport module handles batch planning, vehicle assignment, and passenger movement', async ({ page }) => {
  test.slow();
  test.setTimeout(150000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  expect(authUserId).toBeTruthy();

  const fixture = await ensureTransportFixtures(authUserId);

  await page.goto('/events', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: transportEventName }).click();
  await expect(page.getByRole('heading', { name: transportEventName })).toBeVisible();
  await capture(page, 'workspace');

  const transportHref = `/events/${fixture.eventId}/transport`;
  await expect(page.locator(`a[href="${transportHref}"]`).first()).toBeVisible();
  await page.goto(transportHref, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`/events/${fixture.eventId}/transport$`));
  await expect(page.getByRole('heading', { name: 'Transport' })).toBeVisible();
  await expect(page.getByText('No transport batches')).toBeVisible();
  await capture(page, 'empty');

  await page.getByRole('button', { name: 'New Batch' }).click();
  await page.locator('select[name="movementType"]').selectOption('arrival');
  await page.locator('input[name="_date"]').fill('2026-05-20');
  await page.locator('input[name="timeWindowStart"]').fill('11:00');
  await page.locator('input[name="timeWindowEnd"]').fill('10:00');
  await page.locator('input[name="sourceCity"]').fill('Mumbai');
  await page.locator('input[name="pickupHub"]').fill('QA Terminal Invalid');
  await page.locator('input[name="dropHub"]').fill('QA Hotel Invalid');
  await capture(page, 'invalid-form');

  await page.getByRole('button', { name: 'Create Batch' }).click();
  await expect(page.getByText('End time must be after start time')).toBeVisible();
  await capture(page, 'invalid-error');

  const uniqueSuffix = Date.now().toString().slice(-6);
  const pickupHub = `QA Terminal ${uniqueSuffix}`;
  const dropHub = `QA Hotel ${uniqueSuffix}`;
  const vehicleLabel = `Van-${uniqueSuffix}`;

  await page.locator('input[name="timeWindowStart"]').fill('09:00');
  await page.locator('input[name="timeWindowEnd"]').fill('11:00');
  await page.locator('input[name="pickupHub"]').fill(pickupHub);
  await page.locator('input[name="dropHub"]').fill(dropHub);
  await capture(page, 'valid-form');

  await page.getByRole('button', { name: 'Create Batch' }).click();
  await expect(page.getByText(`${pickupHub} → ${dropHub}`)).toBeVisible();
  await capture(page, 'created');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(`${pickupHub} → ${dropHub}`)).toBeVisible();
  await capture(page, 'reload-created');

  const batchId = await findCreatedBatchId(fixture.eventId, pickupHub, dropHub);
  await seedPassengerAssignment(fixture.eventId, batchId, fixture.personId, fixture.travelRecordId);

  await page.getByRole('link', { name: new RegExp(`${pickupHub} → ${dropHub}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${fixture.eventId}/transport/assign/${batchId}$`));
  await expect(page.getByRole('heading', { name: 'Vehicle Assignment' })).toBeVisible();
  await expect(page.getByText(personName)).toBeVisible();
  await capture(page, 'assignment-unassigned');

  await page.getByRole('button', { name: 'Add Vehicle' }).click();
  await page.locator('input[name="vehicleLabel"]').fill(vehicleLabel);
  await page.locator('select[name="vehicleType"]').selectOption('van');
  await page.locator('input[name="capacity"]').fill('4');
  await page.locator('input[name="driverName"]').fill('QA Driver');
  await capture(page, 'vehicle-form');

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(vehicleLabel)).toBeVisible();
  await capture(page, 'vehicle-created');

  const passengerCard = page.locator(`xpath=//p[normalize-space()="${personName}"]/ancestor::div[contains(@class,"rounded-lg")][1]`);
  const vehicleDropZone = getColumn(page, vehicleLabel).locator('xpath=.//div[contains(@class,"min-h-[80px]")]').first();

  await dragBetween(page, passengerCard, vehicleDropZone);
  await expect(getColumn(page, vehicleLabel).getByText(personName)).toBeVisible();
  await expect(getColumn(page, 'Unassigned').getByText(personName)).toHaveCount(0);
  await capture(page, 'passenger-moved');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(getColumn(page, vehicleLabel).getByText(personName)).toBeVisible();
  await capture(page, 'reload-moved');
});

test('anonymous users are redirected away from the transport module', async ({ browser }) => {
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

  await page.goto(`/events/${baseEventId}/transport`, {
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
