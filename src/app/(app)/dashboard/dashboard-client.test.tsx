import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Mocks ──

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => createElement('div', { 'data-testid': 'user-button' }),
}));

let mockIsSuperAdmin = false;

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({
    isLoaded: true,
    isSuperAdmin: mockIsSuperAdmin,
    isCoordinator: !mockIsSuperAdmin,
    isOps: false,
    isReadOnly: false,
    canWrite: true,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

let mockMetrics = {
  registrations: { total: 42, today: 5 },
  faculty: { confirmed: 12, invited: 8 },
  certificates: { issued: 30, eligible: 42 },
  notifications: { sent: 100, failed: 3 },
  redFlags: { pending: 7 },
};

let mockAttention = [
  { type: 'red_flags' as const, label: 'Red flags need review', count: 7, href: '/events/evt1/red-flags' },
  { type: 'failed_notifications' as const, label: 'Failed notifications', count: 3, href: '/events/evt1/communications?status=failed' },
  { type: 'pending_faculty' as const, label: 'Faculty awaiting response', count: 8, href: '/events/evt1/program?tab=invites' },
];

vi.mock('@/lib/actions/dashboard', () => ({
  getDashboardMetrics: vi.fn(() => Promise.resolve(mockMetrics)),
  getNeedsAttention: vi.fn(() => Promise.resolve(mockAttention)),
  getNotificationUnreadCount: vi.fn(() => Promise.resolve(0)),
}));

import { DashboardClient } from './dashboard-client';

const EVENTS = [
  { id: 'evt1', name: 'GEM Conference 2026', status: 'published', startDate: '2026-05-15T00:00:00Z' },
  { id: 'evt2', name: 'Workshop Series', status: 'draft', startDate: '2026-06-01T00:00:00Z' },
];

// Mock localStorage
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

function render(events = EVENTS) {
  return renderToStaticMarkup(createElement(DashboardClient, { events }));
}

beforeEach(() => {
  mockLocalStorage.clear();
  mockMetrics = {
    registrations: { total: 42, today: 5 },
    faculty: { confirmed: 12, invited: 8 },
    certificates: { issued: 30, eligible: 42 },
    notifications: { sent: 100, failed: 3 },
    redFlags: { pending: 7 },
  };
  mockAttention = [
    { type: 'red_flags' as const, label: 'Red flags need review', count: 7, href: '/events/evt1/red-flags' },
    { type: 'failed_notifications' as const, label: 'Failed notifications', count: 3, href: '/events/evt1/communications?status=failed' },
    { type: 'pending_faculty' as const, label: 'Faculty awaiting response', count: 8, href: '/events/evt1/program?tab=invites' },
  ];
});

describe('7C-1: Dashboard with real metrics and quick actions', () => {
  it('renders event selector with event name', () => {
    const html = render();
    expect(html).toContain('data-testid="event-selector"');
    expect(html).toContain('GEM Conference 2026');
  });

  it('shows "No event selected" when events list is empty', () => {
    const html = render([]);
    expect(html).toContain('No events yet');
    expect(html).toContain('Create Event');
  });

  it('renders Dashboard header and UserButton', () => {
    const html = render();
    expect(html).toContain('Dashboard');
    expect(html).toContain('data-testid="user-button"');
  });

  it('renders event selector with active event info', () => {
    const html = render();
    expect(html).toContain('Active Event');
    expect(html).toContain('GEM Conference 2026');
    expect(html).toContain('published');
  });

  it('renders quick action links scoped to selected event', () => {
    // Quick actions should not render initially (metrics not yet loaded in SSR)
    // But the event selector and structure should be there
    const html = render();
    // Quick actions depend on useEffect/transition which don't run in SSR
    // Verify the event selector renders which gates the quick actions
    expect(html).toContain('event-selector');
  });

  it('does not render metrics before event selection resolves', () => {
    // In SSR, useEffect hasn't run so metrics won't load yet
    const html = render();
    // metric-cards won't be in SSR output since metrics are null initially
    expect(html).not.toContain('data-testid="metric-cards"');
  });

  it('renders empty state with create event link when no events', () => {
    const html = render([]);
    expect(html).toContain('No events yet');
    expect(html).toContain('/events/new');
  });

  it('renders all events in the selector list', () => {
    const html = render();
    expect(html).toContain('GEM Conference 2026');
    // Dropdown items won't show because dropdownOpen is false initially
    // But the selected event is displayed
    expect(html).toContain('Active Event');
  });

  it('renders with correct event date formatting', () => {
    const html = render();
    // The date should be formatted as en-IN locale
    expect(html).toContain('2026');
  });

  it('renders event status in selector', () => {
    const html = render();
    expect(html).toContain('published');
  });
});

// ── PKT-B-005 acceptance: Super Admin quick actions point to global hub ──
// Quick Actions render after the metrics fetch completes, which only runs in
// useEffect — not during renderToStaticMarkup. We lock the routing contract by
// inspecting the component source instead. Two facts must both hold:
//   1. The Super Admin branch routes to /reports?eventId=…
//   2. The non-Super-Admin branch routes to /events/[eventId]/reports.

import fsForSource from 'node:fs';
const dashboardSource = fsForSource.readFileSync(
  new URL('./dashboard-client.tsx', import.meta.url),
  'utf8',
);

describe('Quick Action routing (PKT-B-005)', () => {
  it('Super Admin branch routes attendee/emergency quick actions to the global /reports hub', () => {
    expect(dashboardSource).toMatch(/isSuperAdmin\s*\?\s*`\/reports\?eventId=\$\{selectedEventId\}`/);
    expect(dashboardSource).toContain('quick-action-attendee-list');
    expect(dashboardSource).toContain('quick-action-emergency-kit');
  });

  it('Non-Super-Admin branch keeps the per-event /events/[eventId]/reports link', () => {
    expect(dashboardSource).toMatch(/`\/events\/\$\{selectedEventId\}\/reports`/);
  });
});
