import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getEventTransportBatches, getSuggestedBatches } from '@/lib/actions/transport';
import { TransportPlanningClient } from './transport-planning-client';

type Params = Promise<{ eventId: string }>;

export default async function TransportPage({
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

  const [batches, suggestions] = await Promise.all([
    getEventTransportBatches(eventId),
    getSuggestedBatches(eventId),
  ]);

  return <TransportPlanningClient eventId={eventId} batches={batches} suggestions={suggestions} />;
}
