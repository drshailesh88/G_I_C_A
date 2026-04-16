import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema/program';
import {
  assertEventAccess,
  EventNotFoundError,
} from '@/lib/auth/event-access';
import {
  assertEventIdMatch,
  EventIdMismatchError,
} from '@/lib/auth/event-id-mismatch';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';
import { ROLES } from '@/lib/auth/roles';
import { SESSION_TYPES } from '@/lib/validations/program';

type Params = Promise<{ eventId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
});

const SESSION_WRITE_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

function isEventArchivedError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === 'EventArchivedError' &&
    (err as { statusCode?: unknown }).statusCode === 400
  );
}

const isoDateTimeSchema = z.string().trim().datetime('Invalid ISO timestamp');
const hallIdSchema = z.string().uuid('Invalid hall ID');
const sessionTypeSchema = z.enum(SESSION_TYPES);

const requestSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  startsAt: isoDateTimeSchema.optional(),
  starts_at: isoDateTimeSchema.optional(),
  endsAt: isoDateTimeSchema.optional(),
  ends_at: isoDateTimeSchema.optional(),
  hallId: hallIdSchema.optional(),
  hall_id: hallIdSchema.optional(),
  sessionType: sessionTypeSchema.optional(),
  session_type: sessionTypeSchema.optional(),
  eventId: z.string().optional(),
  event_id: z.string().optional(),
});

function pickAlias<T>(
  preferred: T | undefined,
  fallback: T | undefined,
): T | undefined {
  return preferred ?? fallback;
}

function getSubmittedEventId(
  body: z.infer<typeof requestSchema>,
  urlEventId: string,
): string | undefined {
  const submitted = [body.eventId, body.event_id].filter(
    (value): value is string => typeof value === 'string',
  );

  return submitted.find((value) => value !== urlEventId) ?? submitted[0];
}

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

  let userId: string;
  try {
    const access = await assertEventAccess(eventId, { requireWrite: true });
    if (!access.role || !SESSION_WRITE_ROLES.has(access.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    userId = access.userId!;
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return crossEvent404Response();
    }
    if (isEventArchivedError(err)) {
      return NextResponse.json({ error: 'event archived' }, { status: 400 });
    }
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyResult = requestSchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        fields: bodyResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const data = bodyResult.data;

  try {
    assertEventIdMatch({
      urlEventId: eventId,
      bodyEventId: getSubmittedEventId(data, eventId),
      userId,
      endpoint: `/api/events/${eventId}/sessions`,
    });
  } catch (err) {
    if (err instanceof EventIdMismatchError) {
      return NextResponse.json(
        { error: 'eventId mismatch' },
        { status: 400 },
      );
    }
    throw err;
  }

  try {
    const startsAt = pickAlias(data.startsAt, data.starts_at);
    const endsAt = pickAlias(data.endsAt, data.ends_at);
    const hallId = pickAlias(data.hallId, data.hall_id);
    const sessionType = pickAlias(data.sessionType, data.session_type);

    const [session] = await db
      .insert(sessions)
      .values({
        eventId,
        title: data.title,
        startAtUtc: startsAt ? new Date(startsAt) : null,
        endAtUtc: endsAt ? new Date(endsAt) : null,
        hallId: hallId ?? null,
        sessionType: sessionType ?? 'other',
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return NextResponse.json({ id: session.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500 },
    );
  }
}
