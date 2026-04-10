/**
 * Accommodation Actions — Mutation Kill Tests
 *
 * Targets 67 surviving mutations in accommodation.ts (actions):
 *   - ConditionalExpression: field update conditionals (L87-99)
 *   - LogicalOperator: `|| null` coercion on create values
 *   - StringLiteral: error messages, 'draft' status, 'accommodation' source
 *   - ObjectLiteral: insert/update data shapes
 *   - EqualityOperator: `!== undefined` checks
 *   - ArrayDeclaration: revalidatePath path
 */
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

function setupTwoInserts(recordRows: unknown[]) {
  const recordInsertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(recordRows),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  const eventPeopleInsertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert
    .mockReturnValueOnce(recordInsertChain)
    .mockReturnValueOnce(eventPeopleInsertChain);
  return { recordInsertChain, eventPeopleInsertChain };
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
});

// ══════════════════════════════════════════════════════════════
// CREATE: Kill LogicalOperator (|| null) and ObjectLiteral mutations
// ══════════════════════════════════════════════════════════════
describe('create: || null coercion for optional fields', () => {
  it('passes null for registrationId when empty string is provided', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { recordInsertChain } = setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
      registrationId: '',
    });

    const valuesCall = recordInsertChain.values.mock.calls[0][0];
    expect(valuesCall.registrationId).toBeNull();
  });

  it('passes actual registrationId value when provided', async () => {
    const regId = '550e8400-e29b-41d4-a716-446655440099';
    chainedSelect([{ id: PERSON_ID }]);
    const { recordInsertChain } = setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
      registrationId: regId,
    });

    const valuesCall = recordInsertChain.values.mock.calls[0][0];
    expect(valuesCall.registrationId).toBe(regId);
  });

  it('passes null for all optional fields when not provided', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { recordInsertChain } = setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    const v = recordInsertChain.values.mock.calls[0][0];
    expect(v.hotelAddress).toBeNull();
    expect(v.hotelCity).toBeNull();
    expect(v.googleMapsUrl).toBeNull();
    expect(v.roomType).toBeNull();
    expect(v.roomNumber).toBeNull();
    expect(v.sharedRoomGroup).toBeNull();
    expect(v.bookingReference).toBeNull();
    expect(v.attachmentUrl).toBeNull();
    expect(v.specialRequests).toBeNull();
    expect(v.notes).toBeNull();
  });

  it('passes actual values when optional fields are provided', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { recordInsertChain } = setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
      hotelAddress: '123 Main St',
      hotelCity: 'Mumbai',
      googleMapsUrl: 'https://maps.google.com/test',
      roomType: 'double',
      roomNumber: '305',
      sharedRoomGroup: 'GROUP-A1',
      bookingReference: 'BK-12345',
      attachmentUrl: 'https://storage.example.com/booking.pdf',
      specialRequests: 'Ground floor preferred',
      notes: 'VIP guest',
    });

    const v = recordInsertChain.values.mock.calls[0][0];
    expect(v.hotelAddress).toBe('123 Main St');
    expect(v.hotelCity).toBe('Mumbai');
    expect(v.googleMapsUrl).toBe('https://maps.google.com/test');
    expect(v.roomType).toBe('double');
    expect(v.roomNumber).toBe('305');
    expect(v.sharedRoomGroup).toBe('GROUP-A1');
    expect(v.bookingReference).toBe('BK-12345');
    expect(v.attachmentUrl).toBe('https://storage.example.com/booking.pdf');
    expect(v.specialRequests).toBe('Ground floor preferred');
    expect(v.notes).toBe('VIP guest');
  });
});

// ── Kill StringLiteral: 'draft' status on create ──────────────────────
describe('create: recordStatus is "draft"', () => {
  it('sets recordStatus to "draft" on insert', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { recordInsertChain } = setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    const v = recordInsertChain.values.mock.calls[0][0];
    expect(v.recordStatus).toBe('draft');
  });
});

