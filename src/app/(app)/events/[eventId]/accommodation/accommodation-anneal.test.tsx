/**
 * Accommodation Anneal Tests — UI Red Flag Checkpoints
 *
 * CP-60: Flag types include accommodation-related types
 * CP-64: Flagged-only filter shows only flagged records
 * CP-65: Flag detail shows change description
 * CP-66: Flag age displays relative time (formatDistanceToNow)
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { publicMetadata: { appRole: 'super_admin' } },
    isLoaded: true,
  }),
}));
vi.mock('@/lib/actions/accommodation', () => ({
  cancelAccommodationRecord: vi.fn(),
}));
vi.mock('@/lib/actions/red-flag-actions', () => ({
  reviewFlag: vi.fn(),
  resolveFlag: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

import { AccommodationListClient } from './accommodation-list-client';
import { FLAG_TYPES } from '@/lib/cascade/red-flags';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeRecord(
  overrides: Partial<Parameters<typeof AccommodationListClient>[0]['records'][0]> = {},
) {
  return {
    id: 'rec-1',
    eventId: EVENT_ID,
    personId: 'person-1',
    hotelName: 'Taj Palace',
    hotelCity: 'New Delhi',
    roomType: 'Deluxe',
    roomNumber: '301',
    sharedRoomGroup: null,
    checkInDate: new Date('2026-04-10'),
    checkOutDate: new Date('2026-04-12'),
    recordStatus: 'confirmed',
    personName: 'Dr. Sharma',
    personEmail: 'sharma@example.com',
    personPhone: '+919876543210',
    ...overrides,
  };
}

function makeFlag(
  overrides: Partial<Parameters<typeof AccommodationListClient>[0]['flags'][0]> = {},
) {
  return {
    id: 'flag-1',
    flagType: 'accommodation_change',
    flagDetail: 'Accommodation updated: hotelName changed from Taj to Oberoi',
    flagStatus: 'unreviewed',
    targetEntityId: 'rec-1',
    createdAt: new Date('2026-04-08T10:00:00Z'),
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  };
}

function render(props: Partial<Parameters<typeof AccommodationListClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(AccommodationListClient, {
      eventId: EVENT_ID,
      records: [makeRecord()],
      flags: [],
      flaggedIds: [],
      ...props,
    }),
  );
}

// ── CP-60: Flag types include accommodation-related types ───
describe('CP-60: accommodation flag types defined', () => {
  it('FLAG_TYPES includes accommodation_change', () => {
    expect(FLAG_TYPES).toContain('accommodation_change');
  });

  it('FLAG_TYPES includes accommodation_cancelled', () => {
    expect(FLAG_TYPES).toContain('accommodation_cancelled');
  });

  it('FLAG_TYPES includes shared_room_affected', () => {
    expect(FLAG_TYPES).toContain('shared_room_affected');
  });
});

// ── CP-64: Flagged-only filter shows only flagged records ───
describe('CP-64: flagged-only toggle', () => {
  it('renders Show flagged only button when flaggedIds exist', () => {
    const html = render({
      records: [
        makeRecord({ id: 'rec-1' }),
        makeRecord({ id: 'rec-2', personName: 'Dr. Patel' }),
      ],
      flags: [makeFlag({ targetEntityId: 'rec-1' })],
      flaggedIds: ['rec-1'],
    });
    expect(html).toContain('Show flagged only');
    expect(html).toContain('(1)');
  });

  it('does not render toggle when no flagged records', () => {
    const html = render({
      records: [makeRecord()],
      flags: [],
      flaggedIds: [],
    });
    expect(html).not.toContain('Show flagged only');
  });
});

// ── CP-65: Flag detail shows change description ─────────────
describe('CP-65: flag detail shows change description', () => {
  it('renders flag detail text in the flag badge', () => {
    const html = render({
      records: [makeRecord()],
      flags: [makeFlag({
        flagDetail: 'Accommodation updated: hotelName changed from Taj to Oberoi',
      })],
      flaggedIds: ['rec-1'],
    });
    expect(html).toContain('Accommodation updated: hotelName changed from Taj to Oberoi');
  });

  it('renders different detail text for each flag', () => {
    const html = render({
      records: [makeRecord()],
      flags: [
        makeFlag({
          id: 'flag-1',
          flagDetail: 'Hotel changed',
        }),
        makeFlag({
          id: 'flag-2',
          flagDetail: 'Check-in date changed',
        }),
      ],
      flaggedIds: ['rec-1'],
    });
    expect(html).toContain('Hotel changed');
    expect(html).toContain('Check-in date changed');
  });
});

// ── CP-66: Flag age displays relative time ──────────────────
describe('CP-66: flag age displays relative time', () => {
  it('renders relative time from createdAt via formatDistanceToNow', () => {
    // Create a flag from 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const html = render({
      records: [makeRecord()],
      flags: [makeFlag({ createdAt: twoHoursAgo })],
      flaggedIds: ['rec-1'],
    });
    // formatDistanceToNow with addSuffix:true produces "about 2 hours ago" or "2 hours ago"
    expect(html).toMatch(/hours? ago/);
  });

  it('renders "minutes ago" for recent flags', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const html = render({
      records: [makeRecord()],
      flags: [makeFlag({ createdAt: fiveMinutesAgo })],
      flaggedIds: ['rec-1'],
    });
    expect(html).toMatch(/minutes? ago/);
  });
});

// ── Flag status styling ─────────────────────────────────────
describe('Flag status styling', () => {
  it('renders unreviewed flags with red styling', () => {
    const html = render({
      records: [makeRecord()],
      flags: [makeFlag({ flagStatus: 'unreviewed' })],
      flaggedIds: ['rec-1'],
    });
    expect(html).toContain('bg-red-100');
    expect(html).toContain('text-red-700');
  });

  it('renders reviewed flags with amber styling', () => {
    const html = render({
      records: [makeRecord()],
      flags: [makeFlag({ flagStatus: 'reviewed' })],
      flaggedIds: ['rec-1'],
    });
    expect(html).toContain('bg-amber-100');
    expect(html).toContain('text-amber-700');
  });

  it('shows Mark Reviewed button for unreviewed flags', () => {
    const html = render({
      records: [makeRecord()],
      flags: [makeFlag({ flagStatus: 'unreviewed' })],
      flaggedIds: ['rec-1'],
    });
    expect(html).toContain('Mark Reviewed');
  });

  it('shows Resolve button for unreviewed and reviewed flags', () => {
    const html = render({
      records: [makeRecord()],
      flags: [makeFlag({ flagStatus: 'unreviewed' })],
      flaggedIds: ['rec-1'],
    });
    expect(html).toContain('Resolve');
  });
});
