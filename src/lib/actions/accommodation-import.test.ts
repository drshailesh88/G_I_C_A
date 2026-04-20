import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockRevalidatePath,
  mockAssertEventAccess,
  mockWriteAudit,
  mockEmitCascadeEvent,
  mockNormalizePhone,
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
  mockNormalizePhone: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/audit/write', () => ({ writeAudit: mockWriteAudit }));
vi.mock('@/lib/cascade/emit', () => ({ emitCascadeEvent: mockEmitCascadeEvent }));
vi.mock('@/lib/validations/person', () => ({ normalizePhone: mockNormalizePhone }));

import { importAccommodationBatch } from './accommodation';
import { CASCADE_EVENTS } from '@/lib/cascade/events';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const RECORD_ID = '550e8400-e29b-41d4-a716-446655440002';
const TRAVEL_RECORD_ID = '550e8400-e29b-41d4-a716-446655440003';

function selectOnce(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValueOnce(chain);
  return chain;
}

function insertOnce(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValueOnce(chain);
  return chain;
}

const validRow = {
  rowNumber: 2,
  personEmail: 'alice@example.com',
  hotelName: 'Grand Hotel',
  checkInDate: '2026-05-01T14:00:00.000Z',
  checkOutDate: '2026-05-03T11:00:00.000Z',
};

const mockRecord = {
  id: RECORD_ID,
  eventId: EVENT_ID,
  personId: PERSON_ID,
  hotelName: 'Grand Hotel',
  checkInDate: new Date('2026-05-01T14:00:00.000Z'),
  checkOutDate: new Date('2026-05-03T11:00:00.000Z'),
  recordStatus: 'draft',
  registrationId: null,
  hotelAddress: null,
  hotelCity: null,
  roomType: null,
  roomNumber: null,
  sharedRoomGroup: null,
  bookingReference: null,
  googleMapsUrl: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops', eventId: EVENT_ID });
  mockWriteAudit.mockResolvedValue(undefined);
  mockEmitCascadeEvent.mockResolvedValue({ handlersRun: 0, errors: [] });
  mockNormalizePhone.mockImplementation((p: string) => p);
});

describe('importAccommodationBatch — RBAC', () => {
  it('throws when assertEventAccess rejects (read-only)', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(importAccommodationBatch(EVENT_ID, [])).rejects.toThrow('Forbidden');
  });

  it('accepts org:ops role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'u1', role: 'org:ops', eventId: EVENT_ID });
    const result = await importAccommodationBatch(EVENT_ID, []);
    expect(result.imported).toBe(0);
  });

  it('accepts org:super_admin role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'u1', role: 'org:super_admin', eventId: EVENT_ID });
    const result = await importAccommodationBatch(EVENT_ID, []);
    expect(result.imported).toBe(0);
  });

  it('throws on invalid eventId UUID', async () => {
    await expect(importAccommodationBatch('not-a-uuid', [])).rejects.toThrow();
  });
});

describe('importAccommodationBatch — batch size', () => {
  it('throws when rows exceed 500', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ ...validRow, rowNumber: i + 2 }));
    await expect(importAccommodationBatch(EVENT_ID, rows)).rejects.toThrow('Import batch exceeds 500 rows');
  });

  it('accepts exactly 500 rows (returns errors for invalid, not a throw)', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      ...validRow,
      rowNumber: i + 2,
      roomType: 'INVALID_ROOM',
    }));
    const result = await importAccommodationBatch(EVENT_ID, rows);
    expect(result.errors).toBe(500);
  });
});

