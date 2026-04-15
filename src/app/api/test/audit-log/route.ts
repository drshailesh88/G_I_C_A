import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { and, eq, or, sql } from 'drizzle-orm';
import { auditLog } from '@/lib/db/schema/audit-log';
import { clerkClient } from '@clerk/nextjs/server';
import { guard } from '../_guard';

const MAX_ROWS = 200;

export async function GET(req: NextRequest) {
  const blocked = guard(); if (blocked) return blocked;
  const p = new URL(req.url).searchParams;

  const conds: ReturnType<typeof eq>[] = [];

  const eventId = p.get('event_id');
  if (eventId) conds.push(eq(auditLog.eventId, eventId));

  const actorUserId = p.get('actor_user_id');
  if (actorUserId) conds.push(eq(auditLog.actorUserId, actorUserId));

  const actorUsername = p.get('actor_username');
  if (actorUsername) {
    const client = await clerkClient();
    const { data: users } = await client.users.getUserList({
      emailAddress: [actorUsername],
    });
    if (users.length === 0) {
      return NextResponse.json([]);
    }
    conds.push(eq(auditLog.actorUserId, users[0].id));
  }

  const resource = p.get('resource');
  if (resource) conds.push(eq(auditLog.resource, resource));

  const certId = p.get('cert_id');
  if (certId) {
    conds.push(
      or(
        eq(auditLog.resourceId, certId),
        sql`${auditLog.meta}->>'cert_id' = ${certId}`,
      )!,
    );
  }

  const query = db.select().from(auditLog);
  const rows = conds.length
    ? await query.where(and(...conds)).limit(MAX_ROWS)
    : await query.limit(MAX_ROWS);

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    actorUserId: r.actorUserId,
    action: r.action,
    resource: r.resource,
    resourceId: r.resourceId,
    timestamp: r.timestamp,
    meta: r.meta,
  })));
}
