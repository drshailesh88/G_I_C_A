'use server';

import { Redis } from '@upstash/redis';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { ROLES, type RoleValue } from '@/lib/auth/roles';
import { getAppRoleFromSession } from '@/lib/auth/session-role';
import {
  inviteMemberSchema,
  changeMemberRoleSchema,
  removeMemberSchema,
} from '@/lib/validations/team';
import type { TeamMember } from '@/lib/actions/team-utils';
export type { TeamMember } from '@/lib/actions/team-utils';

type ClerkUserRecord = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id: string; emailAddress: string }> | null;
  publicMetadata?: Record<string, unknown> | null;
  createdAt: number;
};

type TeamMutationLockHandle = {
  key: string;
  ownerToken: string;
};

type TeamMutationLock = {
  acquire(scope: string): Promise<TeamMutationLockHandle | null>;
  release(handle: TeamMutationLockHandle): Promise<void>;
};

const USER_PAGE_SIZE = 100;
const TEAM_MUTATION_LOCK_PREFIX = 'team:membership-lock:';
const TEAM_MUTATION_LOCK_TTL_SECONDS = 15;
const TEAM_MUTATION_LOCK_SCOPE = 'global';
const RELEASE_LOCK_LUA = `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;

const VALID_ROLE_VALUES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.OPS,
  ROLES.READ_ONLY,
]);

function normalizeAppRole(raw: unknown): RoleValue | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const prefixed = raw.startsWith('org:') ? raw : `org:${raw}`;
  return VALID_ROLE_VALUES.has(prefixed) ? (prefixed as RoleValue) : null;
}

function readAppRoleFromUser(user: ClerkUserRecord): RoleValue | null {
  const meta = user.publicMetadata as { appRole?: unknown } | null | undefined;
  return normalizeAppRole(meta?.appRole);
}

function getPrimaryEmail(user: ClerkUserRecord): string {
  const addresses = user.emailAddresses ?? [];
  if (user.primaryEmailAddressId) {
    const primary = addresses.find((e) => e.id === user.primaryEmailAddressId);
    if (primary) return primary.emailAddress;
  }
  return addresses[0]?.emailAddress ?? '';
}

async function assertSuperAdmin(): Promise<string> {
  const session = await auth();
  const userId = session.userId;
  if (!userId) throw new Error('Not authenticated');
  if (getAppRoleFromSession(session) !== ROLES.SUPER_ADMIN) {
    throw new Error('Forbidden: only Super Admin can manage team');
  }
  return userId;
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
    async acquire(scope) {
      const redis = getTeamMutationRedisClient();
      const key = `${TEAM_MUTATION_LOCK_PREFIX}${scope}`;
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

async function withTeamMutationLock<T>(action: () => Promise<T>): Promise<T> {
  const lock = createRedisTeamMutationLock();

  let handle: TeamMutationLockHandle | null = null;

  try {
    handle = await lock.acquire(TEAM_MUTATION_LOCK_SCOPE);
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

async function listUsers(): Promise<ClerkUserRecord[]> {
  const client = await clerkClient();
  const collected: ClerkUserRecord[] = [];
  let offset = 0;
  let totalCount = 0;

  do {
    const page = await client.users.getUserList({ limit: USER_PAGE_SIZE, offset });
    collected.push(...(page.data as unknown as ClerkUserRecord[]));
    totalCount = page.totalCount;
    offset += page.data.length;
    if (page.data.length === 0) break;
  } while (offset < totalCount);

  return collected;
}

async function listSuperAdmins(): Promise<ClerkUserRecord[]> {
  const all = await listUsers();
  return all.filter((u) => readAppRoleFromUser(u) === ROLES.SUPER_ADMIN);
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  await assertSuperAdmin();
  const users = await listUsers();

  return users.map((u) => ({
    userId: u.id,
    email: getPrimaryEmail(u),
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    imageUrl: u.imageUrl ?? '',
    role: readAppRoleFromUser(u) ?? ROLES.READ_ONLY,
    createdAt: u.createdAt,
  }));
}

export async function inviteTeamMember(input: {
  emailAddress: string;
  role: string;
}): Promise<{ success: boolean; error?: string }> {
  await assertSuperAdmin();

  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const client = await clerkClient();
    await client.invitations.createInvitation({
      emailAddress: parsed.data.emailAddress,
      publicMetadata: { appRole: parsed.data.role },
      notify: true,
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

  const parsed = changeMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  if (parsed.data.userId === currentUserId) {
    return { success: false, error: 'Cannot change your own role' };
  }

  try {
    return await withTeamMutationLock(async () => {
      if (parsed.data.role !== ROLES.SUPER_ADMIN) {
        const superAdmins = await listSuperAdmins();
        const targetIsSuperAdmin = superAdmins.some((u) => u.id === parsed.data.userId);

        if (targetIsSuperAdmin && superAdmins.length <= 1) {
          return { success: false, error: 'Cannot downgrade the last Super Admin' };
        }
      }

      const client = await clerkClient();
      await client.users.updateUser(parsed.data.userId, {
        publicMetadata: { appRole: parsed.data.role },
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

  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  if (parsed.data.userId === currentUserId) {
    return { success: false, error: 'Cannot remove yourself from the team' };
  }

  try {
    return await withTeamMutationLock(async () => {
      const superAdmins = await listSuperAdmins();
      const targetIsSuperAdmin = superAdmins.some((u) => u.id === parsed.data.userId);

      if (targetIsSuperAdmin && superAdmins.length <= 1) {
        return { success: false, error: 'Cannot remove the last Super Admin' };
      }

      const client = await clerkClient();
      await client.users.deleteUser(parsed.data.userId);

      revalidatePath('/settings/team');
      return { success: true };
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove member';
    return { success: false, error: message };
  }
}
