import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { assertEventAccess, EventArchivedError, EventNotFoundError } from '@/lib/auth/event-access';
import { assertEventIdMatch, EventIdMismatchError } from '@/lib/auth/event-id-mismatch';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';
import { ROLES } from '@/lib/auth/roles';
import { CERTIFICATE_TYPES } from '@/lib/validations/certificate';
import { Redis } from '@upstash/redis';
import { inngest } from '@/lib/inngest/client';
import { captureSentInngestEvent } from '@/lib/inngest/captured-events';
import { readBulkCertificateGenerationSummary } from '@/lib/certificates/bulk-generation-state';

type Params = Promise<{ eventId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
});

const CERTIFICATE_WRITE_ROLES: ReadonlySet<string> = new Set([ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR]);

const LOCK_TTL_SECONDS = 300;

const bulkBodySchema = z.object({
  certificate_type: z.enum(CERTIFICATE_TYPES),
  scope: z.union([z.literal('all'), z.object({ ids: z.array(z.string().uuid()).min(1) })]),
});

const bulkSummaryQuerySchema = z.object({
  batch_id: z.string().uuid('Invalid batch ID'),
});

function buildLockKey(eventId: string, certificateType: string): string {
  return `lock:certificates:generate:${eventId}:${certificateType}`;
}

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
  return (typeof EventArchivedError === 'function' && err instanceof EventArchivedError) || (err instanceof Error && err.name === 'EventArchivedError');
}

function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.UPSTASH_REDIS_REST_URL_TEST;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN_TEST;
  if (!url && !token && process.env.NODE_ENV === 'test') {
    return { url: 'https://redis.test', token: 'test-token' };
  }
  return url && token ? { url, token } : null;
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { eventId: rawEventId } = await params;

  const parsed = paramsSchema.safeParse({ eventId: rawEventId });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }
  const { eventId } = parsed.data;

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

  const [event] = await db.select({ status: events.status }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event || event.status === 'archived') {
    return NextResponse.json({ error: 'event archived' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyResult = bulkBodySchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        fields: bodyResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    assertEventIdMatch({
      urlEventId: eventId,
      bodyEventId: getSubmittedEventId(body),
      userId,
      endpoint: 'POST /api/events/[eventId]/certificates/bulk',
    });
  } catch (err) {
    if (err instanceof EventIdMismatchError) {
      return NextResponse.json({ error: 'eventId mismatch' }, { status: 400 });
    }
    throw err;
  }

  const { certificate_type, scope } = bodyResult.data;
  const lockKey = buildLockKey(eventId, certificate_type);

  const credentials = redisCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }
  const redis = new Redis(credentials);

  const lockMeta = JSON.stringify({
    lock_holder: userId,
    started_at: new Date().toISOString(),
  });

  const lockResult = await redis.set(lockKey, lockMeta, {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });

  if (lockResult !== 'OK') {
    const existing = await redis.get(lockKey);
    const ttl = await redis.ttl(lockKey);

    let lockHolder = 'unknown';
    let startedAt = 'unknown';
    if (existing && typeof existing === 'object') {
      const meta = existing as Record<string, unknown>;
      lockHolder = (meta.lock_holder as string) ?? 'unknown';
      startedAt = (meta.started_at as string) ?? 'unknown';
    } else if (typeof existing === 'string') {
      try {
        const meta = JSON.parse(existing);
        lockHolder = meta.lock_holder ?? 'unknown';
        startedAt = meta.started_at ?? 'unknown';
      } catch {
        // not parseable JSON
      }
    }

    const expiresAt = ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : 'unknown';

    return NextResponse.json(
      {
        error: 'generation in progress',
        lock_holder: lockHolder,
        started_at: startedAt,
        expires_at: expiresAt,
      },
      { status: 409 },
    );
  }

  const batchId = crypto.randomUUID();
  const total = scope === 'all' ? 0 : scope.ids.length;
  const lockExpiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString();

  try {
    const inngestEvent = {
      name: 'bulk/certificates.generate',
      data: {
        eventId,
        userId,
        batchId,
        certificateType: certificate_type,
        scope,
        lockKey,
      },
    };
    const sendResult = await inngest.send(inngestEvent);
    await captureSentInngestEvent(inngestEvent, sendResult).catch(() => {});

    return NextResponse.json(
      {
        batch_id: batchId,
        total,
        lock_expires_at: lockExpiresAt,
      },
      { status: 202 },
    );
  } catch (err) {
    await redis.del(lockKey);
    console.error(`Bulk certificate generation failed for eventId=${eventId}:`, err);
    return NextResponse.json({ error: 'Bulk generation failed' }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: Params }) {
  const { eventId: rawEventId } = await params;

  const parsed = paramsSchema.safeParse({ eventId: rawEventId });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }
  const { eventId } = parsed.data;

  let role: string | null;
  try {
    const access = await assertEventAccess(eventId);
    role = access.role;
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return crossEvent404Response();
    }
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!role || (role !== ROLES.SUPER_ADMIN && role !== ROLES.EVENT_COORDINATOR && role !== ROLES.READ_ONLY)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const queryResult = bulkSummaryQuerySchema.safeParse({
    batch_id: url.searchParams.get('batch_id'),
  });
  if (!queryResult.success) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        fields: queryResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const summary = await readBulkCertificateGenerationSummary(eventId, queryResult.data.batch_id);
    if (!summary) {
      return NextResponse.json({ error: 'batch not found' }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'invalid batch summary' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }
}
