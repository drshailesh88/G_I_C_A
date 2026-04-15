import { redirect, notFound } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getEventPeople } from '@/lib/actions/person';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema/events';
import { eq } from 'drizzle-orm';
import { EventPeopleClient } from './event-people-client';

type Params = Promise<{ eventId: string }>;

export default async function EventPeoplePage({
  params,
}: {
  params: Params;
}) {
  const { eventId } = await params;

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    notFound();
  }

  const people = await getEventPeople(eventId);

  return <EventPeopleClient eventId={eventId} people={people} />;
}
