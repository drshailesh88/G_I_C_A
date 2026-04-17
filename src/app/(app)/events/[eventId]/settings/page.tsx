import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEvent } from '@/lib/actions/event';
import { ROLES } from '@/lib/auth/roles';
import { EventSettingsClient } from './event-settings-client';

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/login');

  const { eventId } = await params;
  const event = await getEvent(eventId);

  const isReadOnly = session.has?.({ role: ROLES.READ_ONLY }) ?? false;

  return <EventSettingsClient event={event} canWrite={!isReadOnly} />;
}
