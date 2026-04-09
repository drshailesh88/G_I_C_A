'use server';

import { db } from '@/lib/db';
import {
  issuedCertificates,
  certificateTemplates,
  people,
  eventRegistrations,
  sessionAssignments,
  attendanceRecords,
} from '@/lib/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { CERTIFICATE_TYPES, ELIGIBILITY_BASIS_TYPES } from '@/lib/validations/certificate';
import {
  findCurrentCertificate,
  buildSupersessionChain,
  getNextSequence,
  type IssuedCertificateRecord,
} from '@/lib/certificates/issuance-utils';
import { generateCertificateNumber, getCertificateTypeConfig } from '@/lib/certificates/certificate-types';
import { buildCertificateStorageKey } from '@/lib/certificates/storage';

// ── Recipient types ─────────────────────────────────────────
export const RECIPIENT_TYPES = [
  'all_delegates',
  'all_faculty',
  'all_attendees',
  'custom',
] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

// ── Validation schemas ──────────────────────────────────────
const getRecipientsSchema = z.object({
  recipientType: z.enum(RECIPIENT_TYPES),
  personIds: z.array(z.string().uuid()).optional(),
});

const bulkGenerateRequestSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
  recipientType: z.enum(RECIPIENT_TYPES),
  personIds: z.array(z.string().uuid()).optional(),
  eligibilityBasisType: z.enum(ELIGIBILITY_BASIS_TYPES),
});

const sendNotificationsSchema = z.object({
  certificateIds: z.array(z.string().uuid()).min(1).max(500),
  channel: z.enum(['email', 'whatsapp', 'both']),
});

// ── Recipient type ──────────────────────────────────────────
export type Recipient = {
  id: string;
  fullName: string;
  email: string | null;
  designation: string | null;
};

// ── Get eligible recipients ─────────────────────────────────
export async function getEligibleRecipients(
  eventId: string,
  input: unknown,
): Promise<Recipient[]> {
  await assertEventAccess(eventId);
  const validated = getRecipientsSchema.parse(input);

  switch (validated.recipientType) {
    case 'all_delegates': {
      const rows = await db
        .select({
          id: people.id,
          fullName: people.fullName,
          email: people.email,
          designation: people.designation,
        })
        .from(eventRegistrations)
        .innerJoin(people, eq(eventRegistrations.personId, people.id))
        .where(
          withEventScope(
            eventRegistrations.eventId,
            eventId,
            and(
              eq(eventRegistrations.status, 'confirmed'),
              eq(eventRegistrations.category, 'delegate'),
            )!,
          ),
        );
      return rows;
    }

    case 'all_faculty': {
      const rows = await db
        .selectDistinctOn([sessionAssignments.personId], {
          id: people.id,
          fullName: people.fullName,
          email: people.email,
          designation: people.designation,
        })
        .from(sessionAssignments)
        .innerJoin(people, eq(sessionAssignments.personId, people.id))
        .where(eq(sessionAssignments.eventId, eventId));
      return rows;
    }

    case 'all_attendees': {
      const rows = await db
        .selectDistinctOn([attendanceRecords.personId], {
          id: people.id,
          fullName: people.fullName,
          email: people.email,
          designation: people.designation,
        })
        .from(attendanceRecords)
        .innerJoin(people, eq(attendanceRecords.personId, people.id))
        .where(eq(attendanceRecords.eventId, eventId));
      return rows;
    }

    case 'custom': {
      if (!validated.personIds || validated.personIds.length === 0) {
        return [];
      }
      const rows = await db
        .select({
          id: people.id,
          fullName: people.fullName,
          email: people.email,
          designation: people.designation,
        })
        .from(people)
        .where(inArray(people.id, validated.personIds));
      return rows;
    }
  }
}

// ── Bulk generate result ────────────────────────────────────
export type BulkGenerateResult = {
  issued: number;
  skipped: number;
  certificateIds: string[];
  errors: string[];
};

