import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issuedCertificates, certificateTemplates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { assertEventAccess, EventNotFoundError } from '@/lib/auth/event-access';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';
import { ROLES } from '@/lib/auth/roles';
import { issueCertificate } from '@/lib/actions/certificate-issuance';
import { withEventScope } from '@/lib/db/with-event-scope';

type Params = Promise<{ eventId: string; certificateId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  certificateId: z.string().uuid('Invalid certificate ID'),
});

const CERTIFICATE_WRITE_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

export async function POST(
  request: Request,
  { params }: { params: Params },
) {
  const rawParams = await params;

  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }
  const { eventId, certificateId } = parsed.data;

  let role: string | null;
  try {
    const access = await assertEventAccess(eventId, { requireWrite: true });
    role = access.role;
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return crossEvent404Response();
    }
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!role || !CERTIFICATE_WRITE_ROLES.has(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [oldCert] = await db
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

  if (!oldCert) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  if (oldCert.status !== 'issued') {
    return NextResponse.json(
      { error: `Cannot regenerate certificate with status '${oldCert.status}'` },
      { status: 400 },
    );
  }

  const [activeTemplate] = await db
    .select({ id: certificateTemplates.id })
    .from(certificateTemplates)
    .where(
      withEventScope(
        certificateTemplates.eventId,
        eventId,
        and(
          eq(certificateTemplates.certificateType, oldCert.certificateType),
          eq(certificateTemplates.status, 'active'),
        )!,
      ),
    )
    .limit(1);

  if (!activeTemplate) {
    return NextResponse.json(
      { error: 'No active template found for this certificate type' },
      { status: 400 },
    );
  }

  try {
    const newCert = await issueCertificate(eventId, {
      personId: oldCert.personId,
      certificateType: oldCert.certificateType,
      templateId: activeTemplate.id,
      eligibilityBasisType: oldCert.eligibilityBasisType,
      eligibilityBasisId: oldCert.eligibilityBasisId || undefined,
      renderedVariablesJson: oldCert.renderedVariablesJson ?? {},
    });

    return NextResponse.json(
      {
        id: newCert.id,
        certificate_number: newCert.certificateNumber,
        supersedes_id: certificateId,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('Person not found') || message.includes('person not attached')) {
      return NextResponse.json({ error: 'person not attached to event' }, { status: 400 });
    }
    if (message.includes('event') && message.toLowerCase().includes('archived')) {
      return NextResponse.json({ error: 'event archived' }, { status: 400 });
    }

    console.error(`Certificate regeneration failed for eventId=${eventId}, certId=${certificateId}:`, err);
    return NextResponse.json({ error: 'Certificate regeneration failed' }, { status: 500 });
  }
}
