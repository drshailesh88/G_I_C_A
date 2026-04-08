import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getEventTravelRecords } from '@/lib/actions/travel';
import { TravelListClient } from './travel-list-client';

type Params = Promise<{ eventId: string }>;

export default async function TravelPage({
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

  const records = await getEventTravelRecords(eventId);
  return <TravelListClient eventId={eventId} records={records} />;
}
