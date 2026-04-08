'use server';

import { db } from '@/lib/db';
import { issuedCertificates, certificateTemplates, people } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
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

  // Check for existing current certificate (one-current-valid)
  const existingCerts = await db
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
  const existingNumbers = await db
    .select({ certificateNumber: issuedCertificates.certificateNumber })
    .from(issuedCertificates)
    .where(eq(issuedCertificates.eventId, eventId));

  const config = getCertificateTypeConfig(validated.certificateType);
  const sequence = existingNumbers.length + 1;
  const certificateNumber = generateCertificateNumber(validated.certificateType, sequence);

  // Build storage key (PDF will be uploaded separately)
  const certId = crypto.randomUUID();
  const storageKey = buildCertificateStorageKey(eventId, validated.certificateType, certId);

  // Create the new issued certificate
  const [issued] = await db
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
    await db
      .update(issuedCertificates)
      .set({
        status: 'superseded',
        supersededById: issued.id,
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
export async function getIssuedCertificate(eventId: string, certificateId: string) {
  await assertEventAccess(eventId);

  const [cert] = await db
    .select()
    .from(issuedCertificates)
    .where(
      withEventScope(
        issuedCertificates.eventId,
        eventId,
        eq(issuedCertificates.id, certificateId),
      ),
    )
    .limit(1);

  if (!cert) throw new Error('Certificate not found');
  return cert;
}
