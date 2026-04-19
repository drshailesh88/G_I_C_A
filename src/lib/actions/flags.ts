'use server';

import { auth } from '@clerk/nextjs/server';
import {
  createFlagService,
  GLOBAL_FLAGS,
  EVENT_FLAGS,
  type GlobalFlag,
  type EventFlag,
} from '@/lib/flags';
import { ROLES } from '@/lib/auth/roles';

// ── Role guard — only Super Admin can toggle flags ──────────

async function assertSuperAdmin(): Promise<string> {
  const session = await auth();
  const userId = session.userId;
  if (!userId) throw new Error('Unauthorized');

  const isSuperAdmin = session.has?.({ role: ROLES.SUPER_ADMIN }) ?? false;
  if (!isSuperAdmin) {
    throw new Error('Forbidden: only Super Admin can manage feature flags');
  }

  return userId;
}

// ── Get all flags for admin UI ──────────────────────────────

export async function getGlobalFlags() {
  await assertSuperAdmin();

  const svc = createFlagService();
  return svc.getAllGlobalFlags();
}

export async function getEventFlags(eventId: string) {
  await assertSuperAdmin();

  const svc = createFlagService();
  return svc.getAllEventFlags(eventId);
}

// ── Toggle a global flag (Super Admin only) ─────────────────

export async function toggleGlobalFlag(flag: string, enabled: boolean) {
  await assertSuperAdmin();

  if (!GLOBAL_FLAGS.includes(flag as GlobalFlag)) {
    throw new Error(`Invalid global flag: ${flag}`);
  }

  const svc = createFlagService();
  await svc.setGlobalFlag(flag as GlobalFlag, enabled);

  return { flag, enabled };
}

// ── Toggle an event flag (Super Admin only) ─────────────────

export async function toggleEventFlag(eventId: string, flag: string, enabled: boolean) {
  await assertSuperAdmin();

  if (!EVENT_FLAGS.includes(flag as EventFlag)) {
    throw new Error(`Invalid event flag: ${flag}`);
  }

  const svc = createFlagService();
  await svc.setEventFlag(eventId, flag as EventFlag, enabled);

  return { eventId, flag, enabled };
}
