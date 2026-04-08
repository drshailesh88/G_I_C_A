import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEventTransportBatches } from '@/lib/actions/transport';
import { TransportPlanningClient } from './transport-planning-client';

type Params = Promise<{ eventId: string }>;

export default async function TransportPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;
  const batches = await getEventTransportBatches(eventId);

  return <TransportPlanningClient eventId={eventId} batches={batches} />;
}
