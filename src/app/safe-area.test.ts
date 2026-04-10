import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(relPath: string): string {
  return readFileSync(resolve(__dirname, '..', relPath), 'utf-8');
}

// ── 1. Global CSS safe-area utilities ───────────────────────────

describe('globals.css safe-area utilities', () => {
  const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf-8');

  it('defines safe-area-pb utility with env(safe-area-inset-bottom)', () => {
    expect(css).toContain('safe-area-inset-bottom');
  });

  it('defines safe-area-pl utility with env(safe-area-inset-left)', () => {
    expect(css).toContain('safe-area-inset-left');
  });

  it('defines safe-area-pr utility with env(safe-area-inset-right)', () => {
    expect(css).toContain('safe-area-inset-right');
  });

  it('defines safe-area-pt utility with env(safe-area-inset-top)', () => {
    expect(css).toContain('safe-area-inset-top');
  });
});

// ── 2. Viewport-fit=cover in root layout ────────────────────────

describe('root layout viewport-fit', () => {
  const layout = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf-8');

  it('exports viewport config with viewport-fit=cover', () => {
    expect(layout).toContain('viewport-fit=cover');
  });
});

// ── 3. Fixed elements have safe-area classes ────────────────────

describe('tab-bar safe area', () => {
  const tabBar = readSrc('components/tab-bar.tsx');

  it('has safe-area-pb class on fixed bottom nav', () => {
    expect(tabBar).toContain('safe-area-pb');
  });

  it('has safe-area-pl and safe-area-pr for landscape notch', () => {
    expect(tabBar).toContain('safe-area-pl');
    expect(tabBar).toContain('safe-area-pr');
  });
});

describe('qr-checkin bottom bar safe area', () => {
  const qr = readSrc('app/(app)/events/[eventId]/qr/qr-checkin-client.tsx');

  it('has safe-area-pb class on fixed bottom bar', () => {
    expect(qr).toContain('safe-area-pb');
  });

  it('has safe-area-pl and safe-area-pr for landscape notch', () => {
    expect(qr).toContain('safe-area-pl');
    expect(qr).toContain('safe-area-pr');
  });
});

describe('certificates modal safe area', () => {
  const certs = readSrc('app/(app)/events/[eventId]/certificates/certificates-client.tsx');

  it('has safe-area padding on modal overlay', () => {
    expect(certs).toContain('safe-area-insets');
  });
});

// ── 4. Foldable media query ─────────────────────────────────────

describe('foldable device support', () => {
  const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf-8');

  it('has horizontal-viewport-segments media query', () => {
    expect(css).toContain('horizontal-viewport-segments: 2');
  });

  it('defines foldable-left-pane utility', () => {
    expect(css).toContain('foldable-left-pane');
  });

  it('defines foldable-right-pane utility', () => {
    expect(css).toContain('foldable-right-pane');
  });
});

describe('people list uses foldable layout', () => {
  const people = readSrc('app/(app)/people/people-list-client.tsx');

  it('has foldable-left-pane class on list container', () => {
    expect(people).toContain('foldable-left-pane');
  });
});

describe('registrations list uses foldable layout', () => {
  const regs = readSrc('app/(app)/events/[eventId]/registrations/registrations-list-client.tsx');

  it('has foldable-left-pane class on list container', () => {
    expect(regs).toContain('foldable-left-pane');
  });
});
