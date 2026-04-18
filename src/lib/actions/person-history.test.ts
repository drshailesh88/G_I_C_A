import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockWriteAudit } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockWriteAudit: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/audit/write', () => ({ writeAudit: mockWriteAudit }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: vi.fn() }));

import { getPersonHistory } from './person';
import { ROLES } from '@/lib/auth/roles';

const PERSON_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const AUDIT_ROW = {
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  actorUserId: 'user_sa',
  action: 'create',
  resource: 'people',
  resourceId: PERSON_ID,
  timestamp: new Date('2026-04-01T10:00:00Z'),
  meta: { changedFields: ['fullName', 'email'] },
  eventId: null,
};

function authAs(role: string, userId = 'user1') {
  mockAuth.mockResolvedValue({
    userId,
    has: ({ role: r }: { role: string }) => r === role,
  });
}

function mockHistoryChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  };
}

function mockCountChain(count: number) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: String(count) }]),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockWriteAudit.mockResolvedValue(undefined);
  mockRevalidatePath.mockReturnValue(undefined);
});

// ── RBAC ────────────────────────────────────────────────────────

describe('RBAC', () => {
  it('rejects unauthenticated requests', async () => {
    mockAuth.mockResolvedValue({ userId: null, has: () => false });
    await expect(getPersonHistory(PERSON_ID)).rejects.toThrow('Unauthorized');
  });

  it('rejects OPS role (not in PEOPLE_READ_ROLES)', async () => {
    authAs(ROLES.OPS);
    await expect(getPersonHistory(PERSON_ID)).rejects.toThrow('Forbidden');
  });

  it('allows Event Coordinator to read history', async () => {
    authAs(ROLES.EVENT_COORDINATOR);
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain([]))
      .mockReturnValueOnce(mockCountChain(0));
    const result = await getPersonHistory(PERSON_ID);
    expect(result.rows).toEqual([]);
  });

  it('allows Read-only to read history', async () => {
    authAs(ROLES.READ_ONLY);
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain([]))
      .mockReturnValueOnce(mockCountChain(0));
    const result = await getPersonHistory(PERSON_ID);
    expect(result.rows).toEqual([]);
  });
});

// ── Validation ──────────────────────────────────────────────────

describe('Validation', () => {
  it('rejects non-UUID person ID', async () => {
    authAs(ROLES.SUPER_ADMIN);
    await expect(getPersonHistory('not-a-uuid')).rejects.toThrow();
  });
});

// ── Data shape ──────────────────────────────────────────────────

describe('Data shape', () => {
  it('returns empty result when no audit rows exist', async () => {
    authAs(ROLES.SUPER_ADMIN);
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain([]))
      .mockReturnValueOnce(mockCountChain(0));
    const result = await getPersonHistory(PERSON_ID);
    expect(result).toEqual({ rows: [], total: 0, page: 1, totalPages: 0 });
  });

  it('maps audit row fields to PersonHistoryRow shape', async () => {
    authAs(ROLES.SUPER_ADMIN);
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain([AUDIT_ROW]))
      .mockReturnValueOnce(mockCountChain(1));
    const result = await getPersonHistory(PERSON_ID);
    expect(result.rows[0]).toMatchObject({
      id: AUDIT_ROW.id,
      actorUserId: AUDIT_ROW.actorUserId,
      action: AUDIT_ROW.action,
      resource: AUDIT_ROW.resource,
      timestamp: AUDIT_ROW.timestamp,
      meta: { changedFields: ['fullName', 'email'] },
    });
  });

  it('includes total and page in result', async () => {
    authAs(ROLES.SUPER_ADMIN);
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain([AUDIT_ROW]))
      .mockReturnValueOnce(mockCountChain(1));
    const result = await getPersonHistory(PERSON_ID);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });
});

// ── Pagination ──────────────────────────────────────────────────

describe('Pagination', () => {
  it('page 2 applies offset of 25', async () => {
    authAs(ROLES.SUPER_ADMIN);
    const chain = mockHistoryChain([]);
    mockDb.select
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(mockCountChain(0));
    await getPersonHistory(PERSON_ID, 2);
    expect(chain.offset).toHaveBeenCalledWith(25);
  });

  it('calculates totalPages=2 for 26 rows at page size 25', async () => {
    authAs(ROLES.SUPER_ADMIN);
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain([]))
      .mockReturnValueOnce(mockCountChain(26));
    const result = await getPersonHistory(PERSON_ID);
    expect(result.totalPages).toBe(2);
  });

  it('totalPages is 0 when there are no rows', async () => {
    authAs(ROLES.SUPER_ADMIN);
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain([]))
      .mockReturnValueOnce(mockCountChain(0));
    const result = await getPersonHistory(PERSON_ID);
    expect(result.totalPages).toBe(0);
  });
});

// ── Meta passthrough ─────────────────────────────────────────────

describe('Meta passthrough', () => {
  it('passes meta object from audit row through to result row', async () => {
    authAs(ROLES.EVENT_COORDINATOR);
    const rowWithMeta = { ...AUDIT_ROW, meta: { changedFields: ['email'], action: 'restore' } };
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain([rowWithMeta]))
      .mockReturnValueOnce(mockCountChain(1));
    const result = await getPersonHistory(PERSON_ID);
    expect(result.rows[0].meta).toEqual({ changedFields: ['email'], action: 'restore' });
  });
});
