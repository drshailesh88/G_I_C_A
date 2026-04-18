import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/actions/event';
import { getPublicSpeakers } from '@/lib/actions/speaker-profile';
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

  const speakers = await getPublicSpeakers(event.id).catch(() => []);

  return <EventLandingClient event={event} speakers={speakers} />;
}
