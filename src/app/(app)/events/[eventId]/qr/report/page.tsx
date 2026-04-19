import { redirect } from 'next/navigation';
import { assertEventAccess } from '@/lib/auth/event-access';
import { getAttendanceReportData } from '@/lib/actions/attendance';
import { AttendanceReportClient } from './attendance-report-client';

type Params = Promise<{ eventId: string }>;
type SearchParams = Promise<{ focus?: string }>;

export default async function AttendanceReportPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { eventId } = await params;
  const { focus } = await searchParams;

  try {
    await assertEventAccess(eventId);
  } catch {
    redirect('/login');
  }

  const data = await getAttendanceReportData(eventId);

  return <AttendanceReportClient eventId={eventId} data={data} initialTab={focus} />;
}
