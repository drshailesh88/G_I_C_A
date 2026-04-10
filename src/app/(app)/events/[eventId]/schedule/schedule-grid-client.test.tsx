import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── Mocks ──────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) =>
    createElement('a', { href: props.href, 'data-testid': 'link', className: props.className }, props.children as string),
}));

let mockNavMode: 'mobile' | 'tablet' | 'desktop' = 'mobile';
vi.mock('@/hooks/use-responsive-nav', () => ({
  useResponsiveNav: () => ({
    navMode: mockNavMode,
    isMobile: mockNavMode === 'mobile',
    isTablet: mockNavMode === 'tablet',
    isDesktop: mockNavMode === 'desktop',
    sidebarOpen: false,
    toggleSidebar: vi.fn(),
    setSidebarOpen: vi.fn(),
  }),
}));

// Mock localStorage
const store: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    length: 0,
    key: vi.fn(),
  },
  writable: true,
});

import {
  ScheduleGridClient,
  getHourHeight,
  SESSION_TYPE_COLORS,
  SESSION_TYPE_LABELS,
  formatTime,
} from './schedule-grid-client';
import type { ScheduleSession, ConflictWarning } from '@/lib/actions/program';

// ── Test Data ──────────────────────────────────────────────

const HALLS = [
  { id: 'h1', name: 'Hall A', capacity: '200', sortOrder: '1' },
  { id: 'h2', name: 'Hall B', capacity: '150', sortOrder: '2' },
  { id: 'h3', name: 'Hall C', capacity: '100', sortOrder: '3' },
];

function makeSession(overrides: Partial<ScheduleSession> = {}): ScheduleSession {
  return {
    id: 'sess-1',
    title: 'Opening Keynote',
    description: null,
    sessionDate: new Date('2026-05-15'),
    startAtUtc: new Date('2026-05-15T09:00:00Z'),
    endAtUtc: new Date('2026-05-15T10:00:00Z'),
    hallId: 'h1',
    hallName: 'Hall A',
    sessionType: 'keynote',
    track: null,
    isPublic: true,
    cmeCredits: null,
    sortOrder: 1,
    status: 'confirmed',
    parentSessionId: null,
    assignments: [],
    roleRequirements: [],
    childSessions: [],
    ...overrides,
  };
}

const EVENT_ID = 'evt-1';

function render(props: Partial<Parameters<typeof ScheduleGridClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ScheduleGridClient, {
      eventId: EVENT_ID,
      sessions: [],
      halls: HALLS,
      conflicts: [],
      ...props,
    }),
  );
}

beforeEach(() => {
  mockNavMode = 'mobile';
});

// ── Pure helpers ────────────────────────────────────────────

describe('getHourHeight', () => {
  it('returns 60 for mobile', () => {
    expect(getHourHeight('mobile')).toBe(60);
  });

  it('returns 70 for tablet', () => {
    expect(getHourHeight('tablet')).toBe(70);
  });

  it('returns 80 for desktop', () => {
    expect(getHourHeight('desktop')).toBe(80);
  });
});

describe('formatTime', () => {
  it('returns --:-- for null', () => {
    expect(formatTime(null)).toBe('--:--');
  });

  it('formats a date in 24h HH:MM', () => {
    const result = formatTime(new Date('2026-05-15T09:30:00Z'));
    // Should contain hour and minute separated by colon
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('SESSION_TYPE_COLORS', () => {
  it('has color classes for keynote', () => {
    expect(SESSION_TYPE_COLORS.keynote).toContain('purple');
  });

  it('has color classes for break', () => {
    expect(SESSION_TYPE_COLORS.break).toContain('gray');
  });
});

describe('SESSION_TYPE_LABELS', () => {
  it('maps keynote to Keynote', () => {
    expect(SESSION_TYPE_LABELS.keynote).toBe('Keynote');
  });

  it('maps free_paper to Free Papers', () => {
    expect(SESSION_TYPE_LABELS.free_paper).toBe('Free Papers');
  });
});

// ── Empty state ─────────────────────────────────────────────

describe('empty state', () => {
  it('shows empty message when no sessions', () => {
    const html = render({ sessions: [] });
    expect(html).toContain('No sessions for this day');
  });

  it('shows Add Session link', () => {
    const html = render({ sessions: [] });
    expect(html).toContain(`/events/${EVENT_ID}/sessions/new`);
  });
});

// ── Day tabs ────────────────────────────────────────────────

describe('day tabs', () => {
  it('renders day tabs for multi-day sessions', () => {
    const sessions = [
      makeSession({ id: 's1', sessionDate: new Date('2026-05-15') }),
      makeSession({ id: 's2', sessionDate: new Date('2026-05-16') }),
    ];
    const html = render({ sessions });
    expect(html).toContain('Day 1');
    expect(html).toContain('Day 2');
  });

  it('applies scroll-snap to day tab container', () => {
    const sessions = [
      makeSession({ id: 's1', sessionDate: new Date('2026-05-15') }),
      makeSession({ id: 's2', sessionDate: new Date('2026-05-16') }),
    ];
    const html = render({ sessions });
    expect(html).toContain('scroll-snap-type');
  });
});

// ── Mobile view ──────────────────────────────────────────────

describe('mobile view', () => {
  beforeEach(() => {
    mockNavMode = 'mobile';
  });

  it('renders data-testid schedule-grid-mobile', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('data-testid="schedule-grid-mobile"');
  });

  it('renders hall filter chips', () => {
    const sessions = [makeSession({ hallId: 'h1' })];
    const html = render({ sessions });
    expect(html).toContain('data-testid="hall-filter-chips"');
    expect(html).toContain('Hall A');
  });

  it('renders filter chips with horizontal scroll', () => {
    const sessions = [makeSession({ hallId: 'h1' })];
    const html = render({ sessions });
    expect(html).toContain('overflow-x-auto');
  });

  it('renders sessions as chronological agenda list', () => {
    const sessions = [
      makeSession({ id: 's1', title: 'Morning Talk', startAtUtc: new Date('2026-05-15T03:00:00Z') }),
      makeSession({ id: 's2', title: 'Afternoon Talk', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), hallId: 'h2' }),
    ];
    const html = render({ sessions });
    // Both sessions should appear
    expect(html).toContain('Morning Talk');
    expect(html).toContain('Afternoon Talk');
  });

  it('renders session cards with session type info', () => {
    const sessions = [makeSession({ sessionType: 'keynote' })];
    const html = render({ sessions });
    // Session type label visible in agenda card (rendered through className via our mock)
    expect(html).toContain('Keynote');
  });

  it('shows sticky time section headers', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('sticky');
    // Time label should appear (09:00 UTC = local time via getHours)
    expect(html).toMatch(/\d{2}:00/);
  });

  it('does not render desktop grid classes', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).not.toContain('data-testid="schedule-grid-desktop"');
  });

  it('does not render tablet view', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).not.toContain('data-testid="schedule-grid-tablet"');
  });
});

