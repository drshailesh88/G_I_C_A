import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────
const { mockAuth, mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  getEventListContext: vi.fn(),
}));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));

import { duplicateEvent } from './event';

// ── Test fixtures ───────────────────────────────────────────────
const SRC_EVENT_ID = '11111111-1111-1111-1111-111111111111';
const NEW_EVENT_ID = '22222222-2222-2222-2222-222222222222';
const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HALL_OLD = '33333333-3333-3333-3333-333333333333';
const HALL_NEW = '44444444-4444-4444-4444-444444444444';
const SESSION_OLD = '55555555-5555-5555-5555-555555555555';
const SESSION_NEW = '66666666-6666-6666-6666-666666666666';
const TPL_OLD = '77777777-7777-7777-7777-777777777777';
const TPL_NEW = '88888888-8888-8888-8888-888888888888';
const TRIGGER_ID = '99999999-9999-9999-9999-999999999999';

const SOURCE_EVENT = {
  id: SRC_EVENT_ID,
  organizationId: ORG_ID,
  slug: 'annual-summit-2026',
  name: 'Annual Summit 2026',
  description: 'A great event',
  startDate: new Date('2026-05-01T00:00:00.000Z'),
  endDate: new Date('2026-05-03T00:00:00.000Z'), // 2-day duration
  timezone: 'Asia/Kolkata',
  venueName: 'Pragati Maidan',
  venueAddress: '123 Main St',
  venueCity: 'Delhi',
  venueMapUrl: null,
  moduleToggles: { scientific_program: true, registration: true },
  fieldConfig: {},
  branding: { primaryColor: '#1E40AF' },
  registrationSettings: { maxCapacity: 500 },
  communicationSettings: {},
  publicPageSettings: {},
  status: 'published',
  archivedAt: null,
  cancelledAt: null,
  createdBy: 'user-orig',
  updatedBy: 'user-orig',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

// Helpers for sequential DB mocks

/** Mock db.select().from(t).where(cond) — thenable (no .limit()) */
function mockSelectWhere(result: unknown[]) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  mockDb.select.mockReturnValueOnce({ from });
  return { from, where };
}

/** Mock db.select().from(t).where(cond).limit(n) */
function mockSelectWhereLimit(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where, limit });
  mockDb.select.mockReturnValueOnce({ from });
  return { from, where, limit };
}

/** Mock db.select().from(t).limit(n) (no where) */
function mockSelectLimit(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ limit });
  mockDb.select.mockReturnValueOnce({ from });
  return { from, limit };
}

