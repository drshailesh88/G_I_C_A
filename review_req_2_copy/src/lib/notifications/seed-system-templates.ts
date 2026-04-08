/**
 * Seed System Templates
 *
 * Inserts global default templates into the database.
 * Idempotent: skips templates that already exist (by key + channel + eventId=null).
 */

import { db } from '@/lib/db';
import { notificationTemplates } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { SYSTEM_TEMPLATE_SEEDS } from './system-templates';

export async function seedSystemTemplates(actorId: string): Promise<{
  inserted: number;
  skipped: number;
}> {
  let inserted = 0;
  let skipped = 0;

  for (const seed of SYSTEM_TEMPLATE_SEEDS) {
    // Check if already exists
    const existing = await db
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

    await db.insert(notificationTemplates).values({
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
      createdBy: actorId,
      updatedBy: actorId,
    });

    inserted++;
  }

  return { inserted, skipped };
}
