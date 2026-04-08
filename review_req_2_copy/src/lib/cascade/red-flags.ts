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
import { eq, and, ne } from 'drizzle-orm';
import { withEventScope } from '@/lib/db/with-event-scope';

// ── Flag Types ────────────────────────────────────────────────
export const FLAG_TYPES = [
  'travel_change',
  'travel_cancelled',
  'accommodation_change',
  'accommodation_cancelled',
  'registration_cancelled',
  'shared_room_affected',
] as const;
export type FlagType = (typeof FLAG_TYPES)[number];

// ── Target Entity Types ───────────────────────────────────────
export const TARGET_ENTITY_TYPES = [
  'accommodation_record',
  'transport_batch',
  'transport_passenger_assignment',
] as const;
export type TargetEntityType = (typeof TARGET_ENTITY_TYPES)[number];

// ── Source Entity Types ───────────────────────────────────────
export const SOURCE_ENTITY_TYPES = [
  'travel_record',
  'accommodation_record',
  'registration',
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

// ── Create or update red flag ─────────────────────────────────
// Idempotency: one active flag per (event_id, target_type, target_id, flag_type).
// If an unresolved flag already exists, update its detail and source info.
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

  // Check for existing unresolved flag on same target + type
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

  if (existing) {
    // Update existing flag with new detail
    const [updated] = await db
      .update(redFlags)
      .set({
        flagDetail,
        sourceEntityType,
        sourceEntityId,
        sourceChangeSummaryJson: sourceChangeSummaryJson ?? null,
        flagStatus: 'unreviewed',  // Reset to unreviewed on new change
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(redFlags.id, existing.id))
      .returning();

    return { flag: updated, action: 'updated' as const };
  }

  // Create new flag
  const [created] = await db
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
    .returning();

  return { flag: created, action: 'created' as const };
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
    .where(eq(redFlags.id, flagId))
    .returning();

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
    .where(eq(redFlags.id, flagId))
    .returning();

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