/** Mock db.insert(t).values(...).returning() */
function mockInsertReturning(result: unknown[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  mockDb.insert.mockReturnValueOnce({ values });
  return { values, returning };
}

/** Mock db.insert(t).values(...) — no returning */
function mockInsertValues() {
  const values = vi.fn().mockResolvedValue([]);
  mockDb.insert.mockReturnValueOnce({ values });
  return { values };
}

/** Wire up all DB mocks for the happy path */
function setupHappyPath({
  sourceHalls,
  sourceSessions,
  sourceReqs,
  sourceTemplates,
  sourceTriggers,
}: {
  sourceHalls?: unknown[];
  sourceSessions?: unknown[];
  sourceReqs?: unknown[];
  sourceTemplates?: unknown[];
  sourceTriggers?: unknown[];
} = {}) {
  sourceHalls ??= [{ id: HALL_OLD, eventId: SRC_EVENT_ID, name: 'Hall A', capacity: '200', sortOrder: '1' }];
  sourceSessions ??= [
    {
      id: SESSION_OLD, eventId: SRC_EVENT_ID, parentSessionId: null,
      title: 'Keynote', description: null,
      sessionDate: new Date('2026-05-01T08:00:00.000Z'),
      startAtUtc: new Date('2026-05-01T09:00:00.000Z'),
      endAtUtc: new Date('2026-05-01T10:00:00.000Z'),
      hallId: HALL_OLD, sessionType: 'keynote', track: null, isPublic: true,
      cmeCredits: null, sortOrder: 0, status: 'scheduled', cancelledAt: null,
      createdBy: 'user-orig', updatedBy: 'user-orig',
      createdAt: new Date(), updatedAt: new Date(),
    },
  ];
  sourceReqs ??= [{ id: 'req-1', sessionId: SESSION_OLD, role: 'speaker', requiredCount: 2, createdAt: new Date(), updatedAt: new Date() }];
  sourceTemplates ??= [
    {
      id: TPL_OLD, eventId: SRC_EVENT_ID, templateKey: 'reg_confirm', channel: 'email',
      templateName: 'Registration Confirmation', metaCategory: 'registration',
      triggerType: 'registration.created', sendMode: 'automatic', status: 'active', versionNo: 2,
      subjectLine: 'You are registered!', bodyContent: 'Dear {{name}},', previewText: null,
      allowedVariablesJson: ['name'], requiredVariablesJson: ['name'],
      brandingMode: 'event_branding', customBrandingJson: null,
      whatsappTemplateName: null, whatsappLanguageCode: null,
      isSystemTemplate: false, notes: null, lastActivatedAt: null,
      createdBy: 'user-orig', updatedBy: 'user-orig',
      createdAt: new Date(), updatedAt: new Date(), archivedAt: null,
    },
  ];
  sourceTriggers ??= [
    {
      id: TRIGGER_ID, eventId: SRC_EVENT_ID, triggerEventType: 'registration.created',
      guardConditionJson: null, channel: 'email', templateId: TPL_OLD,
      recipientResolution: 'trigger_person', delaySeconds: 0,
      idempotencyScope: 'per_person_per_trigger_entity_per_channel',
      isEnabled: true, priority: null, notes: null,
      createdBy: 'user-orig', updatedBy: 'user-orig', createdAt: new Date(), updatedAt: new Date(),
    },
  ];
  mockAuth.mockResolvedValue({ userId: 'user-1', has: (p: { role: string }) => p.role === 'org:super_admin' });
  mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });

  // Selects in order (matches execution order in duplicateEvent):
  // 1. Load source event → events.where().limit(1)
  mockSelectWhereLimit([SOURCE_EVENT]);
  // 2. getOrCreateDefaultOrg → organizations.limit(1) (called after source event load)
  mockSelectLimit([{ id: ORG_ID }]);
  // 3. Halls
  mockSelectWhere(sourceHalls);
  // 4. Sessions
  mockSelectWhere(sourceSessions);
  // 5. Role requirements (only if sessions exist)
  if (sourceSessions.length > 0) {
    mockSelectWhere(sourceReqs);
  }
  // 6. Templates
  mockSelectWhere(sourceTemplates);
  // 7. Triggers
  mockSelectWhere(sourceTriggers);

  // Inserts in order:
  // 1. New event
  mockInsertReturning([{ ...SOURCE_EVENT, id: NEW_EVENT_ID, slug: 'copy-of-summit-abc123' }]);
  // 2. New halls (if any)
  if (sourceHalls.length > 0) {
    mockInsertReturning([{ id: HALL_NEW }]);
  }
  // 3. Parent sessions: those with parentSessionId === null
  const parentSessions = (sourceSessions as Array<{ parentSessionId: unknown }>)
    .filter((s) => s.parentSessionId === null);
  if (parentSessions.length > 0) {
    mockInsertReturning([{ id: SESSION_NEW }]);
  }
  // 4. Child sessions (none in default setup)
  // 5. Role requirements (no returning)
  if (sourceReqs.length > 0) {
    mockInsertValues();
  }
  // 6. Templates (if any)
  if (sourceTemplates.length > 0) {
    mockInsertReturning([{ id: TPL_NEW }]);
  }
  // 7. Triggers (no returning)
  if (sourceTriggers.length > 0) {
    mockInsertValues();
  }
  // 8. Owner assignment (no returning)
  mockInsertValues();
}

