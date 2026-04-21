import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const {
  mockAuth,
  mockClerkClient,
  mockRevalidatePath,
  mockRedisSet,
  mockRedisEval,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockClerkClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisEval: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockRedisSet,
    eval: mockRedisEval,
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

import { getTeamMembers, inviteTeamMember, changeMemberRole, removeTeamMember } from './team';
import { ROLES } from '@/lib/auth/roles';

const USER_SA = 'user_superadmin';
const USER_COORD = 'user_coordinator';
const USER_OPS = 'user_ops';

type UserRecord = ReturnType<typeof makeUser>;

function sessionClaimsForRole(role: string) {
  return {
    metadata: { appRole: role },
  };
}

function authAsSuperAdmin(userId = USER_SA) {
  mockAuth.mockResolvedValue({
    userId,
    sessionClaims: sessionClaimsForRole(ROLES.SUPER_ADMIN),
  });
}

function makeUser(id: string, email: string, role: string, firstName = 'Test') {
  return {
    id,
    firstName,
    lastName: null,
    imageUrl: '',
    primaryEmailAddressId: `email_${id}`,
    emailAddresses: [{ id: `email_${id}`, emailAddress: email }],
    publicMetadata: { appRole: role },
    createdAt: Date.now(),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function mockUsersClient(users: UserRecord[]) {
  const usersApi = {
    getUserList: vi.fn().mockImplementation((params?: { limit?: number; offset?: number }) => {
      const limit = params?.limit ?? users.length;
      const offset = params?.offset ?? 0;
      return Promise.resolve({
        data: users.slice(offset, offset + limit),
        totalCount: users.length,
      });
    }),
    updateUser: vi.fn().mockResolvedValue({}),
    deleteUser: vi.fn().mockResolvedValue({}),
  };
  const invitationsApi = {
    createInvitation: vi.fn().mockResolvedValue({}),
  };
  mockClerkClient.mockResolvedValue({ users: usersApi, invitations: invitationsApi });
  return { usersApi, invitationsApi };
}

describe('Team Management (user publicMetadata)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    delete process.env.UPSTASH_REDIS_REST_URL_TEST;
    delete process.env.UPSTASH_REDIS_REST_TOKEN_TEST;
    mockRedisSet.mockResolvedValue('OK');
    mockRedisEval.mockResolvedValue(1);
  });

  describe('getTeamMembers', () => {
    it('returns all users', async () => {
      authAsSuperAdmin();
      const users = [
        makeUser(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeUser(USER_COORD, 'coord@gem.org', ROLES.EVENT_COORDINATOR),
      ];
      mockUsersClient(users);

      const result = await getTeamMembers();

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('admin@gem.org');
      expect(result[0].role).toBe(ROLES.SUPER_ADMIN);
      expect(result[1].email).toBe('coord@gem.org');
      expect(result[1].role).toBe(ROLES.EVENT_COORDINATOR);
    });

    it('paginates across every Clerk user page', async () => {
      authAsSuperAdmin();
      const users = Array.from({ length: 101 }, (_, index) =>
        makeUser(`user_${index + 1}`, `user${index + 1}@gem.org`, ROLES.READ_ONLY),
      );
      mockUsersClient(users);

      const result = await getTeamMembers();

      expect(result).toHaveLength(101);
      expect(result.at(-1)?.email).toBe('user101@gem.org');
    });

    it('rejects non-super-admin users', async () => {
      mockAuth.mockResolvedValue({
        userId: USER_COORD,
        sessionClaims: sessionClaimsForRole(ROLES.EVENT_COORDINATOR),
      });

      await expect(getTeamMembers()).rejects.toThrow('only Super Admin');
    });
  });

  describe('inviteTeamMember', () => {
    it('sends invitation via Clerk API with appRole in publicMetadata', async () => {
      authAsSuperAdmin();
      const { invitationsApi } = mockUsersClient([]);

      const result = await inviteTeamMember({
        emailAddress: 'new@gem.org',
        role: ROLES.READ_ONLY,
      });

      expect(result.success).toBe(true);
      expect(invitationsApi.createInvitation).toHaveBeenCalledWith({
        emailAddress: 'new@gem.org',
        publicMetadata: { appRole: ROLES.READ_ONLY },
        notify: true,
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/team');
    });

    it('rejects invalid email', async () => {
      authAsSuperAdmin();
      mockUsersClient([]);

      const result = await inviteTeamMember({
        emailAddress: 'not-an-email',
        role: ROLES.READ_ONLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/email/i);
    });
  });

  describe('changeMemberRole', () => {
    it('updates user publicMetadata via Clerk API', async () => {
      authAsSuperAdmin();
      const { usersApi } = mockUsersClient([
        makeUser(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeUser(USER_COORD, 'coord@gem.org', ROLES.EVENT_COORDINATOR),
      ]);

      const result = await changeMemberRole({
        userId: USER_COORD,
        role: ROLES.OPS,
      });

      expect(result.success).toBe(true);
      expect(usersApi.updateUser).toHaveBeenCalledWith(USER_COORD, {
        publicMetadata: { appRole: ROLES.OPS },
      });
    });

    it('blocks changing own role', async () => {
      authAsSuperAdmin();
      mockUsersClient([]);

      const result = await changeMemberRole({
        userId: USER_SA,
        role: ROLES.READ_ONLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/own role/i);
    });

    it('blocks downgrading the last super admin', async () => {
      authAsSuperAdmin();
      mockUsersClient([
        makeUser(USER_SA, 'admin@gem.org', ROLES.EVENT_COORDINATOR),
        makeUser(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN),
      ]);

      const result = await changeMemberRole({
        userId: USER_OPS,
        role: ROLES.READ_ONLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/last Super Admin/i);
    });
  });

  describe('removeTeamMember', () => {
    it('deletes user via Clerk API', async () => {
      authAsSuperAdmin();
      const { usersApi } = mockUsersClient([
        makeUser(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeUser(USER_COORD, 'coord@gem.org', ROLES.EVENT_COORDINATOR),
      ]);

      const result = await removeTeamMember({ userId: USER_COORD });

      expect(result.success).toBe(true);
      expect(usersApi.deleteUser).toHaveBeenCalledWith(USER_COORD);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/team');
    });

    it('blocks removing yourself', async () => {
      authAsSuperAdmin();
      mockUsersClient([]);

      const result = await removeTeamMember({ userId: USER_SA });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/yourself/i);
    });

    it('blocks removing the last super admin', async () => {
      authAsSuperAdmin();
      mockUsersClient([
        makeUser(USER_SA, 'admin@gem.org', ROLES.EVENT_COORDINATOR),
        makeUser(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN),
      ]);

      const result = await removeTeamMember({ userId: USER_OPS });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/last Super Admin/i);
    });

    it('blocks removing the last super admin even when they appear after the first 100 users', async () => {
      authAsSuperAdmin();
      const users = [
        ...Array.from({ length: 100 }, (_, index) =>
          makeUser(`user_${index + 1}`, `user${index + 1}@gem.org`, ROLES.EVENT_COORDINATOR),
        ),
        makeUser(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN),
      ];
      mockUsersClient(users);

      const result = await removeTeamMember({ userId: USER_OPS });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/last Super Admin/i);
    });

    it('fails closed when another team membership change already holds the lock', async () => {
      authAsSuperAdmin();
      const { usersApi } = mockUsersClient([
        makeUser(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeUser(USER_COORD, 'coord@gem.org', ROLES.EVENT_COORDINATOR),
      ]);
      const updateDeferred = createDeferred<{}>();

      usersApi.updateUser.mockImplementation(() => updateDeferred.promise);
      mockRedisSet
        .mockResolvedValueOnce('OK')
        .mockResolvedValueOnce(null);

      const firstChange = changeMemberRole({
        userId: USER_COORD,
        role: ROLES.OPS,
      });

      await Promise.resolve();

      const overlappingRemove = await removeTeamMember({ userId: USER_COORD });

      updateDeferred.resolve({});
      const firstResult = await firstChange;

      expect(overlappingRemove.success).toBe(false);
      expect(overlappingRemove.error).toMatch(/already in progress/i);
      expect(firstResult.success).toBe(true);
      expect(usersApi.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('rejects unauthenticated users', async () => {
      mockAuth.mockResolvedValue({ userId: null, sessionClaims: null });

      await expect(getTeamMembers()).rejects.toThrow('Not authenticated');
    });

    it('rejects invite with invalid role', async () => {
      authAsSuperAdmin();
      mockUsersClient([]);

      const result = await inviteTeamMember({
        emailAddress: 'test@gem.org',
        role: 'org:hacker',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/role/i);
    });

    it('rejects remove with empty userId', async () => {
      authAsSuperAdmin();
      mockUsersClient([]);

      const result = await removeTeamMember({ userId: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
