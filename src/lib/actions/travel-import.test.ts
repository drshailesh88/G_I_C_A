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

import { importTravelBatch } from './travel';
import { CASCADE_EVENTS } from '@/lib/cascade/events';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const RECORD_ID = '550e8400-e29b-41d4-a716-446655440002';

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
  direction: 'inbound',
  travelMode: 'flight',
  fromCity: 'Mumbai',
  toCity: 'Delhi',
};

const mockRecord = {
  id: RECORD_ID,
  eventId: EVENT_ID,
  personId: PERSON_ID,
  direction: 'inbound',
  travelMode: 'flight',
  fromCity: 'Mumbai',
  toCity: 'Delhi',
  recordStatus: 'draft',
  registrationId: null,
  departureAtUtc: null,
  arrivalAtUtc: null,
  terminalOrGate: null,
};

beforeEach(() => {
  // resetAllMocks clears mockReturnValueOnce queues; clearAllMocks does not (see packet-progress.txt)
  vi.resetAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops', eventId: EVENT_ID });
  mockWriteAudit.mockResolvedValue(undefined);
  mockEmitCascadeEvent.mockResolvedValue({ handlersRun: 0, errors: [] });
  mockNormalizePhone.mockImplementation((p: string) => p);
});

describe('importTravelBatch — RBAC', () => {
  it('rejects read-only role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'u1', role: 'org:read_only', eventId: EVENT_ID });
    await expect(importTravelBatch(EVENT_ID, [])).rejects.toThrow('Forbidden');
  });

  it('rejects event_coordinator role (not in TRAVEL_WRITE_ROLES)', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'u1', role: 'org:event_coordinator', eventId: EVENT_ID });
    await expect(importTravelBatch(EVENT_ID, [])).rejects.toThrow('Forbidden');
  });

  it('accepts org:ops role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'u1', role: 'org:ops', eventId: EVENT_ID });
    const result = await importTravelBatch(EVENT_ID, []);
    expect(result.imported).toBe(0);
  });

  it('accepts org:super_admin role', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'u1', role: 'org:super_admin', eventId: EVENT_ID });
    const result = await importTravelBatch(EVENT_ID, []);
    expect(result.imported).toBe(0);
  });
});

describe('importTravelBatch — batch size', () => {
  it('throws when rows exceed 500', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ ...validRow, rowNumber: i + 2 }));
    await expect(importTravelBatch(EVENT_ID, rows)).rejects.toThrow('Import batch exceeds 500 rows');
  });

  it('accepts exactly 500 rows (returns errors for invalid, not a throw)', async () => {
    // 500 rows with invalid direction → all errors, no throw
    const rows = Array.from({ length: 500 }, (_, i) => ({
      ...validRow,
      rowNumber: i + 2,
      direction: 'INVALID',
    }));
    const result = await importTravelBatch(EVENT_ID, rows);
    expect(result.errors).toBe(500);
  });
});

describe('importTravelBatch — validation', () => {
  it('marks row as error when direction is invalid', async () => {
    const result = await importTravelBatch(EVENT_ID, [{ ...validRow, direction: 'sideways' }]);
    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
    expect((result.results[0] as { error: string }).error).toMatch(/direction/i);
  });

  it('marks row as error when travelMode is invalid', async () => {
    const result = await importTravelBatch(EVENT_ID, [{ ...validRow, travelMode: 'teleport' }]);
    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
    expect((result.results[0] as { error: string }).error).toMatch(/travel mode/i);
  });
});

describe('importTravelBatch — person lookup', () => {
  it('finds person by email and imports the row', async () => {
    selectOnce([{ id: PERSON_ID }]);  // email lookup (no PNR → no dup check)
    insertOnce([mockRecord]);          // travel record insert
    insertOnce([]);                    // event_people upsert

    const result = await importTravelBatch(EVENT_ID, [validRow]);
    expect(result.imported).toBe(1);
    expect(result.results[0].status).toBe('imported');
  });

  it('finds person by phone when email not provided', async () => {
    const row = { ...validRow, personEmail: undefined, personPhone: '+919876543210' };
    mockNormalizePhone.mockReturnValue('+919876543210');
    selectOnce([{ id: PERSON_ID }]);        // phone lookup
    insertOnce([mockRecord]);                // travel record
    insertOnce([]);                          // event_people

    const result = await importTravelBatch(EVENT_ID, [row]);
    expect(result.imported).toBe(1);
  });

  it('skips row when person not found by email', async () => {
    selectOnce([]);   // email lookup → not found, no phone

    const row = { ...validRow, personPhone: undefined };
    const result = await importTravelBatch(EVENT_ID, [row]);
    expect(result.skipped).toBe(1);
    expect(result.results[0].status).toBe('skipped');
    expect((result.results[0] as { reason: string }).reason).toMatch(/person not found/i);
  });

  it('skips row when phone normalisation fails', async () => {
    const row = { ...validRow, personEmail: undefined, personPhone: 'not-a-phone' };
    mockNormalizePhone.mockImplementation(() => { throw new Error('Invalid phone'); });
    selectOnce([]); // email not provided so this won't be called; but set up for phone

    const result = await importTravelBatch(EVENT_ID, [row]);
    expect(result.skipped).toBe(1);
    expect((result.results[0] as { reason: string }).reason).toMatch(/invalid phone/i);
  });

  it('falls back to phone after email miss', async () => {
    const row = { ...validRow, personPhone: '+919876543210' };
    selectOnce([]);                          // email lookup → not found
    selectOnce([{ id: PERSON_ID }]);         // phone lookup → found
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importTravelBatch(EVENT_ID, [row]);
    expect(result.imported).toBe(1);
  });
});