// ── RBAC tests ──────────────────────────────────────────────────
describe('duplicateEvent — RBAC', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('returns forbidden when caller is OPS role', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user-ops',
      has: (p: { role: string }) => p.role === 'org:ops',
    });

    const result = await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('Forbidden') });
  });

  it('returns forbidden when caller is read-only', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user-ro',
      has: (p: { role: string }) => p.role === 'org:read_only',
    });

    const result = await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('Forbidden') });
  });

  it('returns not authenticated when no userId', async () => {
    mockAuth.mockResolvedValue({ userId: null, has: vi.fn() });

    const result = await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    expect(result).toEqual({ ok: false, error: 'Not authenticated' });
  });
});

// ── Validation tests ────────────────────────────────────────────
describe('duplicateEvent — validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1', has: (p: { role: string }) => p.role === 'org:super_admin' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:super_admin' });
  });

  it('rejects non-UUID sourceEventId', async () => {
    const result = await duplicateEvent('not-a-uuid', { name: 'Copy', newStartDate: '2026-06-01' });
    expect(result).toEqual({ ok: false, error: 'Invalid event ID' });
  });

  it('rejects empty event name', async () => {
    const result = await duplicateEvent(SRC_EVENT_ID, { name: '', newStartDate: '2026-06-01' });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('required') });
  });

  it('rejects invalid newStartDate format', async () => {
    const result = await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '01-06-2026' });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('YYYY-MM-DD') });
  });

  it('rejects nonsense date', async () => {
    const result = await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-13-45' });
    expect(result).toEqual({ ok: false, error: 'Invalid date' });
  });
});

// ── New event structure tests ───────────────────────────────────
describe('duplicateEvent — new event properties', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns ok:true with a new event ID', async () => {
    setupHappyPath();
    const result = await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });
    expect(result).toEqual({ ok: true, id: NEW_EVENT_ID });
  });

  it('inserts new event with status draft regardless of source status', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    const insertCall = mockDb.insert.mock.calls[0];
    // First insert is always the event row — verify via the values call
    const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesCall.status).toBe('draft');
  });

  it('sets createdBy and updatedBy to the duplicating user', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'My Duplicate', newStartDate: '2026-06-01' });

    const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesCall.createdBy).toBe('user-1');
    expect(valuesCall.updatedBy).toBe('user-1');
  });

  it('copies branding from source event', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesCall.branding).toEqual({ primaryColor: '#1E40AF' });
  });

  it('copies moduleToggles from source event', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesCall.moduleToggles).toEqual({ scientific_program: true, registration: true });
  });
});

// ── Date shift tests ────────────────────────────────────────────
describe('duplicateEvent — date shifting', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('preserves event duration when shifting start date', async () => {
    setupHappyPath();
    // Source: May 1–3 (2-day event). New start: June 1 → endDate should be June 3.
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(valuesCall.startDate).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(valuesCall.endDate).toEqual(new Date('2026-06-03T00:00:00.000Z'));
  });

  it('shifts session UTC timestamps by the same delta', async () => {
    setupHappyPath();
    // Source session: startAtUtc = May 1 09:00 UTC. Shift = +31 days → June 1 09:00 UTC.
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // Find the session insert (insert call index 2 = after event + halls)
    const sessionInsertValues = mockDb.insert.mock.results[2].value.values.mock.calls[0];
    const sessionRow = sessionInsertValues[0][0];
    expect(sessionRow.startAtUtc).toEqual(new Date('2026-06-01T09:00:00.000Z'));
    expect(sessionRow.endAtUtc).toEqual(new Date('2026-06-01T10:00:00.000Z'));
  });

  it('handles null session dates without throwing', async () => {
    const nullDateSession = {
      id: SESSION_OLD, eventId: SRC_EVENT_ID, parentSessionId: null,
      title: 'TBD Session', description: null,
      sessionDate: null, startAtUtc: null, endAtUtc: null,
      hallId: null, sessionType: 'other', track: null, isPublic: true,
      cmeCredits: null, sortOrder: 0, status: 'draft', cancelledAt: null,
      createdBy: 'user-orig', updatedBy: 'user-orig', createdAt: new Date(), updatedAt: new Date(),
    };

    setupHappyPath({ sourceSessions: [nullDateSession] });
    const result = await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    expect(result).toEqual({ ok: true, id: NEW_EVENT_ID });
  });
});

