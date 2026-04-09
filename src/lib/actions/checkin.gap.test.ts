import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockRevalidatePath,
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
  mockRevalidatePath: vi.fn(),
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
  revalidatePath: mockRevalidatePath,
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

import { processQrScan, processManualCheckIn } from './checkin';

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
      innerJoin: vi.fn().mockImplementation(() => chain),
      leftJoin: vi.fn().mockImplementation(() => chain),
      orderBy: vi.fn().mockResolvedValue(rows),
      then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
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
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440010';
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

// ── Gap: Session-level check-in uses eq instead of isNull ──────
describe('processQrScan session-level behavior', () => {
  const validCompactPayload = `${EVENT_ID}:${TOKEN}`;

  it('uses eq for session-level duplicate detection (not isNull)', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
      sessionId: SESSION_ID,
    });

    // When sessionId is provided, eq should be used (not isNull)
    expect(mockIsNull).not.toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalled();
  });

  it('inserts attendance record with sessionId when provided', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
      sessionId: SESSION_ID,
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID }),
    );
  });
});

// ── Gap: Non-duplicate DB error propagates ─────────────────────
describe('processQrScan non-duplicate DB errors', () => {
  const validCompactPayload = `${EVENT_ID}:${TOKEN}`;

  it('rethrows non-duplicate DB error on insert', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    const nonDuplicateError = new Error('Connection reset');
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(nonDuplicateError),
    });

    await expect(processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    })).rejects.toThrow('Connection reset');
  });
});

// ── Gap: Deterministic ID generation ───────────────────────────
describe('processQrScan deterministic ID', () => {
  const validCompactPayload = `${EVENT_ID}:${TOKEN}`;

  it('generates the same attendance ID for same inputs', async () => {
    const capturedIds: string[] = [];

    for (let i = 0; i < 2; i++) {
      selectCallCount = 0;
      chainedSelectSequence([
        [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
        [{ fullName: 'Dr. Sharma' }],
        [],
      ]);
      const insertChain = chainedInsert([{ id: 'new-id' }]);

      await processQrScan(EVENT_ID, {
        eventId: EVENT_ID,
        qrPayload: validCompactPayload,
      });

      const valuesCall = insertChain.values.mock.calls[0][0];
      capturedIds.push(valuesCall.id);
    }

    expect(capturedIds[0]).toBe(capturedIds[1]);
    // Should look like a UUID (has dashes)
    expect(capturedIds[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates different IDs for different sessions', async () => {
    const capturedIds: string[] = [];

    for (const sid of [null, SESSION_ID]) {
      selectCallCount = 0;
      chainedSelectSequence([
        [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
        [{ fullName: 'Dr. Sharma' }],
        [],
      ]);
      const insertChain = chainedInsert([{ id: 'new-id' }]);

      await processQrScan(EVENT_ID, {
        eventId: EVENT_ID,
        qrPayload: validCompactPayload,
        ...(sid ? { sessionId: sid } : {}),
      });

      const valuesCall = insertChain.values.mock.calls[0][0];
      capturedIds.push(valuesCall.id);
    }

    expect(capturedIds[0]).not.toBe(capturedIds[1]);
  });
});

// ── Gap: Manual check-in session-level ─────────────────────────
describe('processManualCheckIn session-level behavior', () => {
  it('uses eq for session-level duplicate detection', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    await processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
      sessionId: SESSION_ID,
    });

    expect(mockIsNull).not.toHaveBeenCalled();
  });

  it('inserts with sessionId for manual session-level check-in', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
      sessionId: SESSION_ID,
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID }),
    );
  });
});

// ── Gap: Manual check-in non-duplicate error ───────────────────
describe('processManualCheckIn non-duplicate DB errors', () => {
  it('rethrows non-duplicate DB error on insert', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    const nonDuplicateError = new Error('Connection timeout');
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(nonDuplicateError),
    });

    await expect(processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
    })).rejects.toThrow('Connection timeout');
  });
});

// ── Gap: Manual check-in missing person gracefully ─────────────
describe('processManualCheckIn missing person', () => {
  it('falls back to "Unknown" when person not found', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [], // person not found
      [],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    const result = await processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
    });

    expect(result.type).toBe('success');
    expect(result.personName).toBe('Unknown');
  });
});

// ── Gap: QR scan does not revalidate on non-success ─────────────
describe('processQrScan revalidation behavior', () => {
  const validCompactPayload = `${EVENT_ID}:${TOKEN}`;

  it('does not revalidate path on duplicate result', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [{ id: 'existing-id' }], // already checked in
    ]);

    await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('does not revalidate path on ineligible result', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'pending', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);

    await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('does not revalidate path on invalid result', async () => {
    await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: 'garbage-data',
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

// ── Gap: Event ID case-insensitive comparison ───────────────────
describe('processQrScan event ID case sensitivity', () => {
  it('accepts QR payload with uppercase event ID matching lowercase route', async () => {
    const upperEventId = EVENT_ID.toUpperCase();
    const payload = `${upperEventId}:${TOKEN}`;

    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: payload,
    });

    expect(result.type).toBe('success');
  });
});

// ── Gap: QR scan records userId from access check ───────────────
describe('processQrScan records checkInBy', () => {
  const validCompactPayload = `${EVENT_ID}:${TOKEN}`;

  it('records userId from assertEventAccess as checkInBy', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'staff_42', role: 'org:ops' });

    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ checkInBy: 'staff_42' }),
    );
  });
});