describe('importTravelBatch — duplicate PNR', () => {
  it('skips row when same PNR exists for the same person in the same event', async () => {
    const row = { ...validRow, pnrOrBookingRef: 'AI-123' };
    selectOnce([{ id: PERSON_ID }]);         // email lookup
    selectOnce([{ id: 'existing-record' }]); // PNR duplicate check → found

    const result = await importTravelBatch(EVENT_ID, [row]);
    expect(result.skipped).toBe(1);
    expect((result.results[0] as { reason: string }).reason).toMatch(/duplicate pnr/i);
  });

  it('imports when PNR not duplicated', async () => {
    const row = { ...validRow, pnrOrBookingRef: 'AI-NEW' };
    selectOnce([{ id: PERSON_ID }]);  // email lookup
    selectOnce([]);                    // PNR check → not duplicate
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importTravelBatch(EVENT_ID, [row]);
    expect(result.imported).toBe(1);
  });

  it('skips PNR check when no PNR provided (import proceeds)', async () => {
    const row = { ...validRow, pnrOrBookingRef: undefined };
    selectOnce([{ id: PERSON_ID }]);  // email lookup only
    insertOnce([mockRecord]);
    insertOnce([]);

    const result = await importTravelBatch(EVENT_ID, [row]);
    expect(result.imported).toBe(1);
    // Only 1 select (email lookup), no PNR check select
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});

describe('importTravelBatch — audit and cascade', () => {
  it('writes audit log for each imported row', async () => {
    selectOnce([{ id: PERSON_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    await importTravelBatch(EVENT_ID, [validRow]);
    expect(mockWriteAudit).toHaveBeenCalledOnce();
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resource: 'travel',
        resourceId: RECORD_ID,
        meta: expect.objectContaining({ importedVia: 'csv' }),
      }),
    );
  });

  it('emits TRAVEL_SAVED cascade event for each imported row', async () => {
    selectOnce([{ id: PERSON_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    await importTravelBatch(EVENT_ID, [validRow]);
    expect(mockEmitCascadeEvent).toHaveBeenCalledOnce();
    expect(mockEmitCascadeEvent).toHaveBeenCalledWith(
      CASCADE_EVENTS.TRAVEL_SAVED,
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ travelRecordId: RECORD_ID }),
    );
  });

  it('does not write audit or emit cascade for skipped rows', async () => {
    selectOnce([]); // email lookup → not found

    const row = { ...validRow, personPhone: undefined };
    await importTravelBatch(EVENT_ID, [row]);
    expect(mockWriteAudit).not.toHaveBeenCalled();
    expect(mockEmitCascadeEvent).not.toHaveBeenCalled();
  });
});

describe('importTravelBatch — result counters', () => {
  it('returns correct imported/skipped/errors counts for a mixed batch', async () => {
    // Row 1: valid import (no PNR so no dup check)
    selectOnce([{ id: PERSON_ID }]);
    insertOnce([mockRecord]);
    insertOnce([]);

    // Row 2: person not found → skipped
    selectOnce([]);

    // Row 3: invalid direction → error (no DB calls)

    const rows = [
      { ...validRow, rowNumber: 2, personEmail: 'found@example.com', pnrOrBookingRef: undefined },
      { ...validRow, rowNumber: 3, personEmail: 'notfound@example.com', personPhone: undefined },
      { ...validRow, rowNumber: 4, direction: 'bad' },
    ];

    const result = await importTravelBatch(EVENT_ID, rows);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.results).toHaveLength(3);
  });

  it('revalidates the travel path after batch', async () => {
    await importTravelBatch(EVENT_ID, []);
    expect(mockRevalidatePath).toHaveBeenCalledWith(expect.stringContaining('travel'));
  });
});
