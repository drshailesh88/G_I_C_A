import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockRevalidatePath,
  mockAssertEventAccess,
  mockWithEventScope,
  mockWriteAudit,
  mockEmitCascadeEvent,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockWithEventScope: vi.fn((...args: unknown[]) => args[args.length - 1]),
  mockWriteAudit: vi.fn(),
  mockEmitCascadeEvent: vi.fn(),
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

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/audit/write', () => ({
  writeAudit: mockWriteAudit,
}));

vi.mock('@/lib/cascade/emit', () => ({
  emitCascadeEvent: mockEmitCascadeEvent,
}));

import {
  createTravelRecord,
  updateTravelRecord,
  cancelTravelRecord,
  updateTravelRecordStatus,
  getEventTravelRecords,
  getTravelRecord,
  getPersonTravelRecords,
} from './travel';

// ── Chain helpers ─────────────────────────────────────────────
function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    innerJoin: vi.fn().mockReturnThis(),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function chainedInsert(rows: unknown[]) {
  const valuesData: unknown[] = [];
  const chain = {
    values: vi.fn((v: unknown) => { valuesData.push(v); return chain; }),
    returning: vi.fn().mockResolvedValue(rows),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValue(chain);
  return { chain, valuesData };
}

function chainedUpdate(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const RECORD_ID = '550e8400-e29b-41d4-a716-446655440002';

const validCreateInput = {
  personId: PERSON_ID,
  direction: 'inbound' as const,
  travelMode: 'flight' as const,
  fromCity: 'Mumbai',
  toCity: 'Delhi',
};

const existingRecord = {
  id: RECORD_ID,
  eventId: EVENT_ID,
  personId: PERSON_ID,
  recordStatus: 'confirmed',
  direction: 'inbound',
  fromCity: 'Mumbai',
  toCity: 'Delhi',
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
  mockWithEventScope.mockImplementation((...args: unknown[]) => args[args.length - 1]);
  mockWriteAudit.mockResolvedValue(undefined);
  mockEmitCascadeEvent.mockResolvedValue({ handlersRun: 0, errors: [] });
});

// ══════════════════════════════════════════════════════════════
// WRITE ACCESS FORWARDING (CP-01 to CP-03)
// ══════════════════════════════════════════════════════════════
describe('Write access forwarding', () => {
  it('CP-01: updateTravelRecord enforces requireWrite access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(
      updateTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID, fromCity: 'Pune' }),
    ).rejects.toThrow('Forbidden');

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('CP-02: cancelTravelRecord enforces requireWrite access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(
      cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID }),
    ).rejects.toThrow('Forbidden');

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('CP-03: updateTravelRecordStatus enforces requireWrite access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(
      updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed'),
    ).rejects.toThrow('Forbidden');

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

// ══════════════════════════════════════════════════════════════
// READ ACCESS ENFORCEMENT (CP-04 to CP-06)
// ══════════════════════════════════════════════════════════════
describe('Read access enforcement', () => {
  it('CP-04: getEventTravelRecords rejects when assertEventAccess throws', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(getEventTravelRecords(EVENT_ID)).rejects.toThrow('Forbidden');
  });

  it('CP-05: getTravelRecord rejects when assertEventAccess throws', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(getTravelRecord(EVENT_ID, RECORD_ID)).rejects.toThrow('Forbidden');
  });

  it('CP-06: getPersonTravelRecords rejects when assertEventAccess throws', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(getPersonTravelRecords(EVENT_ID, PERSON_ID)).rejects.toThrow('Forbidden');
  });
});

// ══════════════════════════════════════════════════════════════
// EVENT SCOPE ISOLATION (CP-07 to CP-11)
// ══════════════════════════════════════════════════════════════
describe('Event scope isolation', () => {
  it('CP-07: updateTravelRecord uses withEventScope to scope record lookup', async () => {
    chainedSelect([existingRecord]);
    chainedUpdate([{ ...existingRecord, fromCity: 'Pune', recordStatus: 'changed' }]);

    await updateTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID, fromCity: 'Pune' });

    expect(mockWithEventScope).toHaveBeenCalled();
    const call = mockWithEventScope.mock.calls[0];
    expect(call[1]).toBe(EVENT_ID);
  });

  it('CP-08: cancelTravelRecord uses withEventScope to scope record lookup', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID });

    expect(mockWithEventScope).toHaveBeenCalled();
    const call = mockWithEventScope.mock.calls[0];
    expect(call[1]).toBe(EVENT_ID);
  });

  it('CP-09: updateTravelRecordStatus uses withEventScope to scope record lookup', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'draft' }]);
    chainedUpdate([{ id: RECORD_ID, recordStatus: 'confirmed' }]);

    await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed');

    expect(mockWithEventScope).toHaveBeenCalled();
    const call = mockWithEventScope.mock.calls[0];
    expect(call[1]).toBe(EVENT_ID);
  });

  it('CP-10: getTravelRecord uses withEventScope to scope record lookup', async () => {
    chainedSelect([{ id: RECORD_ID }]);

    await getTravelRecord(EVENT_ID, RECORD_ID);

    expect(mockWithEventScope).toHaveBeenCalled();
    const call = mockWithEventScope.mock.calls[0];
    expect(call[1]).toBe(EVENT_ID);
  });

  it('CP-11: getPersonTravelRecords uses withEventScope to scope record lookup', async () => {
    chainedSelect([{ id: RECORD_ID }]);

    await getPersonTravelRecords(EVENT_ID, PERSON_ID);

    expect(mockWithEventScope).toHaveBeenCalled();
    const call = mockWithEventScope.mock.calls[0];
    expect(call[1]).toBe(EVENT_ID);
  });
});

