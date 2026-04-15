import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { travelRecords } from '@/lib/db/schema/logistics';
import { emitCascadeEvent } from '@/lib/cascade/emit';
import { guard } from '../../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { travelId, patch = {} } = await req.json();
  if (!travelId) return NextResponse.json({ error: 'travelId required' }, { status: 400 });
  const [row] = await db.update(travelRecords)
    .set({ ...patch, updatedAt: new Date(), updatedBy: 'system:test' })
    .where(eq(travelRecords.id, travelId))
    .returning();
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await emitCascadeEvent('conference/travel.updated', row.eventId, { type: 'system', id: 'system:test' }, {
    travelId, personId: row.personId, changes: patch,
  });
  return NextResponse.json({ ok: true, travelId });
}
