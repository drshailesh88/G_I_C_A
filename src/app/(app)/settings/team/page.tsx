import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROLES } from '@/lib/auth/roles';
import { getTeamMembers } from '@/lib/actions/team';
import { TeamManagementClient } from './team-management-client';

export default async function TeamPage() {
  const session = await auth();
  if (!session.userId) redirect('/login');

  const isSuperAdmin = session.has?.({ role: ROLES.SUPER_ADMIN }) ?? false;
  if (!isSuperAdmin) redirect('/dashboard');

  const members = await getTeamMembers();

  return <TeamManagementClient initialMembers={members} currentUserId={session.userId} />;
}