// ── Bulk generate certificates ──────────────────────────────
export async function bulkGenerateCertificates(
  eventId: string,
  input: unknown,
): Promise<BulkGenerateResult> {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = bulkGenerateRequestSchema.parse(input);

  // Get the active template
  const [template] = await db
    .select()
    .from(certificateTemplates)
    .where(
      withEventScope(
        certificateTemplates.eventId,
        eventId,
        and(
          eq(certificateTemplates.id, validated.templateId),
          eq(certificateTemplates.status, 'active'),
        )!,
      ),
    )
    .limit(1);
  if (!template) throw new Error('Active certificate template not found');

  // Get eligible recipients and deduplicate by personId
  const rawRecipients = await getEligibleRecipients(eventId, {
    recipientType: validated.recipientType,
    personIds: validated.personIds,
  });

  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  let skippedDuplicates = 0;
  for (const r of rawRecipients) {
    if (seen.has(r.id)) {
      skippedDuplicates++;
      continue;
    }
    seen.add(r.id);
    recipients.push(r);
  }

  if (recipients.length === 0) {
    return { issued: 0, skipped: skippedDuplicates, certificateIds: [], errors: [] };
  }

  if (recipients.length > 500) {
    throw new Error('Maximum 500 recipients per bulk generation');
  }

  const certType = template.certificateType as import('@/lib/validations/certificate').CertificateType;
  const config = getCertificateTypeConfig(certType);

  // Get existing certificates and numbers for this event+type
  const existingCerts = await db
    .select()
    .from(issuedCertificates)
    .where(
      withEventScope(
        issuedCertificates.eventId,
        eventId,
        eq(issuedCertificates.certificateType, template.certificateType),
      ),
    );

  const existingNumbers = await db
    .select({ certificateNumber: issuedCertificates.certificateNumber })
    .from(issuedCertificates)
    .where(eq(issuedCertificates.eventId, eventId));

  const numbers = existingNumbers.map(r => r.certificateNumber);
  let nextSeq = getNextSequence(numbers, config.certificateNumberPrefix);

  const certificateIds: string[] = [];
  const errors: string[] = [];

  // Issue certificates in a transaction — atomic: all succeed or all roll back
  await db.transaction(async (tx) => {
    for (const recipient of recipients) {
      // Check for existing current certificate
      const currentCert = findCurrentCertificate(
        existingCerts as IssuedCertificateRecord[],
        recipient.id,
        eventId,
        template.certificateType,
      );

      const chain = buildSupersessionChain(currentCert);
      const certificateNumber = generateCertificateNumber(
        certType,
        nextSeq,
      );
      nextSeq++;

      const certId = crypto.randomUUID();
      const storageKey = buildCertificateStorageKey(
        eventId,
        template.certificateType,
        certId,
      );

      // Build rendered variables from recipient data
      const renderedVariables: Record<string, string> = {
        full_name: recipient.fullName,
        recipient_name: recipient.fullName,
        designation: recipient.designation ?? '',
        email: recipient.email ?? '',
        certificate_number: certificateNumber,
      };

      const [newCert] = await tx
        .insert(issuedCertificates)
        .values({
          id: certId,
          eventId,
          personId: recipient.id,
          templateId: template.id,
          templateVersionNo: template.versionNo,
          certificateType: template.certificateType,
          eligibilityBasisType: validated.eligibilityBasisType,
          certificateNumber,
          storageKey,
          fileName: `${certificateNumber}.pdf`,
          renderedVariablesJson: renderedVariables,
          brandingSnapshotJson: template.brandingSnapshotJson,
          templateSnapshotJson: template.templateJson,
          supersedesId: chain.newCertLink?.supersedesId || null,
          issuedBy: userId,
        })
        .returning();

      // If superseding, update the old certificate — must succeed atomically
      if (currentCert && chain.oldCertUpdate) {
        await tx
          .update(issuedCertificates)
          .set({
            status: 'superseded',
            supersededById: newCert.id,
            updatedAt: new Date(),
          })
          .where(
            withEventScope(
              issuedCertificates.eventId,
              eventId,
              eq(issuedCertificates.id, currentCert.id),
            ),
          );
      }

      certificateIds.push(newCert.id);
    }
  });

  revalidatePath(`/events/${eventId}/certificates`);

  return {
    issued: certificateIds.length,
    skipped: skippedDuplicates,
    certificateIds,
    errors,
  };
}

// ── Send certificate notifications ──────────────────────────
export async function sendCertificateNotifications(
  eventId: string,
  input: unknown,
): Promise<{ sent: number; failed: number }> {
  await assertEventAccess(eventId, { requireWrite: true });
  const validated = sendNotificationsSchema.parse(input);

  // Get certificates with person info
  const certs = await db
    .select({
      id: issuedCertificates.id,
      certificateNumber: issuedCertificates.certificateNumber,
      certificateType: issuedCertificates.certificateType,
      storageKey: issuedCertificates.storageKey,
      personId: issuedCertificates.personId,
      personFullName: people.fullName,
      personEmail: people.email,
      personPhone: people.phoneE164,
    })
    .from(issuedCertificates)
    .innerJoin(people, eq(issuedCertificates.personId, people.id))
    .where(
      withEventScope(
        issuedCertificates.eventId,
        eventId,
        and(
          inArray(issuedCertificates.id, validated.certificateIds),
          eq(issuedCertificates.status, 'issued'),
        )!,
      ),
    );

  let sent = 0;
  let failed = 0;

  // Lazy import to avoid pulling notification service into tests
  const { sendNotification } = await import('@/lib/notifications/send');

  for (const cert of certs) {
    try {
      // Skip certificates without generated PDFs — no point sending "your cert is ready"
      if (!cert.storageKey) {
        failed++;
        continue;
      }

      const channels = validated.channel === 'both'
        ? ['email', 'whatsapp'] as const
        : [validated.channel] as const;

      for (const channel of channels) {
        await sendNotification({
          eventId,
          personId: cert.personId,
          channel,
          templateKey: 'certificate_delivery',
          triggerType: 'certificate.generated',
          triggerEntityType: 'issued_certificate',
          triggerEntityId: cert.id,
          sendMode: 'manual',
          idempotencyKey: `cert-send-${cert.id}-${channel}`,
          variables: {
            full_name: cert.personFullName,
            certificate_number: cert.certificateNumber,
            certificate_type: cert.certificateType.replace(/_/g, ' '),
            recipientEmail: cert.personEmail ?? '',
            recipientPhoneE164: cert.personPhone ?? '',
          },
          attachments: [{ storageKey: cert.storageKey, fileName: `${cert.certificateNumber}.pdf` }],
        });
      }

      // Update lastSentAt
      await db
        .update(issuedCertificates)
        .set({ lastSentAt: new Date(), updatedAt: new Date() })
        .where(
          withEventScope(
            issuedCertificates.eventId,
            eventId,
            eq(issuedCertificates.id, cert.id),
          ),
        );

      sent++;
    } catch {
      failed++;
    }
  }

  revalidatePath(`/events/${eventId}/certificates`);

  return { sent, failed };
}
