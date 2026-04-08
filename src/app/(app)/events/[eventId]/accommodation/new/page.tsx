import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getPeopleWithTravelRecords } from '@/lib/actions/accommodation';
import { AccommodationFormClient } from '../accommodation-form-client';

type Params = Promise<{ eventId: string }>;

export default async function NewAccommodationPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;
  const peopleWithTravel = await getPeopleWithTravelRecords(eventId);

  return (
    <AccommodationFormClient
      eventId={eventId}
      peopleWithTravel={peopleWithTravel}
    />
  );
}
