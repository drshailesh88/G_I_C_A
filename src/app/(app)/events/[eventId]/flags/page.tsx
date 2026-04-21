import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROLES } from '@/lib/auth/roles';
import { sessionHasRole } from '@/lib/auth/session-role';
import { FlagsDashboard } from './flags-dashboard';

export const metadata = { title: 'Feature Flags' };

export default async function FlagsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const session = await auth();

  if (!session.userId) {
    redirect('/login');
  }

  if (!sessionHasRole(session, ROLES.SUPER_ADMIN)) {
    redirect(`/events/${eventId}`);
  }

  return <FlagsDashboard eventId={eventId} />;
}
