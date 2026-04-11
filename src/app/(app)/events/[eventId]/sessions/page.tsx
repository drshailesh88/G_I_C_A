import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getScheduleData } from '@/lib/actions/program';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { SessionsManagerClient } from './sessions-manager-client';

type Params = Promise<{ eventId: string }>;

export default async function SessionsPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;
  const { role } = await assertEventAccess(eventId);
  const data = await getScheduleData(eventId);
  const canWrite =
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.EVENT_COORDINATOR ||
    role === ROLES.OPS;

  return (
    <SessionsManagerClient
      eventId={eventId}
      sessions={data.sessions}
      halls={data.halls}
      conflicts={data.conflicts}
      canWriteOverride={canWrite}
    />
  );
}
