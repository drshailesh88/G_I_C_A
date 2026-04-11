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
const certificateEventSlug = 'certificates-qa-e2e';
const certificateEventName = 'Certificates QA E2E';
const linkedPersonEmail = 'certificates.linked.e2e@gemindia.test';
const linkedPersonName = 'Certificates E2E Linked';
const outsidePersonEmail = 'certificates.outside.e2e@gemindia.test';
const outsidePersonName = 'Certificates E2E Outside';
const navigationTimeout = 60_000;

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `certificates-${name}.png`), fullPage: true });
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

async function upsertPerson(authUserId: string, fullName: string, email: string) {
  const [existing] = await sql`
    SELECT id
    FROM people
    WHERE email = ${email}
    LIMIT 1
  `;
  if (existing?.id) return existing.id as string;

  const [person] = await sql`
    INSERT INTO people (full_name, email, phone_e164, city, tags, created_by, updated_by)
    VALUES (${fullName}, ${email}, '+919855555555', 'Delhi', ${JSON.stringify(['delegate'])}::jsonb, ${authUserId}, ${authUserId})
    RETURNING id
  `;
  return person.id as string;
}

async function ensureCertificateFixtures(authUserId: string) {
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
      ${certificateEventSlug},
      ${certificateEventName},
      ${'2026-07-10T09:00:00Z'},
      ${'2026-07-12T18:00:00Z'},
      ${'Asia/Kolkata'},
      ${'draft'},
      ${'Certificates QA Venue'},
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

  await sql`DELETE FROM issued_certificates WHERE event_id = ${eventId}`;
  await sql`DELETE FROM certificate_templates WHERE event_id = ${eventId}`;
  await sql`
    DELETE FROM event_people
    WHERE event_id = ${eventId}
      AND person_id IN (
        SELECT id FROM people WHERE email IN (${linkedPersonEmail}, ${outsidePersonEmail})
      )
  `;

  const linkedPersonId = await upsertPerson(authUserId, linkedPersonName, linkedPersonEmail);
  await upsertPerson(authUserId, outsidePersonName, outsidePersonEmail);

  await sql`
    INSERT INTO event_people (event_id, person_id, source)
    VALUES (${eventId}, ${linkedPersonId}, 'manual')
    ON CONFLICT (event_id, person_id) DO UPDATE
    SET source = EXCLUDED.source, updated_at = now()
  `;

  return { eventId, linkedPersonId };
}

