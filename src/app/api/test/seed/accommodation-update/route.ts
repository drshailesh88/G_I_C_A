import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { accommodationRecords } from '@/lib/db/schema/logistics';
import { emitCascadeEvent } from '@/lib/cascade/emit';
import { guard } from '../../_guard';

export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { accomId, patch = {} } = await req.json();
  if (!accomId) return NextResponse.json({ error: 'accomId required' }, { status: 400 });
  const [row] = await db.update(accommodationRecords)
    .set({ ...patch, updatedAt: new Date(), updatedBy: 'system:test' })
    .where(eq(accommodationRecords.id, accomId))
    .returning();
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await emitCascadeEvent('conference/accommodation.updated', row.eventId, { type: 'system', id: 'system:test' }, {
    accommodationId: accomId, changes: patch,
  });
  return NextResponse.json({ ok: true, accomId });
}
