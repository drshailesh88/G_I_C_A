import { test as base } from '@playwright/test';

// Shared auth fixture — extend with Clerk test helpers as needed
// See: https://clerk.com/docs/testing/playwright

export const test = base.extend<{ authenticated: void }>({
  authenticated: async ({ page }, use) => {
    // TODO: Add Clerk test authentication setup
    // Example:
    //   await page.goto('/login');
    //   await clerk.signIn({ ... });
    await use();
  },
});

export { expect } from '@playwright/test';
