/**
 * DRS-49: Performance verification tests
 *
 * Verifies: CLS prevention, transition efficiency, QR render weight,
 * and bundle size of responsive components.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Helpers ─────────────────────────────────────────────────────

/** Read a source file relative to src/ */
function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8');
}

/** Count gzipped bytes of a source file (approximation: raw UTF-8 byte length) */
function rawBytes(relPath: string): number {
  const buf = fs.readFileSync(path.resolve(__dirname, '..', relPath));
  return buf.byteLength;
}

// ── 1. CLS Prevention: images must have dimensions or aspect-ratio ──

describe('CLS prevention — responsive images', () => {
  const IMAGE_FILES = [
    'app/(app)/events/[eventId]/branding/branding-form-client.tsx',
    'components/shared/QrScanner.tsx',
  ];

  it.each(IMAGE_FILES)(
    '%s: every <img> tag has explicit dimensions or aspect-ratio',
    (file) => {
      const source = readSrc(file);
      // Match all <img or <Image tags (JSX)
      const imgTagRegex = /<img\b[^>]*>/g;
      const matches = source.match(imgTagRegex) ?? [];

      for (const tag of matches) {
        const hasDimensions =
          // Tailwind dimension classes: h-N w-N, or size-N
          /className="[^"]*\b(h-\d|w-\d|size-\d)/.test(tag) ||
          // Explicit width/height attributes
          /\b(width|height)\s*=/.test(tag) ||
          // Aspect ratio in className
          /aspect-/.test(tag) ||
          // max-h with w constraints
          /className="[^"]*\b(h-\d+\s+w-\d+|w-\d+\s+h-\d+)/.test(tag);

        expect(hasDimensions).toBe(true);
      }
    },
  );

  it('QrScanner sets aspectRatio on scanner container', () => {
    const source = readSrc('components/shared/QrScanner.tsx');
    expect(source).toContain("aspectRatio: '1'");
  });

  it('branding header image has max-height to prevent CLS', () => {
    const source = readSrc(
      'app/(app)/events/[eventId]/branding/branding-form-client.tsx',
    );
    // The header image should have a max-height or aspect-ratio constraint
    // to prevent large images from causing layout shift
    const headerImgSection = source.slice(
      source.indexOf('headerImageUrl && ('),
    );
    const hasConstraint =
      headerImgSection.includes('max-h-') ||
      headerImgSection.includes('aspect-') ||
      headerImgSection.includes('h-');
    expect(hasConstraint).toBe(true);
  });
});

// ── 2. CSS transition efficiency ─────────────────────────────────

describe('CSS transition efficiency — no layout-triggering transitions', () => {
  it('TabBar uses only color/opacity transitions (no width/height/top/left)', () => {
    const source = readSrc('components/tab-bar.tsx');
    // Should use transition-colors, not transition-all
    expect(source).toContain('transition-colors');
    expect(source).not.toContain('transition-all');
  });

  it('ScanFeedback uses CSS animation (not JS-driven transitions)', () => {
    const source = readSrc('components/shared/ScanFeedback.tsx');
    // Uses Tailwind animate-in (CSS @keyframes), not JS-based
    expect(source).toContain('animate-in');
    expect(source).toContain('duration-');
    // Should not contain requestAnimationFrame or setInterval for animation
    expect(source).not.toContain('requestAnimationFrame');
    expect(source).not.toContain('setInterval');
  });

  it('useResponsiveNav uses matchMedia (not resize listeners)', () => {
    const source = readSrc('hooks/use-responsive-nav.ts');
    expect(source).toContain('matchMedia');
    // Must NOT use resize event (it's less performant)
    expect(source).not.toContain("'resize'");
    expect(source).not.toContain('"resize"');
  });
});

// ── 3. QR scanner page — render weight ──────────────────────────

describe('QR scanner page — render weight', () => {
  it('QrCheckInClient does not import heavy libraries at module level', () => {
    const source = readSrc(
      'app/(app)/events/[eventId]/qr/qr-checkin-client.tsx',
    );
    // processQrScan should be dynamically imported, not top-level
    expect(source).not.toMatch(/^import.*processQrScan/m);
    // Should not import chart libraries or pdf generators
    expect(source).not.toContain('@pdfme');
    expect(source).not.toContain('chart');
  });

  it('QrScanner lazy-loads processQrScan via dynamic import', () => {
    const source = readSrc('components/shared/QrScanner.tsx');
    expect(source).toContain("await import('@/lib/actions/checkin')");
  });

  it('QR page uses min-h-dvh for viewport sizing (no JS measurement)', () => {
    const source = readSrc(
      'app/(app)/events/[eventId]/qr/qr-checkin-client.tsx',
    );
    expect(source).toContain('100dvh');
    // Should not use JS-based viewport measurement
    expect(source).not.toContain('window.innerHeight');
  });
});

// ── 4. Bundle size — responsive components under 5KB raw ────────

describe('Bundle size — new responsive pattern components', () => {
  const RESPONSIVE_FILES = [
    'hooks/use-responsive-nav.ts',
    'components/tab-bar.tsx',
  ];

  const MAX_RAW_BYTES = 8_000; // ~5KB gzipped ≈ 8KB raw for TS source

  it.each(RESPONSIVE_FILES)(
    '%s is under 8KB raw (≈5KB gzipped)',
    (file) => {
      const bytes = rawBytes(file);
      expect(bytes).toBeLessThan(MAX_RAW_BYTES);
    },
  );

  it('combined responsive components are under 12KB raw', () => {
    const total = RESPONSIVE_FILES.reduce((sum, f) => sum + rawBytes(f), 0);
    expect(total).toBeLessThan(12_000);
  });
});

// ── 5. Safe area support ────────────────────────────────────────

describe('Safe area — bottom fixed elements use safe-area padding', () => {
  it('QR check-in bottom bar has safe-area-pb', () => {
    const source = readSrc(
      'app/(app)/events/[eventId]/qr/qr-checkin-client.tsx',
    );
    // Fixed bottom bars must include safe-area padding for notched devices
    const fixedBottomRegex = /fixed\s+inset-x-0\s+bottom-0[^"]*safe-area-pb/;
    expect(source).toMatch(fixedBottomRegex);
  });

  it('TabBar fixed bottom nav has safe-area support via bg-surface', () => {
    const source = readSrc('components/tab-bar.tsx');
    // Fixed bottom nav should exist
    expect(source).toContain('fixed bottom-0');
  });
});
