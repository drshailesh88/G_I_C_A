import { describe, it, expect } from 'vitest';
import { ROLES, TAB_ACCESS } from './roles';

describe('ROLES — gap tests', () => {
  it('exactly 4 roles defined', () => {
    expect(Object.keys(ROLES)).toHaveLength(4);
  });
});

describe('TAB_ACCESS — gap tests', () => {
  it('EVENTS accessible to super_admin', () => {
    expect(TAB_ACCESS.EVENTS).toContain(ROLES.SUPER_ADMIN);
  });

  it('EVENTS accessible to event_coordinator', () => {
    expect(TAB_ACCESS.EVENTS).toContain(ROLES.EVENT_COORDINATOR);
  });

  it('EVENTS accessible to read_only', () => {
    expect(TAB_ACCESS.EVENTS).toContain(ROLES.READ_ONLY);
  });

  it('HOME tab accessible to all 4 roles', () => {
    expect(TAB_ACCESS.HOME).toHaveLength(4);
  });
});
