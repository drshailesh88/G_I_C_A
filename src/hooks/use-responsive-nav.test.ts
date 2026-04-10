import { describe, it, expect } from 'vitest';
import {
  getNavMode,
  getDefaultSidebarState,
  BREAKPOINTS,
  MEDIA_QUERIES,
  SIDEBAR_STORAGE_KEY,
  type NavMode,
} from './use-responsive-nav';

// ── getNavMode ───────────────────────────────────────────────

describe('getNavMode', () => {
  it('returns mobile for width 0', () => {
    expect(getNavMode(0)).toBe('mobile');
  });

  it('returns mobile for width 320', () => {
    expect(getNavMode(320)).toBe('mobile');
  });

  it('returns mobile for width 767 (just below tablet)', () => {
    expect(getNavMode(767)).toBe('mobile');
  });

  it('returns tablet at 768 (boundary)', () => {
    expect(getNavMode(768)).toBe('tablet');
  });

  it('returns tablet for width 800', () => {
    expect(getNavMode(800)).toBe('tablet');
  });

  it('returns tablet for width 1023 (just below desktop)', () => {
    expect(getNavMode(1023)).toBe('tablet');
  });

  it('returns desktop at 1024 (boundary)', () => {
    expect(getNavMode(1024)).toBe('desktop');
  });

  it('returns desktop for width 1440', () => {
    expect(getNavMode(1440)).toBe('desktop');
  });

  it('returns desktop for width 1920', () => {
    expect(getNavMode(1920)).toBe('desktop');
  });
});

// ── getDefaultSidebarState ───────────────────────────────────

describe('getDefaultSidebarState', () => {
  it('returns true (open) for desktop', () => {
    expect(getDefaultSidebarState('desktop')).toBe(true);
  });

  it('returns false (closed) for tablet', () => {
    expect(getDefaultSidebarState('tablet')).toBe(false);
  });

  it('returns false (closed) for mobile', () => {
    expect(getDefaultSidebarState('mobile')).toBe(false);
  });

  it('returns correct defaults for all modes', () => {
    const modes: NavMode[] = ['mobile', 'tablet', 'desktop'];
    const expected = [false, false, true];
    modes.forEach((mode, i) => {
      expect(getDefaultSidebarState(mode)).toBe(expected[i]);
    });
  });
});

// ── Constants ────────────────────────────────────────────────

describe('BREAKPOINTS', () => {
  it('tablet breakpoint is 768', () => {
    expect(BREAKPOINTS.TABLET).toBe(768);
  });

  it('desktop breakpoint is 1024', () => {
    expect(BREAKPOINTS.DESKTOP).toBe(1024);
  });
});

describe('MEDIA_QUERIES', () => {
  it('MOBILE query uses max-width: 767px', () => {
    expect(MEDIA_QUERIES.MOBILE).toBe('(max-width: 767px)');
  });

  it('TABLET query spans 768-1023', () => {
    expect(MEDIA_QUERIES.TABLET).toBe('(min-width: 768px) and (max-width: 1023px)');
  });

  it('DESKTOP query uses min-width: 1024px', () => {
    expect(MEDIA_QUERIES.DESKTOP).toBe('(min-width: 1024px)');
  });
});

describe('SIDEBAR_STORAGE_KEY', () => {
  it('is gem-sidebar-state', () => {
    expect(SIDEBAR_STORAGE_KEY).toBe('gem-sidebar-state');
  });
});
