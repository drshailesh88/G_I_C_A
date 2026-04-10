/**
 * DRS-48: Accessibility pass — touch targets, focus, motion
 *
 * Tests for:
 * 1. Touch targets ≥ 44px (min-h-[44px] / min-w-[44px] classes)
 * 2. prefers-reduced-motion media query in globals.css
 * 3. Focus-visible states on interactive elements
 * 4. Color contrast (verified via globals.css token values)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function readSrc(relPath: string): string {
  return readFileSync(join(__dirname, relPath), 'utf-8');
}

// ── 1. globals.css — reduced motion + focus-visible base styles ──

describe('globals.css accessibility', () => {
  const css = readSrc('app/globals.css');

  it('includes prefers-reduced-motion media query', () => {
    expect(css).toContain('prefers-reduced-motion');
  });

  it('disables animations and transitions for reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*animation-duration:\s*0/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*transition-duration:\s*0/);
  });

  it('defines focus-visible base styles for interactive elements', () => {
    expect(css).toContain('focus-visible');
    expect(css).toMatch(/outline.*2px/);
  });
});

// ── 2. TabBar — touch targets + focus-visible ──

describe('TabBar accessibility', () => {
  const source = readSrc('components/tab-bar.tsx');

  it('tab links have ≥44px touch target height', () => {
    expect(source).toMatch(/min-h-\[44px\]|min-h-11/);
  });

  it('tab links have focus-visible ring', () => {
    expect(source).toContain('focus-visible:');
  });
});

// ── 3. ScanFeedback dismiss button — touch target ──

describe('ScanFeedback accessibility', () => {
  const source = readSrc('components/shared/ScanFeedback.tsx');

  it('dismiss button has ≥44px touch target', () => {
    expect(source).toMatch(/min-h-\[44px\].*min-w-\[44px\]|min-w-\[44px\].*min-h-\[44px\]/);
  });

  it('dismiss button has focus-visible ring', () => {
    expect(source).toContain('focus-visible:');
  });
});

// ── 4. CheckInSearch — touch targets + focus-visible ──

describe('CheckInSearch accessibility', () => {
  const source = readSrc('components/shared/CheckInSearch.tsx');

  it('search button has ≥44px touch target', () => {
    expect(source).toMatch(/min-h-\[44px\]/);
  });

  it('check-in button has ≥44px touch target', () => {
    // Both the search button and the check-in button need min touch targets
    const matches = source.match(/min-h-\[44px\]/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  it('input has ≥44px touch target', () => {
    // Input should also be at least 44px
    const matches = source.match(/min-h-\[44px\]/g);
    expect(matches?.length).toBeGreaterThanOrEqual(3);
  });

  it('interactive elements have focus-visible styles', () => {
    expect(source).toContain('focus-visible:');
  });
});

// ── 5. QrScanner retry button — touch target ──

describe('QrScanner accessibility', () => {
  const source = readSrc('components/shared/QrScanner.tsx');

  it('retry button has ≥44px touch target', () => {
    expect(source).toMatch(/min-h-\[44px\]/);
  });

  it('retry button has focus-visible ring', () => {
    expect(source).toContain('focus-visible:');
  });
});

// ── 6. FlagsDashboard — toggle touch targets + focus-visible ──

describe('FlagsDashboard accessibility', () => {
  const source = readSrc(
    'app/(app)/events/[eventId]/flags/flags-dashboard.tsx',
  );

  it('toggle switches have ≥44px touch target', () => {
    expect(source).toMatch(/min-h-\[44px\]/);
  });

  it('toggle switches have focus-visible ring', () => {
    expect(source).toContain('focus-visible:');
  });

  it('back link has ≥44px touch target', () => {
    // The back arrow link should have proper sizing
    expect(source).toMatch(/min-h-\[44px\].*min-w-\[44px\]|min-w-\[44px\].*min-h-\[44px\]/);
  });
});

// ── 7. useResponsiveNav — motion-safe awareness ──

describe('useResponsiveNav reduced-motion', () => {
  const source = readSrc('hooks/use-responsive-nav.ts');

  it('exports a prefersReducedMotion flag or checks the media query', () => {
    expect(source).toContain('prefers-reduced-motion');
  });
});
