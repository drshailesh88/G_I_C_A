import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issuedCertificates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { assertEventAccess, EventNotFoundError } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { withEventScope } from '@/lib/db/with-event-scope';

type Params = Promise<{ eventId: string; certificateId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  certificateId: z.string().uuid('Invalid certificate ID'),
});

const bodySchema = z.object({
  reason: z.string().refine((val) => val.trim().length > 0, {
    message: 'reason_required',
  }),
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
      return NextResponse.json(null, { status: 404 });
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
