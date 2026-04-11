import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load test env vars
dotenv.config({ path: path.join(__dirname, '../../.env.test.local') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// Must be serial — clerkSetup obtains a Testing Token before tests run
setup.describe.configure({ mode: 'serial' });

export const STORAGE_STATE = path.join(__dirname, '../../playwright/.clerk/user.json');

setup('global setup', async ({}) => {
  await clerkSetup();
});

setup('authenticate and save state', async ({ page }) => {
  // Give this test more time — Clerk JS can be slow to init
  setup.setTimeout(60000);

  // Clear any previous auth state
  await page.context().clearCookies();

  // Navigate to login page and sync on Clerk's UI rather than network idle.
  // The Clerk page keeps background work alive long enough for `networkidle`
  // to hang in dev, which prevents auth state from ever being refreshed.
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // Wait for Clerk to be ready (the SignIn component renders)
  await page.waitForSelector('[data-clerk-component]', { timeout: 15000 }).catch(() => {
    // Fallback: wait for the email input
    return page.waitForSelector('input[name="identifier"], input[type="email"]', { timeout: 10000 });
  });
  await clerk.loaded({ page });

  // Use emailAddress shortcut — signs in via Backend API, no UI interaction needed.
  try {
    await clerk.signIn({
      page,
      emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
    });
  } catch (error) {
    // Clerk's backend helper can finish the sign-in and trigger a redirect
    // quickly enough to destroy the current execution context. In that case,
    // verify the session with the protected page navigation below instead of
    // failing the setup run on a successful sign-in.
    if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed')) {
      throw error;
    }
  }

  // After sign-in, verify against the event index instead of the dashboard.
  // The dashboard currently triggers unsupported transaction code paths in the
  // neon-http driver and is not needed to persist an authenticated session.
  await page.goto('/events', { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/events**', { timeout: 15000 });

  // Save authenticated session for reuse in all tests
  await page.context().storageState({ path: STORAGE_STATE });
});