describe('importAccommodationBatch — validation', () => {
  it('marks row as error when room type is invalid', async () => {
    const result = await importAccommodationBatch(EVENT_ID, [{ ...validRow, roomType: 'penthouse' }]);
    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
    expect((result.results[0] as { error: string }).error).toMatch(/room type/i);
  });

  it('marks row as error when check-in date is invalid', async () => {
    const result = await importAccommodationBatch(EVENT_ID, [{ ...validRow, checkInDate: 'not-a-date' }]);
    expect(result.errors).toBe(1);
    expect((result.results[0] as { error: string }).error).toMatch(/check-in/i);
  });

  it('marks row as error when check-out is before check-in', async () => {
    const result = await importAccommodationBatch(EVENT_ID, [
      { ...validRow, checkInDate: '2026-05-05T12:00:00Z', checkOutDate: '2026-05-04T12:00:00Z' },
    ]);
    expect(result.errors).toBe(1);
    expect((result.results[0] as { error: string }).error).toMatch(/check-out must be after/i);
  });

  it('rejects spreadsheet formulas in imported text fields', async () => {
    selectOnce([{ id: PERSON_ID }]);
    selectOnce([{ id: TRAVEL_RECORD_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importAccommodationBatch(EVENT_ID, [
      {
        ...validRow,
        hotelName: '=CMD|" /C calc"!A0',
      },
    ]);

    expect(result.imported).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
    expect((result.results[0] as { error: string }).error).toMatch(/unsafe spreadsheet formula/i);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe('importAccommodationBatch — person lookup', () => {
  it('finds person by email, checks travel record, and imports the row', async () => {
    selectOnce([{ id: PERSON_ID }]);           // email lookup
    selectOnce([{ id: TRAVEL_RECORD_ID }]);    // travel record check
    insertOnce([mockRecord]);                   // accommodation insert
    insertOnce([]);                             // event_people upsert

    const result = await importAccommodationBatch(EVENT_ID, [validRow]);
    expect(result.imported).toBe(1);
    expect(result.results[0].status).toBe('imported');
  });

  it('finds person by phone when email not provided', async () => {
    const row = { ...validRow, personEmail: undefined, personPhone: '+919876543210' };
    mockNormalizePhone.mockReturnValue('+919876543210');
    selectOnce([{ id: PERSON_ID }]);           // phone lookup
    selectOnce([{ id: TRAVEL_RECORD_ID }]);    // travel record check
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importAccommodationBatch(EVENT_ID, [row]);
    expect(result.imported).toBe(1);
  });

  it('skips row when person not found by email or phone', async () => {
    selectOnce([]);   // email lookup → not found (no phone provided)

    const row = { ...validRow, personPhone: undefined };
    const result = await importAccommodationBatch(EVENT_ID, [row]);
    expect(result.skipped).toBe(1);
    expect((result.results[0] as { reason: string }).reason).toMatch(/person not found/i);
  });

  it('skips row when phone normalisation fails', async () => {
    const row = { ...validRow, personEmail: undefined, personPhone: 'bad-phone' };
    mockNormalizePhone.mockImplementation(() => { throw new Error('Invalid phone'); });

    const result = await importAccommodationBatch(EVENT_ID, [row]);
    expect(result.skipped).toBe(1);
    expect((result.results[0] as { reason: string }).reason).toMatch(/invalid phone/i);
  });

  it('falls back to phone after email miss', async () => {
    const row = { ...validRow, personPhone: '+919876543210' };
    selectOnce([]);                            // email lookup → not found
    selectOnce([{ id: PERSON_ID }]);           // phone lookup → found
    selectOnce([{ id: TRAVEL_RECORD_ID }]);    // travel record check
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importAccommodationBatch(EVENT_ID, [row]);
    expect(result.imported).toBe(1);
  });
});

describe('importAccommodationBatch — travel-first rule', () => {
  it('skips row when person has no active travel record', async () => {
    selectOnce([{ id: PERSON_ID }]);  // email lookup
    selectOnce([]);                    // travel record check → not found

    const result = await importAccommodationBatch(EVENT_ID, [validRow]);
    expect(result.skipped).toBe(1);
    expect((result.results[0] as { reason: string }).reason).toMatch(/no active travel record/i);
  });

  it('imports when person has an active travel record', async () => {
    selectOnce([{ id: PERSON_ID }]);
    selectOnce([{ id: TRAVEL_RECORD_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importAccommodationBatch(EVENT_ID, [validRow]);
    expect(result.imported).toBe(1);
  });
});

describe('importAccommodationBatch — duplicate booking reference', () => {
  it('skips row when same booking reference exists for person in event', async () => {
    const row = { ...validRow, bookingReference: 'BK-001' };
    selectOnce([{ id: PERSON_ID }]);           // email lookup
    selectOnce([{ id: TRAVEL_RECORD_ID }]);    // travel record check
    selectOnce([{ id: 'existing-record' }]);   // booking ref duplicate → found

    const result = await importAccommodationBatch(EVENT_ID, [row]);
    expect(result.skipped).toBe(1);
    expect((result.results[0] as { reason: string }).reason).toMatch(/duplicate booking reference/i);
  });

  it('imports when booking reference is not duplicated', async () => {
    const row = { ...validRow, bookingReference: 'BK-NEW' };
    selectOnce([{ id: PERSON_ID }]);
    selectOnce([{ id: TRAVEL_RECORD_ID }]);
    selectOnce([]);                 // booking ref check → not found
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importAccommodationBatch(EVENT_ID, [row]);
    expect(result.imported).toBe(1);
  });

  it('skips booking ref check when no booking reference provided', async () => {
    const row = { ...validRow, bookingReference: undefined };
    selectOnce([{ id: PERSON_ID }]);
    selectOnce([{ id: TRAVEL_RECORD_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importAccommodationBatch(EVENT_ID, [row]);
    expect(result.imported).toBe(1);
    // Only 2 selects: email lookup + travel check (no booking ref check)
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });
});

describe('importAccommodationBatch — audit and cascade', () => {
  it('writes audit log for each imported row', async () => {
    selectOnce([{ id: PERSON_ID }]);
    selectOnce([{ id: TRAVEL_RECORD_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    await importAccommodationBatch(EVENT_ID, [validRow]);
    expect(mockWriteAudit).toHaveBeenCalledOnce();
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resource: 'accommodation',
        resourceId: RECORD_ID,
        meta: expect.objectContaining({ importedVia: 'csv' }),
      }),
    );
  });

  it('emits ACCOMMODATION_CREATED cascade event for each imported row', async () => {
    selectOnce([{ id: PERSON_ID }]);
    selectOnce([{ id: TRAVEL_RECORD_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    await importAccommodationBatch(EVENT_ID, [validRow]);
    expect(mockEmitCascadeEvent).toHaveBeenCalledOnce();
    expect(mockEmitCascadeEvent).toHaveBeenCalledWith(
      CASCADE_EVENTS.ACCOMMODATION_CREATED,
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ accommodationRecordId: RECORD_ID }),
    );
  });

  it('does not write audit or emit cascade for skipped rows', async () => {
    selectOnce([]);   // email lookup → not found, no phone provided

    const row = { ...validRow, personPhone: undefined };
    await importAccommodationBatch(EVENT_ID, [row]);
    expect(mockWriteAudit).not.toHaveBeenCalled();
    expect(mockEmitCascadeEvent).not.toHaveBeenCalled();
  });
});

describe('importAccommodationBatch — result counters', () => {
  it('returns correct imported/skipped/errors counts for a mixed batch', async () => {
    // Row 1: valid import (no booking ref → no dup check)
    selectOnce([{ id: PERSON_ID }]);
    selectOnce([{ id: TRAVEL_RECORD_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    // Row 2: person not found → skipped
    selectOnce([]);

    // Row 3: invalid room type → error (no DB calls)

    const rows = [
      { ...validRow, rowNumber: 2, personEmail: 'found@example.com', bookingReference: undefined },
      { ...validRow, rowNumber: 3, personEmail: 'notfound@example.com', personPhone: undefined },
      { ...validRow, rowNumber: 4, roomType: 'palace' },
    ];

    const result = await importAccommodationBatch(EVENT_ID, rows);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.results).toHaveLength(3);
  });

  it('revalidates the accommodation path after batch', async () => {
    await importAccommodationBatch(EVENT_ID, []);
    expect(mockRevalidatePath).toHaveBeenCalledWith(expect.stringContaining('accommodation'));
  });

  it('preserves sharedRoomGroup for imported rows', async () => {
    const row = { ...validRow, sharedRoomGroup: 'GROUP-A' };
    selectOnce([{ id: PERSON_ID }]);
    selectOnce([{ id: TRAVEL_RECORD_ID }]);
    const insertChain = insertOnce([{ ...mockRecord, sharedRoomGroup: 'GROUP-A' }]);
    insertOnce([]);

    await importAccommodationBatch(EVENT_ID, [row]);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ sharedRoomGroup: 'GROUP-A' }),
    );
  });
});
