'use server';

import { auth } from '@clerk/nextjs/server';
import { reviewRedFlag, resolveRedFlag } from '@/lib/cascade/red-flags';

export async function reviewFlag(eventId: string, flagId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');
  return reviewRedFlag(eventId, flagId, userId);
}

export async function resolveFlag(eventId: string, flagId: string, resolutionNote?: string) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');
  return resolveRedFlag(eventId, flagId, userId, resolutionNote);
}
