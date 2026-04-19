import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['test-id'] }) },
}));

vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/db/schema', () => ({
  people: {
    id: 'people.id',
    email: 'people.email',
    fullName: 'people.full_name',
    salutation: 'people.salutation',
  },
  programVersions: {
    id: 'pv.id',
    eventId: 'pv.event_id',
    snapshotJson: 'pv.snapshot_json',
  },
  events: { id: 'events.id', name: 'events.name' },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  inArray: vi.fn((...args: unknown[]) => ({ op: 'inArray', args })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  relations: vi.fn(),
}));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => ({ op: 'eventScope', args })),
}));
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: vi.fn(),
}));
vi.mock('../dead-letter', () => ({
  CascadeNotificationRetryError: class extends Error {},
  handleCascadeNotificationResult: vi.fn(),
}));
vi.mock('@/lib/sentry', () => ({
  captureCascadeError: vi.fn(),
}));

import { db } from '@/lib/db';
import { sendNotification } from '@/lib/notifications/send';
import { handleCascadeNotificationResult } from '../dead-letter';
import { clearCascadeHandlers, emitCascadeEvent, enableTestMode, disableTestMode } from '../emit';
import { CASCADE_EVENTS } from '../events';
import { registerProgramCascadeHandlers } from './program-cascade';

enableTestMode();

const mockDb = vi.mocked(db as unknown as { select: ReturnType<typeof vi.fn> });

const EVENT_ID = 'event-aaa-111';
const VERSION_ID = 'version-bbb-222';
const BASE_VERSION_ID = 'version-ccc-333';
const PERSON_A = 'person-ddd-444';
const PERSON_B = 'person-eee-555';
const SESSION_1 = 'session-111';
const SESSION_2 = 'session-222';
const SESSION_3 = 'session-333';

/**
 * Universal chain helper: the `.where()` return is both thenable (for selects
 * that end at `.where()`) and has a `.limit()` method (for selects that call
 * `.where().limit()`). Both resolve with the same rows.
 */
function chainSelect(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const whereReturn = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereReturn),
    }),
  });
}

type SnapshotInput = {
  sessions?: Array<{
    id: string;
    title?: string;
    hallId?: string | null;
    startAtUtc?: string | null;
    endAtUtc?: string | null;
  }>;
  assignments?: Array<{ personId: string; sessionId: string; role?: string }>;
  halls?: Array<{ id: string; name: string }>;
};

function makeSnapshot(
  assignmentsOrSnapshot: Array<{ personId: string; sessionId: string }> | SnapshotInput,
) {
  if (Array.isArray(assignmentsOrSnapshot)) {
    return { snapshotJson: { assignments: assignmentsOrSnapshot } };
  }
  return { snapshotJson: assignmentsOrSnapshot };
}

function eventRow(name = 'Test Conference') {
  return [{ name }];
}

const basePayload = {
  versionId: VERSION_ID,
  versionNo: 2,
  baseVersionId: BASE_VERSION_ID,
  affectedPersonIds: [PERSON_A],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sendNotification).mockResolvedValue({ notificationLogId: 'log-1', provider: 'resend', status: 'sent' });
  vi.mocked(handleCascadeNotificationResult).mockResolvedValue(undefined);
  clearCascadeHandlers();
  registerProgramCascadeHandlers();
});

// ── Spec requirement: skip on first publish (no base version) ─────────────────

