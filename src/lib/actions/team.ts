'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { ROLES, type RoleValue } from '@/lib/auth/roles';
import {
  inviteMemberSchema,
  changeMemberRoleSchema,
  removeMemberSchema,
} from '@/lib/validations/team';

export type TeamMember = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  role: string;
  createdAt: number;
};

const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.EVENT_COORDINATOR]: 'Event Coordinator',
  [ROLES.OPS]: 'Ops',
  [ROLES.READ_ONLY]: 'Read-only',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

async function assertSuperAdmin(): Promise<string> {
  const session = await auth();
  const userId = session.userId;
  if (!userId) throw new Error('Not authenticated');
  const isSuperAdmin = session.has?.({ role: ROLES.SUPER_ADMIN }) ?? false;
  if (!isSuperAdmin) throw new Error('Forbidden: only Super Admin can manage team');
  return userId;
}

async function getOrgId(): Promise<string> {
  const session = await auth();
  const orgId = session.orgId;
  if (!orgId) throw new Error('No organization found');
  return orgId;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  await assertSuperAdmin();
  const orgId = await getOrgId();
  const client = await clerkClient();
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });

  return memberships.data.map((m) => ({
    userId: m.publicUserData?.userId ?? '',
    email: m.publicUserData?.identifier ?? '',
    firstName: m.publicUserData?.firstName ?? null,
    lastName: m.publicUserData?.lastName ?? null,
    imageUrl: m.publicUserData?.imageUrl ?? '',
    role: m.role,
    createdAt: m.createdAt,
  }));
}

export async function inviteTeamMember(input: {
  emailAddress: string;
  role: string;
}): Promise<{ success: boolean; error?: string }> {
  const currentUserId = await assertSuperAdmin();
  const orgId = await getOrgId();

  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: orgId,
      emailAddress: parsed.data.emailAddress,
      role: parsed.data.role,
      inviterUserId: currentUserId,
    });

    revalidatePath('/settings/team');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send invitation';
    return { success: false, error: message };
  }
}

export async function changeMemberRole(input: {
  userId: string;
  role: string;
}): Promise<{ success: boolean; error?: string }> {
  const currentUserId = await assertSuperAdmin();
  const orgId = await getOrgId();

  const parsed = changeMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Guard: cannot change your own role
  if (parsed.data.userId === currentUserId) {
    return { success: false, error: 'Cannot change your own role' };
  }

  // Guard: cannot downgrade the last super admin
  if (parsed.data.role !== ROLES.SUPER_ADMIN) {
    const members = await getTeamMembers();
    const superAdmins = members.filter((m) => m.role === ROLES.SUPER_ADMIN);
    const targetIsSuperAdmin = superAdmins.some((m) => m.userId === parsed.data.userId);
    if (targetIsSuperAdmin && superAdmins.length <= 1) {
      return { success: false, error: 'Cannot downgrade the last Super Admin' };
    }
  }

  try {
    const client = await clerkClient();
    await client.organizations.updateOrganizationMembership({
      organizationId: orgId,
      userId: parsed.data.userId,
      role: parsed.data.role as RoleValue,
    });

    revalidatePath('/settings/team');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to change role';
    return { success: false, error: message };
  }
}

export async function removeTeamMember(input: {
  userId: string;
}): Promise<{ success: boolean; error?: string }> {
  const currentUserId = await assertSuperAdmin();
  const orgId = await getOrgId();

  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Guard: cannot remove yourself
  if (parsed.data.userId === currentUserId) {
    return { success: false, error: 'Cannot remove yourself from the team' };
  }

  // Guard: cannot remove the last super admin
  const members = await getTeamMembers();
  const superAdmins = members.filter((m) => m.role === ROLES.SUPER_ADMIN);
  const targetIsSuperAdmin = superAdmins.some((m) => m.userId === parsed.data.userId);
  if (targetIsSuperAdmin && superAdmins.length <= 1) {
    return { success: false, error: 'Cannot remove the last Super Admin' };
  }

  try {
    const client = await clerkClient();
    await client.organizations.deleteOrganizationMembership({
      organizationId: orgId,
      userId: parsed.data.userId,
    });

    revalidatePath('/settings/team');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove member';
    return { success: false, error: message };
  }
}
