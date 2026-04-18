import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuth,
  mockDb,
  mockRevalidatePath,
  mockAssertEventAccess,
  mockEmitCascadeEvent,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockEmitCascadeEvent: vi.fn().mockResolvedValue({ handlersRun: 1, errors: [] }),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/cascade/emit', () => ({ emitCascadeEvent: mockEmitCascadeEvent }));
vi.mock('@/lib/cascade/events', () => ({
  CASCADE_EVENTS: {
    PROGRAM_VERSION_PUBLISHED: 'conference/program.version_published',
  },
}));
vi.mock('@/lib/notifications/template-renderer', () => ({ renderTemplate: vi.fn() }));

import { publishProgramVersion } from './program';

const EVENT_UUID = '550e8400-e29b-41d4-a716-446655440099';
const VERSION_UUID = '660e8400-e29b-41d4-a716-446655440001';
const BASE_UUID = '770e8400-e29b-41d4-a716-446655440002';
const PERSON_UUID = '880e8400-e29b-41d4-a716-446655440003';

/**
 * Universal chain: where() is both thenable and has orderBy/limit, so it works
 * regardless of whether the query chains .where() or .where().orderBy().limit()
 * or .where().limit().
 */
function chainSelect(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const whereReturn = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(rows),
    }),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereReturn),
    }),
  });
}

function makeInsert(rows: unknown[]) {
  mockDb.insert.mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  });
}

describe('publishProgramVersion — cascade emit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ userId: 'admin-1' });
    mockAssertEventAccess.mockResolvedValue({
      userId: 'admin-1',
      eventId: EVENT_UUID,
      role: 'org:event_coordinator',
    });
    mockEmitCascadeEvent.mockResolvedValue({ handlersRun: 1, errors: [] });
    mockRevalidatePath.mockReturnValue(undefined);
  });

  it('emits PROGRAM_VERSION_PUBLISHED after successful publish (first version, no base)', async () => {
    // 1. latest versionNo → empty (first publish)
    chainSelect([]);
    // 2-4. sessions, assignments, halls (Promise.all)
    chainSelect([]);
    chainSelect([]);
    chainSelect([]);
    // 5. insert → version record
    makeInsert([{ id: VERSION_UUID, versionNo: 1, baseVersionId: null, eventId: EVENT_UUID }]);

    await publishProgramVersion(EVENT_UUID, {});

    expect(mockEmitCascadeEvent).toHaveBeenCalledOnce();
    const [eventName, eventId, actor, payload] = mockEmitCascadeEvent.mock.calls[0];
    expect(eventName).toBe('conference/program.version_published');
    expect(eventId).toBe(EVENT_UUID);
    expect(actor).toEqual({ type: 'user', id: 'admin-1' });
    expect(payload.versionId).toBe(VERSION_UUID);
    expect(payload.versionNo).toBe(1);
    expect(payload.baseVersionId).toBeNull();
    expect(Array.isArray(payload.affectedPersonIds)).toBe(true);
  });

  it('includes affectedPersonIds derived from session assignments', async () => {
    chainSelect([]);  // latest → empty
    chainSelect([]);  // sessions
    chainSelect([{ id: 'a1', personId: PERSON_UUID, sessionId: 'sess-1', eventId: EVENT_UUID }]);  // assignments
    chainSelect([]);  // halls
    makeInsert([{ id: VERSION_UUID, versionNo: 1, baseVersionId: null, eventId: EVENT_UUID }]);

    await publishProgramVersion(EVENT_UUID, {});

    const [, , , payload] = mockEmitCascadeEvent.mock.calls[0];
    expect(payload.affectedPersonIds).toContain(PERSON_UUID);
  });

  it('includes non-null baseVersionId when a previous version exists', async () => {
    // 1. latest versionNo → [{ versionNo: 1 }]
    chainSelect([{ versionNo: 1 }]);
    // 2-4. sessions, assignments, halls
    chainSelect([]);
    chainSelect([]);
    chainSelect([]);
    // 5. prev snapshot for changesSummary
    chainSelect([{ snapshotJson: { sessions: [], assignments: [] } }]);
    // 6. sub-select for baseVersionId inside .values()
    chainSelect([{ id: BASE_UUID }]);
    // 7. insert
    makeInsert([{ id: VERSION_UUID, versionNo: 2, baseVersionId: BASE_UUID, eventId: EVENT_UUID }]);

    await publishProgramVersion(EVENT_UUID, {});

    expect(mockEmitCascadeEvent).toHaveBeenCalledOnce();
    const [, , , payload] = mockEmitCascadeEvent.mock.calls[0];
    expect(payload.versionNo).toBe(2);
    expect(payload.baseVersionId).toBe(BASE_UUID);
  });

  it('does NOT emit when db.insert fails', async () => {
    chainSelect([]);
    chainSelect([]);
    chainSelect([]);
    chainSelect([]);
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    });

    await expect(publishProgramVersion(EVENT_UUID, {})).rejects.toThrow('DB error');

    expect(mockEmitCascadeEvent).not.toHaveBeenCalled();
  });
});