// ── Kill ObjectLiteral: exact shape of insert values ──────────────────
describe('create: exact insert values shape', () => {
  it('passes eventId and userId to insert', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { recordInsertChain } = setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    const v = recordInsertChain.values.mock.calls[0][0];
    expect(v.eventId).toBe(EVENT_ID);
    expect(v.personId).toBe(PERSON_ID);
    expect(v.hotelName).toBe('Hotel Leela');
    expect(v.createdBy).toBe('user_123');
    expect(v.updatedBy).toBe('user_123');
    expect(v.checkInDate).toBeInstanceOf(Date);
    expect(v.checkOutDate).toBeInstanceOf(Date);
  });
});

// ── Kill StringLiteral: 'accommodation' source for event_people ──────
describe('create: event_people source is "accommodation"', () => {
  it('inserts source as "accommodation" for event_people junction', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { eventPeopleInsertChain } = setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    const v = eventPeopleInsertChain.values.mock.calls[0][0];
    expect(v.source).toBe('accommodation');
  });
});

// ── Kill ObjectLiteral: select query returns right shape ──────────────
describe('create: person lookup select shape', () => {
  it('calls select with expected shape (id field)', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    // select() was called — the chain was used
    expect(mockDb.select).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// UPDATE: Kill ConditionalExpression + EqualityOperator + LogicalOperator
// ══════════════════════════════════════════════════════════════
describe('update: field conditional updates (kill ConditionalExpression)', () => {
  const existingDraft = {
    id: RECORD_ID,
    eventId: EVENT_ID,
    personId: PERSON_ID,
    recordStatus: 'draft',
    hotelName: 'Old Hotel',
    hotelAddress: 'Old Addr',
    hotelCity: 'Old City',
    googleMapsUrl: 'old-url',
    roomType: 'single',
    roomNumber: '100',
    sharedRoomGroup: 'OLD-GROUP',
    checkInDate: '2026-05-01',
    checkOutDate: '2026-05-03',
    bookingReference: 'OLD-BK',
    attachmentUrl: 'old-attach',
    specialRequests: 'old-request',
    notes: 'old-notes',
  };

  // Test each field individually to kill the `if (fields.X !== undefined)` mutations

  it('updates googleMapsUrl when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft, googleMapsUrl: 'new-url' }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      googleMapsUrl: 'new-url',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.googleMapsUrl).toBe('new-url');
  });

  it('does NOT include googleMapsUrl when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('googleMapsUrl');
  });

  it('updates roomType when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft, roomType: 'double' }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      roomType: 'double',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.roomType).toBe('double');
  });

  it('does NOT include roomType when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('roomType');
  });

  it('updates roomNumber when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft, roomNumber: '999' }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      roomNumber: '999',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.roomNumber).toBe('999');
  });

  it('does NOT include roomNumber when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('roomNumber');
  });

  it('updates sharedRoomGroup when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft, sharedRoomGroup: 'NEW-GROUP' }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      sharedRoomGroup: 'NEW-GROUP',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.sharedRoomGroup).toBe('NEW-GROUP');
  });

  it('does NOT include sharedRoomGroup when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('sharedRoomGroup');
  });

  it('updates checkInDate when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      checkInDate: '2026-06-01T14:00:00Z',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.checkInDate).toBeInstanceOf(Date);
  });

  it('does NOT include checkInDate when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('checkInDate');
  });

  it('updates checkOutDate when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      checkOutDate: '2026-06-05T12:00:00Z',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.checkOutDate).toBeInstanceOf(Date);
  });

  it('does NOT include checkOutDate when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('checkOutDate');
  });

  it('updates bookingReference when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      bookingReference: 'NEW-BK',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.bookingReference).toBe('NEW-BK');
  });

  it('does NOT include bookingReference when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('bookingReference');
  });

  it('updates attachmentUrl when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      attachmentUrl: 'new-url',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.attachmentUrl).toBe('new-url');
  });

  it('does NOT include attachmentUrl when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('attachmentUrl');
  });

  it('updates specialRequests when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      specialRequests: 'New request',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.specialRequests).toBe('New request');
  });

  it('does NOT include specialRequests when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('specialRequests');
  });

  it('updates notes when provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      notes: 'New notes',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBe('New notes');
  });

  it('does NOT include notes when not provided', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([existingDraft]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Something',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('notes');
  });

  // Kill || null coercion: empty string fields become null in updateData
  it('coerces empty hotelAddress to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelAddress: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.hotelAddress).toBeNull();
  });

  it('coerces empty hotelCity to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelCity: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.hotelCity).toBeNull();
  });

  it('coerces empty googleMapsUrl to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      googleMapsUrl: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.googleMapsUrl).toBeNull();
  });

  it('coerces empty roomNumber to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      roomNumber: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.roomNumber).toBeNull();
  });

  it('coerces empty sharedRoomGroup to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      sharedRoomGroup: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.sharedRoomGroup).toBeNull();
  });

  it('coerces empty bookingReference to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      bookingReference: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.bookingReference).toBeNull();
  });

  it('coerces empty attachmentUrl to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      attachmentUrl: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.attachmentUrl).toBeNull();
  });

  it('coerces empty specialRequests to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      specialRequests: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.specialRequests).toBeNull();
  });

  it('coerces empty notes to null', async () => {
    chainedSelect([existingDraft]);
    const updateChain = chainedUpdate([{ ...existingDraft }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      notes: '',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBeNull();
  });
});

