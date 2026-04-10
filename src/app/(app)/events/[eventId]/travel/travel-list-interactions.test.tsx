import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Mock next/link to render a plain anchor
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; className?: string }) =>
    createElement('a', { href, ...props }, children),
}));

// Mock the cancel action
vi.mock('@/lib/actions/travel', () => ({
  cancelTravelRecord: vi.fn(),
}));

import { TravelListClient } from './travel-list-client';

type TravelRecord = Parameters<typeof TravelListClient>[0]['records'][number];

function makeRecord(overrides: Partial<TravelRecord> = {}): TravelRecord {
  return {
    id: 'tr-1',
    eventId: 'evt-1',
    personId: 'p-1',
    direction: 'inbound',
    travelMode: 'flight',
    fromCity: 'Delhi',
    toCity: 'Mumbai',
    departureAtUtc: new Date('2026-05-01T10:00:00Z'),
    arrivalAtUtc: new Date('2026-05-01T12:30:00Z'),
    pnrOrBookingRef: 'ABC123',
    recordStatus: 'confirmed',
    personName: 'Alice Kumar',
    personEmail: 'alice@test.com',
    personPhone: '+919876543210',
    carrierName: 'Air India',
    serviceNumber: 'AI-302',
    registrationId: null,
    fromLocation: null,
    toLocation: null,
    terminalOrGate: null,
    cancelledAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    flagCount: 0,
    ...overrides,
  };
}

function render(records: TravelRecord[] = [makeRecord()], eventId = 'evt-1') {
  return renderToStaticMarkup(
    createElement(TravelListClient, { eventId, records }),
  );
}

describe('Travel List — Navigation Links', () => {
  it('CP-01: Back arrow links to /events/:eventId', () => {
    const html = render();
    expect(html).toContain('href="/events/evt-1"');
  });

  it('CP-02: Add button links to /events/:eventId/travel/new', () => {
    const html = render();
    expect(html).toContain('href="/events/evt-1/travel/new"');
  });

  it('CP-03: Card links to /events/:eventId/travel/:recordId', () => {
    const html = render();
    expect(html).toContain('href="/events/evt-1/travel/tr-1"');
  });

  it('CP-04: Empty state CTA links to /events/:eventId/travel/new', () => {
    const html = render([]);
    expect(html).toContain('href="/events/evt-1/travel/new"');
    expect(html).toContain('Add Travel Record');
  });
});

describe('Travel List — Status Badge Colors', () => {
  it('CP-05: Draft badge uses amber classes', () => {
    const html = render([makeRecord({ recordStatus: 'draft' })]);
    expect(html).toContain('bg-amber-100');
    expect(html).toContain('Draft');
  });

  it('CP-06: Confirmed badge uses green classes', () => {
    const html = render([makeRecord({ recordStatus: 'confirmed' })]);
    expect(html).toContain('bg-green-100');
    expect(html).toContain('Confirmed');
  });

  it('CP-07: Sent badge uses blue classes', () => {
    const html = render([makeRecord({ recordStatus: 'sent' })]);
    expect(html).toContain('bg-blue-100');
    expect(html).toContain('Sent');
  });

  it('CP-08: Changed badge uses orange classes', () => {
    const html = render([makeRecord({ recordStatus: 'changed' })]);
    expect(html).toContain('bg-orange-100');
    expect(html).toContain('Changed');
  });

  it('CP-09: Cancelled badge uses red classes', () => {
    const html = render([makeRecord({ recordStatus: 'cancelled' })]);
    expect(html).toContain('bg-red-100');
    expect(html).toContain('Cancelled');
  });
});

describe('Travel List — Cancel Flow', () => {
  it('CP-10: Cancel button present on active cards', () => {
    const html = render([makeRecord({ recordStatus: 'confirmed' })]);
    expect(html).toContain('Cancel');
    // The word "Cancel" as the button text (not "Cancelled" as badge)
    expect(html).toMatch(/class="[^"]*text-red-500[^"]*"[^>]*>Cancel</);
  });

  it('CP-11: Cancel button absent on cancelled cards', () => {
    const html = render([makeRecord({ recordStatus: 'cancelled' })]);
    // Should NOT have the red cancel button text — only the "Cancelled" badge
    expect(html).not.toMatch(/class="[^"]*text-red-500[^"]*"[^>]*>Cancel</);
  });
});

describe('Travel List — Section Counts', () => {
  it('CP-12: Active section shows correct count', () => {
    const html = render([
      makeRecord({ id: 'tr-1', recordStatus: 'confirmed' }),
      makeRecord({ id: 'tr-2', recordStatus: 'draft' }),
    ]);
    expect(html).toContain('Active (2)');
  });

  it('CP-13: Cancelled section shows correct count', () => {
    const html = render([
      makeRecord({ id: 'tr-1', recordStatus: 'confirmed' }),
      makeRecord({ id: 'tr-2', recordStatus: 'cancelled' }),
      makeRecord({ id: 'tr-3', recordStatus: 'cancelled' }),
    ]);
    expect(html).toContain('Cancelled (2)');
  });
});

describe('Travel List — Direction Labels', () => {
  it('CP-14: Direction displays capitalized label (Inbound not inbound)', () => {
    const html = render([makeRecord({ direction: 'inbound' })]);
    expect(html).toContain('Inbound');
  });
});
