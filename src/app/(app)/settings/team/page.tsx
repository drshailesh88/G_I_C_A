import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROLES } from '@/lib/auth/roles';
import { sessionHasRole } from '@/lib/auth/session-role';
import { getTeamMembers } from '@/lib/actions/team';
import { TeamManagementClient } from './team-management-client';

export default async function TeamPage() {
  const session = await auth();
  if (!session.userId) redirect('/login');

  if (!sessionHasRole(session, ROLES.SUPER_ADMIN)) redirect('/dashboard');

  const members = await getTeamMembers();

  return <TeamManagementClient initialMembers={members} currentUserId={session.userId} />;
}