describe('handleProgramVersionPublished — first publish (no baseVersionId)', () => {
  it('sends no notifications when baseVersionId is null', async () => {
    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      { ...basePayload, baseVersionId: null },
    );

    expect(vi.mocked(sendNotification)).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

// ── Spec requirement: skip when snapshots not found ───────────────────────────

describe('handleProgramVersionPublished — missing snapshot', () => {
  it('sends no notifications when current version is not found in DB', async () => {
    chainSelect([]);                                                       // currentVersion → empty
    chainSelect([makeSnapshot([{ personId: PERSON_A, sessionId: SESSION_1 }])]);  // prevVersion

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    expect(vi.mocked(sendNotification)).not.toHaveBeenCalled();
  });

  it('sends no notifications when previous version is not found in DB', async () => {
    chainSelect([makeSnapshot([{ personId: PERSON_A, sessionId: SESSION_1 }])]);  // currentVersion
    chainSelect([]);                                                               // prevVersion → empty

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    expect(vi.mocked(sendNotification)).not.toHaveBeenCalled();
  });
});

// ── Spec requirement: skip faculty with zero net changes ──────────────────────

describe('handleProgramVersionPublished — zero net changes', () => {
  it('does not notify a faculty member whose session assignments are unchanged', async () => {
    const assignments = [{ personId: PERSON_A, sessionId: SESSION_1 }];
    chainSelect([makeSnapshot(assignments)]);  // current
    chainSelect([makeSnapshot(assignments)]);  // prev (identical)
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A' }]);  // people
    chainSelect(eventRow());                                                // event name

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    expect(vi.mocked(sendNotification)).not.toHaveBeenCalled();
  });

  it('does not notify when affectedPersonIds is empty', async () => {
    chainSelect([makeSnapshot([])]);  // current
    chainSelect([makeSnapshot([])]);  // prev

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      { ...basePayload, affectedPersonIds: [] },
    );

    expect(vi.mocked(sendNotification)).not.toHaveBeenCalled();
  });
});

// ── Spec requirement: one diff notification per affected faculty ──────────────

describe('handleProgramVersionPublished — added sessions', () => {
  it('sends a notification when a faculty member gains a new session', async () => {
    chainSelect([makeSnapshot([{ personId: PERSON_A, sessionId: SESSION_2 }])]);  // current
    chainSelect([makeSnapshot([])]);                                               // prev (no sessions)
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A' }]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    expect(vi.mocked(sendNotification)).toHaveBeenCalledOnce();
    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.variables.addedSessions).toContain(SESSION_2);
    expect(call.variables.removedSessions).toHaveLength(0);
  });
});

describe('handleProgramVersionPublished — removed sessions', () => {
  it('sends a notification when a faculty member loses a session', async () => {
    chainSelect([makeSnapshot([])]);                                               // current (no sessions)
    chainSelect([makeSnapshot([{ personId: PERSON_A, sessionId: SESSION_1 }])]);  // prev
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A' }]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    expect(vi.mocked(sendNotification)).toHaveBeenCalledOnce();
    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.variables.removedSessions).toContain(SESSION_1);
    expect(call.variables.addedSessions).toHaveLength(0);
  });
});

// ── Acceptance check: idempotency key includes version id and person id ───────

