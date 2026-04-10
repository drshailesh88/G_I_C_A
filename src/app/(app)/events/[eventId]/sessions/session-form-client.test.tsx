import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Stub Next.js and Clerk dependencies
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) =>
    createElement('a', { href, className }, children),
}));
vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({ canWrite: true }),
}));
vi.mock('@/lib/actions/program', () => ({
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  createRoleRequirement: vi.fn(),
  updateRoleRequirement: vi.fn(),
  deleteRoleRequirement: vi.fn(),
}));

import { SessionFormClient } from './session-form-client';

const defaultProps = {
  eventId: 'evt-1',
  halls: [{ id: 'h1', name: 'Main Hall', capacity: '500', sortOrder: '1' }],
  parentSessions: [],
  mode: 'create' as const,
};

function render(props = {}) {
  return renderToStaticMarkup(createElement(SessionFormClient, { ...defaultProps, ...props }));
}

describe('SessionFormClient — responsive layout', () => {
  it('renders a FormGrid with mobile-first single-column grid', () => {
    const html = render();
    // FormGrid outputs grid-cols-1 (mobile) + md:grid-cols-2 (desktop)
    expect(html).toContain('grid-cols-1');
    expect(html).toContain('md:grid-cols-2');
  });

  it('title field spans full width (col-span-full)', () => {
    const html = render();
    // The title field wrapper should have col-span-full so it spans both columns
    expect(html).toContain('col-span-full');
  });

  it('description field spans full width', () => {
    const html = render();
    // Description/textarea wrapper should also span full width
    // We check that "Topic / Description" label is inside a col-span-full wrapper
    const descIdx = html.indexOf('Topic / Description');
    expect(descIdx).toBeGreaterThan(-1);
    // The col-span-full class should appear before the description label
    // (as part of its wrapping div)
    const precedingChunk = html.slice(Math.max(0, descIdx - 200), descIdx);
    expect(precedingChunk).toContain('col-span-full');
  });

  it('date and time fields are side-by-side (not col-span-full)', () => {
    const html = render();
    // Date label should exist and NOT be wrapped in col-span-full
    const dateIdx = html.indexOf('Date');
    expect(dateIdx).toBeGreaterThan(-1);
    // The date field's wrapper should not have col-span-full
    const dateChunk = html.slice(Math.max(0, dateIdx - 150), dateIdx);
    expect(dateChunk).not.toContain('col-span-full');
  });

  it('hall and session type fields are side-by-side', () => {
    const html = render();
    const hallIdx = html.indexOf('Hall');
    expect(hallIdx).toBeGreaterThan(-1);
    const hallChunk = html.slice(Math.max(0, hallIdx - 150), hallIdx);
    expect(hallChunk).not.toContain('col-span-full');
  });

  it('form inputs have min-h-[44px] touch targets', () => {
    const html = render();
    expect(html).toContain('min-h-[44px]');
  });

  it('does not use hardcoded grid-cols-2 without responsive prefix', () => {
    const html = render();
    // Should NOT contain bare "grid-cols-2" — only "md:grid-cols-2"
    // Split by md:grid-cols-2 first, then check remaining chunks
    const withoutResponsive = html.replace(/md:grid-cols-2/g, '');
    // The only grid-cols-2 that should remain is inside FormGrid (which uses sm: prefix)
    // Bare grid-cols-2 from the old layout should be gone
    expect(withoutResponsive).not.toContain('grid-cols-2');
  });

  it('uses gap-4 fluid spacing instead of gap-3', () => {
    const html = render();
    expect(html).toContain('gap-4');
  });
});
