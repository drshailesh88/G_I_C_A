import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess, mockWriteAudit } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockWriteAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => ({ op: 'withEventScope', args })),
}));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/audit/write', () => ({ writeAudit: mockWriteAudit }));

import {
  acceptSuggestion,
  buildClusters,
  discardSuggestion,
  floorToThreeHourWindowUtc,
  generateTransportSuggestions,
  getSuggestedBatches,
  mergeSuggestions,
  splitSuggestion,
} from './transport';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BATCH_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_BATCH_ID = '550e8400-e29b-41d4-a716-446655440002';
const THIRD_BATCH_ID = '550e8400-e29b-41d4-a716-446655440003';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440004';
const OTHER_PERSON_ID = '550e8400-e29b-41d4-a716-446655440005';
const TRAVEL_ID = '550e8400-e29b-41d4-a716-446655440006';
const OTHER_TRAVEL_ID = '550e8400-e29b-41d4-a716-446655440007';
const ASSIGNMENT_ID = '550e8400-e29b-41d4-a716-446655440008';
const OTHER_ASSIGNMENT_ID = '550e8400-e29b-41d4-a716-446655440009';

function resolvedQuery<T>(rows: T[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  });
}

function selectChain<T>(rows: T[]) {
  const terminal = resolvedQuery(rows);
  const joinChain = {
    where: vi.fn().mockReturnValue(terminal),
  };
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
      innerJoin: vi.fn().mockReturnValue(joinChain),
      orderBy: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function insertChain<T>(rows: T[], directResult: unknown = rows) {
  const valuesResult = Object.assign(Promise.resolve(directResult), {
    returning: vi.fn().mockResolvedValue(rows),
  });
  const chain = {
    values: vi.fn().mockReturnValue(valuesResult),
  };
  mockDb.insert.mockReturnValueOnce(chain);
  return chain;
}

function updateChain<T>(rows: T[] = []) {
  const whereResult = Object.assign(Promise.resolve(rows), {
    returning: vi.fn().mockResolvedValue(rows),
  });
  const inner = {
    where: vi.fn().mockReturnValue(whereResult),
  };
  const chain = {
    set: vi.fn().mockReturnValue(inner),
  };
  mockDb.update.mockReturnValueOnce(chain);
  return chain;
}

function makeTravelRow(overrides: Partial<{
  id: string;
  personId: string;
  direction: string;
  toCity: string;
  toLocation: string | null;
  fromCity: string;
  fromLocation: string | null;
  arrivalAtUtc: Date | null;
  departureAtUtc: Date | null;
}> = {}) {
  return {
    id: TRAVEL_ID,
    personId: PERSON_ID,
    direction: 'inbound',
    toCity: 'Mumbai',
    toLocation: 'BOM T2',
    fromCity: 'Delhi',
    fromLocation: 'DEL T3',
    arrivalAtUtc: new Date('2026-05-01T08:15:00Z'),
    departureAtUtc: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user-123', role: 'org:ops' });
});

describe('buildClusters', () => {
  it('returns empty output for empty input', () => {
    expect(buildClusters([])).toEqual([]);
  });

  it('skips intercity direction records', () => {
    const result = buildClusters([makeTravelRow({ direction: 'intercity' })]);
    expect(result).toEqual([]);
  });

  it('skips inbound records without arrivalAtUtc', () => {
    const result = buildClusters([makeTravelRow({ arrivalAtUtc: null })]);
    expect(result).toEqual([]);
  });

  it('skips outbound records without departureAtUtc', () => {
    const result = buildClusters([makeTravelRow({ direction: 'outbound', arrivalAtUtc: null, departureAtUtc: null })]);
    expect(result).toEqual([]);
  });

  it('creates an arrival cluster for inbound records with arrivalAtUtc', () => {
    const result = buildClusters([makeTravelRow()]);
    expect(result).toHaveLength(1);
    expect(result[0]?.movementType).toBe('arrival');
  });

  it('creates a departure cluster for outbound records with departureAtUtc', () => {
    const result = buildClusters([
      makeTravelRow({
        direction: 'outbound',
        arrivalAtUtc: null,
        departureAtUtc: new Date('2026-05-01T12:15:00Z'),
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.movementType).toBe('departure');
  });

  it('groups two inbound records in the same city and 3h window into one cluster', () => {
    const result = buildClusters([
      makeTravelRow({ id: TRAVEL_ID }),
      makeTravelRow({
        id: OTHER_TRAVEL_ID,
        personId: OTHER_PERSON_ID,
        arrivalAtUtc: new Date('2026-05-01T08:45:00Z'),
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.records).toHaveLength(2);
  });

  it('separates inbound records in different cities into different clusters', () => {
    const result = buildClusters([
      makeTravelRow({ toCity: 'Mumbai' }),
      makeTravelRow({ id: OTHER_TRAVEL_ID, toCity: 'Pune', toLocation: 'PNQ' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('separates inbound records in different 3h windows into different clusters', () => {
    const result = buildClusters([
      makeTravelRow({ arrivalAtUtc: new Date('2026-05-01T08:45:00Z') }),
      makeTravelRow({ id: OTHER_TRAVEL_ID, arrivalAtUtc: new Date('2026-05-01T12:05:00Z') }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('defaults pickupHub to toCity when toLocation is null for arrivals', () => {
    const result = buildClusters([makeTravelRow({ toLocation: null, toCity: 'Jaipur' })]);
    expect(result[0]?.pickupHub).toBe('Jaipur');
  });

  it('defaults dropHub to fromCity when fromLocation is null for departures', () => {
    const result = buildClusters([
      makeTravelRow({
        direction: 'outbound',
        arrivalAtUtc: null,
        departureAtUtc: new Date('2026-05-01T12:15:00Z'),
        fromCity: 'Bengaluru',
        fromLocation: null,
      }),
    ]);
    expect(result[0]?.dropHub).toBe('Bengaluru');
  });
});

describe('floorToThreeHourWindowUtc', () => {
  it('maps hour 0 to 00:00-03:00', () => {
    const result = floorToThreeHourWindowUtc(new Date('2026-05-01T00:30:00Z'));
    expect(result.start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-05-01T03:00:00.000Z');
  });

  it('maps hour 2 to 00:00-03:00', () => {
    const result = floorToThreeHourWindowUtc(new Date('2026-05-01T02:59:00Z'));
    expect(result.start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-05-01T03:00:00.000Z');
  });

  it('maps hour 3 to 03:00-06:00', () => {
    const result = floorToThreeHourWindowUtc(new Date('2026-05-01T03:00:00Z'));
    expect(result.start.toISOString()).toBe('2026-05-01T03:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-05-01T06:00:00.000Z');
  });

  it('maps hour 11 to 09:00-12:00', () => {
    const result = floorToThreeHourWindowUtc(new Date('2026-05-01T11:10:00Z'));
    expect(result.start.toISOString()).toBe('2026-05-01T09:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-05-01T12:00:00.000Z');
  });
});

describe('generateTransportSuggestions', () => {
  it('rejects a non-UUID eventId', async () => {
    await expect(generateTransportSuggestions('not-a-uuid')).rejects.toThrow('Invalid event ID');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns created 0 skipped 0 when there are no active records', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));

    await expect(generateTransportSuggestions(EVENT_ID)).resolves.toEqual({ created: 0, skipped: 0 });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns created 1 skipped 0 when one cluster is found and there is no existing auto batch', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([
        makeTravelRow({
          id: TRAVEL_ID,
          arrivalAtUtc: new Date('2026-05-01T08:15:00Z'),
        }),
      ]))
      .mockReturnValueOnce(selectChain([]));
    insertChain([{ id: BATCH_ID }]);
    insertChain([], { rowCount: 1 });

    await expect(generateTransportSuggestions(EVENT_ID)).resolves.toEqual({ created: 1, skipped: 0 });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });

  it('returns created 0 skipped 1 when the cluster matches an existing auto batch key', async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([
        makeTravelRow({
          id: TRAVEL_ID,
          arrivalAtUtc: new Date('2026-05-01T08:15:00Z'),
        }),
      ]))
      .mockReturnValueOnce(selectChain([
        {
          id: BATCH_ID,
          movementType: 'arrival',
          sourceCity: 'Mumbai',
          timeWindowStart: new Date('2026-05-01T06:00:00.000Z'),
        },
      ]));

    insertChain([], { rowCount: 1 });

    await expect(generateTransportSuggestions(EVENT_ID)).resolves.toEqual({ created: 0, skipped: 1 });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledWith(expect.anything());
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/transport`);
  });
});

describe('getSuggestedBatches', () => {
  it('calls assertTransportEventAccess', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await getSuggestedBatches(EVENT_ID);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });

  it('returns an empty array when no auto batches are found', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(getSuggestedBatches(EVENT_ID)).resolves.toEqual([]);
  });
});

describe('acceptSuggestion', () => {
  it('calls assertTransportEventAccess with requireWrite true', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(acceptSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow('Suggestion not found');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('throws Suggestion not found when the batch is missing', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(acceptSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow('Suggestion not found');
  });

  it('throws Batch is not a suggestion when batchSource is manual', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([
      { id: BATCH_ID, eventId: EVENT_ID, batchSource: 'manual', batchStatus: 'planned' },
    ]));
    await expect(acceptSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow('Batch is not a suggestion');
  });

  it('throws Suggestion is already cancelled when batchStatus is cancelled', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([
      { id: BATCH_ID, eventId: EVENT_ID, batchSource: 'auto', batchStatus: 'cancelled' },
    ]));
    await expect(acceptSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow('Suggestion is already cancelled');
  });
});

describe('discardSuggestion', () => {
  it('calls assertTransportEventAccess with requireWrite true', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(discardSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow('Suggestion not found');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('throws Suggestion not found when the batch is missing', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(discardSuggestion(EVENT_ID, BATCH_ID)).rejects.toThrow('Suggestion not found');
  });
});

describe('mergeSuggestions', () => {
  it('throws Cannot merge a suggestion with itself when keepBatchId equals discardBatchId', async () => {
    await expect(mergeSuggestions(EVENT_ID, BATCH_ID, BATCH_ID)).rejects.toThrow(
      'Cannot merge a suggestion with itself',
    );
  });

  it('calls assertTransportEventAccess with requireWrite true', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(mergeSuggestions(EVENT_ID, BATCH_ID, OTHER_BATCH_ID)).rejects.toThrow(
      'Keep batch not found or not a valid suggestion',
    );
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });
});

describe('splitSuggestion', () => {
  it('throws At least one passenger must be selected for split when passengerAssignmentIds is empty', async () => {
    await expect(splitSuggestion(EVENT_ID, BATCH_ID, [])).rejects.toThrow(
      'At least one passenger must be selected for split',
    );
  });
});
