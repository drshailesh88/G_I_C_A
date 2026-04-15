import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { and, eq, sql } from 'drizzle-orm';
import { issuedCertificates as certificates } from '@/lib/db/schema/certificates';
import { guard } from '../_guard';

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const conds = [] as any[];
  if (p.get('event_id')) conds.push(eq(certificates.eventId, p.get('event_id')!));
  if (p.get('type')) conds.push(eq(certificates.certificateType, p.get('type')!));
  if (p.get('status')) conds.push(eq(certificates.status, p.get('status')!));
  if (p.get('person_id')) conds.push(eq(certificates.personId, p.get('person_id')!));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(certificates)
    .where(conds.length ? and(...conds) : undefined);
  return NextResponse.json({ count: Number(count) });
}
