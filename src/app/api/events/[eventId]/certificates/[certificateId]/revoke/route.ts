import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issuedCertificates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
import { withEventScope } from '@/lib/db/with-event-scope';

type Params = Promise<{ eventId: string; certificateId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  certificateId: z.string().uuid('Invalid certificate ID'),
});

const bodySchema = z.object({
  reason: z.string().trim().min(1, 'reason_required'),
});

const CERTIFICATE_WRITE_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

function getSubmittedEventId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }

  const candidate = body as { eventId?: unknown; event_id?: unknown };
  if (typeof candidate.eventId === 'string') {
    return candidate.eventId;
  }
  if (typeof candidate.event_id === 'string') {
    return candidate.event_id;
  }
  return undefined;
}

function isEventArchivedError(err: unknown): boolean {
  return (
    (typeof EventArchivedError === 'function' && err instanceof EventArchivedError) ||
    (err instanceof Error && err.name === 'EventArchivedError')
  );
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

  const rawBody = await request.json().catch(() => ({}));
  const bodyResult = bodySchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return NextResponse.json({ error: 'reason_required' }, { status: 400 });
  }
  const { reason } = bodyResult.data;

  try {
    assertEventIdMatch({
      urlEventId: eventId,
      bodyEventId: getSubmittedEventId(rawBody),
      userId,
      endpoint: 'POST /api/events/[eventId]/certificates/[certificateId]/revoke',
    });
  } catch (err) {
    if (err instanceof EventIdMismatchError) {
      return NextResponse.json({ error: 'eventId mismatch' }, { status: 400 });
    }
    throw err;
  }

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

  if (!cert) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  if (cert.status === 'revoked') {
    return NextResponse.json({ error: 'Certificate already revoked' }, { status: 400 });
  }

  if (cert.status !== 'issued') {
    return NextResponse.json(
      { error: `Cannot revoke certificate with status '${cert.status}'` },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(issuedCertificates)
    .set({
      status: 'revoked',
      revokedAt: new Date(),
      revokeReason: reason,
      updatedAt: new Date(),
    })
    .where(
      withEventScope(
        issuedCertificates.eventId,
        eventId,
        eq(issuedCertificates.id, certificateId),
      ),
    )
    .returning({
      id: issuedCertificates.id,
      status: issuedCertificates.status,
      revokedAt: issuedCertificates.revokedAt,
    });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    revoked_at: updated.revokedAt,
  }, { status: 200 });
}
