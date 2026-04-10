import type { ViewportSize } from "@playwright/test";

export const VIEWPORTS = {
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1280, height: 800 },
  desktop: { width: 1440, height: 900 },
} as const satisfies Record<string, ViewportSize>;

export type ViewportName = keyof typeof VIEWPORTS;

/**
 * Public routes that don't require auth.
 * Dynamic segments use realistic placeholder values.
 */
export const PUBLIC_ROUTES = [
  "/e/demo-event",
  "/e/demo-event/register",
  "/verify",
] as const;
