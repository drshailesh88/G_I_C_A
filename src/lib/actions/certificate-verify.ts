import { z } from 'zod';
import { db } from '@/lib/db';
import { issuedCertificates } from '@/lib/db/schema/certificates';
import { people } from '@/lib/db/schema/people';
import { events } from '@/lib/db/schema/events';
import { eq, and, sql } from 'drizzle-orm';
import { serializeVerifyResponse } from './certificate-verify-serializer';

export { serializeVerifyResponse };

const verificationTokenSchema = z.string().uuid('Invalid verification token');

export async function lookupAndVerify(token: string) {
  const validatedToken = verificationTokenSchema.parse(token);

  const [cert] = await db
    .select({
      id: issuedCertificates.id,
      certificateNumber: issuedCertificates.certificateNumber,
      certificateType: issuedCertificates.certificateType,
      status: issuedCertificates.status,
      issuedAt: issuedCertificates.issuedAt,
      revokedAt: issuedCertificates.revokedAt,
      revokeReason: issuedCertificates.revokeReason,
      supersededById: issuedCertificates.supersededById,
      eventId: issuedCertificates.eventId,
      personName: people.fullName,
      eventName: events.name,
    })
    .from(issuedCertificates)
    .innerJoin(people, eq(issuedCertificates.personId, people.id))
    .innerJoin(events, eq(issuedCertificates.eventId, events.id))
    .where(eq(issuedCertificates.verificationToken, validatedToken))
    .limit(1);

  if (!cert) {
    return null;
  }

  // Increment verification_count and set last_verified_at atomically for ALL statuses
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
    .catch((err: unknown) => {
      console.error('[certificate-verify] failed to increment verification count:', err);
    });

  const responseData: Record<string, unknown> = {
    status: cert.status,
    certificate_number: cert.certificateNumber,
    certificate_type: cert.certificateType,
    person_name: cert.personName,
    event_name: cert.eventName,
    issued_at: cert.issuedAt,
  };

  if (cert.status === 'revoked') {
    responseData.revoked_at = cert.revokedAt;
    responseData.revoke_reason = cert.revokeReason;
  }

  if (cert.status === 'superseded' && cert.supersededById) {
    const [newer] = await db
      .select({ certificateNumber: issuedCertificates.certificateNumber })
      .from(issuedCertificates)
      .where(eq(issuedCertificates.id, cert.supersededById))
      .limit(1);

    if (newer) {
      responseData.superseded_by_certificate_number = newer.certificateNumber;
    }
  }

  return serializeVerifyResponse(responseData);
}