// ── Tablet view ──────────────────────────────────────────────

describe('tablet view', () => {
  beforeEach(() => {
    mockNavMode = 'tablet';
  });

  it('renders data-testid schedule-grid-tablet', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('data-testid="schedule-grid-tablet"');
  });

  it('renders hall columns with min-width 280px', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('min-width:280px');
  });

  it('has overflow-x-auto for horizontal scrolling', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('overflow-x-auto');
  });

  it('has scroll-snap-type on container', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('scroll-snap-type');
  });

  it('renders sticky time column', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('data-testid="time-column"');
  });

  it('renders sticky hall headers', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('Hall A');
    expect(html).toContain('Hall B');
  });

  it('uses HOUR_HEIGHT of 70px', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('70px');
  });
});

// ── Desktop view ─────────────────────────────────────────────

describe('desktop view', () => {
  beforeEach(() => {
    mockNavMode = 'desktop';
  });

  it('renders data-testid schedule-grid-desktop', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('data-testid="schedule-grid-desktop"');
  });

  it('uses CSS Grid layout', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('display:grid');
  });

  it('generates grid-template-columns with hall names', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    // Should have time column + hall columns
    expect(html).toContain('grid-template-columns');
  });

  it('uses HOUR_HEIGHT of 80px in grid rows', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    // HOUR_HEIGHT 80 / 2 = 40px per half-hour slot
    expect(html).toContain('40px');
  });

  it('renders all halls simultaneously', () => {
    const sessions = [
      makeSession({ id: 's1', hallId: 'h1' }),
      makeSession({ id: 's2', hallId: 'h2', title: 'Panel B' }),
      makeSession({ id: 's3', hallId: 'h3', title: 'Workshop C' }),
    ];
    const html = render({ sessions });
    expect(html).toContain('Hall A');
    expect(html).toContain('Hall B');
    expect(html).toContain('Hall C');
  });

  it('renders sticky header row with hall names', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('sticky');
    expect(html).toContain('Hall A');
  });

  it('positions sessions with grid-row', () => {
    const sessions = [makeSession()];
    const html = render({ sessions });
    expect(html).toContain('grid-row');
  });
});

// ── Conflict banner ──────────────────────────────────────────

describe('conflict banner', () => {
  it('renders conflict banner when conflicts exist', () => {
    const conflicts: ConflictWarning[] = [
      { type: 'hall_time_overlap', message: 'Hall A has overlap', sessionIds: ['s1', 's2'] },
    ];
    const html = render({ sessions: [makeSession()], conflicts });
    expect(html).toContain('Hall A has overlap');
  });

  it('shows count of additional conflicts', () => {
    const conflicts: ConflictWarning[] = [
      { type: 'hall_time_overlap', message: 'Conflict 1', sessionIds: ['s1'] },
      { type: 'faculty_double_booking', message: 'Conflict 2', sessionIds: ['s2'] },
      { type: 'hall_time_overlap', message: 'Conflict 3', sessionIds: ['s3'] },
    ];
    const html = render({ sessions: [makeSession()], conflicts });
    expect(html).toContain('+2 more');
  });

  it('does not render conflict banner when no conflicts', () => {
    const html = render({ sessions: [makeSession()], conflicts: [] });
    expect(html).not.toContain('data-testid="conflict-banner"');
  });
});

// ── Unassigned sessions ──────────────────────────────────────

describe('unassigned sessions', () => {
  it('shows unassigned section for sessions without hallId', () => {
    const sessions = [makeSession({ id: 's1', hallId: null, title: 'Unassigned Talk' })];
    const html = render({ sessions });
    expect(html).toContain('Unassigned to a Hall');
    expect(html).toContain('Unassigned Talk');
  });
});
