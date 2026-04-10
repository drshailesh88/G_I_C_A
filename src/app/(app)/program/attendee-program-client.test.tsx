import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

import { AttendeeProgram } from './attendee-program-client';

const SESSIONS = [
  {
    id: 's1',
    title: 'Opening Keynote',
    description: 'Welcome address',
    sessionDate: new Date('2026-05-15'),
    startAtUtc: new Date('2026-05-15T09:00:00Z'),
    endAtUtc: new Date('2026-05-15T10:00:00Z'),
    hallName: 'Hall A',
    sessionType: 'keynote',
    track: null,
    cmeCredits: 1,
    assignments: [{ personId: 'p1', role: 'speaker', presentationTitle: null }],
    childSessions: [],
  },
];

const HALLS = [{ id: 'h1', name: 'Hall A', sortOrder: '1' }];

function render(sessions = SESSIONS, halls = HALLS) {
  return renderToStaticMarkup(
    createElement(AttendeeProgram, { eventId: 'evt1', sessions, halls }),
  );
}

describe('AttendeeProgram responsive migration', () => {
  it('uses fluid font-size tokens', () => {
    const html = render();
    expect(html).toContain('var(--font-size-');
  });

  it('uses fluid spacing tokens', () => {
    const html = render();
    expect(html).toContain('var(--space-');
  });

  it('still renders session data correctly', () => {
    const html = render();
    expect(html).toContain('Opening Keynote');
    expect(html).toContain('Scientific Program');
  });

  it('renders empty state for no sessions on a day', () => {
    const html = render([]);
    expect(html).toContain('Scientific Program');
  });
});
