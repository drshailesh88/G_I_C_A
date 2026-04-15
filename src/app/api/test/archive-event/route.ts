import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { events } from '@/lib/db/schema/events';
import { guard } from '../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { eventId, state = 'archived' } = await req.json();
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  const archivedAt = state === 'archived' ? new Date() : null;
  const [row] = await db.update(events)
    .set({ status: state, archivedAt, updatedAt: new Date(), updatedBy: 'system:test' })
    .where(eq(events.id, eventId))
    .returning({ id: events.id, status: events.status });
  return NextResponse.json({ ok: true, id: row?.id, status: row?.status });
}
