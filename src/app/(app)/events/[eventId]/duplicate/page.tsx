import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getEvent } from '@/lib/actions/event';
import { ROLES } from '@/lib/auth/roles';
import { sessionHasAnyRole } from '@/lib/auth/session-role';
import { DuplicateEventClient } from './duplicate-event-client';

export default async function DuplicateEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  if (!sessionHasAnyRole(session, [ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR])) {
    redirect(`/events/${eventId}`);
  }

  const event = await getEvent(eventId);

  return <DuplicateEventClient sourceEvent={event} />;
}
