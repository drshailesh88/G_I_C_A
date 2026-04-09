import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getAttendanceStats, listAttendanceRecords } from '@/lib/actions/attendance';
import { QrCheckInClient } from './qr-checkin-client';

type Params = Promise<{ eventId: string }>;

export default async function QrCheckInPage({
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

  const [stats, records] = await Promise.all([
    getAttendanceStats(eventId, { eventId }),
    listAttendanceRecords(eventId, { eventId }),
  ]);

  return (
    <QrCheckInClient
      eventId={eventId}
      initialStats={stats}
      initialRecords={records}
    />
  );
}
