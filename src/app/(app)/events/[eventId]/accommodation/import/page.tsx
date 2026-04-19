import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { AccommodationImportClient } from './accommodation-import-client';

type Params = Promise<{ eventId: string }>;

export default async function AccommodationImportPage({ params }: { params: Params }) {
  const { eventId } = await params;

  try {
    await assertEventAccess(eventId, { requireWrite: true });
  } catch {
    redirect(`/events/${eventId}/accommodation`);
  }

  return <AccommodationImportClient eventId={eventId} />;
}
