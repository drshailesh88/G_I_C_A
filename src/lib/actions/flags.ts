'use server';

import { auth } from '@clerk/nextjs/server';
import {
  createFlagService,
  GLOBAL_FLAGS,
  EVENT_FLAGS,
  type GlobalFlag,
  type EventFlag,
} from '@/lib/flags';

// ── Get all flags for admin UI ──────────────────────────────

export async function getGlobalFlags() {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const svc = createFlagService();
  return svc.getAllGlobalFlags();
}

export async function getEventFlags(eventId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const svc = createFlagService();
  return svc.getAllEventFlags(eventId);
}

// ── Toggle a global flag ────────────────────────────────────

export async function toggleGlobalFlag(flag: string, enabled: boolean) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  if (!GLOBAL_FLAGS.includes(flag as GlobalFlag)) {
    throw new Error(`Invalid global flag: ${flag}`);
  }

  const svc = createFlagService();
  await svc.setGlobalFlag(flag as GlobalFlag, enabled);

  return { flag, enabled };
}

// ── Toggle an event flag ────────────────────────────────────

export async function toggleEventFlag(eventId: string, flag: string, enabled: boolean) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  if (!EVENT_FLAGS.includes(flag as EventFlag)) {
    throw new Error(`Invalid event flag: ${flag}`);
  }

  const svc = createFlagService();
  await svc.setEventFlag(eventId, flag as EventFlag, enabled);

  return { eventId, flag, enabled };
}
