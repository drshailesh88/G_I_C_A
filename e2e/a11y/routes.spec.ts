import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Add public routes to test for accessibility
const publicRoutes = ['/login'];

for (const route of publicRoutes) {
  test(`a11y: ${route} has no WCAG violations`, async ({ page }, testInfo) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    await testInfo.attach(`axe-${route.replace(/\//g, '-')}`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });

    expect(results.violations).toEqual([]);
  });
}
