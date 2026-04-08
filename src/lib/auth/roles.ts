// Role definitions matching Clerk org roles
export const ROLES = {
  SUPER_ADMIN: 'org:super_admin',
  EVENT_COORDINATOR: 'org:event_coordinator',
  OPS: 'org:ops',
  READ_ONLY: 'org:read_only',
} as const;

export type RoleKey = keyof typeof ROLES;
export type RoleValue = (typeof ROLES)[RoleKey];

// Tab visibility per role
export const TAB_ACCESS: Record<string, RoleValue[]> = {
  HOME: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.OPS, ROLES.READ_ONLY],
  EVENTS: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  PEOPLE: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  PROGRAM: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.READ_ONLY],
  MORE: [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.OPS, ROLES.READ_ONLY],
};