describe('handleProgramVersionPublished — idempotency', () => {
  it('sets idempotency key to notify:program-version:<versionId>:<personId>:email', async () => {
    chainSelect([makeSnapshot([{ personId: PERSON_A, sessionId: SESSION_2 }])]);
    chainSelect([makeSnapshot([])]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A' }]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.idempotencyKey).toBe(`notify:program-version:${VERSION_ID}:${PERSON_A}:email`);
  });

  it('uses program_update template key and program.version_published triggerType', async () => {
    chainSelect([makeSnapshot([{ personId: PERSON_A, sessionId: SESSION_2 }])]);
    chainSelect([makeSnapshot([])]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A' }]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.templateKey).toBe('program_update');
    expect(call.triggerType).toBe('program.version_published');
  });
});

// ── Multiple faculty ──────────────────────────────────────────────────────────

describe('handleProgramVersionPublished — multiple faculty', () => {
  it('sends one notification per changed faculty, skipping unchanged ones', async () => {
    // PERSON_A: gains SESSION_3; PERSON_B: unchanged
    const currentAssignments = [
      { personId: PERSON_A, sessionId: SESSION_1 },
      { personId: PERSON_A, sessionId: SESSION_3 },
      { personId: PERSON_B, sessionId: SESSION_2 },
    ];
    const prevAssignments = [
      { personId: PERSON_A, sessionId: SESSION_1 },
      { personId: PERSON_B, sessionId: SESSION_2 },
    ];

    chainSelect([makeSnapshot(currentAssignments)]);
    chainSelect([makeSnapshot(prevAssignments)]);
    chainSelect([
      { id: PERSON_A, email: 'a@test.com', fullName: 'A' },
      { id: PERSON_B, email: 'b@test.com', fullName: 'B' },
    ]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      { ...basePayload, affectedPersonIds: [PERSON_A, PERSON_B] },
    );

    expect(vi.mocked(sendNotification)).toHaveBeenCalledOnce();
    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.personId).toBe(PERSON_A);
  });
});

// ── Notification goes through lib/notifications/ ─────────────────────────────

describe('handleProgramVersionPublished — notification routing', () => {
  it('routes all sends through sendNotification with correct event and entity metadata', async () => {
    chainSelect([makeSnapshot([{ personId: PERSON_A, sessionId: SESSION_2 }])]);
    chainSelect([makeSnapshot([])]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A' }]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    expect(vi.mocked(sendNotification)).toHaveBeenCalled();
    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.eventId).toBe(EVENT_ID);
    expect(call.personId).toBe(PERSON_A);
    expect(call.triggerEntityId).toBe(VERSION_ID);
    expect(call.triggerEntityType).toBe('program_version');
    expect(call.sendMode).toBe('automatic');
    expect(call.channel).toBe('email');
  });
});

// ── Spec requirement: changed bucket detected for role/hall/time deltas ───────

describe('handleProgramVersionPublished — changed bucket', () => {
  it('notifies the faculty when role changes for the same session', async () => {
    const session = { id: SESSION_1, title: 'Cardiology Update', hallId: null, startAtUtc: null, endAtUtc: null };
    const current: SnapshotInput = {
      sessions: [session],
      assignments: [{ personId: PERSON_A, sessionId: SESSION_1, role: 'chair' }],
      halls: [],
    };
    const prev: SnapshotInput = {
      sessions: [session],
      assignments: [{ personId: PERSON_A, sessionId: SESSION_1, role: 'speaker' }],
      halls: [],
    };
    chainSelect([makeSnapshot(current)]);
    chainSelect([makeSnapshot(prev)]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A', salutation: 'Dr.' }]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    expect(vi.mocked(sendNotification)).toHaveBeenCalledOnce();
    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.variables.changedSessions).toContain(SESSION_1);
    expect(String(call.variables.changesSummary)).toMatch(/Changed/i);
    expect(String(call.variables.changesSummary)).toMatch(/role/i);
  });

  it('notifies the faculty when session time changes', async () => {
    const sessionPrev = {
      id: SESSION_1, title: 'Plenary', hallId: 'hall-1',
      startAtUtc: '2026-12-15T03:30:00.000Z', endAtUtc: '2026-12-15T05:00:00.000Z',
    };
    const sessionCurr = {
      ...sessionPrev,
      startAtUtc: '2026-12-15T04:00:00.000Z', endAtUtc: '2026-12-15T05:30:00.000Z',
    };
    const current: SnapshotInput = {
      sessions: [sessionCurr],
      assignments: [{ personId: PERSON_A, sessionId: SESSION_1, role: 'speaker' }],
      halls: [{ id: 'hall-1', name: 'Hall A' }],
    };
    const prev: SnapshotInput = {
      sessions: [sessionPrev],
      assignments: [{ personId: PERSON_A, sessionId: SESSION_1, role: 'speaker' }],
      halls: [{ id: 'hall-1', name: 'Hall A' }],
    };
    chainSelect([makeSnapshot(current)]);
    chainSelect([makeSnapshot(prev)]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A', salutation: 'Dr.' }]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.variables.changedSessions).toContain(SESSION_1);
    expect(String(call.variables.changesSummary)).toMatch(/time/i);
  });

  it('notifies the faculty when session hall changes', async () => {
    const sessionPrev = { id: SESSION_1, title: 'Workshop', hallId: 'hall-1' };
    const sessionCurr = { id: SESSION_1, title: 'Workshop', hallId: 'hall-2' };
    const current: SnapshotInput = {
      sessions: [sessionCurr],
      assignments: [{ personId: PERSON_A, sessionId: SESSION_1, role: 'speaker' }],
      halls: [{ id: 'hall-1', name: 'Hall A' }, { id: 'hall-2', name: 'Hall B' }],
    };
    const prev: SnapshotInput = {
      sessions: [sessionPrev],
      assignments: [{ personId: PERSON_A, sessionId: SESSION_1, role: 'speaker' }],
      halls: [{ id: 'hall-1', name: 'Hall A' }, { id: 'hall-2', name: 'Hall B' }],
    };
    chainSelect([makeSnapshot(current)]);
    chainSelect([makeSnapshot(prev)]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'A', salutation: null }]);
    chainSelect(eventRow());

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.variables.changedSessions).toContain(SESSION_1);
    expect(String(call.variables.changesSummary)).toMatch(/hall/i);
  });
});

// ── Spec requirement: notification carries the template-required variables ────

describe('handleProgramVersionPublished — template variables', () => {
  it('passes fullName, eventName, and changesSummary required by program_update', async () => {
    chainSelect([makeSnapshot([{ personId: PERSON_A, sessionId: SESSION_2 }])]);
    chainSelect([makeSnapshot([])]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', fullName: 'Dr. Priya', salutation: 'Dr.' }]);
    chainSelect(eventRow('Cardio Conf 2026'));

    await emitCascadeEvent(
      CASCADE_EVENTS.PROGRAM_VERSION_PUBLISHED,
      EVENT_ID,
      { type: 'user', id: 'admin-1' },
      basePayload,
    );

    const call = vi.mocked(sendNotification).mock.calls[0][0];
    expect(call.variables.fullName).toBe('Dr. Priya');
    expect(call.variables.eventName).toBe('Cardio Conf 2026');
    expect(call.variables.salutation).toBe('Dr.');
    expect(call.variables.versionNo).toBe('2');
    expect(typeof call.variables.changesSummary).toBe('string');
    expect(String(call.variables.changesSummary).length).toBeGreaterThan(0);
  });
});

afterAll(() => {
  disableTestMode();
});
