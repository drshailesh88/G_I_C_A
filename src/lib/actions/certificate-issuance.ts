'use server';

import { db } from '@/lib/db';
import { issuedCertificates, certificateTemplates, people } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { withEventScope } from '@/lib/db/with-event-scope';
import { assertEventAccess } from '@/lib/auth/event-access';
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

// ── Issue a single certificate ───────────────────────────────
export async function issueCertificate(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = issueCertificateSchema.parse(input);

  // Verify person exists
  const [person] = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.id, validated.personId))
    .limit(1);
  if (!person) throw new Error('Person not found');

  // Verify template exists and is active
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

  // Wrap in transaction to prevent race conditions with concurrent issuance
  const issued = await db.transaction(async (tx) => {
    // Check for existing current certificate (one-current-valid)
    const existingCerts = await tx
      .select()
      .from(issuedCertificates)
      .where(
        withEventScope(
          issuedCertificates.eventId,
          eventId,
          and(
            eq(issuedCertificates.personId, validated.personId),
            eq(issuedCertificates.certificateType, validated.certificateType),
          )!,
        ),
      );

    const currentCert = findCurrentCertificate(
      existingCerts as IssuedCertificateRecord[],
      validated.personId,
      eventId,
      validated.certificateType,
    );

    const chain = buildSupersessionChain(currentCert);

    // Get next certificate number
    const existingNumbers = await tx
      .select({ certificateNumber: issuedCertificates.certificateNumber })
      .from(issuedCertificates)
      .where(eq(issuedCertificates.eventId, eventId));

    const config = getCertificateTypeConfig(validated.certificateType);
    const numbers = existingNumbers.map(r => r.certificateNumber);
    const sequence = getNextSequence(numbers, config.certificateNumberPrefix);
    const certificateNumber = generateCertificateNumber(validated.certificateType, sequence);

    // Build storage key (PDF will be uploaded separately)
    const certId = crypto.randomUUID();
    const storageKey = buildCertificateStorageKey(eventId, validated.certificateType, certId);

    // Create the new issued certificate
    const [newCert] = await tx
      .insert(issuedCertificates)
      .values({
        id: certId,
        eventId,
        personId: validated.personId,
        templateId: validated.templateId,
        templateVersionNo: template.versionNo,
        certificateType: validated.certificateType,
        eligibilityBasisType: validated.eligibilityBasisType,
        eligibilityBasisId: validated.eligibilityBasisId || null,
        certificateNumber,
        storageKey,
        fileName: `${certificateNumber}.pdf`,
        renderedVariablesJson: validated.renderedVariablesJson,
        brandingSnapshotJson: template.brandingSnapshotJson,
        templateSnapshotJson: template.templateJson,
        supersedesId: chain.newCertLink?.supersedesId || null,
        issuedBy: userId,
      })
      .returning();

    // If superseding, update the old certificate
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

    return newCert;
  });

  revalidatePath(`/events/${eventId}/certificates`);
  return issued;
}

// ── Revoke a certificate ─────────────────────────────────────
export async function revokeCertificate(eventId: string, input: unknown) {
  const { userId } = await assertEventAccess(eventId, { requireWrite: true });
  const validated = revokeCertificateSchema.parse(input);

  const [cert] = await db
    .select()
    .from(issuedCertificates)
    .where(
      withEventScope(
        issuedCertificates.eventId,
        eventId,
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
        eventId,
        eq(issuedCertificates.id, validated.certificateId),
      ),
    )
    .returning();

  revalidatePath(`/events/${eventId}/certificates`);
  return revoked;
}

// ── List issued certificates ─────────────────────────────────
export async function listIssuedCertificates(eventId: string) {
  await assertEventAccess(eventId);

  return db
    .select()
    .from(issuedCertificates)
    .where(eq(issuedCertificates.eventId, eventId))
    .orderBy(desc(issuedCertificates.issuedAt));
}

// ── Get single issued certificate ────────────────────────────
const certificateIdSchema = z.string().uuid('Invalid certificate ID');

export async function getIssuedCertificate(eventId: string, certificateId: string) {
  await assertEventAccess(eventId);
  const validatedId = certificateIdSchema.parse(certificateId);

  const [cert] = await db
    .select()
    .from(issuedCertificates)
    .where(
      withEventScope(
        issuedCertificates.eventId,
        eventId,
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
  await assertEventAccess(eventId);
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
        eventId,
        eq(issuedCertificates.id, validatedId),
      ),
    )
    .limit(1);

  if (!cert) throw new Error('Certificate not found');

  // Validate download access — blocks revoked, superseded, and ungenerated certs
  const access = validateDownloadAccess({
    id: cert.id,
    eventId,
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
        eventId,
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
