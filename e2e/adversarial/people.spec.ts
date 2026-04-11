import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { test, expect, type Browser, type Page } from '@playwright/test';

dotenv.config({ path: path.join(process.cwd(), '.env.test.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);
const evidenceDir = path.join(process.cwd(), 'e2e', 'evidence');
const existingEmail = 'people.existing.e2e@gemindia.test';
const existingName = 'People E2E Existing';
const importedEmail = 'people.imported.e2e@gemindia.test';
const importedName = 'People E2E Imported';
const addedEmail = 'people.added.e2e@gemindia.test';
const addedName = 'People E2E Added';
const navigationTimeout = 30_000;

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `people-${name}.png`), fullPage: true });
}

async function getSignedInUserId(page: Page) {
  await page.waitForFunction(() => Boolean((window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id));
  return page.evaluate(() => (window as typeof window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? '');
}

async function ensurePeopleFixtures(authUserId: string) {
  await sql`
    DELETE FROM event_people
    WHERE person_id IN (
      SELECT id
      FROM people
      WHERE email IN (${existingEmail}, ${importedEmail}, ${addedEmail})
    )
  `;

  await sql`
    DELETE FROM people
    WHERE email IN (${existingEmail}, ${importedEmail}, ${addedEmail})
  `;

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
      ${existingName},
      ${existingEmail},
      '+919866666666',
      'Faculty',
      'Cardiology',
      'People QA Org',
      'Delhi',
      ${JSON.stringify(['faculty', 'VIP'])}::jsonb,
      ${authUserId},
      ${authUserId}
    )
    RETURNING id
  `;

  return { personId: person.id as string };
}

test.beforeAll(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test.describe.configure({ mode: 'serial' });

test('people module supports search, detail archive/restore, add, and CSV import', async ({ page }) => {
  test.slow();
  test.setTimeout(150000);

  await page.goto('/events', { waitUntil: 'commit' });
  const authUserId = await getSignedInUserId(page);
  expect(authUserId).toBeTruthy();

  const { personId } = await ensurePeopleFixtures(authUserId);

  await page.goto('/people', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await capture(page, 'list');

  await page.getByPlaceholder('Search name, email, organization, phone...').fill(existingName);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/people\?q=/);
  await expect(page.getByRole('link', { name: new RegExp(existingName) }).first()).toBeVisible();
  await capture(page, 'search-existing');

  await page.goto(`/people/${personId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: existingName })).toBeVisible();
  await expect(page.getByText(existingEmail)).toBeVisible();
  await capture(page, 'detail');

  await page.getByRole('button', { name: 'Archive Person' }).click();
  await expect(page.getByText('This will remove the person from all list views.')).toBeVisible();
  await capture(page, 'archive-confirm');
  await page.getByRole('button', { name: 'Confirm Archive' }).click();
  await expect(page.getByText('Archived')).toBeVisible();
  await capture(page, 'archived');

  await page.getByRole('button', { name: 'Restore Person' }).click();
  await expect(page.getByText('Archived')).toHaveCount(0);
  await capture(page, 'restored');

  await page.goto('/people', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add Person' })).toBeVisible();
  await capture(page, 'add-form');

  await page.locator('input[name="fullName"]').fill(addedName);
  await page.locator('input[name="email"]').fill(addedEmail);
  await page.locator('input[name="phone"]').fill('9866666600');
  await page.locator('input[name="organization"]').fill('People Added Org');
  await page.locator('input[name="city"]').fill('Mumbai');
  await page.getByRole('button', { name: 'Create Person' }).click();
  await expect(page.getByRole('heading', { name: 'Add Person' })).toHaveCount(0);
  await capture(page, 'added');

  await page.goto(`/people?q=${encodeURIComponent(addedName)}`, { waitUntil: 'domcontentloaded' });
  const addedPersonLink = page.getByRole('link', { name: new RegExp(addedName) }).first();
  await expect(addedPersonLink).toBeVisible();
  await capture(page, 'search-added');
  await addedPersonLink.click();
  await expect(page.getByRole('heading', { name: addedName })).toBeVisible();
  await expect(page.getByText('+919866666600')).toBeVisible();
  await capture(page, 'detail-added');

  await page.goto('/people/import', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Import People' })).toBeVisible();
  await capture(page, 'import-upload');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'people-e2e.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Full Name,Email,Phone,Organization,City,Tags',
        `${importedName},${importedEmail},9877777700,People Import Org,Pune,delegate`,
      ].join('\n'),
    ),
  });
  await expect(page.getByText('Found 6 columns and 1 rows')).toBeVisible();
  await capture(page, 'import-mapping');

  await page.getByRole('button', { name: 'Preview Import' }).click();
  await expect(page.getByText('Valid rows')).toBeVisible();
  await expect(page.getByText(importedName)).toBeVisible();
  await capture(page, 'import-preview');

  await page.getByRole('button', { name: 'Import 1 People' }).click();
  await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({
    timeout: navigationTimeout,
  });
  await expect(page.getByText('Imported', { exact: true })).toBeVisible();
  await capture(page, 'import-success');

  await page.goto(`/people?q=${encodeURIComponent(importedName)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: new RegExp(importedName) }).first()).toBeVisible();
  await capture(page, 'search-imported');
});

test('anonymous users are redirected away from the people module', async ({ browser }) => {
  test.slow();
  test.setTimeout(60000);

  const context = await createAnonymousContext(browser);
  const page = await context.newPage();
  await page.goto('/people', { waitUntil: 'domcontentloaded' });
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
