import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROLES } from '@/lib/auth/roles';
import { sessionHasRole } from '@/lib/auth/session-role';
import { getEvent } from '@/lib/actions/event';
import { getEventAssignments } from '@/lib/actions/event-assignments';
import { getTeamMembers } from '@/lib/actions/team';
import { TransferOwnershipClient } from './transfer-ownership-client';

export default async function TransferOwnershipPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/login');

  if (!sessionHasRole(session, ROLES.SUPER_ADMIN)) redirect('/dashboard');

  const { eventId } = await params;

  const [event, assignments, teamMembers] = await Promise.all([
    getEvent(eventId),
    getEventAssignments(eventId),
    getTeamMembers(),
  ]);

  const currentOwnerAssignment = assignments.find(
    (a) => a.assignmentType === 'owner' && a.isActive,
  );

  const currentOwner = currentOwnerAssignment
    ? teamMembers.find((m) => m.userId === currentOwnerAssignment.authUserId) ?? null
    : null;

  return (
    <TransferOwnershipClient
      eventId={eventId}
      eventName={event.name}
      currentOwnerUserId={currentOwnerAssignment?.authUserId ?? null}
      currentOwnerDisplayName={
        currentOwner
          ? [currentOwner.firstName, currentOwner.lastName].filter(Boolean).join(' ') || currentOwner.email
          : currentOwnerAssignment?.authUserId ?? null
      }
      teamMembers={teamMembers}
    />
  );
}
