import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

type Check = {
  type: 'visible' | 'text' | 'screenshot' | 'a11y' | 'count' | 'not-visible' | 'url';
  selector?: string;
  text?: string;
  name?: string;
  tags?: string[];
  min?: number;
  max?: number;
  pattern?: string;
};

type AcceptanceCriterion = {
  id: string;
  title: string;
  page: string;
  setup?: { click?: string; fill?: Record<string, string>; wait?: number }[];
  checks: Check[];
};

export function runContractPack(yamlPath: string) {
  const criteria = yaml.load(
    fs.readFileSync(path.resolve(yamlPath), 'utf8')
  ) as AcceptanceCriterion[];

  for (const ac of criteria) {
    test(`${ac.id}: ${ac.title}`, async ({ page }, testInfo) => {
      await page.goto(ac.page);
      await page.waitForLoadState('networkidle');

      // Run setup steps if any
      if (ac.setup) {
        for (const step of ac.setup) {
          if (step.click) await page.click(step.click);
          if (step.fill) {
            for (const [sel, val] of Object.entries(step.fill)) {
              await page.fill(sel, val);
            }
          }
          if (step.wait) await page.waitForTimeout(step.wait);
        }
      }

      // Run checks
      for (const check of ac.checks) {
        await test.step(`${check.type}: ${check.selector || check.name || ''}`, async () => {
          switch (check.type) {
            case 'visible':
              await expect(page.locator(check.selector!)).toBeVisible();
              break;
            case 'not-visible':
              await expect(page.locator(check.selector!)).not.toBeVisible();
              break;
            case 'text':
              await expect(page.locator(check.selector!)).toContainText(check.text!);
              break;
            case 'screenshot':
              await expect(page).toHaveScreenshot(check.name!);
              break;
            case 'a11y': {
              const r = await new AxeBuilder({ page })
                .withTags(check.tags || ['wcag2a', 'wcag2aa'])
                .analyze();
              await testInfo.attach(`axe-${ac.id}`, {
                body: JSON.stringify(r.violations, null, 2),
                contentType: 'application/json',
              });
              expect(r.violations).toEqual([]);
              break;
            }
            case 'count': {
              const n = await page.locator(check.selector!).count();
              if (check.min !== undefined) expect(n).toBeGreaterThanOrEqual(check.min);
              if (check.max !== undefined) expect(n).toBeLessThanOrEqual(check.max);
              break;
            }
            case 'url':
              expect(page.url()).toMatch(new RegExp(check.pattern!));
              break;
          }
        });
      }

      // Always attach a final screenshot as evidence
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`final-${ac.id}`, {
        body: screenshot,
        contentType: 'image/png',
      });
    });
  }
}
