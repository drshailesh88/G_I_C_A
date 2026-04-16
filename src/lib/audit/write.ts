import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export interface WriteAuditParams {
  actorUserId: string;
  eventId: string | null;
  action: 'create' | 'update' | 'delete' | 'read';
  resource: string;
  resourceId: string;
  meta?: Record<string, unknown>;
}

let ensureAuditLogTablePromise: Promise<void> | null = null;

async function ensureAuditLogTable() {
  if (typeof (db as { execute?: unknown }).execute !== 'function') {
    return;
  }

  if (!ensureAuditLogTablePromise) {
    ensureAuditLogTablePromise = (async () => {
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS "audit_log" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "event_id" uuid REFERENCES "events"("id") ON DELETE CASCADE,
          "actor_user_id" text NOT NULL,
          "action" text NOT NULL,
          "resource" text NOT NULL,
          "resource_id" uuid NOT NULL,
          "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
          "meta" jsonb DEFAULT '{}'::jsonb NOT NULL
        )
      `));
      await db.execute(sql.raw('CREATE INDEX IF NOT EXISTS "idx_audit_log_event_id" ON "audit_log" ("event_id")'));
      await db.execute(sql.raw('CREATE INDEX IF NOT EXISTS "idx_audit_log_actor" ON "audit_log" ("actor_user_id")'));
      await db.execute(sql.raw('CREATE INDEX IF NOT EXISTS "idx_audit_log_resource" ON "audit_log" ("resource", "resource_id")'));
      await db.execute(sql.raw('CREATE INDEX IF NOT EXISTS "idx_audit_log_timestamp" ON "audit_log" ("timestamp")'));
    })().catch((error) => {
      ensureAuditLogTablePromise = null;
      throw error;
    });
  }

  await ensureAuditLogTablePromise;
}

export async function writeAudit(params: WriteAuditParams): Promise<void> {
  await ensureAuditLogTable();

  await db.insert(auditLog).values({
    actorUserId: params.actorUserId,
    eventId: params.eventId,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    meta: params.meta ?? {},
  });
}
