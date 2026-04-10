import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const mockUseResponsiveNav = vi.fn();
vi.mock('@/hooks/use-responsive-nav', () => ({
  useResponsiveNav: () => mockUseResponsiveNav(),
}));

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({ canWrite: true }),
}));

vi.mock('@/lib/actions/program', () => ({
  deleteSession: vi.fn(),
}));

import { SessionsManagerClient } from './sessions-manager-client';
import type { ScheduleSession, ConflictWarning } from '@/lib/actions/program';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeSession(overrides: Partial<ScheduleSession> = {}): ScheduleSession {
  return {
    id: 'session-1',
    title: 'Keynote: Opening Ceremony',
    description: null,
    sessionDate: new Date('2026-05-01T00:00:00Z'),
    startAtUtc: new Date('2026-05-01T09:00:00Z'),
    endAtUtc: new Date('2026-05-01T10:00:00Z'),
    hallId: 'hall-1',
    hallName: 'Main Hall',
    sessionType: 'keynote',
    track: null,
    isPublic: true,
    cmeCredits: null,
    sortOrder: 0,
    status: 'confirmed',
    parentSessionId: null,
    assignments: [],
    roleRequirements: [],
    childSessions: [],
    ...overrides,
  };
}

function desktopNav() {
  return {
    navMode: 'desktop' as const,
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    sidebarOpen: true,
    setSidebarOpen: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

function mobileNav() {
  return {
    navMode: 'mobile' as const,
    isMobile: true,
    isTablet: false,
    isDesktop: false,
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

function render(
  props: Partial<Parameters<typeof SessionsManagerClient>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(SessionsManagerClient, {
      eventId: EVENT_ID,
      sessions: [makeSession()],
      halls: [{ id: 'hall-1', name: 'Main Hall', capacity: '500', sortOrder: '0' }],
      conflicts: [],
      ...props,
    }),
  );
}

describe('SessionsManagerClient — responsive', () => {
  // ── Desktop: uses DetailView split layout ──

  it('renders session list inside DetailView on desktop', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render();
    expect(html).toContain('Keynote: Opening Ceremony');
    expect(html).toContain('Sessions');
  });

  it('shows empty detail placeholder when no session selected on desktop', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render();
    expect(html).toContain('Select a session');
  });

  it('renders session table with column headers on desktop', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render();
    expect(html).toContain('Title');
    expect(html).toContain('Hall');
    expect(html).toContain('Time');
    expect(html).toContain('Status');
  });

  // ── Mobile: full-screen list ──

  it('renders session cards on mobile without table headers', () => {
    mockUseResponsiveNav.mockReturnValue(mobileNav());
    const html = render();
    expect(html).toContain('Keynote: Opening Ceremony');
    // No table headers on mobile — uses card layout
    expect(html).not.toContain('<th');
  });

  it('does not show detail placeholder on mobile', () => {
    mockUseResponsiveNav.mockReturnValue(mobileNav());
    const html = render();
    expect(html).not.toContain('Select a session');
  });

  // ── Shared features ──

  it('renders search input', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render();
    expect(html).toContain('Search sessions');
  });

  it('renders conflict warnings banner when conflicts exist', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render({
      conflicts: [
        {
          type: 'hall_time_overlap',
          message: 'Main Hall: overlap between sessions',
          sessionIds: ['session-1', 'session-2'],
        },
      ],
    });
    expect(html).toContain('scheduling conflict');
    expect(html).toContain('Main Hall: overlap between sessions');
  });

  it('renders empty state when no sessions', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render({ sessions: [] });
    expect(html).toContain('No sessions found');
  });

  it('renders session date groupings', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render();
    expect(html).toContain('May');
  });

  it('displays hall name and time format in session listing', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render();
    expect(html).toContain('Main Hall');
    // Time is formatted via toLocaleTimeString('en-IN') — check HH:MM format present
    expect(html).toMatch(/\d{2}:\d{2}/);
  });

  it('uses fluid typography class on page heading', () => {
    mockUseResponsiveNav.mockReturnValue(desktopNav());
    const html = render();
    expect(html).toContain('text-fluid');
  });
});
