import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Mocks ──

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({ canWrite: true }),
}));

vi.mock('@/lib/actions/registration', () => ({
  updateRegistrationStatus: vi.fn(),
}));

import { RegistrationsListClient } from './registrations-list-client';

const REGISTRATIONS = [
  {
    id: 'r1',
    eventId: 'e1',
    personId: 'p1',
    registrationNumber: 'REG-001',
    category: 'delegate',
    age: 35,
    status: 'confirmed',
    qrCodeToken: 'qr1',
    registeredAt: new Date('2026-03-01'),
    cancelledAt: null,
    personName: 'Alice Smith',
    personEmail: 'alice@example.com',
    personPhone: '+919876543210',
    personOrganization: 'IIT Delhi',
  },
  {
    id: 'r2',
    eventId: 'e1',
    personId: 'p2',
    registrationNumber: 'REG-002',
    category: 'faculty',
    age: 42,
    status: 'pending',
    qrCodeToken: 'qr2',
    registeredAt: new Date('2026-03-05'),
    cancelledAt: null,
    personName: 'Bob Jones',
    personEmail: 'bob@example.com',
    personPhone: null,
    personOrganization: null,
  },
  {
    id: 'r3',
    eventId: 'e1',
    personId: 'p3',
    registrationNumber: 'REG-003',
    category: 'delegate',
    age: 28,
    status: 'waitlisted',
    qrCodeToken: 'qr3',
    registeredAt: new Date('2026-03-10'),
    cancelledAt: null,
    personName: 'Carol Lee',
    personEmail: null,
    personPhone: null,
    personOrganization: 'AIIMS',
  },
];

function render(
  overrides: Partial<Parameters<typeof RegistrationsListClient>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(RegistrationsListClient, {
      eventId: 'e1',
      registrations: REGISTRATIONS,
      ...overrides,
    }),
  );
}

describe('RegistrationsListClient responsive migration', () => {
  // ── ResponsiveMetricGrid (summary cards) ──

  it('uses ResponsiveMetricGrid for summary cards (no hardcoded grid-cols-3)', () => {
    const html = render();
    // ResponsiveMetricGrid uses inline style with auto-fit, not grid-cols-3
    expect(html).toContain('auto-fit');
    expect(html).not.toContain('grid-cols-3');
  });

  it('renders status counts in summary cards', () => {
    const html = render();
    expect(html).toContain('confirmed');
    expect(html).toContain('pending');
    expect(html).toContain('waitlisted');
  });

  // ── ResponsiveList ──

  it('uses ResponsiveList with container query wrapper', () => {
    const html = render();
    expect(html).toContain('container-type');
  });

  it('renders registration cards with name and status', () => {
    const html = render();
    expect(html).toContain('Alice Smith');
    expect(html).toContain('Bob Jones');
    expect(html).toContain('Carol Lee');
  });

  it('renders table view with column headers for desktop', () => {
    const html = render();
    expect(html).toContain('<table');
    expect(html).toContain('Name');
    expect(html).toContain('Status');
  });

  it('renders category column as medium priority (visible in table)', () => {
    const html = render();
    expect(html).toContain('delegate');
    expect(html).toContain('faculty');
  });

  it('renders registration date in table', () => {
    const html = render();
    // Date should be rendered somewhere (card or table)
    expect(html).toContain('Mar');
  });

  // ── Empty state ──

  it('shows empty state when no registrations match', () => {
    const html = render({ registrations: [] });
    expect(html).toContain('No registrations');
  });

  // ── Search + filters ──

  it('renders search input', () => {
    const html = render();
    expect(html).toContain('Search');
  });

  it('renders status filter pills', () => {
    const html = render();
    expect(html).toContain('all');
    expect(html).toContain('pending');
    expect(html).toContain('confirmed');
  });

  // ── Touch targets ──

  it('action buttons have minimum 44px touch targets', () => {
    const html = render();
    expect(html).toContain('min-h-[44px]');
  });

  // ── Card links ──

  it('card links point to person detail page', () => {
    const html = render();
    expect(html).toContain('/people/p1');
    expect(html).toContain('/people/p2');
  });
});
