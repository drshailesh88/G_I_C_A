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
  // Navigate to a page that loads Clerk JS
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Sign out first if already signed in (from previous storageState)
  try {
    await clerk.signOut({ page });
  } catch {
    // Not signed in — that's fine
  }

  // Use emailAddress shortcut — signs in via Backend API, no UI interaction needed.
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
  });

  // After sign-in, navigate to a protected page to verify
  await page.goto('/dashboard');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });

  // Save authenticated session for reuse in all tests
  await page.context().storageState({ path: STORAGE_STATE });
});
