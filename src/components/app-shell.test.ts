import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NavMode } from '@/hooks/use-responsive-nav';

// We'll test pure helper functions exported from app-shell
// Component rendering is verified via build + type check

describe('isResponsiveShellEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false when NEXT_PUBLIC_RESPONSIVE_SHELL is unset', async () => {
    delete process.env.NEXT_PUBLIC_RESPONSIVE_SHELL;
    const { isResponsiveShellEnabled } = await import('./app-shell');
    expect(isResponsiveShellEnabled()).toBe(false);
  });

  it('returns false when NEXT_PUBLIC_RESPONSIVE_SHELL is empty string', async () => {
    process.env.NEXT_PUBLIC_RESPONSIVE_SHELL = '';
    const { isResponsiveShellEnabled } = await import('./app-shell');
    expect(isResponsiveShellEnabled()).toBe(false);
  });

  it('returns false when NEXT_PUBLIC_RESPONSIVE_SHELL is "false"', async () => {
    process.env.NEXT_PUBLIC_RESPONSIVE_SHELL = 'false';
    const { isResponsiveShellEnabled } = await import('./app-shell');
    expect(isResponsiveShellEnabled()).toBe(false);
  });

  it('returns true when NEXT_PUBLIC_RESPONSIVE_SHELL is "true"', async () => {
    process.env.NEXT_PUBLIC_RESPONSIVE_SHELL = 'true';
    const { isResponsiveShellEnabled } = await import('./app-shell');
    expect(isResponsiveShellEnabled()).toBe(true);
  });
});

describe('shouldShowSidebar', () => {
  let shouldShowSidebar: (navMode: NavMode, enabled: boolean) => boolean;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./app-shell');
    shouldShowSidebar = mod.shouldShowSidebar;
  });

  it('returns false when flag is off regardless of navMode', () => {
    expect(shouldShowSidebar('desktop', false)).toBe(false);
    expect(shouldShowSidebar('tablet', false)).toBe(false);
    expect(shouldShowSidebar('mobile', false)).toBe(false);
  });

  it('returns false on mobile even when flag is on', () => {
    expect(shouldShowSidebar('mobile', true)).toBe(false);
  });

  it('returns true on tablet when flag is on', () => {
    expect(shouldShowSidebar('tablet', true)).toBe(true);
  });

  it('returns true on desktop when flag is on', () => {
    expect(shouldShowSidebar('desktop', true)).toBe(true);
  });
});

describe('shouldShowTabBar', () => {
  let shouldShowTabBar: (navMode: NavMode, enabled: boolean) => boolean;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./app-shell');
    shouldShowTabBar = mod.shouldShowTabBar;
  });

  it('returns true when flag is off (backward compatible)', () => {
    expect(shouldShowTabBar('mobile', false)).toBe(true);
    expect(shouldShowTabBar('tablet', false)).toBe(true);
    expect(shouldShowTabBar('desktop', false)).toBe(true);
  });

  it('returns true on mobile when flag is on', () => {
    expect(shouldShowTabBar('mobile', true)).toBe(true);
  });

  it('returns false on tablet when flag is on', () => {
    expect(shouldShowTabBar('tablet', true)).toBe(false);
  });

  it('returns false on desktop when flag is on', () => {
    expect(shouldShowTabBar('desktop', true)).toBe(false);
  });
});
