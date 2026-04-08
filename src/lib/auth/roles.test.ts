import { describe, it, expect } from 'vitest';
import { ROLES, TAB_ACCESS } from './roles';

describe('ROLES', () => {
  it('defines all four roles', () => {
    expect(ROLES.SUPER_ADMIN).toBe('org:super_admin');
    expect(ROLES.EVENT_COORDINATOR).toBe('org:event_coordinator');
    expect(ROLES.OPS).toBe('org:ops');
    expect(ROLES.READ_ONLY).toBe('org:read_only');
  });
});

describe('TAB_ACCESS', () => {
  it('grants all roles access to HOME', () => {
    expect(TAB_ACCESS.HOME).toContain(ROLES.SUPER_ADMIN);
    expect(TAB_ACCESS.HOME).toContain(ROLES.OPS);
    expect(TAB_ACCESS.HOME).toContain(ROLES.READ_ONLY);
  });

  it('hides EVENTS, PEOPLE, PROGRAM from Ops role', () => {
    expect(TAB_ACCESS.EVENTS).not.toContain(ROLES.OPS);
    expect(TAB_ACCESS.PEOPLE).not.toContain(ROLES.OPS);
    expect(TAB_ACCESS.PROGRAM).not.toContain(ROLES.OPS);
  });

  it('shows MORE to all roles', () => {
    expect(TAB_ACCESS.MORE).toContain(ROLES.SUPER_ADMIN);
    expect(TAB_ACCESS.MORE).toContain(ROLES.OPS);
    expect(TAB_ACCESS.MORE).toContain(ROLES.READ_ONLY);
  });
});