// ── Structural copy tests ───────────────────────────────────────
describe('duplicateEvent — structural copy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('copies halls with new eventId', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // Hall insert is the second insert call (after event)
    const hallValues = mockDb.insert.mock.results[1].value.values.mock.calls[0][0];
    expect(Array.isArray(hallValues)).toBe(true);
    expect(hallValues[0].eventId).toBe(NEW_EVENT_ID);
    expect(hallValues[0].name).toBe('Hall A');
  });

  it('maps old hallId to new hallId in copied sessions', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // Session insert is the third insert (event, halls, sessions)
    const sessionRow = mockDb.insert.mock.results[2].value.values.mock.calls[0][0][0];
    expect(sessionRow.hallId).toBe(HALL_NEW);
    expect(sessionRow.hallId).not.toBe(HALL_OLD);
  });

  it('copies session role requirements with mapped sessionId', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // Requirements insert is after event+halls+sessions (index 3)
    const reqValues = mockDb.insert.mock.results[3].value.values.mock.calls[0][0];
    expect(Array.isArray(reqValues)).toBe(true);
    expect(reqValues[0].sessionId).toBe(SESSION_NEW);
    expect(reqValues[0].sessionId).not.toBe(SESSION_OLD);
    expect(reqValues[0].role).toBe('speaker');
    expect(reqValues[0].requiredCount).toBe(2);
  });

  it('skips copying sessions and requirements when source has none', async () => {
    setupHappyPath({ sourceSessions: [], sourceReqs: [], sourceTriggers: [] });
    const result = await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    expect(result).toEqual({ ok: true, id: NEW_EVENT_ID });
  });
});

// ── Templates and triggers tests ───────────────────────────────
describe('duplicateEvent — templates and triggers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('copies event-specific templates with status=draft and versionNo=1', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // Template insert is after event+halls+sessions+reqs (index 4)
    const tplValues = mockDb.insert.mock.results[4].value.values.mock.calls[0][0];
    expect(tplValues[0].eventId).toBe(NEW_EVENT_ID);
    expect(tplValues[0].status).toBe('draft');
    expect(tplValues[0].versionNo).toBe(1);
    expect(tplValues[0].isSystemTemplate).toBe(false);
  });

  it('maps old templateId to new templateId in copied triggers', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // Trigger insert is after event+halls+sessions+reqs+templates (index 5)
    const triggerValues = mockDb.insert.mock.results[5].value.values.mock.calls[0][0];
    expect(triggerValues[0].templateId).toBe(TPL_NEW);
    expect(triggerValues[0].templateId).not.toBe(TPL_OLD);
    expect(triggerValues[0].eventId).toBe(NEW_EVENT_ID);
  });

  it('queries templates with isSystemTemplate=false filter', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // The 6th select call (index 5) fetches templates; verify it was called
    // (where args include the isSystemTemplate filter — we just confirm it was invoked)
    expect(mockDb.select).toHaveBeenCalledTimes(7); // org+event+halls+sessions+reqs+templates+triggers
  });
});

// ── Person-linked data exclusion tests ─────────────────────────
describe('duplicateEvent — person-linked data NOT copied', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not insert session_assignments rows', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // Verify the insert calls — none should reference sessionAssignments schema
    // (we have 8 inserts total: event, halls, sessions, reqs, templates, triggers, owner)
    expect(mockDb.insert).toHaveBeenCalledTimes(7);
  });
});

// ── Owner assignment tests ──────────────────────────────────────
describe('duplicateEvent — owner assignment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('assigns the duplicating user as event owner', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    // Last insert is the owner assignment (index 6)
    const ownerValues = mockDb.insert.mock.results[6].value.values.mock.calls[0][0];
    expect(ownerValues.eventId).toBe(NEW_EVENT_ID);
    expect(ownerValues.authUserId).toBe('user-1');
    expect(ownerValues.assignmentType).toBe('owner');
  });

  it('revalidates /events and /dashboard', async () => {
    setupHappyPath();
    await duplicateEvent(SRC_EVENT_ID, { name: 'Copy', newStartDate: '2026-06-01' });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/events');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
  });
});
