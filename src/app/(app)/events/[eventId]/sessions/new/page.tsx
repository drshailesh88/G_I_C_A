import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getHalls, getSessions } from '@/lib/actions/program';
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
  const [halls, existingSessions] = await Promise.all([
    getHalls(eventId),
    getSessions(eventId),
  ]);

  // Only pass parent-eligible sessions (those without a parent themselves)
  const parentEligible = existingSessions.filter((s) => !s.parentSessionId);

  return (
    <SessionFormClient
      eventId={eventId}
      halls={halls}
      parentSessions={parentEligible}
      mode="create"
    />
  );
}
