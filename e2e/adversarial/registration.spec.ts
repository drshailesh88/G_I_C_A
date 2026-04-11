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
const registrationEventSlug = 'registration-qa-e2e';
const registrationEventName = 'Registration QA E2E';
const attendeeName = 'Registration E2E Delegate';
const attendeeEmail = 'registration.delegate.e2e@gemindia.test';
const attendeePhone = '9876543299';
const navigationTimeout = 45_000;

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `registration-${name}.png`), fullPage: true });
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

async function ensureRegistrationFixtures(authUserId: string) {
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
      registration_settings,
      created_by,
      updated_by
    )
    VALUES (
      ${baseEvent.organization_id},
      ${registrationEventSlug},
      ${registrationEventName},
      ${'2026-08-10T09:00:00Z'},
      ${'2026-08-12T18:00:00Z'},
      ${'Asia/Kolkata'},
      ${'published'},
      ${'Registration QA Venue'},
      ${'Delhi'},
      ${JSON.stringify({ requiresApproval: true })}::jsonb,
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
      registration_settings = EXCLUDED.registration_settings,
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
    DELETE FROM event_registrations
    WHERE event_id = ${eventId}
       OR person_id IN (SELECT id FROM people WHERE email = ${attendeeEmail})
  `;
  await sql`
    DELETE FROM event_people
    WHERE event_id = ${eventId}
       OR person_id IN (SELECT id FROM people WHERE email = ${attendeeEmail})
  `;
  await sql`DELETE FROM people WHERE email = ${attendeeEmail}`;

  return { eventId, eventSlug: registrationEventSlug };
}

test.beforeAll(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test.describe.configure({ mode: 'serial' });

test('registration module supports public signup, admin search, approve, and cancel', async ({ page, browser }) => {
  test.slow();
  test.setTimeout(180000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  expect(authUserId).toBeTruthy();
  const { eventId, eventSlug } = await ensureRegistrationFixtures(authUserId);

  const publicContext = await createAnonymousContext(browser);
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`/e/${eventSlug}/register`, { waitUntil: 'domcontentloaded' });
  await expect(publicPage.getByRole('heading', { name: 'Register' })).toBeVisible();
  await capture(publicPage, 'public-form');

  await publicPage.getByLabel('Full Name').fill(attendeeName);
  await publicPage.getByLabel('Email').fill(attendeeEmail);
  await publicPage.getByLabel('Mobile Number').fill(attendeePhone);
  await publicPage.getByLabel('Designation').fill('Consultant');
  await publicPage.getByLabel('Specialty').fill('Internal Medicine');
  await publicPage.getByLabel('Organization / Hospital').fill('Registration QA Hospital');
  await publicPage.getByLabel('City').fill('Pune');
  await publicPage.getByRole('spinbutton', { name: 'Age' }).fill('42');
  await publicPage.getByRole('button', { name: 'Complete Registration' }).click();
  await expect(publicPage).toHaveURL(/\/register\/success\?id=/, { timeout: navigationTimeout });
  await expect(publicPage.getByText('Registration Pending')).toBeVisible();
  await capture(publicPage, 'public-success');
  await publicContext.close();

  await page.goto(`/events/${eventId}/registrations`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Registrations' })).toBeVisible();
  const registrationRow = page.getByRole('row', { name: new RegExp(`${attendeeName}.*pending.*delegate`, 'i') });
  await expect(registrationRow).toBeVisible();
  await capture(page, 'admin-list');

  await page.getByPlaceholder('Search name, reg number, email...').fill('no matching registration');
  await expect(page.getByText('No registrations found')).toBeVisible();
  await capture(page, 'admin-search-empty');

  await page.getByPlaceholder('Search name, reg number, email...').fill(attendeeName);
  await expect(registrationRow).toBeVisible();
  await capture(page, 'admin-search-match');

  await registrationRow.getByRole('button', { name: 'Approve' }).click();
  const confirmedRow = page.getByRole('row', { name: new RegExp(`${attendeeName}.*confirmed.*delegate`, 'i') });
  await expect(confirmedRow).toBeVisible({
    timeout: navigationTimeout,
  });
  await capture(page, 'admin-approved');

  await confirmedRow.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`${attendeeName}.*cancelled.*delegate`, 'i') })).toBeVisible({
    timeout: navigationTimeout,
  });
  await capture(page, 'admin-cancelled');
});

test('anonymous users are redirected away from the registrations admin module', async ({ browser }) => {
  test.slow();
  test.setTimeout(60000);

  const context = await createAnonymousContext(browser);
  const page = await context.newPage();
  await page.goto(`/events/${baseEventId}/registrations`, { waitUntil: 'domcontentloaded' });
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
