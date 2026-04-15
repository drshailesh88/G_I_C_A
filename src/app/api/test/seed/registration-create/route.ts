import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import { eventPeople } from '@/lib/db/schema/event-people';
import { and, eq } from 'drizzle-orm';
import { emitCascadeEvent } from '@/lib/cascade/emit';
import { guard } from '../../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { eventId, personId } = await req.json();
  if (!eventId || !personId) return NextResponse.json({ error: 'eventId + personId required' }, { status: 400 });
  const [ep] = await db.select().from(eventPeople)
    .where(and(eq(eventPeople.eventId, eventId), eq(eventPeople.personId, personId))).limit(1);
  if (!ep) await db.insert(eventPeople).values({ eventId, personId, source: 'registration' });
  const [row] = await db.insert(eventRegistrations).values({
    eventId,
    personId,
    status: 'confirmed',
    createdBy: 'system:test',
    updatedBy: 'system:test',
  } as any).returning({ id: eventRegistrations.id });
  // NOTE: no registration.created cascade event type defined yet — skip emit.
  void emitCascadeEvent; // keep import under use for future wiring
  return NextResponse.json({ ok: true, registrationId: row.id });
}