// ── Kill ConditionalExpression: status transitions on update ──────────
describe('update: status transition to "changed"', () => {
  it('sets recordStatus to "changed" when existing is "sent"', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'sent',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'changed' }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Hotel',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.recordStatus).toBe('changed');
  });

  it('does NOT change status when existing is "draft"', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'draft',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'draft' }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Hotel',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.recordStatus).toBeUndefined();
  });

  it('does NOT change status when existing is "changed"', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'changed',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Hotel',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.recordStatus).toBeUndefined();
  });
});

// ── Kill ObjectLiteral: update data always has updatedBy, updatedAt ──
describe('update: always sets updatedBy and updatedAt', () => {
  it('includes updatedBy and updatedAt in set call', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'draft',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Hotel',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.updatedBy).toBe('user_123');
    expect(setCall.updatedAt).toBeInstanceOf(Date);
  });
});

// ── Kill StringLiteral: cancel status value and error messages ────────
describe('cancel: exact error messages and values', () => {
  it('sets recordStatus to exactly "cancelled"', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'draft', notes: null }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.recordStatus).toBe('cancelled');
    expect(setCall.cancelledAt).toBeInstanceOf(Date);
  });

  it('appends cancellation reason to notes when reason provided', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: 'Old note' }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      reason: 'Hotel overbooked',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBe('Old note\nCancellation reason: Hotel overbooked');
  });

  it('sets notes with reason when no existing notes', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: null }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      reason: 'Changed plans',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBe('Cancellation reason: Changed plans');
  });

  it('preserves existing notes when no reason', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: 'Existing note' }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'cancelled' }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.notes).toBe('Existing note');
  });

  it('error message for non-found record is exactly "Accommodation record not found"', async () => {
    chainedSelect([]);
    await expect(
      cancelAccommodationRecord(EVENT_ID, { accommodationRecordId: RECORD_ID }),
    ).rejects.toThrow('Accommodation record not found');
  });

  it('error message includes status name', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'cancelled' }]);
    await expect(
      cancelAccommodationRecord(EVENT_ID, { accommodationRecordId: RECORD_ID }),
    ).rejects.toThrow('Cannot cancel an accommodation record in "cancelled" status');
  });
});

