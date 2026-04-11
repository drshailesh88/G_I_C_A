import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import {
  getSession,
  getHalls,
  getSessions,
  getSessionRoleRequirements,
  getSessionAssignments,
} from '@/lib/actions/program';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ROLES } from '@/lib/auth/roles';
import { SessionFormClient } from '../session-form-client';

type Params = Promise<{ eventId: string; sessionId: string }>;

export default async function EditSessionPage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId, sessionId } = await params;

  try {
    const { role } = await assertEventAccess(eventId);
    const [session, halls, existingSessions, roleRequirements, assignments] =
      await Promise.all([
        getSession(eventId, sessionId),
        getHalls(eventId),
        getSessions(eventId),
        getSessionRoleRequirements(eventId, sessionId),
        getSessionAssignments(eventId, sessionId),
      ]);
    const canWrite =
      role === ROLES.SUPER_ADMIN ||
      role === ROLES.EVENT_COORDINATOR ||
      role === ROLES.OPS;

    // Only pass parent-eligible sessions (those without a parent, excluding current session)
    const parentEligible = existingSessions.filter(
      (s) => !s.parentSessionId && s.id !== sessionId,
    );

    return (
      <SessionFormClient
        eventId={eventId}
        halls={halls}
        parentSessions={parentEligible}
        mode="edit"
        session={session}
        roleRequirements={roleRequirements.map((r) => r.session_role_requirements)}
        assignments={assignments}
        canWriteOverride={canWrite}
      />
    );
  } catch {
    notFound();
  }
}
