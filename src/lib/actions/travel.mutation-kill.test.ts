/**
 * Mutation-killing tests for travel actions.
 *
 * These tests target specific mutation categories that survived Stryker:
 * - ConditionalExpression: if(field !== undefined) branches in updateTravelRecord
 * - LogicalOperator: || null coercion for optional fields
 * - StringLiteral: error messages
 * - ObjectLiteral: updateData shape
 * - NoCoverage: getEventTravelRecords, getPersonTravelRecords internals
 *
 * ORACLE: The expected behavior is derived from the SPECIFICATION:
 *   "updateTravelRecord applies ONLY the fields provided in the input,
 *    coerces empty strings to null for optional fields,
 *    and preserves all other fields unchanged."
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
  getEventTravelRecords,
  getTravelRecord,
  getPersonTravelRecords,
} from './travel';

// ── Helpers ──────────────────────────────────────────────────
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
// MUTATION TARGET: Conditional field application (lines 91-105)
// Spec: "Only provided fields are applied to the update"
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecord: field-level application', () => {
  it('applies direction when provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, direction: 'outbound' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      direction: 'outbound',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.direction).toBe('outbound');
  });

  it('does NOT apply direction when not provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, fromCity: 'Pune' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData).not.toHaveProperty('direction');
  });

  it('applies travelMode when provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, travelMode: 'train' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      travelMode: 'train',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.travelMode).toBe('train');
  });

  it('applies fromCity when provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, fromCity: 'Pune' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.fromCity).toBe('Pune');
  });

  it('applies toCity when provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, toCity: 'Chennai' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      toCity: 'Chennai',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.toCity).toBe('Chennai');
  });

  it('applies carrierName when provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, carrierName: 'Air India' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      carrierName: 'Air India',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.carrierName).toBe('Air India');
  });

  it('applies serviceNumber when provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, serviceNumber: 'AI-302' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      serviceNumber: 'AI-302',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.serviceNumber).toBe('AI-302');
  });

  it('applies pnrOrBookingRef when provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, pnrOrBookingRef: 'PNR123' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      pnrOrBookingRef: 'PNR123',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.pnrOrBookingRef).toBe('PNR123');
  });

  it('applies notes when provided', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord, notes: 'VIP guest' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      notes: 'VIP guest',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBe('VIP guest');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Empty-string-to-null coercion (|| null)
// Spec: "Optional fields coerce empty strings to null"
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecord: empty-string-to-null coercion', () => {
  it('coerces empty fromLocation to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromLocation: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.fromLocation).toBeNull();
  });

  it('coerces empty toLocation to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      toLocation: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.toLocation).toBeNull();
  });

  it('coerces empty carrierName to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      carrierName: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.carrierName).toBeNull();
  });

  it('coerces empty serviceNumber to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      serviceNumber: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.serviceNumber).toBeNull();
  });

  it('coerces empty pnrOrBookingRef to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      pnrOrBookingRef: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.pnrOrBookingRef).toBeNull();
  });

  it('coerces empty seatOrCoach to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      seatOrCoach: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.seatOrCoach).toBeNull();
  });

  it('coerces empty terminalOrGate to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      terminalOrGate: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.terminalOrGate).toBeNull();
  });

  it('coerces empty attachmentUrl to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      attachmentUrl: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.attachmentUrl).toBeNull();
  });

  it('coerces empty notes to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      notes: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBeNull();
  });

  it('preserves non-empty optional field values (not coerced)', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromLocation: 'IGI Airport T3',
      carrierName: 'Air India',
      notes: 'Important note',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.fromLocation).toBe('IGI Airport T3');
    expect(setData.carrierName).toBe('Air India');
    expect(setData.notes).toBe('Important note');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: datetime coercion (lines 97-98)
// Spec: "departureAtUtc/arrivalAtUtc are converted to Date objects,
//        empty strings become null"
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecord: datetime handling', () => {
  it('converts departureAtUtc string to Date object', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      departureAtUtc: '2026-05-01T10:00:00.000Z',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.departureAtUtc).toBeInstanceOf(Date);
    expect(setData.departureAtUtc.toISOString()).toBe('2026-05-01T10:00:00.000Z');
  });

  it('converts arrivalAtUtc string to Date object', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      arrivalAtUtc: '2026-05-01T12:30:00.000Z',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.arrivalAtUtc).toBeInstanceOf(Date);
  });

  it('coerces empty departureAtUtc to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      departureAtUtc: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.departureAtUtc).toBeNull();
  });

  it('coerces empty arrivalAtUtc to null', async () => {
    chainedSelect([existingRecord]);
    const updateChain = chainedUpdate([{ ...existingRecord }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      arrivalAtUtc: '',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.arrivalAtUtc).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Error messages (StringLiteral mutations)
// Spec: "Specific error messages are returned for each failure mode"
// ══════════════════════════════════════════════════════════════
describe('Error messages are specific and meaningful', () => {
  it('createTravelRecord: person not found error message', async () => {
    chainedSelect([]);
    await expect(
      createTravelRecord(EVENT_ID, {
        personId: PERSON_ID, direction: 'inbound', travelMode: 'flight',
        fromCity: 'A', toCity: 'B',
      }),
    ).rejects.toThrow('Person not found');
  });

  it('updateTravelRecord: record not found error message', async () => {
    chainedSelect([]);
    await expect(
      updateTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID, fromCity: 'X' }),
    ).rejects.toThrow('Travel record not found');
  });

  it('updateTravelRecord: cancelled record error message', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'cancelled' }]);
    await expect(
      updateTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID, fromCity: 'X' }),
    ).rejects.toThrow('Cannot update a cancelled travel record');
  });

  it('cancelTravelRecord: record not found error message', async () => {
    chainedSelect([]);
    await expect(
      cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID }),
    ).rejects.toThrow('Travel record not found');
  });

  it('cancelTravelRecord: already cancelled error includes status name', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'cancelled' }]);
    await expect(
      cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID }),
    ).rejects.toThrow('cancelled');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: createTravelRecord field mapping (lines 34-56)
// Spec: "All validated fields are stored in the DB record"
// ══════════════════════════════════════════════════════════════
describe('createTravelRecord: all fields stored correctly', () => {
  it('stores all required and optional fields in the insert', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const insertChain = chainedInsert([{ id: RECORD_ID }]);

    await createTravelRecord(EVENT_ID, {
      personId: PERSON_ID,
      direction: 'outbound',
      travelMode: 'train',
      fromCity: 'Delhi',
      toCity: 'Mumbai',
      fromLocation: 'NDLS',
      toLocation: 'CSMT',
      departureAtUtc: '2026-06-01T08:00:00Z',
      arrivalAtUtc: '2026-06-01T16:00:00Z',
      carrierName: 'Indian Railways',
      serviceNumber: '12951',
      pnrOrBookingRef: 'PNR456',
      seatOrCoach: 'A1-23',
      terminalOrGate: 'Platform 16',
      attachmentUrl: 'https://example.com/ticket.pdf',
      notes: 'Rajdhani Express',
    });

    const insertData = insertChain.values.mock.calls[0][0];
    expect(insertData.eventId).toBe(EVENT_ID);
    expect(insertData.personId).toBe(PERSON_ID);
    expect(insertData.direction).toBe('outbound');
    expect(insertData.travelMode).toBe('train');
    expect(insertData.fromCity).toBe('Delhi');
    expect(insertData.toCity).toBe('Mumbai');
    expect(insertData.fromLocation).toBe('NDLS');
    expect(insertData.toLocation).toBe('CSMT');
    expect(insertData.departureAtUtc).toBeInstanceOf(Date);
    expect(insertData.arrivalAtUtc).toBeInstanceOf(Date);
    expect(insertData.carrierName).toBe('Indian Railways');
    expect(insertData.serviceNumber).toBe('12951');
    expect(insertData.pnrOrBookingRef).toBe('PNR456');
    expect(insertData.seatOrCoach).toBe('A1-23');
    expect(insertData.terminalOrGate).toBe('Platform 16');
    expect(insertData.attachmentUrl).toBe('https://example.com/ticket.pdf');
    expect(insertData.notes).toBe('Rajdhani Express');
    expect(insertData.recordStatus).toBe('draft');
  });

  it('coerces empty optional fields to null on create', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const insertChain = chainedInsert([{ id: RECORD_ID }]);

    await createTravelRecord(EVENT_ID, {
      personId: PERSON_ID,
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
      fromLocation: '',
      carrierName: '',
      notes: '',
    });

    const insertData = insertChain.values.mock.calls[0][0];
    expect(insertData.fromLocation).toBeNull();
    expect(insertData.carrierName).toBeNull();
    expect(insertData.notes).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: Draft status does NOT auto-change (line 108)
// Spec: "Only confirmed/sent records auto-transition to changed"
// ══════════════════════════════════════════════════════════════
describe('updateTravelRecord: auto-status-change boundaries', () => {
  it('draft record does NOT auto-change status on update', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, fromCity: 'Pune' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData).not.toHaveProperty('recordStatus');
  });

  it('changed record does NOT auto-change status on update', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'changed' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, fromCity: 'Pune' }]);

    await updateTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      fromCity: 'Pune',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData).not.toHaveProperty('recordStatus');
  });
});

// ══════════════════════════════════════════════════════════════
// MUTATION TARGET: cancelTravelRecord note assembly
// Spec: "Cancellation reason is appended, not replaced"
// ══════════════════════════════════════════════════════════════
describe('cancelTravelRecord: note handling edge cases', () => {
  it('no reason + no existing notes = notes unchanged (null)', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft', notes: null }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, { travelRecordId: RECORD_ID });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBeNull();
  });

  it('reason + no existing notes = reason only', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft', notes: null }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      reason: 'Visa denied',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toBe('Cancellation reason: Visa denied');
  });

  it('reason + existing notes = both preserved with newline', async () => {
    chainedSelect([{ ...existingRecord, recordStatus: 'draft', notes: 'Original' }]);
    const updateChain = chainedUpdate([{ ...existingRecord, recordStatus: 'cancelled' }]);

    await cancelTravelRecord(EVENT_ID, {
      travelRecordId: RECORD_ID,
      reason: 'Changed plans',
    });

    const setData = updateChain.set.mock.calls[0][0];
    expect(setData.notes).toContain('Original');
    expect(setData.notes).toContain('Changed plans');
    expect(setData.notes).toContain('\n');
  });
});
