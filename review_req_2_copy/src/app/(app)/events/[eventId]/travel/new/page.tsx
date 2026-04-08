import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getEventPeople } from '@/lib/actions/person';
import { TravelFormClient } from '../travel-form-client';

type Params = Promise<{ eventId: string }>;

export default async function NewTravelPage({
  params,
}: {
  params: Params;
}) {
  const { eventId } = await params;

  try {
    await assertEventAccess(eventId, { requireWrite: true });
  } catch {
    redirect('/login');
  }

  // Fetch people linked to this event (event-scoped via event_people junction)
  const eventPeople = await getEventPeople(eventId);

  return (
    <TravelFormClient
      eventId={eventId}
      people={eventPeople.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        phoneE164: p.phoneE164,
      }))}
    />
  );
}
