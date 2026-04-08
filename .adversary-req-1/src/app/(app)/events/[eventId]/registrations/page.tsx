import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEventRegistrations } from '@/lib/actions/registration';
import { RegistrationsListClient } from './registrations-list-client';

type Params = Promise<{ eventId: string }>;

export default async function RegistrationsPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;
  const registrations = await getEventRegistrations(eventId);

  return <RegistrationsListClient eventId={eventId} registrations={registrations} />;
}
