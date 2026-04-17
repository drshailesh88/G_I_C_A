/**
 * Seed System Templates
 *
 * Inserts global default templates into the database.
 * Idempotent: skips templates that already exist (by key + channel + eventId=null).
 */

import { db } from '@/lib/db';
import { notificationTemplates } from '@/lib/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { SYSTEM_TEMPLATE_SEEDS } from './system-templates';

const MAX_SEED_ACTOR_ID_LENGTH = 128;
const SEED_SYSTEM_TEMPLATES_LOCK_KEY = 8_187_401;

function normalizeSeedActorId(actorId: string) {
  const normalizedActorId = actorId.trim();

  if (!normalizedActorId) {
    throw new Error('seedSystemTemplates: actorId must be a non-empty string');
  }

  if (normalizedActorId.length > MAX_SEED_ACTOR_ID_LENGTH) {
    throw new Error(`seedSystemTemplates: actorId must be ${MAX_SEED_ACTOR_ID_LENGTH} characters or fewer`);
  }

  if (/[\u0000-\u001F\u007F]/.test(normalizedActorId)) {
    throw new Error('seedSystemTemplates: actorId contains control characters');
  }

  return normalizedActorId;
}

export async function seedSystemTemplates(actorId: string): Promise<{
  inserted: number;
  skipped: number;
}> {
  const normalizedActorId = normalizeSeedActorId(actorId);

  return db.transaction(async (tx) => {
    let inserted = 0;
    let skipped = 0;

    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEED_SYSTEM_TEMPLATES_LOCK_KEY})`);

    for (const seed of SYSTEM_TEMPLATE_SEEDS) {
      const existing = await tx
        .select({ id: notificationTemplates.id })
        .from(notificationTemplates)
        .where(
          and(
            isNull(notificationTemplates.eventId),
            eq(notificationTemplates.templateKey, seed.templateKey),
            eq(notificationTemplates.channel, seed.channel),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await tx.insert(notificationTemplates).values({
        eventId: null,
        templateKey: seed.templateKey,
        channel: seed.channel,
        templateName: seed.templateName,
        metaCategory: seed.metaCategory,
        triggerType: seed.triggerType,
        sendMode: seed.sendMode,
        status: 'active',
        subjectLine: seed.subjectLine,
        bodyContent: seed.bodyContent,
        previewText: seed.previewText,
        allowedVariablesJson: seed.allowedVariablesJson,
        requiredVariablesJson: seed.requiredVariablesJson,
        brandingMode: 'event_branding',
        isSystemTemplate: true,
        notes: 'System default template — seeded automatically',
        createdBy: normalizedActorId,
        updatedBy: normalizedActorId,
      });

      inserted++;
    }

    return { inserted, skipped };
  });
}
