'use client';

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className, 'data-testid': testId }: any) =>
    createElement('a', { href, className, 'data-testid': testId }, children),
}));
vi.mock('@/hooks/use-responsive-nav', () => ({
  useResponsiveNav: () => ({ navMode: 'desktop', isMobile: false, isDesktop: true }),
}));

import { ScheduleGridClient } from './schedule-grid-client';
import type { ScheduleSession, ConflictWarning } from '@/lib/actions/program';

const EVENT_ID = 'evt-001';

function makeSession(id: string): ScheduleSession {
  return {
    id,
    title: `Session ${id}`,
    description: null,
    sessionDate: new Date('2026-05-10'),
    startAtUtc: new Date('2026-05-10T09:00:00Z'),
    endAtUtc: new Date('2026-05-10T10:00:00Z'),
    hallId: 'h1',
    hallName: 'Main Hall',
    sessionType: 'keynote',
    track: null,
    isPublic: true,
    cmeCredits: null,
    sortOrder: 0,
    status: 'draft',
    parentSessionId: null,
    childSessions: [],
    assignments: [],
    roleRequirements: [],
  };
}

function makeConflict(sessionIds: string[], message = 'Faculty double-booking detected'): ConflictWarning {
  return { type: 'faculty_double_booking', message, sessionIds };
}

const HALLS = [{ id: 'h1', name: 'Main Hall', capacity: '500', sortOrder: '1' }];

function render(conflicts: ConflictWarning[], sessions: ScheduleSession[] = []) {
  return renderToStaticMarkup(
    createElement(ScheduleGridClient, { eventId: EVENT_ID, sessions, halls: HALLS, conflicts }),
  );
}

describe('ScheduleGridClient — conflict Fix CTA', () => {
  it('shows Fix CTA when conflict has two sessionIds', () => {
    const html = render([makeConflict(['s1', 's2'])]);
    expect(html).toContain('data-testid="conflict-fix-cta"');
    expect(html).toContain('Fix');
  });

  it('Fix CTA href targets the second conflicting session with ?conflict=true', () => {
    const html = render([makeConflict(['s1', 's2'])]);
    expect(html).toContain(`/events/${EVENT_ID}/sessions/s2?conflict=true`);
  });

  it('does not show Fix CTA when conflict has only one sessionId', () => {
    const html = render([makeConflict(['s1'])]);
    expect(html).not.toContain('data-testid="conflict-fix-cta"');
  });

  it('shows conflict banner with message', () => {
    const html = render([makeConflict(['s1', 's2'], 'Dr. Smith is double-booked')]);
    expect(html).toContain('data-testid="conflict-banner"');
    expect(html).toContain('Dr. Smith is double-booked');
  });

  it('shows +N more count when multiple conflicts exist', () => {
    const conflicts = [makeConflict(['s1', 's2']), makeConflict(['s3', 's4'])];
    const html = render(conflicts);
    expect(html).toContain('+1 more');
  });

  it('does not render conflict banner when no conflicts', () => {
    const html = render([]);
    expect(html).not.toContain('data-testid="conflict-banner"');
  });
});
