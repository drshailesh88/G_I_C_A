import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issuedCertificates, certificateTemplates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  assertEventAccess,
  EventArchivedError,
  EventNotFoundError,
} from '@/lib/auth/event-access';
import {
  assertEventIdMatch,
  EventIdMismatchError,
} from '@/lib/auth/event-id-mismatch';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';
import { ROLES } from '@/lib/auth/roles';
import { issueCertificate } from '@/lib/actions/certificate-issuance';
import { withEventScope } from '@/lib/db/with-event-scope';

type Params = Promise<{ eventId: string; certificateId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  certificateId: z.string().uuid('Invalid certificate ID'),
});

const bodySchema = z
  .object({
    eventId: z.string().uuid('Invalid event ID').optional(),
    event_id: z.string().uuid('Invalid event ID').optional(),
  })
  .strict();

const CERTIFICATE_WRITE_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

function getSubmittedEventId(
  body: z.infer<typeof bodySchema>,
  urlEventId: string,
): string | undefined {
  const submitted = [body.eventId, body.event_id].filter(
    (value): value is string => typeof value === 'string',
  );

  return submitted.find((value) => value !== urlEventId) ?? submitted[0];
}

function isEventArchivedError(err: unknown): boolean {
  return (
    (typeof EventArchivedError === 'function' && err instanceof EventArchivedError) ||
    (err instanceof Error && err.name === 'EventArchivedError')
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (!raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

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
  let userId: string;
  try {
    const access = await assertEventAccess(eventId, { requireWrite: true });
    role = access.role;
    userId = access.userId;
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return crossEvent404Response();
    }
    if (isEventArchivedError(err)) {
      return NextResponse.json({ error: 'event archived' }, { status: 400 });
    }
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!role || !CERTIFICATE_WRITE_ROLES.has(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyResult = bodySchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: 'validation_failed', fields: bodyResult.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    assertEventIdMatch({
      urlEventId: eventId,
      bodyEventId: getSubmittedEventId(bodyResult.data, eventId),
      userId,
      endpoint: 'POST /api/events/[eventId]/certificates/[certificateId]/regenerate',
    });
  } catch (err) {
    if (err instanceof EventIdMismatchError) {
      return NextResponse.json({ error: 'eventId mismatch' }, { status: 400 });
    }
    throw err;
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
