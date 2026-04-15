import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { and, eq, like } from 'drizzle-orm';
import { notificationLog } from '@/lib/db/schema/communications';
import { guard } from '../_guard';

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;
  const conds = [] as any[];
  const key = p.get('idempotency_key');
  if (key) conds.push(eq(notificationLog.idempotencyKey, key));
  const triggerId = p.get('triggerId');
  // triggerId filter: idempotency_key contains ":${triggerId}:" — key format notification:{u}:{e}:{t}:{trig}:{ch}
  if (triggerId) conds.push(like(notificationLog.idempotencyKey, `%:${triggerId}:%`));
  const rows = await (conds.length
    ? db.select().from(notificationLog).where(and(...conds))
    : db.select().from(notificationLog));
  return NextResponse.json(rows.map((r) => ({
    idempotency_key: r.idempotencyKey,
    channel: r.channel,
    status: r.status,
    attempts: r.attempts,
    last_error: r.lastErrorMessage,
    sent_at: r.sentAt,
  })));
}
