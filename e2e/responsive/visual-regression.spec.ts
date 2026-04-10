import { test, expect } from "@playwright/test";
import { VIEWPORTS, PUBLIC_ROUTES, type ViewportName } from "./viewports";

const viewportEntries = Object.entries(VIEWPORTS) as [
  ViewportName,
  (typeof VIEWPORTS)[ViewportName],
][];

for (const route of PUBLIC_ROUTES) {
  for (const [viewportName, size] of viewportEntries) {
    test(`${route} @ ${viewportName} (${size.width}x${size.height})`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto(route, { waitUntil: "networkidle" });

      // Allow any animations / lazy images to settle
      await page.waitForTimeout(500);

      const screenshotName = `${route.replace(/\//g, "-").replace(/^-/, "")}-${viewportName}.png`;

      await expect(page).toHaveScreenshot(screenshotName, {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      });
    });
  }
}
