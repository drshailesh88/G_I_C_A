import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { test, expect, type Page } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

dotenv.config({ path: path.join(process.cwd(), '.env.test.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const evidenceDir = path.join(process.cwd(), 'e2e', 'evidence');
const eventLinkSelector = 'a[href^="/events/"]:not([href="/events/new"])';

async function capture(page: Page, name: string) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `travel-${name}.png`), fullPage: true });
}

async function signIn(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="identifier"], input[type="email"]', { timeout: 15000 });
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
  });
}

test.beforeAll(async () => {
  await clerkSetup();
  fs.mkdirSync(evidenceDir, { recursive: true });
});

test('advertised events do not dead-end on the travel module', async ({ page }) => {
  test.slow();

  await signIn(page);

  await page.goto('/events', { waitUntil: 'domcontentloaded' });
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
  await page.goto(`${firstEventHref}/travel`, { waitUntil: 'domcontentloaded' });
  await capture(page, 'travel-route');

  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Travel' })).toBeVisible();
});

test('anonymous users are redirected away from the travel module', async ({ page }) => {
  await page.goto('/events/68ee91f0-6d37-4525-ab1b-393438434402/travel', {
    waitUntil: 'domcontentloaded',
  });
  await capture(page, 'travel-anon-redirect');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('Conference Management Platform')).toBeVisible();
});
