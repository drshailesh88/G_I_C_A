import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEventRegistrations } from '@/lib/actions/registration';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
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
  const { role } = await assertEventAccess(eventId);
  const registrations = await getEventRegistrations(eventId);
  const canWrite =
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.EVENT_COORDINATOR ||
    role === ROLES.OPS;

  return <RegistrationsListClient eventId={eventId} registrations={registrations} canWriteOverride={canWrite} />;
}
