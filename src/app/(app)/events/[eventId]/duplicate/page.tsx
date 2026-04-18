import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getEvent } from '@/lib/actions/event';
import { DuplicateEventClient } from './duplicate-event-client';

export default async function DuplicateEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const isAllowed =
    session.has?.({ role: 'org:super_admin' }) ||
    session.has?.({ role: 'org:event_coordinator' });
  if (!isAllowed) redirect(`/events/${eventId}`);

  const event = await getEvent(eventId);

  return <DuplicateEventClient sourceEvent={event} />;
}
