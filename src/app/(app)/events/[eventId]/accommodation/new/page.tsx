import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getPeopleWithTravelRecords } from '@/lib/actions/accommodation';
import { AccommodationFormClient } from '../accommodation-form-client';

type Params = Promise<{ eventId: string }>;

export default async function NewAccommodationPage({
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

  const peopleWithTravel = await getPeopleWithTravelRecords(eventId);

  return (
    <AccommodationFormClient
      eventId={eventId}
      peopleWithTravel={peopleWithTravel}
    />
  );
}
