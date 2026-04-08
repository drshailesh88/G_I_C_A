import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
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
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
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
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
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

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
});

// ══════════════════════════════════════════════════════════════
// CREATE
// ══════════════════════════════════════════════════════════════
describe('createTravelRecord', () => {
  it('creates a travel record for a valid person', async () => {
    const selectChain = chainedSelect([{ id: PERSON_ID }]);
    const insertChain = chainedInsert([{ id: RECORD_ID, ...validCreateInput, eventId: EVENT_ID }]);

    const result = await createTravelRecord(EVENT_ID, validCreateInput);

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
    expect(result.id).toBe(RECORD_ID);
  });

  it('throws when person not found', async () => {
    chainedSelect([]);

    await expect(createTravelRecord(EVENT_ID, validCreateInput)).rejects.toThrow('Person not found');
  });

  it('rejects invalid input (missing direction)', async () => {
    const { direction, ...bad } = validCreateInput;
    await expect(createTravelRecord(EVENT_ID, bad)).rejects.toThrow();
  });

  it('enforces write access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(createTravelRecord(EVENT_ID, validCreateInput)).rejects.toThrow('Forbidden');
  });

  it('revalidates travel path after creation', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    chainedInsert([{ id: RECORD_ID, ...validCreateInput, eventId: EVENT_ID }]);

    await createTravelRecord(EVENT_ID, validCreateInput);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/travel`);
  });
});

// ══════════════════════════════════════════════════════════════
// UPDATE
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecord', () => {
  const existingRecord = {
    id: RECORD_ID,
    eventId: EVENT_ID,
    personId: PERSON_ID,
    recordStatus: 'confirmed',
    direction: 'inbound',
    fromCity: 'Mumbai',
    toCity: 'Delhi',
  };

  it('updates a travel record', async () => {
    chainedSelect([existingRecord]);
    chainedUpdate([{ ...existingRecord, fromCity: 'Pune', recordStatus: 'changed' }]);

    const result = await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    expect(result.record.fromCity).toBe('Pune');
    expect(result.previous.fromCity).toBe('Mumbai');
  });

  it('marks confirmed record as changed on update', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'changed' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.recordStatus).toBe('changed');
  });

  it('throws when record not found', async () => {
    chainedSelect([]);

    await expect(
      updateTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID, fromCity: 'Pune' }),
    ).rejects.toThrow('Travel record not found');
  });

  it('throws when updating a cancelled record', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await expect(
      updateTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID, fromCity: 'Pune' }),
    ).rejects.toThrow('Cannot update a cancelled travel record');
  });
});

// ══════════════════════════════════════════════════════════════
// CANCEL
// ══════════════════════════════════════════════════════════════
describe('cancelTravelRecord', () => {
  it('soft cancels a confirmed record', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: null }]);
    chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    const result = await cancelTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      reason: 'Flight cancelled',
    });

    expect(result.recordStatus).toBe('cancelled');
  });

  it('throws when cancelling an already cancelled record', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await expect(
      cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID }),
    ).rejects.toThrow('Cannot cancel a travel record in "cancelled" status');
  });

  it('throws when record not found', async () => {
    chainedSelect([]);

    await expect(
      cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID }),
    ).rejects.toThrow('Travel record not found');
  });

  it('appends cancellation reason to notes', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'draft', notes: 'Original note' }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      reason: 'Changed plans',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toContain('Cancellation reason: Changed plans');
    expect(setCall.notes).toContain('Original note');
  });
});

// ══════════════════════════════════════════════════════════════
// STATUS TRANSITION
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecordStatus', () => {
  it('allows valid transition draft → confirmed', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'draft' }]);
    chainedUpdate([{ id: RECORD_ID, recordStatus: 'confirmed' }]);

    const result = await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed');
    expect(result.recordStatus).toBe('confirmed');
  });

  it('rejects invalid transition cancelled → confirmed', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await expect(
      updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed'),
    ).rejects.toThrow('Cannot transition');
  });

  it('sets cancelledAt when transitioning to cancelled', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'cancelled');

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.cancelledAt).toBeInstanceOf(Date);
  });
});

// ══════════════════════════════════════════════════════════════
// LIST / GET
// ══════════════════════════════════════════════════════════════
describe('getEventTravelRecords', () => {
  it('returns travel records with person details', async () => {
    const rows = [
      { id: RECORD_ID, personName: 'Dr. Sharma', direction: 'inbound' },
    ];
    chainedSelect(rows);

    const result = await getEventTravelRecords(EVENT_ID);
    expect(result).toEqual(rows);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });
});

describe('getTravelRecord', () => {
  it('returns a single record', async () => {
    chainedSelect([{ id: RECORD_ID }]);

    const result = await getTravelRecord(EVENT_ID, RECORD_ID);
    expect(result.id).toBe(RECORD_ID);
  });

  it('throws when record not found', async () => {
    chainedSelect([]);
    await expect(getTravelRecord(EVENT_ID, RECORD_ID)).rejects.toThrow('Travel record not found');
  });
});

describe('getPersonTravelRecords', () => {
  it('returns all travel records for a person in an event', async () => {
    const rows = [{ id: RECORD_ID }, { id: 'another-id' }];
    chainedSelect(rows);

    const result = await getPersonTravelRecords(EVENT_ID, PERSON_ID);
    expect(result).toEqual(rows);
  });
});
