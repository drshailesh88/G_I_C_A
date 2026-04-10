import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import * as path from 'path';

// Must be serial — clerkSetup obtains a Testing Token before tests run
setup.describe.configure({ mode: 'serial' });

export const STORAGE_STATE = path.join(__dirname, '../../playwright/.clerk/user.json');

setup('global setup', async ({}) => {
  await clerkSetup();
});

setup('authenticate and save state', async ({ page }) => {
  await page.goto('/');

  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_CLERK_USER_USERNAME!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });

  // Verify auth worked by navigating to a protected page
  await page.goto('/dashboard');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });

  // Save authenticated session for reuse in all tests
  await page.context().storageState({ path: STORAGE_STATE });
});
