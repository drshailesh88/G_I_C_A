import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    selectDistinctOn: vi.fn(),
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
  createAccommodationRecord,
  updateAccommodationRecord,
  cancelAccommodationRecord,
  getEventAccommodationRecords,
  getAccommodationRecord,
  getPeopleWithTravelRecords,
  getSharedRoomGroupMembers,
} from './accommodation';

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

function chainedSelectDistinctOn(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
    innerJoin: vi.fn().mockReturnThis(),
  };
  mockDb.selectDistinctOn.mockReturnValue(chain);
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
  hotelName: 'Hotel Leela',
  checkInDate: '2026-05-01T14:00:00Z',
  checkOutDate: '2026-05-03T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
});

// ══════════════════════════════════════════════════════════════
// CREATE
// ══════════════════════════════════════════════════════════════
describe('createAccommodationRecord', () => {
  it('creates a record for a valid person', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    chainedInsert([{ id: RECORD_ID, ...validCreateInput, eventId: EVENT_ID }]);

    const result = await createAccommodationRecord(EVENT_ID, validCreateInput);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
    expect(result.id).toBe(RECORD_ID);
  });

  it('throws when person not found', async () => {
    chainedSelect([]);
    await expect(createAccommodationRecord(EVENT_ID, validCreateInput)).rejects.toThrow('Person not found');
  });

  it('rejects invalid input (missing hotelName)', async () => {
    const { hotelName, ...bad } = validCreateInput;
    await expect(createAccommodationRecord(EVENT_ID, bad)).rejects.toThrow();
  });

  it('rejects checkout before checkin', async () => {
    await expect(createAccommodationRecord(EVENT_ID, {
      ...validCreateInput,
      checkInDate: '2026-05-03T14:00:00Z',
      checkOutDate: '2026-05-01T12:00:00Z',
    })).rejects.toThrow('Check-out must be after check-in');
  });
});

// ══════════════════════════════════════════════════════════════
// UPDATE
// ══════════════════════════════════════════════════════════════
describe('updateAccommodationRecord', () => {
  const existingRecord = {
    id: RECORD_ID,
    eventId: EVENT_ID,
    personId: PERSON_ID,
    recordStatus: 'confirmed',
    hotelName: 'Hotel Leela',
  };

  it('updates an accommodation record', async () => {
    chainedSelect([existingRecord]);
    chainedUpdate([{ ...existingRecord, hotelName: 'Hotel Taj', recordStatus: 'changed' }]);

    const result = await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Hotel Taj',
    });
    expect(result.record.hotelName).toBe('Hotel Taj');
    expect(result.previous.hotelName).toBe('Hotel Leela');
  });

  it('marks confirmed record as changed', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'changed' }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Hotel Taj',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.recordStatus).toBe('changed');
  });

  it('throws when record not found', async () => {
    chainedSelect([]);
    await expect(
      updateAccommodationRecord(EVENT_ID, { accommodationRecordId: RECORD_ID, hotelName: 'X' }),
    ).rejects.toThrow('Accommodation record not found');
  });

  it('throws when updating cancelled record', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'cancelled' }]);
    await expect(
      updateAccommodationRecord(EVENT_ID, { accommodationRecordId: RECORD_ID, hotelName: 'X' }),
    ).rejects.toThrow('Cannot update a cancelled accommodation record');
  });
});

// ══════════════════════════════════════════════════════════════
// CANCEL
// ══════════════════════════════════════════════════════════════
describe('cancelAccommodationRecord', () => {
  it('soft cancels a confirmed record', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: null }]);
    chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    const result = await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      reason: 'Guest changed plans',
    });
    expect(result.recordStatus).toBe('cancelled');
  });

  it('throws when cancelling already cancelled record', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'cancelled' }]);
    await expect(
      cancelAccommodationRecord(EVENT_ID, { accommodationRecordId: RECORD_ID }),
    ).rejects.toThrow('Cannot cancel an accommodation record in "cancelled" status');
  });

  it('throws when record not found', async () => {
    chainedSelect([]);
    await expect(
      cancelAccommodationRecord(EVENT_ID, { accommodationRecordId: RECORD_ID }),
    ).rejects.toThrow('Accommodation record not found');
  });
});

// ══════════════════════════════════════════════════════════════
// LIST / GET
// ══════════════════════════════════════════════════════════════
describe('getEventAccommodationRecords', () => {
  it('returns records with person details', async () => {
    const rows = [{ id: RECORD_ID, personName: 'Dr. Sharma', hotelName: 'Hotel Leela' }];
    chainedSelect(rows);
    const result = await getEventAccommodationRecords(EVENT_ID);
    expect(result).toEqual(rows);
  });
});

describe('getAccommodationRecord', () => {
  it('returns a single record', async () => {
    chainedSelect([{ id: RECORD_ID }]);
    const result = await getAccommodationRecord(EVENT_ID, RECORD_ID);
    expect(result.id).toBe(RECORD_ID);
  });

  it('throws when not found', async () => {
    chainedSelect([]);
    await expect(getAccommodationRecord(EVENT_ID, RECORD_ID)).rejects.toThrow('Accommodation record not found');
  });
});

describe('getPeopleWithTravelRecords', () => {
  it('returns people who have travel records', async () => {
    const rows = [{ personId: PERSON_ID, personName: 'Dr. Sharma' }];
    chainedSelectDistinctOn(rows);
    const result = await getPeopleWithTravelRecords(EVENT_ID);
    expect(result).toEqual(rows);
  });
});

describe('getSharedRoomGroupMembers', () => {
  it('returns members of a shared room group', async () => {
    const rows = [{ id: RECORD_ID, personName: 'Dr. Sharma' }];
    // This query ends at .where() — no .limit() or .orderBy() call
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
      innerJoin: vi.fn().mockReturnThis(),
    };
    mockDb.select.mockReturnValue(chain);
    const result = await getSharedRoomGroupMembers(EVENT_ID, 'GROUP-A1');
    expect(result).toEqual(rows);
  });

  it('returns empty array for empty group', async () => {
    const result = await getSharedRoomGroupMembers(EVENT_ID, '');
    expect(result).toEqual([]);
  });
});