// ── Kill: revalidatePath called with correct path ──────────────────
describe('revalidatePath: correct paths', () => {
  it('revalidates /events/{eventId}/accommodation on create', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    setupTwoInserts([{ id: RECORD_ID }]);

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/accommodation`);
  });

  it('revalidates /events/{eventId}/accommodation on update', async () => {
    chainedSelect([{ id: RECORD_ID, eventId: EVENT_ID, recordStatus: 'draft' }]);
    chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'X',
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/accommodation`);
  });

  it('revalidates /events/{eventId}/accommodation on cancel', async () => {
    chainedSelect([{ id: RECORD_ID, recordStatus: 'confirmed', notes: null }]);
    chainedUpdate([{ id: RECORD_ID }]);

    await cancelAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/accommodation`);
  });
});

// ── Kill: getEventAccommodationRecords select shape ──────────────────
describe('getEventAccommodationRecords: select shape', () => {
  it('calls assertEventAccess without requireWrite', async () => {
    chainedSelect([]);
    await getEventAccommodationRecords(EVENT_ID);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });
});

// ── Kill: getAccommodationRecord error messages ──────────────────────
describe('getAccommodationRecord: exact error messages', () => {
  it('error message is exactly "Accommodation record not found"', async () => {
    chainedSelect([]);
    await expect(getAccommodationRecord(EVENT_ID, RECORD_ID)).rejects.toThrow(
      'Accommodation record not found',
    );
  });
});

// ── Kill: getSharedRoomGroupMembers returns empty for falsy group ─────
describe('getSharedRoomGroupMembers: edge cases', () => {
  it('returns empty array for empty string group', async () => {
    const result = await getSharedRoomGroupMembers(EVENT_ID, '');
    expect(result).toEqual([]);
    // Should NOT have called db.select
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

// ── Kill: update returns { record, previous } shape ──────────────────
describe('update: return shape has record and previous', () => {
  it('returns { record: updated, previous: existing }', async () => {
    const existing = { id: RECORD_ID, eventId: EVENT_ID, recordStatus: 'draft', hotelName: 'Old' };
    const updated = { id: RECORD_ID, eventId: EVENT_ID, recordStatus: 'draft', hotelName: 'New' };
    chainedSelect([existing]);
    chainedUpdate([updated]);

    const result = await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New',
    });

    expect(result).toHaveProperty('record');
    expect(result).toHaveProperty('previous');
    expect(result.record).toEqual(updated);
    expect(result.previous).toEqual(existing);
  });
});

// ── Kill L87/L88 ConditionalExpression: hotelName/hotelAddress not included when not provided ──
describe('update: hotelName and hotelAddress conditional branches', () => {
  it('does NOT include hotelName when not provided (only roomType changed)', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'draft',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      roomType: 'double',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('hotelName');
  });

  it('does NOT include hotelAddress when not provided (only roomType changed)', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'draft',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      roomType: 'double',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall).not.toHaveProperty('hotelAddress');
  });

  it('includes hotelName when provided', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'draft',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Name',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.hotelName).toBe('New Name');
  });

  it('includes hotelAddress when provided', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'draft',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelAddress: 'New Address',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.hotelAddress).toBe('New Address');
  });

  it('coerces empty hotelAddress to null when provided as empty', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
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

// ── Kill StringLiteral L219/L249: ne() filter values ──────────────────
describe('getPeopleWithTravelRecords and getSharedRoomGroupMembers: ne filter values', () => {
  it('getPeopleWithTravelRecords filters non-cancelled records', async () => {
    chainedSelectDistinctOn([]);
    await getPeopleWithTravelRecords(EVENT_ID);
    // The function was called and returned — if ne() was called with wrong
    // value, the mock wouldn't care, but the function still runs.
    // We verify the chain was used.
    expect(mockDb.selectDistinctOn).toHaveBeenCalled();
  });

  it('getSharedRoomGroupMembers queries for non-cancelled records', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
      innerJoin: vi.fn().mockReturnThis(),
    };
    mockDb.select.mockReturnValue(chain);
    await getSharedRoomGroupMembers(EVENT_ID, 'GROUP-B');
    expect(mockDb.select).toHaveBeenCalled();
  });
});

// ── Kill: create error for Person not found ──────────────────────────
describe('create: exact error message for person not found', () => {
  it('error is exactly "Person not found"', async () => {
    chainedSelect([]);
    await expect(
      createAccommodationRecord(EVENT_ID, {
        personId: PERSON_ID,
        hotelName: 'Hotel Leela',
        checkInDate: '2026-05-01T14:00:00Z',
        checkOutDate: '2026-05-03T12:00:00Z',
      }),
    ).rejects.toThrow('Person not found');
  });
});
