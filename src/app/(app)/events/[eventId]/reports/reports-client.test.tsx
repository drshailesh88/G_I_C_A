import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Mocks ──

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ has: () => false, isLoaded: true }),
}));

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({
    isLoaded: true,
    isSuperAdmin: false,
    isCoordinator: true,
    isOps: false,
    isReadOnly: false,
    canWrite: true,
  }),
}));

import { ReportsClient } from './reports-client';

function render() {
  return renderToStaticMarkup(createElement(ReportsClient, { eventId: 'evt1' }));
}

describe('DRS-29: Responsive reports-client', () => {
  it('wraps export cards in ResponsiveMetricGrid', () => {
    const html = render();
    // ResponsiveMetricGrid renders a grid div with auto-fit minmax
    expect(html).toContain('repeat(auto-fit, minmax(min(100%, 240px), 1fr))');
  });

  it('renders all 6 export type cards plus archive and emergency kit', () => {
    const html = render();
    expect(html).toContain('Attendee List');
    expect(html).toContain('Travel Roster');
    expect(html).toContain('Rooming List');
    expect(html).toContain('Transport Plan');
    expect(html).toContain('Faculty Responsibilities');
    expect(html).toContain('Attendance Report');
    expect(html).toContain('Event Archive');
    expect(html).toContain('Emergency Kit');
  });

  it('all buttons have min-height of 44px for touch targets', () => {
    const html = render();
    // All buttons should have min-h-[44px] or equivalent touch target class
    const buttonMatches = html.match(/<button[^>]*>/g) || [];
    expect(buttonMatches.length).toBeGreaterThanOrEqual(8); // 6 exports + archive + emergency
    for (const btn of buttonMatches) {
      expect(btn).toContain('min-h-[44px]');
    }
  });

  it('uses fluid typography for the page heading', () => {
    const html = render();
    // Should use responsive text size class instead of fixed text-2xl
    expect(html).toContain('text-xl');
    expect(html).toContain('sm:text-2xl');
  });

  it('uses fluid spacing on the card container', () => {
    const html = render();
    // The outer wrapper should use responsive spacing
    expect(html).toContain('space-y-4');
    expect(html).toContain('sm:space-y-6');
  });
});
