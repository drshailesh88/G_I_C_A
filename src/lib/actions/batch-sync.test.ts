import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockAssertEventAccess,
  mockWithEventScope,
  mockEq,
  mockAnd,
  mockIsNull,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockWithEventScope: vi.fn(),
  mockEq: vi.fn(),
  mockAnd: vi.fn(),
  mockIsNull: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');

  return {
    ...actual,
    eq: mockEq,
    and: mockAnd,
    isNull: mockIsNull,
  };
});

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { processBatchSync } from './batch-sync';

// ── Chain helpers ─────────────────────────────────────────────
let selectCallCount = 0;
function chainedSelectSequence(calls: unknown[][]) {
  selectCallCount = 0;
  mockDb.select.mockImplementation(() => {
    const rows = calls[selectCallCount] || [];
    selectCallCount++;
    const chain: any = {
      from: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  });
}

function chainedSelectOutcomes(outcomes: Array<unknown[] | Error>) {
  selectCallCount = 0;
  mockDb.select.mockImplementation(() => {
    const outcome = outcomes[selectCallCount] ?? [];
    selectCallCount++;
    const chain: any = {
      from: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockImplementation(() => (
        outcome instanceof Error
          ? Promise.reject(outcome)
          : Promise.resolve(outcome)
      )),
      then: (resolve: (val: unknown) => void, reject?: (reason: unknown) => void) => (
        outcome instanceof Error
          ? Promise.reject(outcome).then(resolve, reject)
          : Promise.resolve(outcome).then(resolve, reject)
      ),
    };
    return chain;
  });
}

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const REG_ID = '550e8400-e29b-41d4-a716-446655440002';
const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  mockEq.mockImplementation((left, right) => ({ kind: 'eq', left, right }));
  mockAnd.mockImplementation((...conditions) => ({ kind: 'and', conditions }));
  mockIsNull.mockImplementation((column) => ({ kind: 'isNull', column }));
  mockWithEventScope.mockImplementation((_eventColumn, _eventId, condition) => condition);
});

function makeSyncInput(overrides: Partial<{
  qrPayload: string;
  sessionId: string | null;
  scannedAt: string;
  deviceId: string;
}> = {}) {
  return {
    qrPayload: overrides.qrPayload ?? `${EVENT_ID}:${TOKEN}`,
    sessionId: overrides.sessionId ?? null,
    scannedAt: overrides.scannedAt ?? '2026-04-08T10:00:00Z',
    deviceId: overrides.deviceId ?? 'ipad-crew-1',
  };
}

