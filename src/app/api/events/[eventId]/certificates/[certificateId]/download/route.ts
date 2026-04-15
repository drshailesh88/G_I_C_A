import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { issuedCertificates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { assertEventAccess } from '@/lib/auth/event-access';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';
import { ROLES } from '@/lib/auth/roles';
import { withEventScope } from '@/lib/db/with-event-scope';
import { createR2Provider } from '@/lib/certificates/storage';

type Params = Promise<{ eventId: string; certificateId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  certificateId: z.string().uuid('Invalid certificate ID'),
});

const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
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
    const access = await assertEventAccess(eventId, { requireWrite: false });
    role = access.role;
  } catch {
    return crossEvent404Response();
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

  if (cert.status === 'revoked' && role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }

  const storage = createR2Provider();
  const url = await storage.getSignedUrl(cert.storageKey, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({ url }, { status: 200 });
}
