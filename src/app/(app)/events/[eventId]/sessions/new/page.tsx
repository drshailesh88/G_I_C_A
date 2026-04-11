import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getHalls, getSessions } from '@/lib/actions/program';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { SessionFormClient } from '../session-form-client';

type Params = Promise<{ eventId: string }>;

export default async function NewSessionPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;
  const { role } = await assertEventAccess(eventId);
  const [halls, existingSessions] = await Promise.all([
    getHalls(eventId),
    getSessions(eventId),
  ]);
  const canWrite =
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.EVENT_COORDINATOR ||
    role === ROLES.OPS;

  // Only pass parent-eligible sessions (those without a parent themselves)
  const parentEligible = existingSessions.filter((s) => !s.parentSessionId);

  return (
    <SessionFormClient
      eventId={eventId}
      halls={halls}
      parentSessions={parentEligible}
      mode="create"
      canWriteOverride={canWrite}
    />
  );
}
