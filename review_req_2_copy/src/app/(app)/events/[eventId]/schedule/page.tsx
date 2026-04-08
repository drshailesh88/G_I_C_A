import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getScheduleData } from '@/lib/actions/program';
import { ScheduleGridClient } from './schedule-grid-client';

type Params = Promise<{ eventId: string }>;

export default async function SchedulePage({
  params,
}: {
  params: Params;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login');

  const { eventId } = await params;
  const data = await getScheduleData(eventId);

  return (
    <ScheduleGridClient
      eventId={eventId}
      sessions={data.sessions}
      halls={data.halls}
      conflicts={data.conflicts}
    />
  );
}
