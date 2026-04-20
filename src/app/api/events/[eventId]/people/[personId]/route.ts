import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people } from '@/lib/db/schema/people';
import { eventPeople } from '@/lib/db/schema/event-people';
import { travelRecords } from '@/lib/db/schema/logistics';
import { sessionAssignments } from '@/lib/db/schema/program';
import { eventRegistrations } from '@/lib/db/schema/registrations';
import {
  assertEventAccess,
  EventNotFoundError,
} from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { crossEvent404Response } from '@/lib/auth/sanitize-cross-event-404';

// People detail returns PII (name, email, phone, registration/travel/session
// data). Ops is limited to logistics surfaces so cannot read this, even with
// event-level access.
const PEOPLE_READ_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.READ_ONLY,
]);

type Params = Promise<{ eventId: string; personId: string }>;

const paramsSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  personId: z.string().uuid('Invalid person ID'),
});

export async function GET(
  _request: Request,
  { params }: { params: Params },
) {
  const { eventId: rawEventId, personId: rawPersonId } = await params;

  const parsed = paramsSchema.safeParse({ eventId: rawEventId, personId: rawPersonId });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }
  const { eventId, personId } = parsed.data;

  try {
    const { role } = await assertEventAccess(eventId);
    if (!role || !PEOPLE_READ_ROLES.has(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  } catch (err) {
    if (err instanceof EventNotFoundError) {
      return crossEvent404Response();
    }
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const epRows = await db
      .select()
      .from(eventPeople)
      .where(and(eq(eventPeople.eventId, eventId), eq(eventPeople.personId, personId)))
      .limit(1);

    if (epRows.length === 0) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const personRows = await db
      .select()
      .from(people)
      .where(eq(people.id, personId))
      .limit(1);

    if (personRows.length === 0) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const person = personRows[0];

    const travel = await db
      .select()
      .from(travelRecords)
      .where(and(eq(travelRecords.eventId, eventId), eq(travelRecords.personId, personId)));

    const sessions = await db
      .select()
      .from(sessionAssignments)
      .where(and(eq(sessionAssignments.eventId, eventId), eq(sessionAssignments.personId, personId)));

    const regRows = await db
      .select()
      .from(eventRegistrations)
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.personId, personId)))
      .limit(1);

    return NextResponse.json({
      person: {
        id: person.id,
        full_name: person.fullName,
        email: person.email,
        phone_e164: person.phoneE164,
        salutation: person.salutation,
        designation: person.designation,
        specialty: person.specialty,
        organization: person.organization,
        city: person.city,
      },
      travel: travel.length > 0 ? travel : [],
      sessions,
      registration: regRows.length > 0 ? regRows[0] : null,
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
