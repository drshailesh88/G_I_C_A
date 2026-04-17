/**
 * Mutation-killing tests for travel actions — Round 2
 *
 * Targets 30 surviving mutations:
 * - 14x ConditionalExpression (lines 91-105): `if (fields.X !== undefined)` mutated
 *   to `if (true)` or `if (false)`. Need tests that verify the EXACT set of keys
 *   in the updateData object — not just one field at a time.
 * - LogicalOperator (line 37): `registrationId || null` — need test with truthy registrationId
 * - ConditionalExpression + StringLiteral (lines 177, 184, 194): updateTravelRecordStatus
 * - ObjectLiteral (lines 25, 63, 213): select shapes and insert shapes
 * - StringLiteral (line 146): cancellation reason format
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
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => args[args.length - 1]),
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
} from './travel';

// ── Helpers ──────────────────────────────────────────────────
function chainedSelect(rows: unknown[]) {
  const chain = buildSelectChain(rows);
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function buildSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    innerJoin: vi.fn().mockReturnThis(),
  };
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

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const RECORD_ID = '550e8400-e29b-41d4-a716-446655440002';
const REG_ID = '550e8400-e29b-41d4-a716-446655440003';

const existingRecord = {
  id: RECORD_ID,
  eventId: EVENT_ID,
  personId: PERSON_ID,
  recordStatus: 'draft',
  direction: 'inbound',
  travelMode: 'flight',
  fromCity: 'Mumbai',
  toCity: 'Delhi',
  fromLocation: null,
  toLocation: null,
  carrierName: null,
  serviceNumber: null,
  pnrOrBookingRef: null,
  seatOrCoach: null,
  terminalOrGate: null,
  attachmentUrl: null,
  notes: null,
  departureAtUtc: null,
  arrivalAtUtc: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
  mockWriteAudit.mockResolvedValue(undefined);
  mockEmitCascadeEvent.mockResolvedValue({ handlersRun: 0, errors: [] });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: ConditionalExpression lines 91-105
// Kill by verifying EXACT keys present in setData object
// If Stryker mutates `if (fields.X !== undefined)` to `if (true)`,
// it would add an extra key to setData. If `if (false)`, it would
// remove the key. We verify the exact set of keys.
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecord: exact keys in setData (kill ConditionalExpression)', () => {
  it('only direction appears in setData when only direction is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, direction: 'outbound' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      direction: 'outbound',
    });

    const setData = updateChain.set.mock.calls[0][0];
    // setData should have updatedBy, updatedAt, and direction — nothing else
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['direction']);
  });

  it('only travelMode appears in setData when only travelMode is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, travelMode: 'train' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      travelMode: 'train',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['travelMode']);
  });

  it('only fromCity appears in setData when only fromCity is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, fromCity: 'Pune' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['fromCity']);
  });

  it('only fromLocation appears in setData when only fromLocation is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromLocation: 'IGI Airport',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['fromLocation']);
  });

  it('only toCity appears in setData when only toCity is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, toCity: 'Chennai' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      toCity: 'Chennai',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['toCity']);
  });

  it('only toLocation appears in setData when only toLocation is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      toLocation: 'CSMT',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['toLocation']);
  });

  it('only departureAtUtc appears in setData when only departureAtUtc is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      departureAtUtc: '2026-05-01T10:00:00Z',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['departureAtUtc']);
  });

  it('only arrivalAtUtc appears in setData when only arrivalAtUtc is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      arrivalAtUtc: '2026-05-01T12:00:00Z',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['arrivalAtUtc']);
  });

  it('only carrierName appears in setData when only carrierName is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      carrierName: 'SpiceJet',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['carrierName']);
  });

  it('only serviceNumber appears in setData when only serviceNumber is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      serviceNumber: 'SG-101',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['serviceNumber']);
  });

  it('only pnrOrBookingRef appears in setData when only pnrOrBookingRef is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      pnrOrBookingRef: 'ABC123',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['pnrOrBookingRef']);
  });

  it('only seatOrCoach appears in setData when only seatOrCoach is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      seatOrCoach: 'A1-15',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['seatOrCoach']);
  });

  it('only terminalOrGate appears in setData when only terminalOrGate is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      terminalOrGate: 'Gate 14',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['terminalOrGate']);
  });

  it('only attachmentUrl appears in setData when only attachmentUrl is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      attachmentUrl: 'https://example.com/ticket.pdf',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['attachmentUrl']);
  });

  it('only notes appears in setData when only notes is provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      notes: 'VIP',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual(['notes']);
  });

  it('multiple fields: exactly the provided fields appear and nothing else', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      direction: 'outbound',
      fromCity: 'Pune',
      notes: 'Updated',
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys.sort()).toEqual(['direction', 'fromCity', 'notes'].sort());
  });

  it('no optional fields: setData has only updatedBy and updatedAt', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
    });

    const setData = updateChain.set.mock.calls[0][0];
    const fieldKeys = Object.keys(setData).filter(
      (k) => k !== 'updatedBy' && k !== 'updatedAt',
    );
    expect(fieldKeys).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Line 37 — registrationId || null
// Kill by verifying truthy registrationId is stored (not coerced to null)
// ══════════════════════════════════════════════════════════════
describe('createTravelRecord: registrationId handling', () => {
  it('stores truthy registrationId as-is (not coerced to null)', async () => {
    mockDb.select
      .mockReturnValueOnce(buildSelectChain([{ id: PERSON_ID }]))
      .mockReturnValueOnce(buildSelectChain([{ id: REG_ID }]));
    const insertChain = chainedInsert([{ id: RECORD_ID }]);

    await createTravelRecord(EVENT_ID, {
      personId: PERSON_ID,
      registrationId: REG_ID,
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
    });

    const insertData = insertChain.values.mock.calls[0][0];
    expect(insertData.registrationId).toBe(REG_ID);
  });

  it('coerces empty registrationId to null', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const insertChain = chainedInsert([{ id: RECORD_ID }]);

    await createTravelRecord(EVENT_ID, {
      personId: PERSON_ID,
      registrationId: '',
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
    });

    const insertData = insertChain.values.mock.calls[0][0];
    expect(insertData.registrationId).toBeNull();
  });

  it('omitting registrationId stores null', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const insertChain = chainedInsert([{ id: RECORD_ID }]);

    await createTravelRecord(EVENT_ID, {
      personId: PERSON_ID,
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
    });

    const insertData = insertChain.values.mock.calls[0][0];
    expect(insertData.registrationId).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Lines 177, 184, 194 — updateTravelRecordStatus
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecordStatus: error paths and cancel logic', () => {
  it('throws "Travel record not found" when record does not exist (line 177)', async () => {
    chainedSelect([]);
    await expect(
      updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed'),
    ).rejects.toThrow('Travel record not found');
  });

  it('throws error with current and target status when transition is invalid (line 184)', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'cancelled' }]);
    await expect(
      updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed'),
    ).rejects.toThrow(/Cannot transition from "cancelled" to "confirmed"/);
  });

  it('error message includes "Allowed: none (terminal)" for cancelled status', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'cancelled' }]);
    await expect(
      updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed'),
    ).rejects.toThrow('none (terminal)');
  });

  it('error message includes allowed statuses for draft', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    await expect(
      updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'sent'),
    ).rejects.toThrow('confirmed, cancelled');
  });

  it('sets cancelledAt when newStatus is "cancelled" (line 194)', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'cancelled');

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.cancelledAt).toBeInstanceOf(Date);
    expect(setData.recordStatus).toBe('cancelled');
  });

  it('does NOT set cancelledAt when newStatus is NOT "cancelled"', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'confirmed' }]);

    await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed');

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData).not.toHaveProperty('cancelledAt');
    expect(setData.recordStatus).toBe('confirmed');
  });

  it('successful transition sets updatedBy and updatedAt', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'confirmed' }]);

    await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed');

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.updatedBy).toBe('user_123');
    expect(setData.updatedAt).toBeInstanceOf(Date);
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Line 25 — person verification select shape { id: people.id }
// Kill by verifying the select was called (person lookup works)
// ══════════════════════════════════════════════════════════════
describe('createTravelRecord: person verification select shape (line 25)', () => {
  it('select is called and uses the person lookup result to gate creation', async () => {
    // First select returns person, then insert works
    const selectChain = chainedSelect([{ id: PERSON_ID }]);
    chainedInsert([{ id: RECORD_ID }]);

    await createTravelRecord(EVENT_ID, {
      personId: PERSON_ID,
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
    });

    // Verify select was called (person lookup)
    expect(mockDb.select).toHaveBeenCalled();
    // Verify select was called with an object shape argument
    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toBeDefined();
    expect(selectArg).toHaveProperty('id');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Line 63 — eventPeople insert onConflictDoNothing target
// Kill by verifying onConflictDoNothing was called with target array
// ══════════════════════════════════════════════════════════════
describe('createTravelRecord: eventPeople upsert (line 63)', () => {
  it('onConflictDoNothing is called with target array for eventPeople', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const insertChain = chainedInsert([{ id: RECORD_ID }]);

    await createTravelRecord(EVENT_ID, {
      personId: PERSON_ID,
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
    });

    // The second insert call is for eventPeople
    // First insert: travelRecords, second insert: eventPeople
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    // onConflictDoNothing should be called with an object containing target
    expect(insertChain.onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.any(Array) }),
    );
  });

  it('eventPeople insert includes source "travel"', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const insertChain = chainedInsert([{ id: RECORD_ID }]);

    await createTravelRecord(EVENT_ID, {
      personId: PERSON_ID,
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
    });

    // The second insert values call contains source: 'travel'
    const secondInsertValues = insertChain.values.mock.calls[1]?.[0];
    if (secondInsertValues) {
      expect(secondInsertValues.source).toBe('travel');
    }
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Line 213 — getEventTravelRecords select shape
// Kill by verifying the returned rows contain expected fields
// ══════════════════════════════════════════════════════════════
describe('getEventTravelRecords: select shape (line 213)', () => {
  it('select is called with an object shape containing travel and person fields', async () => {
    const row = {
      id: RECORD_ID,
      eventId: EVENT_ID,
      personId: PERSON_ID,
      registrationId: null,
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      fromLocation: null,
      toCity: 'Delhi',
      toLocation: null,
      departureAtUtc: null,
      arrivalAtUtc: null,
      carrierName: null,
      serviceNumber: null,
      pnrOrBookingRef: null,
      terminalOrGate: null,
      recordStatus: 'draft',
      cancelledAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      personName: 'Alice',
      personEmail: 'alice@example.com',
      personPhone: '+911234567890',
    };
    chainedSelect([row]);

    const result = await getEventTravelRecords(EVENT_ID);

    expect(result).toHaveLength(1);
    // Verify select was called with object containing person join fields
    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toBeDefined();
    expect(selectArg).toHaveProperty('personName');
    expect(selectArg).toHaveProperty('personEmail');
    expect(selectArg).toHaveProperty('personPhone');
    // Verify travel record fields are in the select shape
    expect(selectArg).toHaveProperty('id');
    expect(selectArg).toHaveProperty('eventId');
    expect(selectArg).toHaveProperty('direction');
    expect(selectArg).toHaveProperty('travelMode');
    expect(selectArg).toHaveProperty('recordStatus');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Line 146 — cancellation reason string format
// "Cancellation reason: " prefix — Stryker changes the string
// ══════════════════════════════════════════════════════════════
describe('cancelTravelRecord: exact cancellation reason format (line 146)', () => {
  it('note starts with "Cancellation reason: " prefix when no existing notes', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft', notes: null }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      reason: 'Test reason',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBe('Cancellation reason: Test reason');
    expect(setData.notes).toMatch(/^Cancellation reason: /);
  });

  it('note has exact format: existing notes + newline + "Cancellation reason: " + reason', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft', notes: 'Existing note' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      reason: 'Budget cut',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBe('Existing note\nCancellation reason: Budget cut');
  });

  it('no reason provided: notes remain as existing notes (not appended)', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft', notes: 'Keep this' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBe('Keep this');
  });

  it('cancelledAt is set as a Date on cancel', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.cancelledAt).toBeInstanceOf(Date);
    expect(setData.recordStatus).toBe('cancelled');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: auto-status-change for confirmed/sent
// Kills mutations on lines 108 where Stryker might change
// the equality check for confirmed/sent
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecord: confirmed and sent auto-transition to changed', () => {
  it('confirmed record auto-changes to "changed" on update', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'confirmed' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'changed' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.recordStatus).toBe('changed');
  });

  it('sent record auto-changes to "changed" on update', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'sent' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'changed' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.recordStatus).toBe('changed');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: revalidatePath calls with exact path
// ══════════════════════════════════════════════════════════════
describe('revalidatePath is called with correct event path', () => {
  it('updateTravelRecordStatus calls revalidatePath', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    chainedUpdate([{ ...existingRecord, recordStatus: 'confirmed' }]);

    await updateTravelRecordStatus(EVENT_ID, RECORD_ID, 'confirmed');

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/travel`);
  });
});