describe('processBatchSync', () => {
  it('syncs a single valid record', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.total).toBe(1);
    expect(result.synced).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.results[0].result.type).toBe('success');
  });

  it('handles invalid QR payload gracefully', async () => {
    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput({ qrPayload: 'garbage' })],
    });

    expect(result.errors).toBe(1);
    expect(result.results[0].result.type).toBe('invalid');
  });

  it('handles wrong event ID in QR payload', async () => {
    const wrongEventId = '550e8400-e29b-41d4-a716-446655440099';
    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput({ qrPayload: `${wrongEventId}:${TOKEN}` })],
    });

    expect(result.errors).toBe(1);
    expect(result.results[0].result.message).toContain('different event');
  });

  it('accepts QR payloads when the event UUID casing differs', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput({ qrPayload: `${EVENT_ID.toUpperCase()}:${TOKEN}` })],
    });

    // Correct behavior: UUID comparison should be case-insensitive, so a valid QR
    // for the same event must still sync even if its hex characters are uppercase.
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.results[0].result.type).toBe('success');
  });

  it('handles duplicate as synced (not error)', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const duplicateError = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(duplicateError),
    });

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.duplicates).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.results[0].result.type).toBe('duplicate');
  });

  it('handles registration not found', async () => {
    chainedSelectSequence([[]]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.errors).toBe(1);
    expect(result.results[0].result.type).toBe('invalid');
  });

  it('handles ineligible registration (pending)', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'pending', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.errors).toBe(1);
    expect(result.results[0].result.type).toBe('ineligible');
  });

  it('processes mixed batch correctly', async () => {
    // Record 0: valid → success
    // Record 1: invalid QR
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [
        makeSyncInput(),
        makeSyncInput({ qrPayload: 'bad-data' }),
      ],
    });

    expect(result.total).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].result.type).toBe('success');
    expect(result.results[1].result.type).toBe('invalid');
  });

  it('requires write access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    })).rejects.toThrow('Forbidden');
  });

  it('validates input with Zod', async () => {
    await expect(processBatchSync(EVENT_ID, {
      eventId: 'bad',
      records: [],
    })).rejects.toThrow();
  });

  it('rejects empty records array', async () => {
    await expect(processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [],
    })).rejects.toThrow();
  });

  it('passes scannedAt as checkInAt to attendance record', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput({ scannedAt: '2026-04-08T09:30:00Z' })],
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        checkInAt: new Date('2026-04-08T09:30:00Z'),
        offlineDeviceId: 'ipad-crew-1',
      }),
    );
  });

  it('passes deviceId to attendance record', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput({ deviceId: 'tablet-42' })],
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ offlineDeviceId: 'tablet-42' }),
    );
  });

  it('handles cancelled registration', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: new Date(), registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.results[0].result.type).toBe('ineligible');
  });

  it('handles database error (non-duplicate) during insert', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('Connection timeout')),
    });

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.errors).toBe(1);
    expect(result.results[0].result.message).toContain('Database error');
  });

  it('continues processing later records when a registration lookup throws', async () => {
    chainedSelectOutcomes([
      new Error('registration query failed'),
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [
        makeSyncInput({ deviceId: 'broken-reader' }),
        makeSyncInput({ deviceId: 'healthy-reader' }),
      ],
    });

    // Correct behavior: one failed lookup should be recorded as an item-level error,
    // and the rest of the batch should still be processed.
    expect(result.total).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(insertChain.values).toHaveBeenCalledTimes(1);
  });

  it('continues processing later records when a person lookup throws', async () => {
    chainedSelectOutcomes([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      new Error('person query failed'),
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [
        makeSyncInput({ deviceId: 'reader-a' }),
        makeSyncInput({ deviceId: 'reader-b' }),
      ],
    });

    // Correct behavior: if enrichment for one record fails, that record should be
    // marked as an error without aborting the rest of the batch.
    expect(result.total).toBe(2);
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(insertChain.values).toHaveBeenCalledTimes(1);
  });

  // ── buildAttendanceRecordId ──────────────────────────────────────────────────

  it('generates a UUID-v5-format id for the attendance record', async () => {
    // Kills: BlockStatement→{}, ArrayDeclaration→[], all MethodExpression (slice→hash),
    // StringLiteral L35:5 (removes '5' prefix), StringLiteral L40 (join separator '-'→'')
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      }),
    );
  });

  it('generates different ids for records with and without sessionId', async () => {
    const SESSION_ID = '660e8400-e29b-41d4-a716-446655440003';
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertedIds: string[] = [];
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: { id: string }) => {
        insertedIds.push(vals.id);
        return Promise.resolve([{ id: vals.id }]);
      }),
    }));

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [
        makeSyncInput({ sessionId: null }),
        makeSyncInput({ sessionId: SESSION_ID }),
      ],
    });

    expect(insertedIds).toHaveLength(2);
    expect(insertedIds[0]).not.toBe(insertedIds[1]);
    // Both must be valid UUID format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(insertedIds[0]).toMatch(uuidPattern);
    expect(insertedIds[1]).toMatch(uuidPattern);
  });

  it('uses "event" as the null-sessionId fallback segment (exact ID match)', async () => {
    // Kills: StringLiteral L29:52 ('event' → ''): the mutant produces hash of
    //   `${eventId}:${personId}:` (empty string), yielding a completely different UUID.
    // Also kills: LogicalOperator L36:19 (hash[16] ?? '0' → hash[16] && '0'):
    //   with &&, hash[16] is always truthy (hex char), so result is always '0' → parseInt=0
    //   → variant always '8'; but actual hash[16]='6' maps to variant 'a', so IDs differ.
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput({ sessionId: null })],
    });

    // Independently compute what the ID should be using the same construction.
    const hash = createHash('sha256')
      .update(`${EVENT_ID}:${PERSON_ID}:event`)
      .digest('hex');
    const expectedId = [
      hash.slice(0, 8),
      hash.slice(8, 12),
      `5${hash.slice(13, 16)}`,
      `${((parseInt(hash[16] ?? '0', 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
      hash.slice(20, 32),
    ].join('-');

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: expectedId }),
    );
  });

  it('generates different ids for records with two distinct non-null sessionIds', async () => {
    // Kills: LogicalOperator L29:39 (sessionId ?? 'event' → sessionId && 'event'):
    // with &&, ALL non-null sessionIds collapse to 'event', producing identical hashes.
    const SESSION_ID_1 = '660e8400-e29b-41d4-a716-446655440003';
    const SESSION_ID_2 = '770e8400-e29b-41d4-a716-446655440004';
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertedIds: string[] = [];
    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: { id: string }) => {
        insertedIds.push(vals.id);
        return Promise.resolve([{ id: vals.id }]);
      }),
    }));

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [
        makeSyncInput({ sessionId: SESSION_ID_1 }),
        makeSyncInput({ sessionId: SESSION_ID_2 }),
      ],
    });

    expect(insertedIds).toHaveLength(2);
    expect(insertedIds[0]).not.toBe(insertedIds[1]);
  });

  // ── isDuplicateError ──────────────────────────────────────────────────────────

  it('treats error with duplicate key message (no 23505 code) as duplicate', async () => {
    // Kills: LogicalOperator L46:10 (||→&&), ConditionalExpression L46:10 (→false),
    //        StringLiteral L46:19 ('23505'→''), ConditionalExpression L44:7 (instanceof→false)
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint')),
    });

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.duplicates).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.results[0].result.type).toBe('duplicate');
    expect(result.results[0].result.message).toBeTruthy();
  });

  it('treats error with code 23505 and no duplicate key message as duplicate', async () => {
    // Kills: LogicalOperator L46:10 (||→&&), StringLiteral L45:16 ('code'→'')
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(
        Object.assign(new Error('unique_violation'), { code: '23505' }),
      ),
    });

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.duplicates).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('performs case-insensitive match on duplicate key message', async () => {
    // Kills: MethodExpression L46:30 (toLowerCase→toUpperCase):
    // 'DUPLICATE KEY...'.toUpperCase() = 'DUPLICATE KEY...' which does NOT include 'duplicate key'.
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DUPLICATE KEY VALUE VIOLATES CONSTRAINT')),
    });

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.duplicates).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('does not treat a non-Error throw as a duplicate', async () => {
    // Kills: ConditionalExpression L44:7 (instanceof→false):
    // non-Error objects would bypass the check and potentially be treated as duplicates.
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue({ code: '23505', message: 'duplicate key' }),
    });

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.errors).toBe(1);
    expect(result.duplicates).toBe(0);
  });

  // ── processBatchSync call-site correctness ──────────────────────────────────

  it('calls assertEventAccess with requireWrite: true', async () => {
    // Kills: ObjectLiteral L53:55 (→{}), BooleanLiteral L53:71 (true→false)
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('passes a non-null sessionId through to the attendance record insert', async () => {
    // Kills: LogicalOperator L67:23 (record.sessionId ?? null → record.sessionId && null):
    // with &&, truthy sessionId is nulled out instead of preserved.
    const SESSION_ID = '660e8400-e29b-41d4-a716-446655440003';
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput({ sessionId: SESSION_ID })],
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID }),
    );
  });

  it('reports wrong-event QR with type invalid', async () => {
    // Kills: StringLiteral L85:25 ('invalid'→''): existing test checks message but not type.
    const wrongEventId = '550e8400-e29b-41d4-a716-446655440099';
    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput({ qrPayload: `${wrongEventId}:${TOKEN}` })],
    });

    expect(result.results[0].result.type).toBe('invalid');
  });

  it('includes a meaningful message when registration is not found', async () => {
    // Kills: ConditionalExpression L113:11 (→false), BlockStatement L113:26 (→{}),
    //        StringLiteral L117:47 (message→'').
    // With mutant →false the not-found block is skipped; outer catch fires with a
    // generic 'Database error' message instead of the specific 'not recognized' text.
    chainedSelectSequence([[]]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.errors).toBe(1);
    expect(result.results[0].result.type).toBe('invalid');
    expect(result.results[0].result.message).toContain('not recognized');
  });

  it('uses the real person name from the database in the scan result', async () => {
    // Kills: LogicalOperator L130:26 (person?.fullName ?? 'Unknown' → person?.fullName && 'Unknown'):
    // with &&, truthy fullName is replaced by 'Unknown' instead of preserved.
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.results[0].result.personName).toBe('Dr. Sharma');
  });

  it('falls back to Unknown when person record is missing', async () => {
    // Kills: OptionalChaining L130:26 (person?.fullName → person.fullName):
    // without optional chaining, undefined.fullName throws and the outer catch
    // counts it as an error instead of a successful check-in with 'Unknown' name.
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [], // person lookup returns nothing
    ]);
    chainedInsert([{ id: 'new-id' }]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.results[0].result.personName).toBe('Unknown');
  });

  it('records checkInMethod as qr_scan in the attendance insert', async () => {
    // Kills: StringLiteral L166:26 ('qr_scan'→'')
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ checkInMethod: 'qr_scan' }),
    );
  });

  it('includes a non-empty message in the duplicate result', async () => {
    // Kills: StringLiteral L186:24 (duplicate message→'')
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    const duplicateError = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(duplicateError),
    });

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.results[0].result.message).toBeTruthy();
    expect(result.results[0].result.message).toContain('checked in');
  });

  it('includes a non-empty message when a non-duplicate DB error occurs during insert', async () => {
    // Kills: StringLiteral L197:29 (non-dup error message→'')
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
    ]);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('Connection timeout')),
    });

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.results[0].result.type).toBe('invalid');
    expect(result.results[0].result.message).toBeTruthy();
  });

  it('outer DB lookup failure produces a typed invalid result with non-empty message', async () => {
    // Kills: ObjectLiteral L205:32/L207:17 (→{}), StringLiteral L207:25 (type→''),
    //        StringLiteral L207:45 (message→'')
    chainedSelectOutcomes([
      new Error('registration query failed'),
    ]);

    const result = await processBatchSync(EVENT_ID, {
      eventId: EVENT_ID,
      records: [makeSyncInput()],
    });

    expect(result.errors).toBe(1);
    expect(result.results[0].result.type).toBe('invalid');
    expect(result.results[0].result.message).toBeTruthy();
  });
});
