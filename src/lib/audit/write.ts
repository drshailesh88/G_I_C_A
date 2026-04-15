import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';

export interface WriteAuditParams {
  actorUserId: string;
  eventId: string | null;
  action: 'create' | 'update' | 'delete' | 'read';
  resource: string;
  resourceId: string;
  meta?: Record<string, unknown>;
}

export async function writeAudit(params: WriteAuditParams): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: params.actorUserId,
    eventId: params.eventId,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    meta: params.meta ?? {},
  });
}
