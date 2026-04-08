import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEventAccommodationRecords } from '@/lib/actions/accommodation';
import { getUnresolvedFlags, getFlaggedEntityIds } from '@/lib/cascade/red-flags';
import { AccommodationListClient } from './accommodation-list-client';

type Params = Promise<{ eventId: string }>;

export default async function AccommodationPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;

  const [records, flags, flaggedIds] = await Promise.all([
    getEventAccommodationRecords(eventId),
    getUnresolvedFlags(eventId, 'accommodation_record'),
    getFlaggedEntityIds(eventId, 'accommodation_record'),
  ]);

  return (
    <AccommodationListClient
      eventId={eventId}
      records={records}
      flags={flags}
      flaggedIds={flaggedIds}
    />
  );
}
