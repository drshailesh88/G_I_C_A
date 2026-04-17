'use server';

import { db } from '@/lib/db';
import {
  issuedCertificates,
  certificateTemplates,
  people,
  eventRegistrations,
  events,
  eventPeople,
  attendanceRecords,
  sessionAssignments,
} from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
import { assertCertificateWriteRole } from './certificate-rbac';
import {
  issueCertificateSchema,
  revokeCertificateSchema,
} from '@/lib/validations/certificate';
import {
  findCurrentCertificate,
  buildSupersessionChain,
  validateRevocation,
  validateDownloadAccess,
  getNextSequence,
  type IssuedCertificateRecord,
} from '@/lib/certificates/issuance-utils';
import { generateCertificateNumber, getCertificateTypeConfig } from '@/lib/certificates/certificate-types';
import { buildCertificateStorageKey } from '@/lib/certificates/storage';

type PersonVariableSnapshot = {
  fullName?: string | null;
  salutation?: string | null;
  email?: string | null;
  phoneE164?: string | null;
  designation?: string | null;
  organization?: string | null;
  specialty?: string | null;
  city?: string | null;
};

const eventIdSchema = z.string().uuid('Invalid event ID');

function validateEventId(eventId: string): string {
  return eventIdSchema.parse(eventId);
}

function buildRenderedVariablesSnapshot(
  variables: Record<string, unknown>,
  person: PersonVariableSnapshot,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { ...variables };

  const put = (key: string, value: string | null | undefined) => {
    if (value === undefined) return;
    snapshot[key] = value ?? '';
  };

  put('full_name', person.fullName);
  put('recipient_name', person.fullName);
  put('salutation', person.salutation);
  put('email', person.email);
  put('phone', person.phoneE164);
  put('phone_e164', person.phoneE164);
  put('designation', person.designation);
  put('organization', person.organization);
  put('specialty', person.specialty);
  put('city', person.city);

  return snapshot;
}

async function assertEligibilityBasisBelongsToEventPerson(
  eventId: string,
  personId: string,
  basisType: string,
  basisId: string | undefined,
) {
  if (!basisId) {
    return;
  }

  if (basisType === 'manual') {
    throw new Error('Manual eligibility cannot reference another record');
  }

  let rows: { id: string }[];

  switch (basisType) {
    case 'registration':
      rows = await db
        .select({ id: eventRegistrations.id })
        .from(eventRegistrations)
        .where(
          withEventScope(
            eventRegistrations.eventId,
            eventId,
            and(
              eq(eventRegistrations.id, basisId),
              eq(eventRegistrations.personId, personId),
            )!,
          ),
        )
        .limit(1);
      break;

    case 'attendance':
      rows = await db
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
          withEventScope(
            attendanceRecords.eventId,
            eventId,
            and(
              eq(attendanceRecords.id, basisId),
              eq(attendanceRecords.personId, personId),
            )!,
          ),
        )
        .limit(1);
      break;

    case 'session_assignment':
      rows = await db
        .select({ id: sessionAssignments.id })
        .from(sessionAssignments)
        .where(
          withEventScope(
            sessionAssignments.eventId,
            eventId,
            and(
              eq(sessionAssignments.id, basisId),
              eq(sessionAssignments.personId, personId),
            )!,
          ),
        )
        .limit(1);
      break;

    case 'event_role':
      rows = await db
        .select({ id: eventPeople.id })
        .from(eventPeople)
        .where(
          withEventScope(
            eventPeople.eventId,
            eventId,
            and(
              eq(eventPeople.id, basisId),
              eq(eventPeople.personId, personId),
            )!,
          ),
        )
        .limit(1);
      break;

    default:
      rows = [];
  }

  const [record] = rows;
  if (!record) {
    throw new Error('Eligibility basis does not belong to this event/person');
  }
}

