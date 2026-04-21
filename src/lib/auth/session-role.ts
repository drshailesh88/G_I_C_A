import { ROLES, type RoleValue } from './roles';

const VALID_ROLE_VALUES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.OPS,
  ROLES.READ_ONLY,
]);

type SessionLike = {
  sessionClaims?: Record<string, unknown> | null;
} | null | undefined;

export function getAppRoleFromSession(session: SessionLike): RoleValue | null {
  const claims = session?.sessionClaims;
  const metadata = claims?.metadata as { appRole?: unknown } | undefined;
  const raw = metadata?.appRole;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const prefixed = raw.startsWith('org:') ? raw : `org:${raw}`;
  return VALID_ROLE_VALUES.has(prefixed) ? (prefixed as RoleValue) : null;
}

export function sessionHasRole(session: SessionLike, role: RoleValue | string): boolean {
  return getAppRoleFromSession(session) === role;
}

export function sessionHasAnyRole(session: SessionLike, roles: readonly (RoleValue | string)[]): boolean {
  const role = getAppRoleFromSession(session);
  return role !== null && roles.includes(role);
}
