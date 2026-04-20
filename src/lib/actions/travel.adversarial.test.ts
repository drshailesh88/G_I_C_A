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

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/audit/write', () => ({ writeAudit: mockWriteAudit }));
vi.mock('@/lib/cascade/emit', () => ({ emitCascadeEvent: mockEmitCascadeEvent }));
vi.mock('@/lib/validations/person', () => ({ normalizePhone: mockNormalizePhone }));

import { importTravelBatch } from './travel';

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

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertEventAccess.mockResolvedValue({
    userId: 'user-ops',
    role: 'org:ops',
    eventId: EVENT_ID,
  });
  mockWriteAudit.mockResolvedValue(undefined);
  mockEmitCascadeEvent.mockResolvedValue({ handlersRun: 0, errors: [] });
  mockNormalizePhone.mockImplementation((value: string) => value);
});

describe('importTravelBatch adversarial coverage', () => {
  it('should reject malformed departure timestamps in CSV import', async () => {
    const row = {
      rowNumber: 2,
      personEmail: 'alice@example.com',
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Mumbai',
      toCity: 'Delhi',
      departureAtUtc: 'not-a-utc-timestamp',
    };

    selectOnce([{ id: PERSON_ID }]);
    insertOnce([
      {
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
      },
    ]);
    insertOnce([]);

    // BUG: importTravelBatch skips travelCsvRowSchema and imports rows with malformed UTC timestamps.
    const result = await importTravelBatch(EVENT_ID, [row]);

    expect(result.errors).toBe(1);
    expect(result.results[0]).toEqual({
      rowNumber: 2,
      status: 'error',
      error: 'Departure time must be a valid UTC timestamp',
    });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
