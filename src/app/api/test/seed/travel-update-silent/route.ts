import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { travelRecords } from '@/lib/db/schema/logistics';
import { guard } from '../../_guard';

// Update travel row WITHOUT emitting cascade — for stale-payload tests (CE7).
export async function POST(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const { travelId, patch = {} } = await req.json();
  if (!travelId) return NextResponse.json({ error: 'travelId required' }, { status: 400 });
  await db.update(travelRecords)
    .set({ ...patch, updatedAt: new Date(), updatedBy: 'system:test' })
    .where(eq(travelRecords.id, travelId));
  return NextResponse.json({ ok: true, travelId });
}
