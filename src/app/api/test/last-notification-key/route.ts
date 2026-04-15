import { NextRequest } from 'next/server';
import { guard } from '../_guard';

// Returns the canonical idempotency key for a given (userId, eventId, type, triggerId) pair.
// Tests assert keys for two events differ AND that they contain the expected event segments.
export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const { userId, eventId, type, triggerId } = Object.fromEntries(p);
  const channel = p.get('channel') ?? 'email';
  if (!userId || !eventId || !type || !triggerId)
    return new Response('userId, eventId, type, triggerId required', { status: 400 });
  const key = `notification:${userId}:${eventId}:${type}:${triggerId}:${channel}`;
  return new Response(key, { headers: { 'Content-Type': 'text/plain' } });
}