// ── Issue a single certificate ───────────────────────────────
export async function issueCertificate(eventId: string, input: unknown) {
  const scopedEventId = validateEventId(eventId);
  const { userId, role } = await assertEventAccess(scopedEventId, { requireWrite: true });
  assertCertificateWriteRole(role);
  const validated = issueCertificateSchema.parse(input);

  // Block issuance on archived events
  const [event] = await db
    .select({ status: events.status })
    .from(events)
    .where(eq(events.id, scopedEventId))
    .limit(1);
  if (!event || event.status === 'archived') {
    throw new Error('Event is archived — certificate issuance is blocked');
  }

  // Verify person exists
  const [person] = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      salutation: people.salutation,
      email: people.email,
      phoneE164: people.phoneE164,
      designation: people.designation,
      organization: people.organization,
      specialty: people.specialty,
      city: people.city,
    })
    .from(people)
    .where(eq(people.id, validated.personId))
    .limit(1);
  if (!person) throw new Error('Person not found');

  // Verify person is attached to this event
  const [attachment] = await db
    .select({ id: eventPeople.id })
    .from(eventPeople)
    .where(and(eq(eventPeople.eventId, scopedEventId), eq(eventPeople.personId, validated.personId)))
    .limit(1);
  if (!attachment) throw new Error('person not attached to event');

  // Verify template exists and is active
  const [template] = await db
    .select()
    .from(certificateTemplates)
    .where(
      withEventScope(
        certificateTemplates.eventId,
        scopedEventId,
        and(
          eq(certificateTemplates.id, validated.templateId),
          eq(certificateTemplates.certificateType, validated.certificateType),
          eq(certificateTemplates.status, 'active'),
        )!,
      ),
    )
    .limit(1);
  if (!template || template.certificateType !== validated.certificateType) {
    throw new Error('Active certificate template not found');
  }

  await assertEligibilityBasisBelongsToEventPerson(
    scopedEventId,
    validated.personId,
    validated.eligibilityBasisType,
    validated.eligibilityBasisId,
  );

  // Retry loop for certificate number collisions (concurrent issuance for same event)
  const MAX_CERT_NUMBER_RETRIES = 3;
  let originalTransactionFailure: Error | null = null;

  for (let attempt = 0; attempt < MAX_CERT_NUMBER_RETRIES; attempt++) {
    try {
      const issued = await db.transaction(async (tx) => {
        const existingCerts = await tx
          .select()
          .from(issuedCertificates)
          .where(
            withEventScope(
              issuedCertificates.eventId,
              scopedEventId,
              and(
                eq(issuedCertificates.personId, validated.personId),
                eq(issuedCertificates.certificateType, validated.certificateType),
              )!,
            ),
          );

        const currentCert = findCurrentCertificate(
          existingCerts as IssuedCertificateRecord[],
          validated.personId,
          scopedEventId,
          validated.certificateType,
        );

        const chain = buildSupersessionChain(currentCert);

        const existingNumbers = await tx
          .select({ certificateNumber: issuedCertificates.certificateNumber })
          .from(issuedCertificates)
          .where(eq(issuedCertificates.eventId, scopedEventId));

        const config = getCertificateTypeConfig(validated.certificateType);
        const numbers = existingNumbers.map(r => r.certificateNumber);
        const sequence = getNextSequence(numbers, config.certificateNumberPrefix);
        const certificateNumber = generateCertificateNumber(validated.certificateType, sequence);

        const certId = crypto.randomUUID();
        const storageKey = buildCertificateStorageKey(scopedEventId, validated.certificateType, certId);
        const renderedVariablesSnapshot = buildRenderedVariablesSnapshot(
          validated.renderedVariablesJson,
          person,
        );

        if (currentCert && chain.oldCertUpdate) {
          const [superseded] = await tx
            .update(issuedCertificates)
            .set({
              status: 'superseded',
              supersededById: certId,
              updatedAt: new Date(),
            })
            .where(
              withEventScope(
                issuedCertificates.eventId,
                scopedEventId,
                and(
                  eq(issuedCertificates.id, currentCert.id),
                  eq(issuedCertificates.status, 'issued'),
                )!,
              ),
            )
            .returning({ id: issuedCertificates.id });

          if (!superseded) {
            throw new Error('Current certificate changed during issuance; retry regeneration');
          }
        }

        const [newCert] = await tx
          .insert(issuedCertificates)
          .values({
            id: certId,
            eventId: scopedEventId,
            personId: validated.personId,
            templateId: validated.templateId,
            templateVersionNo: template.versionNo,
            certificateType: validated.certificateType,
            eligibilityBasisType: validated.eligibilityBasisType,
            eligibilityBasisId: validated.eligibilityBasisId || null,
            certificateNumber,
            storageKey,
            fileName: `${certificateNumber}.pdf`,
            renderedVariablesJson: renderedVariablesSnapshot,
            brandingSnapshotJson: template.brandingSnapshotJson,
            templateSnapshotJson: template.templateJson,
            supersedesId: chain.newCertLink?.supersedesId || null,
            issuedBy: userId,
          })
          .returning();

        return newCert;
      });

      revalidatePath(`/events/${scopedEventId}/certificates`);
      return issued;
    } catch (error) {
      if (originalTransactionFailure) {
        throw originalTransactionFailure;
      }

      const isCertNumberCollision =
        error instanceof Error &&
        ('code' in error ? String((error as any).code) === '23505' : false) &&
        error.message.toLowerCase().includes('certificate_number');

      if (isCertNumberCollision && attempt < MAX_CERT_NUMBER_RETRIES - 1) {
        continue;
      }

      const isTransactionFailure =
        error instanceof Error &&
        'code' in error &&
        String((error as any).code).startsWith('40');

      if (isTransactionFailure && attempt === 0) {
        originalTransactionFailure = error;
        continue;
      }

      throw error;
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error('Certificate issuance failed after maximum retries');
}

// ── Revoke a certificate ─────────────────────────────────────
export async function revokeCertificate(eventId: string, input: unknown) {
  const scopedEventId = validateEventId(eventId);
  const { userId, role } = await assertEventAccess(scopedEventId, { requireWrite: true });
  assertCertificateWriteRole(role);
  const validated = revokeCertificateSchema.parse(input);

  const [cert] = await db
    .select()
    .from(issuedCertificates)
    .where(
      withEventScope(
        issuedCertificates.eventId,
        scopedEventId,
        eq(issuedCertificates.id, validated.certificateId),
      ),
    )
    .limit(1);

  if (!cert) throw new Error('Certificate not found');

  const validation = validateRevocation(cert as unknown as IssuedCertificateRecord, validated.revokeReason);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const [revoked] = await db
    .update(issuedCertificates)
    .set({
      status: 'revoked',
      revokedAt: new Date(),
      revokeReason: validated.revokeReason,
      updatedAt: new Date(),
    })
    .where(
      withEventScope(
        issuedCertificates.eventId,
        scopedEventId,
        and(
          eq(issuedCertificates.id, validated.certificateId),
          eq(issuedCertificates.status, 'issued'),
        )!,
      ),
    )
    .returning();

  if (!revoked) {
    throw new Error('Certificate changed during revocation; reload and try again');
  }

  revalidatePath(`/events/${scopedEventId}/certificates`);
  return revoked;
}

// ── List issued certificates (with recipient info) ──────────
export async function listIssuedCertificates(eventId: string) {
  const scopedEventId = validateEventId(eventId);
  await assertEventAccess(scopedEventId);

  return db
    .select({
      id: issuedCertificates.id,
      certificateNumber: issuedCertificates.certificateNumber,
      certificateType: issuedCertificates.certificateType,
      status: issuedCertificates.status,
      personId: issuedCertificates.personId,
      issuedAt: issuedCertificates.issuedAt,
      revokedAt: issuedCertificates.revokedAt,
      revokeReason: issuedCertificates.revokeReason,
      downloadCount: issuedCertificates.downloadCount,
      verificationCount: issuedCertificates.verificationCount,
      lastDownloadedAt: issuedCertificates.lastDownloadedAt,
      lastSentAt: issuedCertificates.lastSentAt,
      storageKey: issuedCertificates.storageKey,
      recipientName: people.fullName,
      registrationNumber: eventRegistrations.registrationNumber,
    })
    .from(issuedCertificates)
    .innerJoin(people, eq(issuedCertificates.personId, people.id))
    .leftJoin(
      eventRegistrations,
      and(
        eq(eventRegistrations.personId, issuedCertificates.personId),
        eq(eventRegistrations.eventId, issuedCertificates.eventId),
      ),
    )
    .where(eq(issuedCertificates.eventId, scopedEventId))
    .orderBy(desc(issuedCertificates.issuedAt));
}

// ── Get single issued certificate ────────────────────────────
const certificateIdSchema = z.string().uuid('Invalid certificate ID');

export async function getIssuedCertificate(eventId: string, certificateId: string) {
  const scopedEventId = validateEventId(eventId);
  await assertEventAccess(scopedEventId);
  const validatedId = certificateIdSchema.parse(certificateId);

  const [cert] = await db
    .select()
    .from(issuedCertificates)
    .where(
      withEventScope(
        issuedCertificates.eventId,
        scopedEventId,
        eq(issuedCertificates.id, validatedId),
      ),
    )
    .limit(1);

  if (!cert) throw new Error('Certificate not found');
  return cert;
}

// ── Get signed download URL ─────────────────────────────────
export async function getCertificateDownloadUrl(
  eventId: string,
  certificateId: string,
  storageProvider?: import('@/lib/certificates/storage').StorageProvider,
) {
  const scopedEventId = validateEventId(eventId);
  const { role } = await assertEventAccess(scopedEventId);
  assertCertificateWriteRole(role);
  const validatedId = certificateIdSchema.parse(certificateId);

  const [cert] = await db
    .select({
      id: issuedCertificates.id,
      status: issuedCertificates.status,
      storageKey: issuedCertificates.storageKey,
      fileName: issuedCertificates.fileName,
    })
    .from(issuedCertificates)
    .where(
      withEventScope(
        issuedCertificates.eventId,
        scopedEventId,
        eq(issuedCertificates.id, validatedId),
      ),
    )
    .limit(1);

  if (!cert) throw new Error('Certificate not found');

  // Validate download access — blocks revoked, superseded, and ungenerated certs
  const access = validateDownloadAccess({
    id: cert.id,
    eventId: scopedEventId,
    personId: '',
    certificateType: '',
    status: cert.status,
    supersededById: null,
    supersedesId: null,
    revokedAt: null,
    revokeReason: null,
    storageKey: cert.storageKey,
  });
  if (!access.allowed) throw new Error(access.error);

  // Explicit null check — defense-in-depth for ungenerated PDFs
  if (!cert.storageKey) throw new Error('Certificate PDF has not been generated yet');

  // Generate signed URL (1-hour expiry)
  const provider = storageProvider ?? (await import('@/lib/certificates/storage')).createR2Provider();
  const url = await provider.getSignedUrl(cert.storageKey, 3600);

  // Increment download tracking (fire-and-forget with error logging)
  db.update(issuedCertificates)
    .set({
      downloadCount: sql`${issuedCertificates.downloadCount} + 1`,
      lastDownloadedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      withEventScope(
        issuedCertificates.eventId,
        scopedEventId,
        eq(issuedCertificates.id, validatedId),
      ),
    )
    .then(() => {})
    .catch((err) => { console.error('[certificate-download] failed to increment download count:', err); });

  return {
    url,
    fileName: cert.fileName,
    expiresInSeconds: 3600,
  };
}

// ── Verify certificate (public, no auth) ────────────────────
// NOTE: This is a public QR verification endpoint. It intentionally does NOT
// require eventId as a parameter because the scanner only has the verification
// token (embedded in the QR code). The token itself is a v4 UUID with 122 bits
// of entropy, making enumeration impractical. The update uses both id AND eventId
// for defense-in-depth.
const verificationTokenSchema = z.string().uuid('Invalid verification token');

export async function verifyCertificate(verificationToken: string) {
  const validatedToken = verificationTokenSchema.parse(verificationToken);

  const [cert] = await db
    .select({
      id: issuedCertificates.id,
      certificateNumber: issuedCertificates.certificateNumber,
      certificateType: issuedCertificates.certificateType,
      status: issuedCertificates.status,
      issuedAt: issuedCertificates.issuedAt,
      revokedAt: issuedCertificates.revokedAt,
      personId: issuedCertificates.personId,
      eventId: issuedCertificates.eventId,
    })
    .from(issuedCertificates)
    .where(eq(issuedCertificates.verificationToken, validatedToken))
    .limit(1);

  if (!cert) {
    return { valid: false as const, error: 'Certificate not found' };
  }

  if (cert.status === 'revoked') {
    return {
      valid: false as const,
      error: 'This certificate has been revoked',
      certificateNumber: cert.certificateNumber,
      revokedAt: cert.revokedAt,
    };
  }

  if (cert.status === 'superseded') {
    return {
      valid: false as const,
      error: 'This certificate has been superseded by a newer version',
      certificateNumber: cert.certificateNumber,
    };
  }

  // Only increment verification count for valid certificates
  db.update(issuedCertificates)
    .set({
      verificationCount: sql`${issuedCertificates.verificationCount} + 1`,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(issuedCertificates.id, cert.id),
      eq(issuedCertificates.eventId, cert.eventId),
    ))
    .then(() => {})
    .catch((err) => { console.error('[certificate-verify] failed to increment verification count:', err); });

  return {
    valid: true as const,
    certificateNumber: cert.certificateNumber,
    certificateType: cert.certificateType,
    issuedAt: cert.issuedAt,
  };
}

// ── Resend certificate notification (single cert) ───────────
const resendCertSchema = z.object({
  certificateId: z.string().uuid('Invalid certificate ID'),
  channel: z.enum(['email', 'whatsapp', 'both']),
});

export async function resendCertificateNotification(eventId: string, input: unknown) {
  const scopedEventId = validateEventId(eventId);
  const { role } = await assertEventAccess(scopedEventId, { requireWrite: true });
  assertCertificateWriteRole(role);
  const validated = resendCertSchema.parse(input);

  const [cert] = await db
    .select({
      id: issuedCertificates.id,
      certificateNumber: issuedCertificates.certificateNumber,
      certificateType: issuedCertificates.certificateType,
      status: issuedCertificates.status,
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
        scopedEventId,
        eq(issuedCertificates.id, validated.certificateId),
      ),
    )
    .limit(1);

  if (!cert) throw new Error('Certificate not found');
  if (cert.status !== 'issued') throw new Error('Can only resend issued certificates');
  if (!cert.storageKey) throw new Error('Certificate PDF has not been generated yet');

  const { sendNotification } = await import('@/lib/notifications/send');

  const channels = validated.channel === 'both'
    ? ['email', 'whatsapp'] as const
    : [validated.channel] as const;

  for (const channel of channels) {
    const result = await sendNotification({
      eventId: scopedEventId,
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
    if (result.status === 'failed') {
      throw new Error(`Certificate notification failed via ${channel}`);
    }
  }

  // Update lastSentAt
  await db
    .update(issuedCertificates)
    .set({ lastSentAt: new Date(), updatedAt: new Date() })
    .where(
      withEventScope(
        issuedCertificates.eventId,
        scopedEventId,
        eq(issuedCertificates.id, cert.id),
      ),
    );

  revalidatePath(`/events/${scopedEventId}/certificates`);
  return { sent: true, channels: channels.length };
}
