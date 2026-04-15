import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { assertEventAccess, EventNotFoundError } from '@/lib/auth/event-access';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';
import { ROLES } from '@/lib/auth/roles';
import { issueCertificate } from '@/lib/actions/certificate-issuance';
import { CERTIFICATE_TYPES, ELIGIBILITY_BASIS_TYPES, createCmeVariablesSchema } from '@/lib/validations/certificate';

type Params = Promise<{ eventId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
});

const CERTIFICATE_WRITE_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

export const issueCertificateRequestSchema = z
  .object({
    person_id: z.string().uuid('Invalid person ID'),
    certificate_type: z.enum(CERTIFICATE_TYPES),
    template_id: z.string().uuid('Invalid template ID'),
    eligibility_basis_type: z.enum(ELIGIBILITY_BASIS_TYPES),
    eligibility_basis_id: z.string().uuid().nullable().optional(),
    variables: z.record(z.unknown()),
  })
  .transform((data) => ({
    personId: data.person_id,
    certificateType: data.certificate_type,
    templateId: data.template_id,
    eligibilityBasisType: data.eligibility_basis_type,
    eligibilityBasisId: data.eligibility_basis_id ?? undefined,
    renderedVariablesJson: data.variables,
  }));

export async function POST(
  request: Request,
  { params }: { params: Params },
) {
  const { eventId: rawEventId } = await params;

  const parsed = paramsSchema.safeParse({ eventId: rawEventId });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }
  const { eventId } = parsed.data;

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyResult = issueCertificateRequestSchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: 'validation_failed', fields: bodyResult.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (bodyResult.data.certificateType === 'cme_attendance') {
    const [event] = await db
      .select({ startDate: events.startDate, endDate: events.endDate })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const durationHours =
      (event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60 * 60);
    const cmeSchema = createCmeVariablesSchema(durationHours);
    const cmeResult = cmeSchema.safeParse(bodyResult.data.renderedVariablesJson);
    if (!cmeResult.success) {
      return NextResponse.json(
        { error: 'validation_failed', fields: cmeResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
  }

  try {
    const cert = await issueCertificate(eventId, bodyResult.data);
    return NextResponse.json(
      {
        id: cert.id,
        certificate_number: cert.certificateNumber,
        verification_token: cert.verificationToken,
        status: 'issued',
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('Person not found') || message.includes('person not attached')) {
      return NextResponse.json({ error: 'person not attached to event' }, { status: 400 });
    }
    if (message.toLowerCase().includes('event') && message.toLowerCase().includes('archived')) {
      return NextResponse.json({ error: 'event archived' }, { status: 400 });
    }
    if (message.includes('template not found') || message.includes('Active certificate template not found')) {
      return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
    }

    console.error(`Certificate issuance failed for eventId=${eventId}:`, err);
    return NextResponse.json({ error: 'Certificate issuance failed' }, { status: 500 });
  }
}
