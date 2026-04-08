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
});