test.beforeAll(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test.describe.configure({ mode: 'serial' });

test('certificates module supports template lifecycle, issuance, filters, and revocation', async ({ page }) => {
  test.slow();
  test.setTimeout(180000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  expect(authUserId).toBeTruthy();

  const { eventId } = await ensureCertificateFixtures(authUserId);
  const uniqueSuffix = Date.now().toString().slice(-6);
  const templateName = `Certificates E2E Template ${uniqueSuffix}`;
  const updatedTemplateName = `Certificates E2E Updated ${uniqueSuffix}`;
  const revokeReason = `QA revoke ${uniqueSuffix}`;

  await page.goto(`/events/${eventId}/certificates`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Certificates' })).toBeVisible();
  await expect(page.getByText('No certificate templates yet')).toBeVisible();
  await capture(page, 'list-empty');

  await page.getByRole('button', { name: 'New Template' }).click();
  await expect(page.getByRole('heading', { name: 'New Certificate Template' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Template' })).toBeDisabled();
  await capture(page, 'create-empty');

  await page.getByPlaceholder('e.g. Delegate Attendance Certificate').fill(templateName);
  await page
    .locator('.safe-area-insets')
    .filter({ hasText: 'New Certificate Template' })
    .locator('textarea')
    .fill('Created by adversarial certificate E2E');
  await page.getByRole('button', { name: 'Create Template' }).click();
  await expect(page.getByRole('heading', { name: 'New Certificate Template' })).toHaveCount(0, {
    timeout: navigationTimeout,
  });
  await expect(page.getByText(templateName)).toBeVisible({ timeout: navigationTimeout });
  await expect(page.getByText('draft').first()).toBeVisible();
  await capture(page, 'created-draft');

  const templateCard = page.locator('div').filter({ hasText: templateName }).filter({ hasText: 'draft' }).first();
  await templateCard.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Edit: ${templateName}`) })).toBeVisible();
  const editModal = page.locator('.safe-area-insets').filter({ hasText: `Edit: ${templateName}` });
  await editModal.locator('input').nth(0).fill(updatedTemplateName);
  await editModal.locator('input').nth(1).fill('full_name, event_name, certificate_number, email');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Edit: ${templateName}`) })).toHaveCount(0, {
    timeout: navigationTimeout,
  });
  await expect(page.getByText(updatedTemplateName)).toBeVisible({ timeout: navigationTimeout });
  await capture(page, 'edited-draft');

  const updatedCard = page.locator('div').filter({ hasText: updatedTemplateName }).filter({ hasText: 'draft' }).first();
  await updatedCard.getByRole('button', { name: 'Activate' }).click();
  await expect(page.locator('div').filter({ hasText: updatedTemplateName }).filter({ hasText: 'active' }).first()).toBeVisible({
    timeout: navigationTimeout,
  });
  await expect(page.getByRole('button', { name: 'Issue Certificate' })).toBeVisible();
  await capture(page, 'activated');

  await page.getByRole('button', { name: 'Issue Certificate' }).click();
  await expect(page.getByRole('heading', { name: 'Issue Certificate' })).toBeVisible();
  await page.getByPlaceholder('Search by name, email, or phone...').fill('Certificates E2E');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(linkedPersonName)).toBeVisible({ timeout: navigationTimeout });
  await expect(page.getByText(outsidePersonName)).toHaveCount(0);
  await capture(page, 'issue-search');

  await page.getByRole('button', { name: new RegExp(linkedPersonName) }).click();
  await expect(page.getByText(linkedPersonEmail)).toBeVisible();
  await page
    .locator('.safe-area-insets')
    .filter({ hasText: 'Issue Certificate' })
    .getByRole('button', { name: 'Issue Certificate' })
    .click();
  await expect(page.getByRole('heading', { name: 'Issue Certificate' })).toHaveCount(0, {
    timeout: navigationTimeout,
  });
  await capture(page, 'issued');

  await page.getByRole('button', { name: 'Issued Certificates' }).click();
  await expect(page.getByTestId('results-count')).toContainText('Showing 1 of 1 certificates');
  await expect(page.getByText(linkedPersonName).first()).toBeVisible();
  await capture(page, 'issued-tab');

  await page.getByTestId('cert-search').fill('no matching certificate');
  await expect(page.getByTestId('results-count')).toContainText('Showing 0 of 1 certificates');
  await capture(page, 'issued-filter-empty');
  await page.getByTestId('cert-search').fill(linkedPersonName);
  await expect(page.getByTestId('results-count')).toContainText('Showing 1 of 1 certificates');
  await capture(page, 'issued-filter-match');

  await page.getByTestId('btn-revoke').first().click();
  await page.getByPlaceholder('Reason...').first().fill(revokeReason);
  await capture(page, 'revoke-confirm');
  await page.getByTestId('btn-revoke-confirm').first().click();
  const revokedCard = page.getByTestId('issued-cert-card').filter({ hasText: linkedPersonName }).first();
  await expect(revokedCard.getByText('revoked')).toBeVisible({ timeout: navigationTimeout });
  await expect(revokedCard.getByText(revokeReason)).toBeVisible();
  await capture(page, 'revoked');
});

test('anonymous users are redirected away from the certificates module', async ({ browser }) => {
  test.slow();
  test.setTimeout(60000);

  const context = await createAnonymousContext(browser);
  const page = await context.newPage();
  await page.goto(`/events/${baseEventId}/certificates`, { waitUntil: 'domcontentloaded' });
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
