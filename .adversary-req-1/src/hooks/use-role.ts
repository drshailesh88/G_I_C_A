'use client';

import { useAuth } from '@clerk/nextjs';
import { ROLES } from '@/lib/auth/roles';

export function useRole() {
  const { has, isLoaded } = useAuth();

  if (!isLoaded) {
    return {
      isLoaded: false,
      isSuperAdmin: false,
      isCoordinator: false,
      isOps: false,
      isReadOnly: false,
      canWrite: false,
    };
  }

  const isSuperAdmin = has?.({ role: ROLES.SUPER_ADMIN }) ?? false;
  const isCoordinator = has?.({ role: ROLES.EVENT_COORDINATOR }) ?? false;
  const isOps = has?.({ role: ROLES.OPS }) ?? false;
  const isReadOnly = has?.({ role: ROLES.READ_ONLY }) ?? false;

  return {
    isLoaded: true,
    isSuperAdmin,
    isCoordinator,
    isOps,
    isReadOnly,
    canWrite: isSuperAdmin || isCoordinator || isOps,
  };
}
