import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/actions/event';
import { RegistrationFormClient } from './registration-form-client';

type Params = Promise<{ eventSlug: string }>;

export default async function RegistrationPage({
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

  if (event.status !== 'published') {
    notFound();
  }

  return <RegistrationFormClient eventId={event.id} eventSlug={event.slug} eventName={event.name} />;
}
