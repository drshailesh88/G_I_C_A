import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { ReportsClient } from './reports-client';

type Params = Promise<{ eventId: string }>;

export default async function ReportsPage({
  params,
}: {
  params: Params;
}) {
  const { eventId } = await params;

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  return <ReportsClient eventId={eventId} />;
}
