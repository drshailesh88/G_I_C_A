/**
 * Mutation-kill-2 tests for actions/person.ts
 *
 * Targets survivors concentrated in:
 *   - createPerson `createdFields.push(...)` conditionals for each optional
 *     field (salutation/email/phone/designation/specialty/organization/city/tags)
 *     and the audit meta `changedFields` payload.
 *   - updatePerson before→after diff: only fields whose JSON serialization
 *     changes end up in `meta.changes`.
 *   - getPersonHistory helpers (deriveSource, deriveChanges,
 *     deriveChangedFields) — each branch of the merge/restore/create fallback
 *     and the array/object meta handling.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuth,
  mockAssertEventAccess,
  mockDb,
  mockRevalidatePath,
  mockWriteAudit,
  mockDrizzle,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: 'user_123' })),
  mockAssertEventAccess: vi.fn(async () => ({
    userId: 'user_123',
    role: 'org:event_coordinator',
  })),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockWriteAudit: vi.fn(),
  mockDrizzle: {
    eq: vi.fn((...args: unknown[]) => ({ _tag: 'eq', args })),
    or: vi.fn((...args: unknown[]) => ({ _tag: 'or', args })),
    and: vi.fn((...args: unknown[]) => ({ _tag: 'and', args })),
    ilike: vi.fn((...args: unknown[]) => ({ _tag: 'ilike', args })),
    desc: vi.fn((col: unknown) => ({ _tag: 'desc', col })),
    inArray: vi.fn((...args: unknown[]) => ({ _tag: 'inArray', args })),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({
        _tag: 'sql', strings: [...strings], values,
      }),
      {},
    ),
    isNull: vi.fn((col: unknown) => ({ _tag: 'isNull', col })),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/audit/write', () => ({ writeAudit: mockWriteAudit }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: mockDrizzle.eq,
    or: mockDrizzle.or,
    and: mockDrizzle.and,
    ilike: mockDrizzle.ilike,
    desc: mockDrizzle.desc,
    inArray: mockDrizzle.inArray,
    sql: mockDrizzle.sql,
    isNull: mockDrizzle.isNull,
  };
});

import { createPerson, updatePerson, getPersonHistory } from './person';
import { ROLES } from '@/lib/auth/roles';

const PERSON_ID = '770e8400-e29b-41d4-a716-446655440000';

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
function authAsSuperAdmin() {
  mockAuth.mockResolvedValue({
    userId: 'u_sa',
    has: ({ role }: { role: string }) => role === ROLES.SUPER_ADMIN,
  });
}

function chainedSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
  };
}
function chainedInsert(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}
function chainedUpdate(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({ userId: 'user_123' });
  mockAssertEventAccess.mockResolvedValue({
    userId: 'user_123', role: 'org:event_coordinator',
  });
  mockWriteAudit.mockResolvedValue(undefined);
  mockRevalidatePath.mockReturnValue(undefined);
});

// ─────────────────────────────────────────────────────────
// createPerson audit `changedFields` — one assertion per
// optional field present / absent.
// ─────────────────────────────────────────────────────────
describe('createPerson audit meta changedFields', () => {
  const CREATED = { id: PERSON_ID, fullName: 'N' };

  function stubCreation() {
    // findDuplicatePerson → no match
    mockDb.select.mockReturnValueOnce(chainedSelect([]));
    mockDb.insert.mockReturnValueOnce(chainedInsert([CREATED]));
  }

  it('baseline: changedFields = [fullName, email] when only those are provided', async () => {
    stubCreation();
    await createPerson({ fullName: 'Alice', email: 'alice@x.co', tags: [] });
    const fields = mockWriteAudit.mock.calls[0][0].meta.changedFields as string[];
    expect(fields).toContain('fullName');
    expect(fields).toContain('email');
    expect(fields).not.toContain('salutation');
    expect(fields).not.toContain('phoneE164');
    expect(fields).not.toContain('designation');
    expect(fields).not.toContain('specialty');
    expect(fields).not.toContain('organization');
    expect(fields).not.toContain('city');
    expect(fields).not.toContain('tags');
  });

  it('pushes "salutation" when provided', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', salutation: 'Dr', tags: [] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).toContain('salutation');
  });

  it('does NOT push "salutation" when omitted', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', tags: [] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).not.toContain('salutation');
  });

  it('pushes "email" only when email provided', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@b.co', tags: [] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).toContain('email');
  });

  it('pushes "phoneE164" only when a normalizable phone is provided', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', phone: '+14155552671', tags: [] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).toContain('phoneE164');
  });

  it('pushes "designation" only when designation provided', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', designation: 'CEO', tags: [] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).toContain('designation');
  });

  it('pushes "specialty" only when specialty provided', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', specialty: 'Cardiology', tags: [] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).toContain('specialty');
  });

  it('pushes "organization" only when organization provided', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', organization: 'Acme', tags: [] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).toContain('organization');
  });

  it('pushes "city" only when city provided', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', city: 'Mumbai', tags: [] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).toContain('city');
  });

  it('pushes "tags" only when tags array is non-empty', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', tags: ['vip'] });
    expect(mockWriteAudit.mock.calls[0][0].meta.changedFields).toContain('tags');
  });

  it('does NOT push "tags" when tags array is empty', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', tags: [] });
    const fields = mockWriteAudit.mock.calls[0][0].meta.changedFields as string[];
    expect(fields).not.toContain('tags');
  });

  it('audit fires action="create" resource="people" with eventId=null', async () => {
    stubCreation();
    await createPerson({ fullName: 'A', email: 'a@x.co', tags: [] });
    const call = mockWriteAudit.mock.calls[0][0];
    expect(call.action).toBe('create');
    expect(call.resource).toBe('people');
    expect(call.eventId).toBeNull();
    expect(call.resourceId).toBe(PERSON_ID);
  });
});

// ─────────────────────────────────────────────────────────
// updatePerson before→after diff
// ─────────────────────────────────────────────────────────
describe('updatePerson diff in audit.meta.changes', () => {
  function stubUpdate(previous: Record<string, unknown>, updated: Record<string, unknown> = previous) {
    mockDb.select.mockReturnValueOnce(chainedSelect([previous]));
    mockDb.update.mockReturnValueOnce(chainedUpdate([updated]));
  }

  it('adds an entry in changes only for fields whose serialized value differs', async () => {
    stubUpdate(
      { id: PERSON_ID, fullName: 'Old', email: 'old@x.com', city: 'Mumbai' },
      { id: PERSON_ID, fullName: 'New', email: 'old@x.com', city: 'Mumbai' },
    );
    await updatePerson({ personId: PERSON_ID, fullName: 'New', email: 'old@x.com' });

    const changes = mockWriteAudit.mock.calls[0][0].meta.changes as Record<string, unknown>;
    expect(changes).toHaveProperty('fullName');
    expect(changes.fullName).toEqual({ from: 'Old', to: 'New' });
    // email was included in updateData but did not change — must NOT appear in changes.
    expect(changes).not.toHaveProperty('email');
  });

  it('picks up null-from → value-to transitions', async () => {
    stubUpdate(
      { id: PERSON_ID, fullName: 'X', designation: null },
      { id: PERSON_ID, fullName: 'X', designation: 'CEO' },
    );
    await updatePerson({ personId: PERSON_ID, designation: 'CEO' });
    const changes = mockWriteAudit.mock.calls[0][0].meta.changes as Record<string, any>;
    expect(changes.designation).toEqual({ from: null, to: 'CEO' });
  });

  it('treats undefined on either side as null in the diff', async () => {
    stubUpdate(
      { id: PERSON_ID, fullName: 'X' }, // city undefined
      { id: PERSON_ID, fullName: 'X', city: 'Delhi' },
    );
    await updatePerson({ personId: PERSON_ID, city: 'Delhi' });
    const changes = mockWriteAudit.mock.calls[0][0].meta.changes as Record<string, any>;
    expect(changes.city.from).toBeNull();
    expect(changes.city.to).toBe('Delhi');
  });

  it('empty string input stored as null triggers a change entry', async () => {
    stubUpdate(
      { id: PERSON_ID, fullName: 'X', email: 'a@b.co' },
      { id: PERSON_ID, fullName: 'X', email: null },
    );
    await updatePerson({ personId: PERSON_ID, email: '' });
    const changes = mockWriteAudit.mock.calls[0][0].meta.changes as Record<string, any>;
    expect(changes.email).toEqual({ from: 'a@b.co', to: null });
  });

  it('changedFields list excludes updatedBy / updatedAt', async () => {
    stubUpdate(
      { id: PERSON_ID, fullName: 'X' },
      { id: PERSON_ID, fullName: 'Y' },
    );
    await updatePerson({ personId: PERSON_ID, fullName: 'Y' });
    const fields = mockWriteAudit.mock.calls[0][0].meta.changedFields as string[];
    expect(fields).toContain('fullName');
    expect(fields).not.toContain('updatedBy');
    expect(fields).not.toContain('updatedAt');
  });

  it('audit meta.source is exactly "admin"', async () => {
    stubUpdate(
      { id: PERSON_ID, fullName: 'X' },
      { id: PERSON_ID, fullName: 'Y' },
    );
    await updatePerson({ personId: PERSON_ID, fullName: 'Y' });
    expect(mockWriteAudit.mock.calls[0][0].meta.source).toBe('admin');
  });
});

// ─────────────────────────────────────────────────────────
// getPersonHistory helpers — deriveSource / deriveChanges /
// deriveChangedFields branch coverage.
// ─────────────────────────────────────────────────────────
describe('getPersonHistory derive helpers', () => {
  function stubHistory(rows: unknown[]) {
    mockDb.select
      .mockReturnValueOnce(mockHistoryChain(rows))
      .mockReturnValueOnce(mockCountChain(rows.length));
  }

  function baseRow(meta: Record<string, unknown>, action = 'update') {
    return {
      id: '11111111-1111-1111-1111-111111111111',
      actorUserId: 'u',
      action,
      resource: 'people',
      resourceId: PERSON_ID,
      eventId: null,
      timestamp: new Date('2026-04-01T10:00:00Z'),
      meta,
    };
  }

  it('deriveSource: explicit meta.source wins (non-string ignored)', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ source: 'self_service' })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].source).toBe('self_service');
  });

  it('deriveSource: non-string source is ignored and falls through', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ source: 42 })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].source).toBe('admin');
  });

  it('deriveSource: meta.action="merge" → source="merge"', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ action: 'merge' })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].source).toBe('merge');
  });

  it('deriveSource: meta.action="restore" → source="admin"', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ action: 'restore' })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].source).toBe('admin');
  });

  it('deriveSource: audit.action="create" + no meta action → source="admin"', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({}, 'create')]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].source).toBe('admin');
  });

  it('deriveSource: non-string meta.action falls through to action fallback', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ action: 42 })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].source).toBe('admin');
  });

  it('deriveChanges: returns object when meta.changes is a plain object', async () => {
    authAsSuperAdmin();
    const meta = { changes: { email: { from: 'a', to: 'b' } } };
    stubHistory([baseRow(meta)]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changes).toEqual({ email: { from: 'a', to: 'b' } });
  });

  it('deriveChanges: returns {} when meta.changes is an array', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ changes: ['not', 'an', 'object'] })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changes).toEqual({});
  });

  it('deriveChanges: returns {} when meta.changes is a non-object (string)', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ changes: 'x' })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changes).toEqual({});
  });

  it('deriveChanges: returns {} when meta.changes is null', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ changes: null })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changes).toEqual({});
  });

  it('deriveChangedFields: uses meta.changedFields when it is a string[]', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ changedFields: ['email', 'city'] })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changedFields).toEqual(['email', 'city']);
  });

  it('deriveChangedFields: filters out non-string values inside changedFields', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ changedFields: ['email', 42, 'city', null] })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changedFields).toEqual(['email', 'city']);
  });

  it('deriveChangedFields: falls back to Object.keys(changes) when changedFields absent', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ changes: { email: { from: 'a', to: 'b' }, city: { from: null, to: 'x' } } })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changedFields.sort()).toEqual(['city', 'email']);
  });

  it('deriveChangedFields: falls back to [] when neither changedFields nor valid changes', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({})]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changedFields).toEqual([]);
  });

  it('deriveChangedFields: treats changes=array as invalid (returns [])', async () => {
    authAsSuperAdmin();
    stubHistory([baseRow({ changes: [{ a: 1 }] })]);
    const r = await getPersonHistory(PERSON_ID);
    expect(r.rows[0].changedFields).toEqual([]);
  });
});
