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
const programEventSlug = 'program-qa-e2e';
const programEventName = 'Program QA E2E';
const hallName = 'Program QA Hall A';
const sessionTitle = 'Program QA Opening Session';
const updatedSessionTitle = 'Program QA Updated Session';
const speakerName = 'Dr. Program Speaker';
const speakerEmail = 'program.speaker.e2e@gemindia.test';
const presentationTitle = 'Therapeutic update';
const navigationTimeout = 45_000;

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `program-${name}.png`), fullPage: true });
}

async function getSignedInUserId(page: Page) {
  await page.waitForFunction(() => Boolean((window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id));
  return page.evaluate(() => (window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? '');
}

async function ensureProgramFixtures(authUserId: string) {
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
      ${programEventSlug},
      ${programEventName},
      ${'2026-09-14T09:00:00Z'},
      ${'2026-09-16T18:00:00Z'},
      ${'Asia/Kolkata'},
      ${'draft'},
      ${'Program QA Venue'},
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

  await sql`DELETE FROM session_assignments WHERE event_id = ${eventId}`;
  await sql`
    DELETE FROM session_role_requirements
    WHERE session_id IN (SELECT id FROM sessions WHERE event_id = ${eventId})
  `;
  await sql`DELETE FROM sessions WHERE event_id = ${eventId}`;
  await sql`DELETE FROM halls WHERE event_id = ${eventId}`;
  await sql`
    DELETE FROM event_people
    WHERE event_id = ${eventId}
       OR person_id IN (SELECT id FROM people WHERE email = ${speakerEmail})
  `;
  await sql`DELETE FROM people WHERE email = ${speakerEmail}`;

  return { eventId };
}

async function getSessionId(eventId: string, title: string) {
  const [session] = await sql`
    SELECT id
    FROM sessions
    WHERE event_id = ${eventId}
      AND title = ${title}
    LIMIT 1
  `;

  if (!session?.id) {
    throw new Error(`Session "${title}" not found`);
  }

  return session.id as string;
}

async function seedSpeakerAssignment(eventId: string, sessionId: string, authUserId: string) {
  const [person] = await sql`
    INSERT INTO people (
      full_name,
      email,
      phone_e164,
      designation,
      specialty,
      organization,
      city,
      tags,
      created_by,
      updated_by
    )
    VALUES (
      ${speakerName},
      ${speakerEmail},
      ${'+919876543211'},
      ${'Faculty'},
      ${'Gastroenterology'},
      ${'Program QA Hospital'},
      ${'Mumbai'},
      ${JSON.stringify(['faculty'])}::jsonb,
      ${authUserId},
      ${authUserId}
    )
    RETURNING id
  `;

  const personId = person.id as string;

  await sql`
    INSERT INTO event_people (event_id, person_id, source)
    VALUES (${eventId}, ${personId}, 'session_assignment')
    ON CONFLICT (event_id, person_id) DO NOTHING
  `;

  await sql`
    INSERT INTO session_assignments (
      event_id,
      session_id,
      person_id,
      role,
      sort_order,
      presentation_title,
      presentation_duration_minutes,
      notes,
      created_by,
      updated_by
    )
    VALUES (
      ${eventId},
      ${sessionId},
      ${personId},
      ${'speaker'},
      ${0},
      ${presentationTitle},
      ${30},
      ${'Seeded by program adversarial E2E'},
      ${authUserId},
      ${authUserId}
    )
  `;
}

test.beforeAll(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test.describe.configure({ mode: 'serial' });

test('program module supports session CRUD, schedule grid rendering, and speaker assignments', async ({ page }) => {
  test.slow();
  test.setTimeout(180000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  expect(authUserId).toBeTruthy();
  const { eventId } = await ensureProgramFixtures(authUserId);

  await page.goto(`/events/${eventId}/sessions`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  await capture(page, 'sessions-empty');

  await page.getByTitle('Manage Halls').click();
  await page.getByPlaceholder('Hall name').fill(hallName);
  await page.getByPlaceholder('Capacity').fill('120');
  await page.getByRole('button', { name: 'Add' }).last().click();
  await expect(page.getByText(hallName)).toBeVisible({ timeout: navigationTimeout });
  await capture(page, 'hall-created');

  await page.getByRole('link', { name: 'Add' }).click();
  await expect(page.getByRole('heading', { name: 'Add Session' })).toBeVisible();
  await page.getByPlaceholder('Enter session title').fill(sessionTitle);
  await page.locator('input[type="date"]').fill('2026-09-14');
  await page.locator('input[type="time"]').nth(0).fill('09:00');
  await page.locator('input[type="time"]').nth(1).fill('10:00');
  await page.locator('select').nth(0).selectOption({ label: `${hallName} (120)` });
  await page.locator('select').nth(1).selectOption('workshop');
  await page.getByPlaceholder('Enter topic or description').fill('Adversarial program flow coverage.');
  await page.getByPlaceholder('e.g., Cardiology').fill('QA Track');
  await page.getByPlaceholder('0').fill('2');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/sessions$`), { timeout: navigationTimeout });
  await expect(page.getByRole('row', { name: new RegExp(`${sessionTitle}.*${hallName}.*09:00.*10:00`, 'i') })).toBeVisible();
  await capture(page, 'session-created');

  const sessionId = await getSessionId(eventId, sessionTitle);
  await page.goto(`/events/${eventId}/sessions/${sessionId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Edit Session' })).toBeVisible();
  await page.getByPlaceholder('Enter session title').fill(updatedSessionTitle);
  await page.getByPlaceholder('e.g., Cardiology').fill('Updated QA Track');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/sessions$`), { timeout: navigationTimeout });
  await expect(page.getByRole('row', { name: new RegExp(`${updatedSessionTitle}.*${hallName}`, 'i') })).toBeVisible();
  await expect(page.getByText(sessionTitle)).toHaveCount(0);
  await capture(page, 'session-updated');

  await seedSpeakerAssignment(eventId, sessionId, authUserId);
  await page.goto(`/events/${eventId}/sessions`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('row', { name: new RegExp(updatedSessionTitle, 'i') }).click();
  await expect(page.getByText(speakerName)).toBeVisible();
  await expect(page.getByText(presentationTitle)).toBeVisible();
  await capture(page, 'speaker-assignment');

  await page.goto(`/events/${eventId}/schedule`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Schedule Builder' })).toBeVisible();
  await expect(page.getByTestId('schedule-grid-desktop')).toBeVisible();
  await expect(page.getByText(hallName).first()).toBeVisible();
  await expect(page.getByText(updatedSessionTitle).first()).toBeVisible();
  await expect(page.getByText(speakerName).first()).toBeVisible();
  await capture(page, 'schedule-grid');

  await page.goto(`/events/${eventId}/sessions/${sessionId}`, { waitUntil: 'domcontentloaded' });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Session' }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/sessions$`), { timeout: navigationTimeout });
  await expect(page.getByText(updatedSessionTitle)).toHaveCount(0);
  await expect(page.getByText('No sessions found')).toBeVisible();
  await capture(page, 'session-deleted');
});

test('anonymous users are redirected away from the program admin module', async ({ browser }) => {
  test.slow();
  test.setTimeout(60000);

  const context = await createAnonymousContext(browser);
  const page = await context.newPage();
  await page.goto(`/events/${baseEventId}/sessions`, { waitUntil: 'domcontentloaded' });
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
