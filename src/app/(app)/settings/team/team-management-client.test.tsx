import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('@/lib/actions/team', () => ({
  inviteTeamMember: vi.fn(),
  changeMemberRole: vi.fn(),
  removeTeamMember: vi.fn(),
  getTeamMembers: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/actions/team-utils', () => ({
  getRoleLabel: (role: string) => role,
}));

vi.mock('@/lib/auth/roles', () => ({
  ROLES: {
    SUPER_ADMIN: 'org:super_admin',
    EVENT_COORDINATOR: 'org:event_coordinator',
    OPS: 'org:ops',
    READ_ONLY: 'org:read_only',
  },
}));

import { TeamManagementClient } from './team-management-client';

const MEMBERS = [
  {
    userId: 'u1',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    imageUrl: '',
    role: 'org:super_admin',
    createdAt: Date.now(),
  },
  {
    userId: 'u2',
    email: 'ops@example.com',
    firstName: 'Ops',
    lastName: 'Person',
    imageUrl: '',
    role: 'org:ops',
    createdAt: Date.now(),
  },
];

function render(members = MEMBERS, currentUserId = 'u1') {
  return renderToStaticMarkup(
    createElement(TeamManagementClient, { initialMembers: members, currentUserId }),
  );
}

describe('TeamManagementClient responsive migration', () => {
  it('uses fluid font-size tokens', () => {
    const html = render();
    expect(html).toContain('var(--font-size-');
  });

  it('uses fluid spacing tokens', () => {
    const html = render();
    expect(html).toContain('var(--space-');
  });

  it('uses fluid gap for member list layout', () => {
    const html = render();
    expect(html).toContain('gap:var(--space-');
  });

  it('still renders member data correctly', () => {
    const html = render();
    expect(html).toContain('Admin User');
    expect(html).toContain('ops@example.com');
  });

  it('renders empty state when no members', () => {
    const html = render([]);
    expect(html).toContain('No team members yet');
  });
});
