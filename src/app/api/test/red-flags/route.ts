import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { redFlags } from '@/lib/db/schema/red-flags';
import { guard } from '../_guard';

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const conds = [] as any[];
  if (p.get('event_id')) conds.push(eq(redFlags.eventId, p.get('event_id')!));
  if (p.get('flag_type')) conds.push(eq(redFlags.flagType, p.get('flag_type')!));
  if (p.get('target_entity_id')) conds.push(eq(redFlags.targetEntityId, p.get('target_entity_id')!));
  const rows = await (conds.length
    ? db.select().from(redFlags).where(and(...conds))
    : db.select().from(redFlags));
  return NextResponse.json(rows);
}
