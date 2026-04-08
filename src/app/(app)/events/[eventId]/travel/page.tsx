import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEventTravelRecords } from '@/lib/actions/travel';
import { TravelListClient } from './travel-list-client';

type Params = Promise<{ eventId: string }>;

export default async function TravelPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;
  const records = await getEventTravelRecords(eventId);

  return <TravelListClient eventId={eventId} records={records} />;
}