// ══════════════════════════════════════════════════════════════
// AUDIT FIELDS (CP-12 to CP-17)
// ══════════════════════════════════════════════════════════════
describe('Audit fields', () => {
  it('CP-12: createTravelRecord sets createdBy to authenticated userId', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { chain } = chainedInsert([{ id: RECORD_ID, ...validCreateInput, eventId: EVENT_ID }]);

    await createTravelRecord(EVENT_ID, validCreateInput);

    // First call to chain.values is for the travel record
    const insertPayload = chain.values.mock.calls[0][0];
    expect(insertPayload.createdBy).toBe('user_123');
  });

  it('CP-13: createTravelRecord sets updatedBy to authenticated userId', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { chain } = chainedInsert([{ id: RECORD_ID, ...validCreateInput, eventId: EVENT_ID }]);

    await createTravelRecord(EVENT_ID, validCreateInput);

    const insertPayload = chain.values.mock.calls[0][0];
    expect(insertPayload.updatedBy).toBe('user_123');
  });

  it('CP-14: updateTravelRecord sets updatedBy to authenticated userId', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, fromCity: 'Pune', recordStatus: 'changed' }]);

    await updateTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID, fromCity: 'Pune' });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.updatedBy).toBe('user_123');
  });

  it('CP-15: cancelTravelRecord sets updatedBy to authenticated userId', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.updatedBy).toBe('user_123');
  });

  it('CP-16: updateTravelRecordStatus sets updatedBy to authenticated userId', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'confirmed' }]);

    await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed');

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.updatedBy).toBe('user_123');
  });

  it('CP-17: cancelTravelRecord sets cancelledAt to a Date', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.cancelledAt).toBeInstanceOf(Date);
  });
});

// ══════════════════════════════════════════════════════════════
// JUNCTION TABLE (CP-18 to CP-19)
// ══════════════════════════════════════════════════════════════
describe('Junction table', () => {
  it('CP-18: createTravelRecord inserts into eventPeople with source travel', async () => {
    chainedSelect([{ id: PERSON_ID }]);

    // We need to track multiple insert calls
    const insertCalls: unknown[] = [];
    const travelInsertChain = {
      values: vi.fn((v: unknown) => { insertCalls.push(v); return travelInsertChain; }),
      returning: vi.fn().mockResolvedValue([{ id: RECORD_ID, ...validCreateInput, eventId: EVENT_ID }]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    mockDb.insert.mockReturnValue(travelInsertChain);

    await createTravelRecord(EVENT_ID, validCreateInput);

    // Second values() call is the event_people junction
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
    const junctionPayload = insertCalls[1] as Record<string, unknown>;
    expect(junctionPayload.source).toBe('travel');
    expect(junctionPayload.eventId).toBe(EVENT_ID);
    expect(junctionPayload.personId).toBe(PERSON_ID);
  });

  it('CP-19: createTravelRecord uses onConflictDoNothing for eventPeople', async () => {
    chainedSelect([{ id: PERSON_ID }]);

    const chain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: RECORD_ID, ...validCreateInput, eventId: EVENT_ID }]),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    mockDb.insert.mockReturnValue(chain);

    await createTravelRecord(EVENT_ID, validCreateInput);

    expect(chain.onConflictDoNothing).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// PATH REVALIDATION (CP-20 to CP-22)
// ══════════════════════════════════════════════════════════════
describe('Path revalidation', () => {
  it('CP-20: updateTravelRecord revalidates travel path', async () => {
    chainedSelect([existingRecord]);
    chainedUpdate([{ ...existingRecord, fromCity: 'Pune', recordStatus: 'changed' }]);

    await updateTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID, fromCity: 'Pune' });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/travel`);
  });

  it('CP-21: cancelTravelRecord revalidates travel path', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/travel`);
  });

  it('CP-22: updateTravelRecordStatus revalidates travel path', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'draft' }]);
    chainedUpdate([{ id: RECORD_ID, recordStatus: 'confirmed' }]);

    await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed');

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/travel`);
  });
});
