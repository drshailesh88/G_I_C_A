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

const ORG_ID = 'org_abc123';
const USER_SA = 'user_superadmin';
const USER_COORD = 'user_coordinator';
const USER_OPS = 'user_ops';

type Membership = ReturnType<typeof makeMembership>;

function sessionClaimsForRole(role: string) {
  return {
    org_membership: {
      publicMetadata: { appRole: role },
    },
  };
}

function authAsSuperAdmin(userId = USER_SA) {
  mockAuth.mockResolvedValue({
    userId,
    orgId: ORG_ID,
    sessionClaims: sessionClaimsForRole(ROLES.SUPER_ADMIN),
  });
}

function makeMembership(userId: string, email: string, role: string, firstName = 'Test') {
  return {
    publicUserData: { userId, identifier: email, firstName, lastName: null, imageUrl: '' },
    role: 'org:member',
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

function mockOrgClient(memberships: Membership[]) {
  const orgApi = {
    getOrganizationMembershipList: vi.fn().mockImplementation((params?: {
      limit?: number;
      offset?: number;
      userId?: string[];
    }) => {
      const limit = params?.limit ?? memberships.length;
      const offset = params?.offset ?? 0;

      let filtered = memberships;

      if (params?.userId?.length) {
        filtered = filtered.filter((membership) =>
          params.userId!.includes(membership.publicUserData.userId),
        );
      }

      return Promise.resolve({
        data: filtered.slice(offset, offset + limit),
        totalCount: filtered.length,
      });
    }),
    createOrganizationInvitation: vi.fn().mockResolvedValue({}),
    updateOrganizationMembershipMetadata: vi.fn().mockResolvedValue({}),
    deleteOrganizationMembership: vi.fn().mockResolvedValue({}),
  };
  mockClerkClient.mockResolvedValue({ organizations: orgApi });
  return orgApi;
}

describe('Team Management (6D-1)', () => {
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
    it('returns all organization members', async () => {
      authAsSuperAdmin();
      const members = [
        makeMembership(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeMembership(USER_COORD, 'coord@gem.org', ROLES.EVENT_COORDINATOR),
      ];
      mockOrgClient(members);

      const result = await getTeamMembers();

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('admin@gem.org');
      expect(result[0].role).toBe(ROLES.SUPER_ADMIN);
      expect(result[1].email).toBe('coord@gem.org');
      expect(result[1].role).toBe(ROLES.EVENT_COORDINATOR);
    });

    it('paginates across every Clerk membership page', async () => {
      authAsSuperAdmin();
      const members = Array.from({ length: 101 }, (_, index) =>
        makeMembership(`user_${index + 1}`, `user${index + 1}@gem.org`, ROLES.READ_ONLY),
      );
      mockOrgClient(members);

      const result = await getTeamMembers();

      expect(result).toHaveLength(101);
      expect(result.at(-1)?.email).toBe('user101@gem.org');
    });

    it('rejects non-super-admin users', async () => {
      mockAuth.mockResolvedValue({
        userId: USER_COORD,
        orgId: ORG_ID,
        sessionClaims: sessionClaimsForRole(ROLES.EVENT_COORDINATOR),
      });

      await expect(getTeamMembers()).rejects.toThrow('only Super Admin');
    });
  });

  describe('inviteTeamMember', () => {
    it('sends invitation via Clerk API', async () => {
      authAsSuperAdmin();
      const orgApi = mockOrgClient([]);

      const result = await inviteTeamMember({
        emailAddress: 'new@gem.org',
        role: ROLES.READ_ONLY,
      });

      expect(result.success).toBe(true);
      expect(orgApi.createOrganizationInvitation).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        emailAddress: 'new@gem.org',
        role: ROLES.READ_ONLY,
        inviterUserId: USER_SA,
        publicMetadata: { appRole: ROLES.READ_ONLY },
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/team');
    });

    it('rejects invalid email', async () => {
      authAsSuperAdmin();
      mockOrgClient([]);

      const result = await inviteTeamMember({
        emailAddress: 'not-an-email',
        role: ROLES.READ_ONLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/email/i);
    });
  });

  describe('changeMemberRole', () => {
    it('updates member role via Clerk metadata API', async () => {
      authAsSuperAdmin();
      const orgApi = mockOrgClient([
        makeMembership(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeMembership(USER_COORD, 'coord@gem.org', ROLES.EVENT_COORDINATOR),
      ]);

      const result = await changeMemberRole({
        userId: USER_COORD,
        role: ROLES.OPS,
      });

      expect(result.success).toBe(true);
      expect(orgApi.updateOrganizationMembershipMetadata).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        userId: USER_COORD,
        publicMetadata: { appRole: ROLES.OPS },
      });
    });

    it('blocks changing own role', async () => {
      authAsSuperAdmin();
      mockOrgClient([]);

      const result = await changeMemberRole({
        userId: USER_SA,
        role: ROLES.READ_ONLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/own role/i);
    });

    it('blocks downgrading the last super admin', async () => {
      authAsSuperAdmin();
      mockOrgClient([
        makeMembership(USER_SA, 'admin@gem.org', ROLES.EVENT_COORDINATOR), // not SA in DB
        makeMembership(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN), // only SA
      ]);

      // The auth still says current user is SA (from session)
      const result = await changeMemberRole({
        userId: USER_OPS,
        role: ROLES.READ_ONLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/last Super Admin/i);
    });
  });

  describe('removeTeamMember', () => {
    it('removes member via Clerk API', async () => {
      authAsSuperAdmin();
      const orgApi = mockOrgClient([
        makeMembership(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeMembership(USER_COORD, 'coord@gem.org', ROLES.EVENT_COORDINATOR),
      ]);

      const result = await removeTeamMember({ userId: USER_COORD });

      expect(result.success).toBe(true);
      expect(orgApi.deleteOrganizationMembership).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        userId: USER_COORD,
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/team');
    });

    it('blocks removing yourself', async () => {
      authAsSuperAdmin();
      mockOrgClient([]);

      const result = await removeTeamMember({ userId: USER_SA });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/yourself/i);
    });

    it('blocks removing the last super admin', async () => {
      authAsSuperAdmin();
      mockOrgClient([
        makeMembership(USER_SA, 'admin@gem.org', ROLES.EVENT_COORDINATOR),
        makeMembership(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN),
      ]);

      const result = await removeTeamMember({ userId: USER_OPS });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/last Super Admin/i);
    });

    it('blocks removing the last super admin even when they appear after the first 100 members', async () => {
      authAsSuperAdmin();
      const members = [
        ...Array.from({ length: 100 }, (_, index) =>
          makeMembership(`user_${index + 1}`, `user${index + 1}@gem.org`, ROLES.EVENT_COORDINATOR),
        ),
        makeMembership(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN),
      ];
      mockOrgClient(members);

      const result = await removeTeamMember({ userId: USER_OPS });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/last Super Admin/i);
    });

    it('fails closed when another team membership change already holds the lock', async () => {
      authAsSuperAdmin();
      const orgApi = mockOrgClient([
        makeMembership(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeMembership(USER_COORD, 'coord@gem.org', ROLES.EVENT_COORDINATOR),
      ]);
      const updateDeferred = createDeferred<{}>();

      orgApi.updateOrganizationMembershipMetadata.mockImplementation(() => updateDeferred.promise);
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
      expect(orgApi.deleteOrganizationMembership).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('rejects unauthenticated users', async () => {
      mockAuth.mockResolvedValue({ userId: null, orgId: null, sessionClaims: null });

      await expect(getTeamMembers()).rejects.toThrow('Not authenticated');
    });

    it('rejects invite with invalid role', async () => {
      authAsSuperAdmin();
      mockOrgClient([]);

      const result = await inviteTeamMember({
        emailAddress: 'test@gem.org',
        role: 'org:hacker',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/role/i);
    });

    it('rejects remove with empty userId', async () => {
      authAsSuperAdmin();
      mockOrgClient([]);

      const result = await removeTeamMember({ userId: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
