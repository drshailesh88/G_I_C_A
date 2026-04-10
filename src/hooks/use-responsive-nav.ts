'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Constants ────────────────────────────────────────────────

export const BREAKPOINTS = {
  TABLET: 768,
  DESKTOP: 1024,
} as const;

export const MEDIA_QUERIES = {
  MOBILE: `(max-width: ${BREAKPOINTS.TABLET - 1}px)`,
  TABLET: `(min-width: ${BREAKPOINTS.TABLET}px) and (max-width: ${BREAKPOINTS.DESKTOP - 1}px)`,
  DESKTOP: `(min-width: ${BREAKPOINTS.DESKTOP}px)`,
} as const;

export const SIDEBAR_STORAGE_KEY = 'gem-sidebar-state';

export type NavMode = 'mobile' | 'tablet' | 'desktop';

// ── Pure helpers (exported for testing) ──────────────────────

/** Determine nav mode from window width */
export function getNavMode(width: number): NavMode {
  if (width >= BREAKPOINTS.DESKTOP) return 'desktop';
  if (width >= BREAKPOINTS.TABLET) return 'tablet';
  return 'mobile';
}

/** Default sidebar state per nav mode */
export function getDefaultSidebarState(mode: NavMode): boolean {
  return mode === 'desktop';
}

// ── Hook ─────────────────────────────────────────────────────

export function useResponsiveNav() {
  const [navMode, setNavMode] = useState<NavMode>(() => {
    if (typeof window === 'undefined') return 'mobile';
    return getNavMode(window.innerWidth);
  });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;

    const mode = getNavMode(window.innerWidth);

    // Only desktop persists sidebar state to localStorage
    if (mode === 'desktop') {
      try {
        const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (stored !== null) return stored === 'true';
      } catch {
        // localStorage unavailable (SSR, incognito, etc.)
      }
      return true; // desktop default = open
    }

    return false; // tablet/mobile default = closed
  });

  // Persist desktop sidebar state to localStorage
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (navMode === 'desktop') {
        try {
          localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
        } catch {
          // localStorage unavailable
        }
      }
      return next;
    });
  }, [navMode]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    if (navMode === 'desktop') {
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, 'false');
      } catch {
        // localStorage unavailable
      }
    }
  }, [navMode]);

  // Listen to matchMedia changes (not resize events)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const desktopMql = window.matchMedia(MEDIA_QUERIES.DESKTOP);
    const tabletMql = window.matchMedia(MEDIA_QUERIES.TABLET);
    const reducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');

    function update() {
      let mode: NavMode;
      if (desktopMql.matches) {
        mode = 'desktop';
      } else if (tabletMql.matches) {
        mode = 'tablet';
      } else {
        mode = 'mobile';
      }

      setNavMode((prevMode) => {
        if (prevMode === mode) return prevMode;

        // When mode changes, reset sidebar to default for that mode
        // except desktop which restores from localStorage
        if (mode === 'desktop') {
          try {
            const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
            setSidebarOpen(stored !== null ? stored === 'true' : true);
          } catch {
            setSidebarOpen(true);
          }
        } else {
          setSidebarOpen(false);
        }

        return mode;
      });
    }

    function updateReducedMotion() {
      setPrefersReducedMotion(reducedMotionMql.matches);
    }

    desktopMql.addEventListener('change', update);
    tabletMql.addEventListener('change', update);
    reducedMotionMql.addEventListener('change', updateReducedMotion);

    return () => {
      desktopMql.removeEventListener('change', update);
      tabletMql.removeEventListener('change', update);
      reducedMotionMql.removeEventListener('change', updateReducedMotion);
    };
  }, []);

  return {
    navMode,
    sidebarOpen,
    isSidebarOpen: sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    closeSidebar,
    prefersReducedMotion,
    isMobile: navMode === 'mobile',
    isTablet: navMode === 'tablet',
    isDesktop: navMode === 'desktop',
  };
}
