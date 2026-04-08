import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/actions/event';
import { EventLandingClient } from './event-landing-client';

type Params = Promise<{ eventSlug: string }>;

export default async function EventLandingPage({
  params,
}: {
  params: Params;
}) {
  const { eventSlug } = await params;

  let event;
  try {
    event = await getEventBySlug(eventSlug);
  } catch (err) {
    if (err instanceof Error && err.message === 'Event not found') {
      notFound();
    }
    throw err;
  }

  return <EventLandingClient event={event} />;
}
