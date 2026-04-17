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
import { captureSentInngestEvent } from '@/lib/inngest/captured-events';

// ── Recipient types ─────────────────────────────────────────
export const RECIPIENT_TYPES = [
  'all_delegates',
  'all_faculty',
  'all_attendees',
  'custom',
] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

const eventIdSchema = z.string().uuid('Invalid event ID');
const customRecipientIdsSchema = z.array(z.string().uuid()).min(1).max(500);

// ── Validation schemas ──────────────────────────────────────
const getRecipientsSchema = z.object({
  recipientType: z.enum(RECIPIENT_TYPES),
  personIds: z.array(z.string().uuid()).max(500).optional(),
});

const bulkGenerateRequestSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
  recipientType: z.enum(RECIPIENT_TYPES),
  personIds: z.array(z.string().uuid()).optional(),
  eligibilityBasisType: z.enum(ELIGIBILITY_BASIS_TYPES),
}).superRefine((value, ctx) => {
  if (value.recipientType === 'custom') {
    const parsedIds = customRecipientIdsSchema.safeParse(value.personIds);
    if (!parsedIds.success) {
      for (const issue of parsedIds.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['personIds', ...issue.path],
        });
      }
    }
    return;
  }

  if (value.personIds && value.personIds.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['personIds'],
      message: 'personIds may only be provided for custom recipient selection',
    });
  }
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

function validateEventId(eventId: string): string {
  const parsed = eventIdSchema.safeParse(eventId);
  if (!parsed.success) {
    throw new Error('Invalid event ID');
  }

  return parsed.data;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

async function validateCustomRecipientIds(eventId: string, personIds: string[]): Promise<string[]> {
  const scopedPersonIds = uniqueIds(personIds);
  const rows = await db
    .select({ personId: eventPeople.personId })
    .from(eventPeople)
    .where(and(eq(eventPeople.eventId, eventId), inArray(eventPeople.personId, scopedPersonIds))!);

  if (rows.length !== scopedPersonIds.length) {
    throw new Error('One or more recipients do not belong to this event');
  }

  return scopedPersonIds;
}

async function validateNotificationCertificateIds(
  eventId: string,
  certificateIds: string[],
): Promise<string[]> {
  const scopedCertificateIds = uniqueIds(certificateIds);
  const rows = await db
    .select({
      id: issuedCertificates.id,
      status: issuedCertificates.status,
    })
    .from(issuedCertificates)
    .where(
      withEventScope(
        issuedCertificates.eventId,
        eventId,
        inArray(issuedCertificates.id, scopedCertificateIds),
      ),
    );

  if (rows.length !== scopedCertificateIds.length) {
    throw new Error('One or more certificates do not belong to this event');
  }

  if (rows.some((row) => row.status !== 'issued')) {
    throw new Error('Only currently issued certificates can be notified');
  }

  return scopedCertificateIds;
}

// ── Get eligible recipients ─────────────────────────────────
export async function getEligibleRecipients(
  eventId: string,
  input: unknown,
): Promise<Recipient[]> {
  const scopedEventId = validateEventId(eventId);
  await assertEventAccess(scopedEventId);
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
            scopedEventId,
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
        .where(eq(sessionAssignments.eventId, scopedEventId));
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
        .where(eq(attendanceRecords.eventId, scopedEventId));
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
        .where(and(eq(eventPeople.eventId, scopedEventId), inArray(people.id, validated.personIds))!);
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
  const scopedEventId = validateEventId(eventId);
  // Feature flag check
  const enabled = await isCertificateGenerationEnabled().catch(() => {
    throw new Error('Certificate generation availability could not be verified');
  });
  if (!enabled) {
    throw new Error('Certificate generation is currently disabled');
  }

  const { userId, role } = await assertEventAccess(scopedEventId, { requireWrite: true });
  assertCertificateWriteRole(role);
  const validated = bulkGenerateRequestSchema.parse(input);
  const validatedPersonIds =
    validated.recipientType === 'custom'
      ? await validateCustomRecipientIds(scopedEventId, validated.personIds ?? [])
      : undefined;

  // Quick validation: template must exist and be active
  const [template] = await db
    .select({ id: certificateTemplates.id })
    .from(certificateTemplates)
    .where(
      withEventScope(
        certificateTemplates.eventId,
        scopedEventId,
        and(
          eq(certificateTemplates.id, validated.templateId),
          eq(certificateTemplates.status, 'active'),
        )!,
      ),
    )
    .limit(1);
  if (!template) throw new Error('Active certificate template not found');

  // Dispatch to Inngest — actual generation happens in batched steps
  const inngestEvent = {
    name: 'bulk/certificates.generate',
    data: {
      eventId: scopedEventId,
      userId,
      templateId: validated.templateId,
      recipientType: validated.recipientType,
      personIds: validatedPersonIds,
      eligibilityBasisType: validated.eligibilityBasisType,
    },
  };
  const sendResult = await inngest.send(inngestEvent);
  await captureSentInngestEvent(inngestEvent, sendResult).catch(() => {});

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
  const scopedEventId = validateEventId(eventId);
  const { role } = await assertEventAccess(scopedEventId, { requireWrite: true });
  assertCertificateWriteRole(role);
  const validated = sendNotificationsSchema.parse(input);
  const scopedCertificateIds = await validateNotificationCertificateIds(
    scopedEventId,
    validated.certificateIds,
  );

  // Dispatch to Inngest — emails batched (20 + 30s sleep), WhatsApp per-message (2s sleep)
  const inngestEvent = {
    name: 'bulk/certificates.notify',
    data: {
      eventId: scopedEventId,
      certificateIds: scopedCertificateIds,
      channel: validated.channel,
    },
  };
  const sendResult = await inngest.send(inngestEvent);
  await captureSentInngestEvent(inngestEvent, sendResult).catch(() => {});

  return {
    queued: true,
    message: `Notification delivery queued for ${scopedCertificateIds.length} certificates via ${validated.channel}.`,
  };
}
