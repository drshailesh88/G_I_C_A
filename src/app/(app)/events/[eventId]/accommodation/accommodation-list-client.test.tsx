import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockCanWrite = vi.hoisted(() => ({ value: true }));

vi.mock('@/lib/actions/accommodation', () => ({
  cancelAccommodationRecord: vi.fn(),
}));

// Mock logistics notifications (prevents DB initialization in tests)
vi.mock('@/lib/actions/logistics-notifications', () => ({
  getLastLogisticsNotification: vi.fn().mockResolvedValue(null),
  resendLogisticsNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
}));
vi.mock('@/lib/actions/red-flag-actions', () => ({
  reviewFlag: vi.fn(),
  resolveFlag: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({
    isLoaded: true,
    isSuperAdmin: false,
    isCoordinator: false,
    isOps: false,
    isReadOnly: !mockCanWrite.value,
    canWrite: mockCanWrite.value,
  }),
}));

import { AccommodationListClient } from './accommodation-list-client';

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
    flagType: 'date_overlap',
    flagDetail: 'Check-in overlaps with another booking',
    flagStatus: 'unreviewed',
    targetEntityId: 'rec-1',
    createdAt: new Date('2026-04-08'),
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

describe('AccommodationListClient', () => {
  describe('responsive layout', () => {
    it('renders a mobile card view container with md:hidden', () => {
      const html = render();
      // Mobile card view should be hidden on md+ screens
      expect(html).toContain('md:hidden');
    });

    it('renders a desktop table view container with hidden md:block', () => {
      const html = render();
      // Desktop table should be hidden on mobile, visible on md+
      expect(html).toContain('hidden md:block');
    });

    it('renders both card and table views for the same records', () => {
      const html = render({
        records: [makeRecord({ id: 'rec-1', personName: 'Dr. Sharma' })],
      });
      // Person name should appear twice: once in card, once in table row
      const nameCount = (html.match(/Dr\. Sharma/g) || []).length;
      expect(nameCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('mobile card view', () => {
    it('shows person name and hotel on cards', () => {
      const html = render();
      expect(html).toContain('Dr. Sharma');
      expect(html).toContain('Taj Palace');
    });

    it('shows check-in/out dates on cards', () => {
      const html = render();
      expect(html).toContain('Apr 10');
      expect(html).toContain('Apr 12');
    });
  });

  describe('desktop table view', () => {
    it('renders table column headers: Name, Hotel, Dates, Room, Status', () => {
      const html = render();
      expect(html).toContain('Name');
      expect(html).toContain('Hotel');
      expect(html).toContain('Dates');
      expect(html).toContain('Room');
      expect(html).toContain('Status');
    });

    it('renders record data in the table', () => {
      const html = render({
        records: [
          makeRecord({
            personName: 'Dr. Patel',
            hotelName: 'Grand Hyatt',
            roomType: 'Suite',
            roomNumber: '505',
          }),
        ],
      });
      expect(html).toContain('Dr. Patel');
      expect(html).toContain('Grand Hyatt');
      expect(html).toContain('Suite');
      expect(html).toContain('505');
    });

    it('renders flags in desktop view', () => {
      const flag = makeFlag();
      const html = render({
        records: [makeRecord()],
        flags: [flag],
        flaggedIds: ['rec-1'],
      });
      expect(html).toContain('Check-in overlaps with another booking');
    });
  });

  describe('empty state', () => {
    it('shows empty state when no records', () => {
      const html = render({ records: [] });
      expect(html).toContain('No accommodation records');
    });
  });

  describe('cancelled records section', () => {
    it('renders cancelled records separately with opacity', () => {
      const html = render({
        records: [
          makeRecord({ id: 'rec-active', recordStatus: 'confirmed' }),
          makeRecord({ id: 'rec-cancelled', recordStatus: 'cancelled', personName: 'Dr. Cancelled' }),
        ],
      });
      expect(html).toContain('Active');
      expect(html).toContain('Cancelled');
      expect(html).toContain('Dr. Cancelled');
    });
  });

  describe('read_only disabled buttons', () => {
    it('renders Add button as disabled with aria-disabled for read_only', () => {
      mockCanWrite.value = false;
      const html = render();
      expect(html).toContain('aria-disabled="true"');
      expect(html).toMatch(/<button[^>]*disabled[^>]*>[^]*?Add/);
      mockCanWrite.value = true;
    });

    it('renders Cancel button as disabled with aria-disabled for read_only', () => {
      mockCanWrite.value = false;
      const html = render();
      const cancelMatch = html.match(/<button[^>]*aria-disabled="true"[^>]*>[^<]*Cancel/);
      expect(cancelMatch).not.toBeNull();
      mockCanWrite.value = true;
    });

    it('renders row resend trigger as disabled for read_only', () => {
      mockCanWrite.value = false;
      const html = render();
      expect(html).toContain('data-testid="row-actions-trigger"');
      expect(html).toContain('disabled=""');
      mockCanWrite.value = true;
    });

    it('renders Add as a link for writable roles', () => {
      mockCanWrite.value = true;
      const html = render();
      expect(html).toContain('accommodation/new');
      const addDisabled = html.match(/<button[^>]*aria-disabled="true"[^>]*>[^]*?Add/);
      expect(addDisabled).toBeNull();
    });

    it('renders empty-state Add button as disabled for read_only', () => {
      mockCanWrite.value = false;
      const html = render({ records: [] });
      expect(html).toContain('aria-disabled="true"');
      expect(html).toMatch(/<button[^>]*disabled[^>]*>[^]*?Add Accommodation/);
      mockCanWrite.value = true;
    });
  });
});
