import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    createElement('a', { href }, children),
}));

vi.mock('@/hooks/use-role', () => ({
  useRole: () => ({ canWrite: true }),
}));

vi.mock('@/lib/actions/program', () => ({
  createFacultyInvite: vi.fn(),
}));

import { FacultyInviteClient } from './faculty-invite-client';

const INVITES = [
  {
    id: 'inv1',
    eventId: 'evt1',
    personId: 'person-abc-123-xyz',
    token: 'tok1',
    status: 'sent',
    sentAt: new Date('2026-01-15'),
    respondedAt: null,
  },
  {
    id: 'inv2',
    eventId: 'evt1',
    personId: 'person-def-456-uvw',
    token: 'tok2',
    status: 'accepted',
    sentAt: new Date('2026-01-10'),
    respondedAt: new Date('2026-01-12'),
  },
];

const SESSIONS = [
  {
    id: 'sess1',
    title: 'Opening Keynote',
    sessionDate: new Date('2026-05-15'),
    startAtUtc: new Date('2026-05-15T09:00:00Z'),
    endAtUtc: new Date('2026-05-15T10:00:00Z'),
    hallId: 'hall1',
    sessionType: 'keynote',
    parentSessionId: null,
  },
];

function render(props?: Partial<Parameters<typeof FacultyInviteClient>[0]>) {
  return renderToStaticMarkup(
    createElement(FacultyInviteClient, {
      eventId: 'evt1',
      invites: INVITES,
      sessions: SESSIONS,
      ...props,
    }),
  );
}

describe('FacultyInviteClient — responsive migration', () => {
  it('renders the FormGrid wrapper with 2-col responsive classes', () => {
    const html = render();
    // FormGrid default: grid-cols-1 + md:grid-cols-2
    expect(html).toContain('grid-cols-1');
    expect(html).toContain('md:grid-cols-2');
  });

  it('renders person ID input field with col-span-full for full-width', () => {
    const html = render();
    // The person ID input (faculty select) should span full width
    expect(html).toContain('Enter person UUID');
  });

  it('renders send button with col-span-full', () => {
    const html = render();
    expect(html).toContain('Send Invitation Email');
  });

  it('still renders the status summary grid', () => {
    const html = render();
    expect(html).toContain('Sent');
    expect(html).toContain('Accepted');
    expect(html).toContain('Declined');
  });

  it('still renders invites list', () => {
    const html = render();
    expect(html).toContain('person-a');  // truncated personId
  });

  it('renders header with title', () => {
    const html = render();
    expect(html).toContain('Invite Faculty');
  });

  it('renders with empty invites', () => {
    const html = render({ invites: [] });
    expect(html).toContain('No invitations found');
  });
});
