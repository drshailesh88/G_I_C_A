/**
 * Accommodation Anneal Tests — filling remaining checkpoint gaps
 *
 * CP-02: Auto-upsert event_people junction on create
 * CP-04: Partial field update — only specified fields change
 * CP-09: Get single record scoped by eventId (wrong event throws)
 * CP-28: Draft -> confirmed transition is allowed
 * CP-29: Draft -> cancelled transition is allowed
 * CP-34: Confirmed -> changed on update (explicit test)
 * CP-40: Change summary detects hotel name change
 * CP-42: hasAccomCascadeTriggerChanges returns true for cascade fields
 * CP-72: All queries scope by eventId (withEventScope called)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockRevalidatePath,
  mockAssertEventAccess,
  mockWithEventScope,
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
  mockWithEventScope: vi.fn(),
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
  withEventScope: (...args: unknown[]) => {
    mockWithEventScope(...args);
    return 'event-scope-filter';
  },
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
  getAccommodationRecord,
  getEventAccommodationRecords,
  getPeopleWithTravelRecords,
  getSharedRoomGroupMembers,
} from './accommodation';

import {
  ACCOMMODATION_RECORD_TRANSITIONS,
  buildAccommodationChangeSummary,
  hasAccomCascadeTriggerChanges,
} from '@/lib/validations/accommodation';

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

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:ops' });
  mockWriteAudit.mockResolvedValue(undefined);
  mockEmitCascadeEvent.mockResolvedValue({ handlersRun: 1, errors: [] });
});

// ── CP-02: Auto-upsert event_people junction on create ──────
describe('CP-02: create auto-upserts event_people', () => {
  function setupTwoInserts() {
    // Each insert call gets its own chain
    const recordInsertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: RECORD_ID, eventId: EVENT_ID }]),
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

  it('inserts event_people with source=accommodation after creating record', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { eventPeopleInsertChain } = setupTwoInserts();

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    // db.insert is called twice: once for record, once for event_people
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    const valuesCall = eventPeopleInsertChain.values.mock.calls[0][0];
    expect(valuesCall.eventId).toBe(EVENT_ID);
    expect(valuesCall.personId).toBe(PERSON_ID);
    expect(valuesCall.source).toBe('accommodation');
  });

  it('uses onConflictDoNothing for event_people upsert', async () => {
    chainedSelect([{ id: PERSON_ID }]);
    const { eventPeopleInsertChain } = setupTwoInserts();

    await createAccommodationRecord(EVENT_ID, {
      personId: PERSON_ID,
      hotelName: 'Hotel Leela',
      checkInDate: '2026-05-01T14:00:00Z',
      checkOutDate: '2026-05-03T12:00:00Z',
    });

    expect(eventPeopleInsertChain.onConflictDoNothing).toHaveBeenCalled();
  });
});

// ── CP-04: Partial field update — only specified fields change ──
describe('CP-04: partial field update', () => {
  it('only changes hotelName when only hotelName is provided', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      personId: PERSON_ID,
      recordStatus: 'draft',
      hotelName: 'Old Hotel',
      hotelCity: 'Mumbai',
      roomType: 'single',
    }]);
    const updateChain = chainedUpdate([{
      id: RECORD_ID,
      hotelName: 'New Hotel',
      hotelCity: 'Mumbai',
      roomType: 'single',
    }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'New Hotel',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.hotelName).toBe('New Hotel');
    // Fields not in input should not be present in update
    expect(setCall.hotelCity).toBeUndefined();
    expect(setCall.roomType).toBeUndefined();
    expect(setCall.roomNumber).toBeUndefined();
  });
});

// ── CP-09: Get single record throws for wrong eventId ───────
describe('CP-09: get record enforces eventId via withEventScope', () => {
  it('calls withEventScope to scope by eventId', async () => {
    chainedSelect([{ id: RECORD_ID, eventId: EVENT_ID }]);

    await getAccommodationRecord(EVENT_ID, RECORD_ID);

    expect(mockWithEventScope).toHaveBeenCalled();
    const [_col, eventIdArg] = mockWithEventScope.mock.calls[0];
    expect(eventIdArg).toBe(EVENT_ID);
  });

  it('throws when record not found (wrong eventId resolves to no rows)', async () => {
    chainedSelect([]);

    await expect(
      getAccommodationRecord(EVENT_ID, RECORD_ID),
    ).rejects.toThrow('Accommodation record not found');
  });
});

// ── CP-28: Draft -> confirmed is an allowed transition ──────
describe('CP-28: draft -> confirmed transition', () => {
  it('transition map allows draft -> confirmed', () => {
    expect(ACCOMMODATION_RECORD_TRANSITIONS.draft).toContain('confirmed');
  });
});

// ── CP-29: Draft -> cancelled is an allowed transition ──────
describe('CP-29: draft -> cancelled transition', () => {
  it('transition map allows draft -> cancelled', () => {
    expect(ACCOMMODATION_RECORD_TRANSITIONS.draft).toContain('cancelled');
  });
});

// ── CP-34: Confirmed -> changed on update ───────────────────
describe('CP-34: update auto-changes confirmed to changed', () => {
  it('sets recordStatus to changed when existing is confirmed', async () => {
    chainedSelect([{
      id: RECORD_ID,
      eventId: EVENT_ID,
      recordStatus: 'confirmed',
    }]);
    const updateChain = chainedUpdate([{ id: RECORD_ID, recordStatus: 'changed' }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Different Hotel',
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.recordStatus).toBe('changed');
  });
});

// ── CP-40: Change summary detects hotel name change ─────────
describe('CP-40: buildAccommodationChangeSummary detects hotel name change', () => {
  it('includes hotelName in summary when it changed', () => {
    const summary = buildAccommodationChangeSummary(
      { hotelName: 'Old Hotel' },
      { hotelName: 'New Hotel' },
    );
    expect(summary.hotelName).toEqual({ from: 'Old Hotel', to: 'New Hotel' });
  });

  it('does not include hotelName when unchanged', () => {
    const summary = buildAccommodationChangeSummary(
      { hotelName: 'Same Hotel' },
      { hotelName: 'Same Hotel' },
    );
    expect(summary.hotelName).toBeUndefined();
  });
});

// ── CP-42: hasAccomCascadeTriggerChanges returns true ────────
describe('CP-42: hasAccomCascadeTriggerChanges returns true for cascade fields', () => {
  it('returns true when hotelName changes', () => {
    expect(hasAccomCascadeTriggerChanges(
      { hotelName: 'A' },
      { hotelName: 'B' },
    )).toBe(true);
  });

  it('returns true when checkInDate changes', () => {
    expect(hasAccomCascadeTriggerChanges(
      { checkInDate: '2026-05-01' },
      { checkInDate: '2026-05-02' },
    )).toBe(true);
  });

  it('returns true when checkOutDate changes', () => {
    expect(hasAccomCascadeTriggerChanges(
      { checkOutDate: '2026-05-03' },
      { checkOutDate: '2026-05-04' },
    )).toBe(true);
  });

  it('returns true when hotelCity changes', () => {
    expect(hasAccomCascadeTriggerChanges(
      { hotelCity: 'Mumbai' },
      { hotelCity: 'Delhi' },
    )).toBe(true);
  });

  it('returns true when sharedRoomGroup changes', () => {
    expect(hasAccomCascadeTriggerChanges(
      { sharedRoomGroup: 'A' },
      { sharedRoomGroup: 'B' },
    )).toBe(true);
  });
});

// ── CP-72: All queries scope by eventId ─────────────────────
describe('CP-72: all queries use eventId scoping', () => {
  it('getAccommodationRecord uses withEventScope', async () => {
    chainedSelect([{ id: RECORD_ID }]);
    await getAccommodationRecord(EVENT_ID, RECORD_ID);
    expect(mockWithEventScope).toHaveBeenCalled();
  });

  it('updateAccommodationRecord uses withEventScope to fetch existing', async () => {
    chainedSelect([{ id: RECORD_ID, eventId: EVENT_ID, recordStatus: 'draft' }]);
    chainedUpdate([{ id: RECORD_ID }]);

    await updateAccommodationRecord(EVENT_ID, {
      accommodationRecordId: RECORD_ID,
      hotelName: 'Test',
    });

    expect(mockWithEventScope).toHaveBeenCalled();
  });

  it('getEventAccommodationRecords filters by eventId', async () => {
    chainedSelect([]);
    await getEventAccommodationRecords(EVENT_ID);
    // Uses eq(accommodationRecords.eventId, eventId) directly
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });

  it('getPeopleWithTravelRecords uses withEventScope', async () => {
    chainedSelectDistinctOn([]);
    await getPeopleWithTravelRecords(EVENT_ID);
    expect(mockWithEventScope).toHaveBeenCalled();
  });

  it('getSharedRoomGroupMembers uses withEventScope', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
      innerJoin: vi.fn().mockReturnThis(),
    };
    mockDb.select.mockReturnValue(chain);
    await getSharedRoomGroupMembers(EVENT_ID, 'GROUP-A');
    expect(mockWithEventScope).toHaveBeenCalled();
  });
});
