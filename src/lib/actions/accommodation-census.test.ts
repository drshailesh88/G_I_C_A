/**
 * Accommodation Census Tests — Actions gap coverage
 *
 * Covers Spec 01, 03, 07 checkpoints not in existing accommodation.test.ts:
 * - CP-06: Cancel with reason appends to existing notes
 * - CP-36: Update draft record does NOT change status
 * - CP-78: Cancel with reason appends to existing notes (detailed)
 * - CP-79: Create with all optional fields populated
 * - CP-80: Update sets null for empty optional fields
 * - CP-73/74/75: Revalidation paths
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockRevalidatePath,
  mockAssertEventAccess,
  mockWriteAudit,
  mockEmitCascadeEvent,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    selectDistinctOn: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
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
  withEventScope: vi.fn(),
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
  createAccommodationRecord,
  updateAccommodationRecord,
  cancelAccommodationRecord,
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

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
  mockWriteAudit.mockResolvedValue(undefined);
  mockEmitCascadeEvent.mockResolvedValue({ handlersRun: 1, errors: [] });
});

// ── CP-06 / CP-78: Cancel with reason appends to existing notes ──
describe('CP-06/CP-78: cancel with reason appends to notes', () => {
  it('appends cancellation reason to existing notes', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: 'Important VIP' }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      reason: 'Budget cut',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBe('Important VIP\nCancellation reason: Budget cut');
  });

  it('creates notes from reason when existing notes are null', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'draft', notes: null }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      reason: 'No longer needed',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBe('Cancellation reason: No longer needed');
  });

  it('keeps existing notes when no reason provided', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: 'VIP guest' }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBe('VIP guest');
  });
});

// ── CP-36: Update draft record does NOT change status ────────
describe('CP-36: update draft leaves status as draft', () => {
  it('does not change draft status on update', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      personId: PERSON_ID,
      recordStatus: 'draft',
      hotelName: 'Old Hotel',
    }]);
    const updateChain = chainedUpdate([{
      id: RECORD_ID,
      recordStatus: 'draft',
      hotelName: 'New Hotel',
    }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Hotel',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    // recordStatus should NOT be set (draft stays draft)
    expect(setCall.recordStatus).toBeUndefined();
  });
});

// ── CP-35: Update auto-changes sent to "changed" ─────────────
describe('CP-35: update sent record marks as changed', () => {
  it('changes sent to changed on update', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      personId: PERSON_ID,
      recordStatus: 'sent',
      hotelName: 'Old Hotel',
    }]);
    const updateChain = chainedUpdate([{
      id: RECORD_ID,
      recordStatus: 'changed',
    }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Hotel',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.recordStatus).toBe('changed');
  });
});

// ── CP-79: Create with all optional fields populated ─────────
describe('CP-79: create with all optional fields', () => {
  it('passes all optional fields to insert', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const insertChain = chainedInsert([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      hotelAddress: '123 Main St',
      hotelCity: 'Mumbai',
      googleMapsUrl: 'https://maps.google.com/test',
      roomType: 'suite',
      roomNumber: '501',
      sharedRoomGroup: 'GROUP-VIP',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
      bookingReference: 'BK-99999',
      attachmentUrl: 'https://storage.example.com/booking.pdf',
      specialRequests: 'Wheelchair accessible',
      notes: 'VVIP delegate',
    });

    const insertValues = insertChain.values.mock.calls[0][0];
    expect(insertValues.hotelAddress).toBe('123 Main St');
    expect(insertValues.hotelCity).toBe('Mumbai');
    expect(insertValues.googleMapsUrl).toBe('https://maps.google.com/test');
    expect(insertValues.roomType).toBe('suite');
    expect(insertValues.roomNumber).toBe('501');
    expect(insertValues.sharedRoomGroup).toBe('GROUP-VIP');
    expect(insertValues.bookingReference).toBe('BK-99999');
    expect(insertValues.attachmentUrl).toBe('https://storage.example.com/booking.pdf');
    expect(insertValues.specialRequests).toBe('Wheelchair accessible');
    expect(insertValues.notes).toBe('VVIP delegate');
  });
});

// ── CP-80: Update sets null for empty optional fields ────────
describe('CP-80: update with empty optional fields sets null', () => {
  it('sets hotelCity to null when empty string passed', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      personId: PERSON_ID,
      recordStatus: 'draft',
      hotelCity: 'Mumbai',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelCity: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.hotelCity).toBeNull();
  });

  it('sets hotelAddress to null when empty string passed', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      personId: PERSON_ID,
      recordStatus: 'draft',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelAddress: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.hotelAddress).toBeNull();
  });
});

// ── CP-73/74/75: Revalidation on create/update/cancel ────────
describe('CP-73: revalidation on create', () => {
  it('calls revalidatePath after create', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    chainedInsert([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/accommodation`);
  });
});

describe('CP-74: revalidation on update', () => {
  it('calls revalidatePath after update', async () => {
    chainedSelect([{ id: RECORD_ID, eventId: EVENT_ID, recordStatus: 'draft' }]);
    chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Name',
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/accommodation`);
  });
});

describe('CP-75: revalidation on cancel', () => {
  it('calls revalidatePath after cancel', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: null }]);
    chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/accommodation`);
  });
});

// ── CP-69/70/71: Write access required ───────────────────────
describe('CP-69: create requires write access', () => {
  it('calls assertEventAccess with requireWrite', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    chainedInsert([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

describe('CP-70: update requires write access', () => {
  it('calls assertEventAccess with requireWrite', async () => {
    chainedSelect([{ id: RECORD_ID, eventId: EVENT_ID, recordStatus: 'draft' }]);
    chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Updated',
    });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

describe('CP-71: cancel requires write access', () => {
  it('calls assertEventAccess with requireWrite', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: null }]);
    chainedUpdate([{ id: RECORD_ID }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
    });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});
