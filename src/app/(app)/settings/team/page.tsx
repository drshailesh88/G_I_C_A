import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROLES } from '@/lib/auth/roles';
import { getTeamMembers } from '@/lib/actions/team';
import { TeamManagementClient } from './team-management-client';

const VALID_ROLE_VALUES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.OPS,
  ROLES.READ_ONLY,
]);

function normalizeAppRole(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const prefixed = raw.startsWith('org:') ? raw : `org:${raw}`;
  return VALID_ROLE_VALUES.has(prefixed) ? prefixed : null;
}

export default async function TeamPage() {
  const session = await auth();
  if (!session.userId) redirect('/login');

  const claims = (session as { sessionClaims?: Record<string, unknown> }).sessionClaims;
  const orgMembership = claims?.org_membership as
    | { publicMetadata?: { appRole?: unknown }; public_metadata?: { appRole?: unknown } }
    | undefined;
  const metadata = claims?.metadata as { appRole?: unknown } | undefined;
  const rawAppRole =
    orgMembership?.publicMetadata?.appRole ??
    orgMembership?.public_metadata?.appRole ??
    metadata?.appRole;
  const role = normalizeAppRole(rawAppRole);

  if (role !== ROLES.SUPER_ADMIN) redirect('/dashboard');

  const members = await getTeamMembers();

  return <TeamManagementClient initialMembers={members} currentUserId={session.userId} />;
}
