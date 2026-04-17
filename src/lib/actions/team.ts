'use server';

import { Redis } from '@upstash/redis';
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

type OrganizationMembershipRecord = {
  publicUserData?: {
    userId?: string | null;
    identifier?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    imageUrl?: string | null;
  } | null;
  role: string;
  createdAt: number;
};

type TeamMutationLockHandle = {
  key: string;
  ownerToken: string;
};

type TeamMutationLock = {
  acquire(orgId: string): Promise<TeamMutationLockHandle | null>;
  release(handle: TeamMutationLockHandle): Promise<void>;
};

const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.EVENT_COORDINATOR]: 'Event Coordinator',
  [ROLES.OPS]: 'Ops',
  [ROLES.READ_ONLY]: 'Read-only',
};

const MEMBERSHIP_PAGE_SIZE = 100;
const TEAM_MUTATION_LOCK_PREFIX = 'team:membership-lock:';
const TEAM_MUTATION_LOCK_TTL_SECONDS = 15;
const RELEASE_LOCK_LUA = `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;

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

function getTeamMutationRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.UPSTASH_REDIS_REST_URL_TEST;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN_TEST;

  if (!url || !token) {
    throw new Error('Team membership mutations require Redis lock configuration');
  }

  return new Redis({ url, token });
}

function createRedisTeamMutationLock(): TeamMutationLock {
  return {
    async acquire(orgId) {
      const redis = getTeamMutationRedisClient();
      const key = `${TEAM_MUTATION_LOCK_PREFIX}${orgId}`;
      const ownerToken = crypto.randomUUID();
      const result = await redis.set(key, ownerToken, {
        nx: true,
        ex: TEAM_MUTATION_LOCK_TTL_SECONDS,
      });

      if (result === 'OK') {
        return { key, ownerToken };
      }

      return null;
    },

    async release(handle) {
      const redis = getTeamMutationRedisClient();
      await redis.eval(RELEASE_LOCK_LUA, [handle.key], [handle.ownerToken]);
    },
  };
}

async function withTeamMutationLock<T>(
  orgId: string,
  action: () => Promise<T>,
): Promise<T> {
  const lock = createRedisTeamMutationLock();

  let handle: TeamMutationLockHandle | null = null;

  try {
    handle = await lock.acquire(orgId);
  } catch {
    throw new Error('Unable to verify team membership lock. Please try again later.');
  }

  if (!handle) {
    throw new Error('Another team membership change is already in progress. Please try again.');
  }

  try {
    return await action();
  } finally {
    await lock.release(handle).catch(() => undefined);
  }
}

async function listOrganizationMemberships(
  orgId: string,
  filters?: {
    role?: RoleValue[];
    userId?: string[];
  },
): Promise<OrganizationMembershipRecord[]> {
  const client = await clerkClient();
  const memberships: OrganizationMembershipRecord[] = [];
  let offset = 0;
  let totalCount = 0;

  do {
    const page = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: MEMBERSHIP_PAGE_SIZE,
      offset,
      ...(filters?.role ? { role: filters.role } : {}),
      ...(filters?.userId ? { userId: filters.userId } : {}),
    });

    memberships.push(...page.data);
    totalCount = page.totalCount;
    offset += page.data.length;
  } while (offset < totalCount);

  return memberships;
}

async function listSuperAdminMemberships(orgId: string): Promise<OrganizationMembershipRecord[]> {
  return listOrganizationMemberships(orgId, { role: [ROLES.SUPER_ADMIN] });
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  await assertSuperAdmin();
  const orgId = await getOrgId();
  const memberships = await listOrganizationMemberships(orgId);

  return memberships.map((m) => ({
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

  try {
    return await withTeamMutationLock(orgId, async () => {
      // Guard: cannot downgrade the last super admin
      if (parsed.data.role !== ROLES.SUPER_ADMIN) {
        const superAdmins = await listSuperAdminMemberships(orgId);
        const targetIsSuperAdmin = superAdmins.some(
          (membership) => membership.publicUserData?.userId === parsed.data.userId,
        );

        if (targetIsSuperAdmin && superAdmins.length <= 1) {
          return { success: false, error: 'Cannot downgrade the last Super Admin' };
        }
      }

      const client = await clerkClient();
      await client.organizations.updateOrganizationMembership({
        organizationId: orgId,
        userId: parsed.data.userId,
        role: parsed.data.role as RoleValue,
      });

      revalidatePath('/settings/team');
      return { success: true };
    });
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

  try {
    return await withTeamMutationLock(orgId, async () => {
      // Guard: cannot remove the last super admin
      const superAdmins = await listSuperAdminMemberships(orgId);
      const targetIsSuperAdmin = superAdmins.some(
        (membership) => membership.publicUserData?.userId === parsed.data.userId,
      );

      if (targetIsSuperAdmin && superAdmins.length <= 1) {
        return { success: false, error: 'Cannot remove the last Super Admin' };
      }

      const client = await clerkClient();
      await client.organizations.deleteOrganizationMembership({
        organizationId: orgId,
        userId: parsed.data.userId,
      });

      revalidatePath('/settings/team');
      return { success: true };
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove member';
    return { success: false, error: message };
  }
}
