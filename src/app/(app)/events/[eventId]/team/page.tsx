import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROLES } from '@/lib/auth/roles';
import { getEventAssignments } from '@/lib/actions/event-assignments';
import { getTeamMembers } from '@/lib/actions/team';
import { getEvent } from '@/lib/actions/event';
import { EventTeamClient } from './event-team-client';

export default async function EventTeamPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/login');

  const isSuperAdmin = session.has?.({ role: ROLES.SUPER_ADMIN }) ?? false;
  if (!isSuperAdmin) redirect('/dashboard');

  const { eventId } = await params;

  const [event, assignments, teamMembers] = await Promise.all([
    getEvent(eventId),
    getEventAssignments(eventId),
    getTeamMembers(),
  ]);

  return (
    <EventTeamClient
      eventId={eventId}
      eventName={event.name}
      initialAssignments={assignments}
      teamMembers={teamMembers}
    />
  );
}
