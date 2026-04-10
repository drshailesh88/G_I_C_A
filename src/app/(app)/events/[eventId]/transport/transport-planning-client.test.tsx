import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Mocks ──

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Mock useResponsiveNav — default to mobile
let mockNavMode: 'mobile' | 'tablet' | 'desktop' = 'mobile';

vi.mock('@/hooks/use-responsive-nav', () => ({
  useResponsiveNav: () => ({
    navMode: mockNavMode,
    isMobile: mockNavMode === 'mobile',
    isTablet: mockNavMode === 'tablet',
    isDesktop: mockNavMode === 'desktop',
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    toggleSidebar: vi.fn(),
  }),
}));

import { TransportPlanningClient } from './transport-planning-client';

const EVENT_ID = 'evt-1';

const BATCHES = [
  {
    id: 'b1',
    eventId: EVENT_ID,
    movementType: 'arrival',
    batchSource: 'manual',
    serviceDate: new Date('2026-05-15'),
    timeWindowStart: new Date('2026-05-15T08:00:00'),
    timeWindowEnd: new Date('2026-05-15T10:00:00'),
    sourceCity: 'Mumbai',
    pickupHub: 'CSIA T2',
    pickupHubType: 'airport',
    dropHub: 'Taj Hotel',
    dropHubType: 'hotel',
    batchStatus: 'planned',
    notes: null,
  },
  {
    id: 'b2',
    eventId: EVENT_ID,
    movementType: 'departure',
    batchSource: 'manual',
    serviceDate: new Date('2026-05-15'),
    timeWindowStart: new Date('2026-05-15T14:00:00'),
    timeWindowEnd: new Date('2026-05-15T16:00:00'),
    sourceCity: 'Mumbai',
    pickupHub: 'Taj Hotel',
    pickupHubType: 'hotel',
    dropHub: 'CSIA T2',
    dropHubType: 'airport',
    batchStatus: 'ready',
    notes: 'VIP batch',
  },
];

function render(batches = BATCHES) {
  return renderToStaticMarkup(
    createElement(TransportPlanningClient, { eventId: EVENT_ID, batches }),
  );
}

beforeEach(() => {
  mockNavMode = 'mobile';
});

// ── Mobile: card view ──

describe('TransportPlanningClient — mobile (card view)', () => {
  beforeEach(() => {
    mockNavMode = 'mobile';
  });

  it('renders card layout on mobile', () => {
    const html = render();
    expect(html).toContain('data-testid="transport-cards"');
  });

  it('does not render table on mobile', () => {
    const html = render();
    expect(html).not.toContain('data-testid="transport-table"');
  });

  it('renders batch route in card', () => {
    const html = render();
    expect(html).toContain('CSIA T2');
    expect(html).toContain('Taj Hotel');
  });

  it('renders status badge in card', () => {
    const html = render();
    expect(html).toContain('Planned');
  });

  it('renders movement type in card', () => {
    const html = render();
    expect(html).toContain('Arrival');
  });
});

// ── Desktop: table view ──

describe('TransportPlanningClient — desktop (table view)', () => {
  beforeEach(() => {
    mockNavMode = 'desktop';
  });

  it('renders table layout on desktop', () => {
    const html = render();
    expect(html).toContain('data-testid="transport-table"');
  });

  it('does not render cards on desktop', () => {
    const html = render();
    expect(html).not.toContain('data-testid="transport-cards"');
  });

  it('renders table headers', () => {
    const html = render();
    expect(html).toContain('Route');
    expect(html).toContain('Status');
    expect(html).toContain('Time');
  });

  it('renders batch data in table rows', () => {
    const html = render();
    expect(html).toContain('CSIA T2');
    expect(html).toContain('Taj Hotel');
    expect(html).toContain('Planned');
    expect(html).toContain('Ready');
  });

  it('renders movement type column', () => {
    const html = render();
    expect(html).toContain('Arrival');
    expect(html).toContain('Departure');
  });

  it('renders city column on desktop', () => {
    const html = render();
    expect(html).toContain('Mumbai');
  });
});

// ── Empty state ──

describe('TransportPlanningClient — empty state', () => {
  it('renders empty state when no batches on mobile', () => {
    mockNavMode = 'mobile';
    const html = render([]);
    expect(html).toContain('No transport batches');
  });

  it('renders empty state when no batches on desktop', () => {
    mockNavMode = 'desktop';
    const html = render([]);
    expect(html).toContain('No transport batches');
  });
});

// ── Shared elements ──

describe('TransportPlanningClient — shared elements', () => {
  it('renders header with back link and title', () => {
    const html = render();
    expect(html).toContain('Transport');
    expect(html).toContain(`/events/${EVENT_ID}`);
  });

  it('renders New Batch button', () => {
    const html = render();
    expect(html).toContain('New Batch');
  });

  it('renders date group headings', () => {
    const html = render();
    // The grouped heading for May 15, 2026
    expect(html).toContain('2026');
  });
});
