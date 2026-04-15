import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { travelRecords } from '@/lib/db/schema/logistics';
import { eventPeople } from '@/lib/db/schema/event-people';
import { and, eq } from 'drizzle-orm';
import { emitCascadeEvent } from '@/lib/cascade/emit';
import { guard } from '../../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { eventId, personId, mode = 'flight' } = await req.json();
  if (!eventId || !personId) return NextResponse.json({ error: 'eventId + personId required' }, { status: 400 });

  // Ensure event_people link exists (auto-upsert)
  const [existing] = await db.select().from(eventPeople)
    .where(and(eq(eventPeople.eventId, eventId), eq(eventPeople.personId, personId))).limit(1);
  if (!existing) await db.insert(eventPeople).values({ eventId, personId, source: 'travel' });

  const [row] = await db.insert(travelRecords).values({
    eventId,
    personId,
    travelMode: mode,
    direction: 'arrival',
    status: 'scheduled',
    createdBy: 'system:test',
    updatedBy: 'system:test',
  } as any).returning({ id: travelRecords.id });

  await emitCascadeEvent('conference/travel.saved', eventId, { type: 'system', id: 'system:test' }, {
    travelId: row.id, personId, changes: { created: true },
  });

  return NextResponse.json({ ok: true, travelId: row.id });
}
