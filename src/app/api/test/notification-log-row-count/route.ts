import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { and, eq, like, sql } from 'drizzle-orm';
import { notificationLog } from '@/lib/db/schema/communications';
import { guard } from '../_guard';

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const conds = [] as any[];
  if (p.get('triggerId')) conds.push(like(notificationLog.idempotencyKey, `%:${p.get('triggerId')}:%`));
  if (p.get('channel')) conds.push(eq(notificationLog.channel, p.get('channel')!));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(conds.length ? and(...conds) : undefined);
  return NextResponse.json({ rows: Number(count) });
}
