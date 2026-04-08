'use server';

import { assertEventAccess } from '@/lib/auth/event-access';
import { reviewRedFlag, resolveRedFlag } from '@/lib/cascade/red-flags';

export async function reviewFlag(eventId: string, flagId: string) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  return reviewRedFlag(eventId, flagId, userId);
}

export async function resolveFlag(eventId: string, flagId: string, resolutionNote?: string) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  return resolveRedFlag(eventId, flagId, userId, resolutionNote);
}
