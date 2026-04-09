import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const {
  mockAuth,
  mockClerkClient,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockClerkClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
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

function authAsSuperAdmin(userId = USER_SA) {
  mockAuth.mockResolvedValue({
    userId,
    orgId: ORG_ID,
    has: ({ role }: { role: string }) => role === ROLES.SUPER_ADMIN,
  });
}

function makeMembership(userId: string, email: string, role: string, firstName = 'Test') {
  return {
    publicUserData: { userId, identifier: email, firstName, lastName: null, imageUrl: '' },
    role,
    createdAt: Date.now(),
  };
}

function mockOrgClient(memberships: ReturnType<typeof makeMembership>[]) {
  const orgApi = {
    getOrganizationMembershipList: vi.fn().mockResolvedValue({ data: memberships }),
    createOrganizationInvitation: vi.fn().mockResolvedValue({}),
    updateOrganizationMembership: vi.fn().mockResolvedValue({}),
    deleteOrganizationMembership: vi.fn().mockResolvedValue({}),
  };
  mockClerkClient.mockResolvedValue({ organizations: orgApi });
  return orgApi;
}

describe('Team Management (6D-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    });

    it('rejects non-super-admin users', async () => {
      mockAuth.mockResolvedValue({
        userId: USER_COORD,
        orgId: ORG_ID,
        has: ({ role }: { role: string }) => role === ROLES.EVENT_COORDINATOR,
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
    it('updates member role via Clerk API', async () => {
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
      expect(orgApi.updateOrganizationMembership).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        userId: USER_COORD,
        role: ROLES.OPS,
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
        makeMembership(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeMembership(USER_COORD, 'coord@gem.org', ROLES.SUPER_ADMIN),
      ]);
      // USER_COORD is one of 2 super admins — try downgrading USER_SA is blocked by "own role" guard
      // Let's test: only 1 super admin (USER_SA), try to downgrade another who IS super admin
      // Setup: USER_SA is current user, USER_OPS is the only other super admin
      mockOrgClient([
        makeMembership(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeMembership(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN),
      ]);

      // Remove one so only USER_OPS is super admin besides USER_SA
      // Actually: both are SA, downgrading USER_OPS to OPS means only 1 SA left — that's fine
      // But if we have only 1 SA (not current user), downgrading them is blocked
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
        makeMembership(USER_SA, 'admin@gem.org', ROLES.SUPER_ADMIN),
        makeMembership(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN),
      ]);
      // Only USER_OPS is super admin (USER_SA shows as coordinator in member list)
      mockOrgClient([
        makeMembership(USER_SA, 'admin@gem.org', ROLES.EVENT_COORDINATOR),
        makeMembership(USER_OPS, 'ops@gem.org', ROLES.SUPER_ADMIN),
      ]);

      const result = await removeTeamMember({ userId: USER_OPS });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/last Super Admin/i);
    });
  });

  describe('edge cases', () => {
    it('rejects unauthenticated users', async () => {
      mockAuth.mockResolvedValue({ userId: null, orgId: null, has: () => false });

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
