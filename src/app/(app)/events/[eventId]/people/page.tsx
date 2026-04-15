import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getEventPeople } from '@/lib/actions/person';
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

  const people = await getEventPeople(eventId);

  return <EventPeopleClient eventId={eventId} people={people} />;
}
