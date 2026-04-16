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

const requestSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  hall_id: z.string().uuid().optional(),
  session_type: z.string().optional(),
  event_id: z.string().optional(),
});

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
      bodyEventId: data.event_id,
      userId,
      endpoint: 'POST /api/events/[eventId]/sessions',
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
    const [session] = await db
      .insert(sessions)
      .values({
        eventId,
        title: data.title,
        startAtUtc: data.starts_at ? new Date(data.starts_at) : null,
        endAtUtc: data.ends_at ? new Date(data.ends_at) : null,
        hallId: data.hall_id ?? null,
        sessionType: data.session_type ?? 'other',
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
