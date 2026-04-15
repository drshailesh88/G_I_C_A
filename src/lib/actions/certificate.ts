'use server';

import { db } from '@/lib/db';
import { certificateTemplates, eventPeople, people } from '@/lib/db/schema';
import { eq, and, desc, ne, sql, ilike, or, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import {
  createCertificateTemplateSchema,
  updateCertificateTemplateSchema,
  activateCertificateTemplateSchema,
  archiveCertificateTemplateSchema,
  TEMPLATE_STATUS_TRANSITIONS,
  type TemplateStatus,
} from '@/lib/validations/certificate';

const recipientSearchSchema = z.object({
  query: z.string().trim().min(1, 'Search query is required').max(200),
  limit: z.number().int().min(1).max(20).default(10),
});

// ── List certificate templates ───────────────────────────────
export async function listCertificateTemplates(eventId: string) {
  await assertEventAccess(eventId);

  return db
    .select()
    .from(certificateTemplates)
    .where(eq(certificateTemplates.eventId, eventId))
    .orderBy(desc(certificateTemplates.updatedAt));
}

// ── Search certificate recipients within one event ─────────────
export async function searchCertificateRecipients(eventId: string, input: unknown) {
  await assertEventAccess(eventId);
  const { query, limit } = recipientSearchSchema.parse(input);
  const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_');

  return db
    .select({
      id: people.id,
      fullName: people.fullName,
      email: people.email,
      designation: people.designation,
    })
    .from(eventPeople)
    .innerJoin(people, eq(eventPeople.personId, people.id))
    .where(
      and(
        eq(eventPeople.eventId, eventId),
        isNull(people.archivedAt),
        isNull(people.anonymizedAt),
        or(
          ilike(people.fullName, `%${escaped}%`),
          ilike(people.email, `%${escaped}%`),
          ilike(people.organization, `%${escaped}%`),
          eq(people.phoneE164, query),
        )!,
      ),
    )
    .orderBy(people.fullName)
    .limit(limit);
}

// ── Get single certificate template ──────────────────────────
export async function getCertificateTemplate(eventId: string, templateId: string) {
  await assertEventAccess(eventId);

  const [template] = await db
    .select()
    .from(certificateTemplates)
    .where(withEventScope(certificateTemplates.eventId, eventId, eq(certificateTemplates.id, templateId)))
    .limit(1);

  if (!template) throw new Error('Certificate template not found');
  return template;
}

// ── Create certificate template ──────────────────────────────
export async function createCertificateTemplate(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = createCertificateTemplateSchema.parse(input);

  const [template] = await db
    .insert(certificateTemplates)
    .values({
      eventId,
      templateName: validated.templateName,
      certificateType: validated.certificateType,
      audienceScope: validated.audienceScope,
      templateJson: validated.templateJson,
      pageSize: validated.pageSize,
      orientation: validated.orientation,
      allowedVariablesJson: validated.allowedVariablesJson,
      requiredVariablesJson: validated.requiredVariablesJson,
      defaultFileNamePattern: validated.defaultFileNamePattern || '{{full_name}}-{{event_name}}-certificate.pdf',
      signatureConfigJson: validated.signatureConfigJson || null,
      brandingSnapshotJson: validated.brandingSnapshotJson || null,
      qrVerificationEnabled: validated.qrVerificationEnabled,
      verificationText: validated.verificationText || null,
      notes: validated.notes || null,
      status: 'draft',
      versionNo: 1,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  revalidatePath(`/events/${eventId}/certificates`);
  return template;
}

// ── Update certificate template ──────────────────────────────
export async function updateCertificateTemplate(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = updateCertificateTemplateSchema.parse(input);
  const { templateId, ...fields } = validated;

  // Fetch existing — ensure it belongs to this event
  const [existing] = await db
    .select()
    .from(certificateTemplates)
    .where(withEventScope(certificateTemplates.eventId, eventId, eq(certificateTemplates.id, templateId)))
    .limit(1);

  if (!existing) throw new Error('Certificate template not found');

  // Only drafts can have content changes (active templates need versioning via activate)
  if (existing.status === 'archived') {
    throw new Error('Cannot update an archived template');
  }

  const updateFields: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
  if (fields.templateName !== undefined) updateFields.templateName = fields.templateName;
  if (fields.templateJson !== undefined) updateFields.templateJson = fields.templateJson;
  if (fields.pageSize !== undefined) updateFields.pageSize = fields.pageSize;
  if (fields.orientation !== undefined) updateFields.orientation = fields.orientation;
  if (fields.allowedVariablesJson !== undefined) updateFields.allowedVariablesJson = fields.allowedVariablesJson;
  if (fields.requiredVariablesJson !== undefined) updateFields.requiredVariablesJson = fields.requiredVariablesJson;
  if (fields.defaultFileNamePattern !== undefined) updateFields.defaultFileNamePattern = fields.defaultFileNamePattern;
  if (fields.signatureConfigJson !== undefined) updateFields.signatureConfigJson = fields.signatureConfigJson;
  if (fields.brandingSnapshotJson !== undefined) updateFields.brandingSnapshotJson = fields.brandingSnapshotJson;
  if (fields.qrVerificationEnabled !== undefined) updateFields.qrVerificationEnabled = fields.qrVerificationEnabled;
  if (fields.verificationText !== undefined) updateFields.verificationText = fields.verificationText;
  if (fields.notes !== undefined) updateFields.notes = fields.notes;

  // If updating an active template, bump the version atomically in SQL
  // This prevents concurrent saves from writing the same version number
  if (existing.status === 'active' && fields.templateJson !== undefined) {
    updateFields.versionNo = sql`${certificateTemplates.versionNo} + 1`;
  }

  const [updated] = await db
    .update(certificateTemplates)
    .set(updateFields)
    .where(withEventScope(certificateTemplates.eventId, eventId, eq(certificateTemplates.id, templateId)))
    .returning();

  revalidatePath(`/events/${eventId}/certificates`);
  return updated;
}

// ── Activate certificate template ────────────────────────────
// Activating archives any other active template of the same type for this event.
export async function activateCertificateTemplate(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const { templateId } = activateCertificateTemplateSchema.parse(input);

  const [template] = await db
    .select()
    .from(certificateTemplates)
    .where(withEventScope(certificateTemplates.eventId, eventId, eq(certificateTemplates.id, templateId)))
    .limit(1);

  if (!template) throw new Error('Certificate template not found');

  const allowed = TEMPLATE_STATUS_TRANSITIONS[template.status as TemplateStatus];
  if (!allowed?.includes('active')) {
    throw new Error(`Cannot activate a template with status "${template.status}"`);
  }

  const [activated] = await db.transaction(async (tx) => {
    await tx
      .update(certificateTemplates)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(certificateTemplates.eventId, eventId),
          eq(certificateTemplates.certificateType, template.certificateType),
          eq(certificateTemplates.status, 'active'),
          ne(certificateTemplates.id, templateId),
        ),
      );

    return tx
      .update(certificateTemplates)
      .set({
        status: 'active',
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(withEventScope(certificateTemplates.eventId, eventId, eq(certificateTemplates.id, templateId)))
      .returning();
  });

  revalidatePath(`/events/${eventId}/certificates`);
  return activated;
}

// ── Archive certificate template ─────────────────────────────
export async function archiveCertificateTemplate(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const { templateId } = archiveCertificateTemplateSchema.parse(input);

  const [template] = await db
    .select()
    .from(certificateTemplates)
    .where(withEventScope(certificateTemplates.eventId, eventId, eq(certificateTemplates.id, templateId)))
    .limit(1);

  if (!template) throw new Error('Certificate template not found');

  const allowed = TEMPLATE_STATUS_TRANSITIONS[template.status as TemplateStatus];
  if (!allowed?.includes('archived')) {
    throw new Error(`Cannot archive a template with status "${template.status}"`);
  }

  const [archived] = await db
    .update(certificateTemplates)
    .set({
      status: 'archived',
      archivedAt: new Date(),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(withEventScope(certificateTemplates.eventId, eventId, eq(certificateTemplates.id, templateId)))
    .returning();

  revalidatePath(`/events/${eventId}/certificates`);
  return archived;
}
