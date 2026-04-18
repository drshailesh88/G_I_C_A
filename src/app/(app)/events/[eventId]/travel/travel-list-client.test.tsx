import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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

// Mock logistics notifications (prevents DB initialization in tests)
vi.mock('@/lib/actions/logistics-notifications', () => ({
  getLastLogisticsNotification: vi.fn().mockResolvedValue(null),
  resendLogisticsNotification: vi.fn().mockResolvedValue({ status: 'sent' }),
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

function render(records: TravelRecord[] = [makeRecord()]) {
  return renderToStaticMarkup(
    createElement(TravelListClient, { eventId: 'evt-1', records })
  );
}

describe('TravelListClient — responsive', () => {
  describe('container query wrapper', () => {
    it('wraps list in a container query element', () => {
      const html = render();
      expect(html).toContain('container-type:inline-size');
    });
  });

  describe('card view (mobile)', () => {
    it('renders card with person name', () => {
      const html = render();
      expect(html).toContain('Alice Kumar');
    });

    it('renders departure and arrival dates on card', () => {
      const html = render();
      expect(html).toContain('May 1');
    });

    it('renders route on card', () => {
      const html = render();
      expect(html).toContain('Delhi');
      expect(html).toContain('Mumbai');
    });

    it('renders status badge on card', () => {
      const html = render();
      expect(html).toContain('Confirmed');
    });

    it('shows red flag count as badge on card when flags > 0', () => {
      const html = render([makeRecord({ flagCount: 3 })]);
      // Should show flag count badge
      expect(html).toContain('3');
      // Should have the alert triangle icon or flag indicator
      expect(html).toMatch(/flag|alert/i);
    });

    it('does not show flag badge on card when flagCount is 0', () => {
      const html = render([makeRecord({ flagCount: 0 })]);
      // The AlertTriangle should not appear for zero flags in card
      // We check that there's no flag badge element — 0 flags means no badge
      const flagBadgePattern = /bg-red.*?0/;
      expect(html).not.toMatch(flagBadgePattern);
    });
  });

  describe('table view (desktop)', () => {
    it('renders an HTML table', () => {
      const html = render();
      expect(html).toContain('<table');
      expect(html).toContain('<thead');
      expect(html).toContain('<tbody');
    });

    it('renders Name column header', () => {
      const html = render();
      expect(html).toContain('Name');
    });

    it('renders Status column header', () => {
      const html = render();
      expect(html).toContain('Status');
    });

    it('renders Flags column header', () => {
      const html = render();
      expect(html).toContain('Flags');
    });

    it('renders Route column header', () => {
      const html = render();
      expect(html).toContain('Route');
    });

    it('renders flight/service number in table', () => {
      const html = render();
      expect(html).toContain('AI-302');
    });

    it('renders PNR in table', () => {
      const html = render();
      expect(html).toContain('ABC123');
    });

    it('renders flag count in table flags column', () => {
      const html = render([makeRecord({ flagCount: 2 })]);
      expect(html).toContain('2');
    });
  });

  describe('empty state', () => {
    it('renders empty state when no records', () => {
      const html = render([]);
      expect(html).toContain('No travel records');
    });

    it('does not render table when no records', () => {
      const html = render([]);
      expect(html).not.toContain('<table');
    });
  });

  describe('cancelled records section', () => {
    it('separates active and cancelled records', () => {
      const html = render([
        makeRecord({ id: 'tr-1', recordStatus: 'confirmed' }),
        makeRecord({ id: 'tr-2', recordStatus: 'cancelled' }),
      ]);
      expect(html).toContain('Active');
      expect(html).toContain('Cancelled');
    });

    it('applies opacity to cancelled records', () => {
      const html = render([makeRecord({ recordStatus: 'cancelled' })]);
      expect(html).toContain('opacity-60');
    });
  });
});
