import { notFound } from 'next/navigation';
import { getEventBySlug } from '@/lib/actions/event';
import { RegistrationFormClient } from './registration-form-client';

type Params = Promise<{ eventSlug: string }>;

function isRegistrationOpen(registrationSettings: unknown, now = new Date()) {
  const settings = (registrationSettings ?? {}) as Record<string, unknown>;
  const cutoffDate = typeof settings.cutoffDate === 'string' ? settings.cutoffDate : null;
  const openFlag = settings.open !== false;
  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(now);

  return openFlag && (!cutoffDate || todayIst <= cutoffDate);
}

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

  return (
    <RegistrationFormClient
      eventId={event.id}
      eventSlug={event.slug}
      eventName={event.name}
      registrationOpen={isRegistrationOpen(event.registrationSettings)}
    />
  );
}
