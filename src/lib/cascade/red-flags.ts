/**
 * Red Flag Cascade Service
 *
 * Creates, reviews, and resolves red flags on downstream records.
 * Enforces one active (unresolved) flag per (event_id, target_type, target_id, flag_type).
 *
 * Lifecycle: unreviewed → reviewed → resolved
 * Super Admin can skip: unreviewed → resolved
 */

import { db } from '@/lib/db';
import { redFlags } from '@/lib/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';

let ensureRedFlagActiveIndexPromise: Promise<void> | null = null;

async function ensureRedFlagActiveIndex() {
  if (typeof (db as { execute?: unknown }).execute !== 'function') {
    return;
  }

  if (!ensureRedFlagActiveIndexPromise) {
    ensureRedFlagActiveIndexPromise = (async () => {
      await db.execute(sql.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS "uq_red_flag_active"
          ON "red_flags" ("event_id", "target_entity_type", "target_entity_id", "flag_type")
          WHERE "flag_status" != 'resolved'
      `));
    })().catch((error) => {
      ensureRedFlagActiveIndexPromise = null;
      throw error;
    });
  }

  await ensureRedFlagActiveIndexPromise;
}

// ── Flag Types ────────────────────────────────────────────────
export const FLAG_TYPES = [
  'travel_change',
  'travel_cancelled',
  'accommodation_change',
  'accommodation_cancelled',
  'registration_cancelled',
  'shared_room_affected',
  'system_dispatch_failure',
] as const;
export type FlagType = (typeof FLAG_TYPES)[number];

// ── Target Entity Types ───────────────────────────────────────
export const TARGET_ENTITY_TYPES = [
  'travel_record',
  'accommodation_record',
  'transport_batch',
  'transport_passenger_assignment',
  'notification_log',
] as const;
export type TargetEntityType = (typeof TARGET_ENTITY_TYPES)[number];

// ── Source Entity Types ───────────────────────────────────────
export const SOURCE_ENTITY_TYPES = [
  'travel_record',
  'accommodation_record',
  'registration',
  'cascade_dispatch',
] as const;
export type SourceEntityType = (typeof SOURCE_ENTITY_TYPES)[number];

// ── Flag Status ───────────────────────────────────────────────
export const FLAG_STATUSES = ['unreviewed', 'reviewed', 'resolved'] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];

export const FLAG_TRANSITIONS: Record<FlagStatus, FlagStatus[]> = {
  unreviewed: ['reviewed', 'resolved'],  // resolved = Super Admin skip
  reviewed: ['resolved'],
  resolved: [],  // terminal
};

function buildScopedFlagMutationWhereClause(
  eventId: string,
  flagId: string,
  expectedStatus: FlagStatus,
  expectedUpdatedAt?: Date | null,
) {
  return withEventScope(
    redFlags.eventId,
    eventId,
    eq(redFlags.id, flagId),
    eq(redFlags.flagStatus, expectedStatus),
    expectedUpdatedAt ? eq(redFlags.updatedAt, expectedUpdatedAt) : undefined,
  );
}

// ── Create or update red flag ─────────────────────────────────
// Idempotency: one active flag per (event_id, target_type, target_id, flag_type).
// Uses ON CONFLICT DO UPDATE on partial unique index uq_red_flag_active
// (WHERE flag_status != 'resolved'). A resolved flag does not block a new one.
export async function upsertRedFlag(params: {
  eventId: string;
  flagType: FlagType;
  flagDetail: string;
  targetEntityType: TargetEntityType;
  targetEntityId: string;
  sourceEntityType: SourceEntityType;
  sourceEntityId: string;
  sourceChangeSummaryJson?: Record<string, unknown>;
}) {
  const {
    eventId,
    flagType,
    flagDetail,
    targetEntityType,
    targetEntityId,
    sourceEntityType,
    sourceEntityId,
    sourceChangeSummaryJson,
  } = params;

  await ensureRedFlagActiveIndex();

  // Pre-check for action tracking (the write itself is atomic via ON CONFLICT)
  const [existing] = await db
    .select()
    .from(redFlags)
    .where(
      withEventScope(
        redFlags.eventId,
        eventId,
        eq(redFlags.targetEntityType, targetEntityType),
        eq(redFlags.targetEntityId, targetEntityId),
        eq(redFlags.flagType, flagType),
        ne(redFlags.flagStatus, 'resolved'),
      ),
    )
    .limit(1);

  const [flag] = await db
    .insert(redFlags)
    .values({
      eventId,
      flagType,
      flagDetail,
      targetEntityType,
      targetEntityId,
      sourceEntityType,
      sourceEntityId,
      sourceChangeSummaryJson: sourceChangeSummaryJson ?? null,
      flagStatus: 'unreviewed',
    })
    .onConflictDoUpdate({
      target: [redFlags.eventId, redFlags.targetEntityType, redFlags.targetEntityId, redFlags.flagType],
      targetWhere: ne(redFlags.flagStatus, 'resolved'),
      set: {
        flagDetail,
        sourceEntityType,
        sourceEntityId,
        sourceChangeSummaryJson: sourceChangeSummaryJson ?? null,
        flagStatus: 'unreviewed',
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return { flag, action: (existing ? 'updated' : 'created') as 'created' | 'updated' };
}

// ── Review a red flag ─────────────────────────────────────────
export async function reviewRedFlag(
  eventId: string,
  flagId: string,
  actorId: string,
) {
  const [existing] = await db
    .select()
    .from(redFlags)
    .where(withEventScope(redFlags.eventId, eventId, eq(redFlags.id, flagId)))
    .limit(1);

  if (!existing) throw new Error('Red flag not found');

  const currentStatus = existing.flagStatus as FlagStatus;
  if (!FLAG_TRANSITIONS[currentStatus].includes('reviewed')) {
    throw new Error(`Cannot review a flag in "${currentStatus}" status`);
  }

  const [updated] = await db
    .update(redFlags)
    .set({
      flagStatus: 'reviewed',
      reviewedBy: actorId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      buildScopedFlagMutationWhereClause(
        eventId,
        flagId,
        currentStatus,
        existing.updatedAt,
      ),
    )
    .returning();

  if (!updated) {
    throw new Error('Red flag review failed due to a stale conflict');
  }

  return updated;
}

// ── Resolve a red flag ────────────────────────────────────────
export async function resolveRedFlag(
  eventId: string,
  flagId: string,
  actorId: string,
  resolutionNote?: string,
) {
  const [existing] = await db
    .select()
    .from(redFlags)
    .where(withEventScope(redFlags.eventId, eventId, eq(redFlags.id, flagId)))
    .limit(1);

  if (!existing) throw new Error('Red flag not found');

  const currentStatus = existing.flagStatus as FlagStatus;
  if (!FLAG_TRANSITIONS[currentStatus].includes('resolved')) {
    throw new Error(`Cannot resolve a flag in "${currentStatus}" status`);
  }

  const [updated] = await db
    .update(redFlags)
    .set({
      flagStatus: 'resolved',
      resolvedBy: actorId,
      resolvedAt: new Date(),
      resolutionNote: resolutionNote || null,
      updatedAt: new Date(),
    })
    .where(
      buildScopedFlagMutationWhereClause(
        eventId,
        flagId,
        currentStatus,
        existing.updatedAt,
      ),
    )
    .returning();

  if (!updated) {
    throw new Error('Red flag resolution failed due to a stale conflict');
  }

  return updated;
}

// ── Get red flags for a target entity ─────────────────────────
export async function getRedFlagsForTarget(
  eventId: string,
  targetEntityType: TargetEntityType,
  targetEntityId: string,
) {
  return db
    .select()
    .from(redFlags)
    .where(
      withEventScope(
        redFlags.eventId,
        eventId,
        eq(redFlags.targetEntityType, targetEntityType),
        eq(redFlags.targetEntityId, targetEntityId),
      ),
    );
}

// ── Get all unresolved flags for an event ─────────────────────
export async function getUnresolvedFlags(
  eventId: string,
  targetEntityType?: TargetEntityType,
) {
  const conditions = [
    ne(redFlags.flagStatus, 'resolved'),
  ];

  if (targetEntityType) {
    conditions.push(eq(redFlags.targetEntityType, targetEntityType));
  }

  return db
    .select()
    .from(redFlags)
    .where(withEventScope(redFlags.eventId, eventId, ...conditions));
}

// ── Get flagged entity IDs (for "show flagged only" filter) ───
export async function getFlaggedEntityIds(
  eventId: string,
  targetEntityType: TargetEntityType,
): Promise<string[]> {
  const rows = await db
    .select({ targetEntityId: redFlags.targetEntityId })
    .from(redFlags)
    .where(
      withEventScope(
        redFlags.eventId,
        eventId,
        eq(redFlags.targetEntityType, targetEntityType),
        ne(redFlags.flagStatus, 'resolved'),
      ),
    );

  return [...new Set(rows.map(r => r.targetEntityId))];
}
