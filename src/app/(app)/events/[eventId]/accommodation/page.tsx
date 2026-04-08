import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getEventAccommodationRecords } from '@/lib/actions/accommodation';
import { getUnresolvedFlags, getFlaggedEntityIds } from '@/lib/cascade/red-flags';
import { AccommodationListClient } from './accommodation-list-client';

type Params = Promise<{ eventId: string }>;

export default async function AccommodationPage({
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
