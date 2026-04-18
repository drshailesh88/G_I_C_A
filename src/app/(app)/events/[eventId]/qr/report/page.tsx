import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getAttendanceReportData } from '@/lib/actions/attendance';
import { AttendanceReportClient } from './attendance-report-client';

type Params = Promise<{ eventId: string }>;

export default async function AttendanceReportPage({
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

  const data = await getAttendanceReportData(eventId);

  return <AttendanceReportClient eventId={eventId} data={data} />;
}
