import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getEventFacultyInvites, getSessions } from '@/lib/actions/program';
import { FacultyInviteClient } from './faculty-invite-client';

type Params = Promise<{ eventId: string }>;

export default async function FacultyInvitePage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;
  const [invites, sessions] = await Promise.all([
    getEventFacultyInvites(eventId),
    getSessions(eventId),
  ]);

  return (
    <FacultyInviteClient
      eventId={eventId}
      invites={invites}
      sessions={sessions}
    />
  );
}
