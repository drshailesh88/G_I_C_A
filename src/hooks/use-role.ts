'use client';

import { useUser } from '@clerk/nextjs';
import { ROLES, type RoleValue } from '@/lib/auth/roles';

const VALID_ROLE_VALUES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.OPS,
  ROLES.READ_ONLY,
]);

function normalizeAppRole(raw: unknown): RoleValue | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const prefixed = raw.startsWith('org:') ? raw : `org:${raw}`;
  return VALID_ROLE_VALUES.has(prefixed) ? (prefixed as RoleValue) : null;
}

export function useRole() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return {
      isLoaded: false,
      role: null as RoleValue | null,
      isSuperAdmin: false,
      isCoordinator: false,
      isOps: false,
      isReadOnly: false,
      canWrite: false,
    };
  }

  const role = normalizeAppRole((user?.publicMetadata as { appRole?: unknown } | undefined)?.appRole);
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;
  const isCoordinator = role === ROLES.EVENT_COORDINATOR;
  const isOps = role === ROLES.OPS;
  const isReadOnly = role === ROLES.READ_ONLY;

  return {
    isLoaded: true,
    role,
    isSuperAdmin,
    isCoordinator,
    isOps,
    isReadOnly,
    canWrite: isSuperAdmin || isCoordinator || isOps,
  };
}
