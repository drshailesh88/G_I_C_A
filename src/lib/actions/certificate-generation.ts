'use server';

import { db } from '@/lib/db';
import {
  issuedCertificates,
  certificateTemplates,
  people,
  eventRegistrations,
  sessionAssignments,
  attendanceRecords,
  eventPeople,
} from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { assertCertificateWriteRole } from './certificate-rbac';
import { CERTIFICATE_TYPES, ELIGIBILITY_BASIS_TYPES } from '@/lib/validations/certificate';
import { isCertificateGenerationEnabled } from '@/lib/flags';
import { inngest } from '@/lib/inngest/client';

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
      // Defense-in-depth: join with eventPeople to enforce eventId scoping
      const rows = await db
        .select({
          id: people.id,
          fullName: people.fullName,
          email: people.email,
          designation: people.designation,
        })
        .from(people)
        .innerJoin(eventPeople, eq(eventPeople.personId, people.id))
        .where(and(eq(eventPeople.eventId, eventId), inArray(people.id, validated.personIds))!);
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

// ── Queued result type ──────────────────────────────────────
export type BulkGenerateQueuedResult = {
  queued: true;
  message: string;
};

// ── Bulk generate certificates (via Inngest) ────────────────
export async function bulkGenerateCertificates(
  eventId: string,
  input: unknown,
): Promise<BulkGenerateQueuedResult> {
  // Feature flag check
  try {
    const enabled = await isCertificateGenerationEnabled();
    if (!enabled) throw new Error('Certificate generation is currently disabled');
  } catch (err) {
    if (err instanceof Error && err.message.includes('currently disabled')) throw err;
  }

  const { userId, role } = await assertEventAccess(eventId, { requireWrite: true });
  assertCertificateWriteRole(role);
  const validated = bulkGenerateRequestSchema.parse(input);

  // Quick validation: template must exist and be active
  const [template] = await db
    .select({ id: certificateTemplates.id })
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

  // Dispatch to Inngest — actual generation happens in batched steps
  await inngest.send({
    name: 'bulk/certificates.generate',
    data: {
      eventId,
      userId,
      templateId: validated.templateId,
      recipientType: validated.recipientType,
      personIds: validated.personIds,
      eligibilityBasisType: validated.eligibilityBasisType,
    },
  });

  return {
    queued: true,
    message: 'Certificate generation queued. Certificates will be generated in batches of 50.',
  };
}

// ── Queued notification result ───────────────────────────────
export type NotificationQueuedResult = {
  queued: true;
  message: string;
};

// ── Send certificate notifications (via Inngest) ────────────
export async function sendCertificateNotifications(
  eventId: string,
  input: unknown,
): Promise<NotificationQueuedResult> {
  const { role } = await assertEventAccess(eventId, { requireWrite: true });
  assertCertificateWriteRole(role);
  const validated = sendNotificationsSchema.parse(input);

  // Dispatch to Inngest — emails batched (20 + 30s sleep), WhatsApp per-message (2s sleep)
  await inngest.send({
    name: 'bulk/certificates.notify',
    data: {
      eventId,
      certificateIds: validated.certificateIds,
      channel: validated.channel,
    },
  });

  return {
    queued: true,
    message: `Notification delivery queued for ${validated.certificateIds.length} certificates via ${validated.channel}.`,
  };
}
