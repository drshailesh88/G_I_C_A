import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/db/schema', () => ({
  eventPeople: {
    eventId: 'event_people.event_id',
    personId: 'event_people.person_id',
  },
  people: {
    id: 'people.id',
    email: 'people.email',
    phoneE164: 'people.phone_e164',
    fullName: 'people.full_name',
    salutation: 'people.salutation',
  },
  programVersions: {
    id: 'pv.id',
    eventId: 'pv.event_id',
    snapshotJson: 'pv.snapshot_json',
    affectedPersonIdsJson: 'pv.affected_person_ids_json',
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
vi.mock('@/lib/sentry', () => ({ captureCascadeError: vi.fn() }));

import { db } from '@/lib/db';
import { sendNotification } from '@/lib/notifications/send';
import {
  buildBundleIdempotencyKey,
  buildResponsibilityBundle,
  renderResponsibilityBundleSummary,
  sendFacultyResponsibilityBundles,
} from './program-bundle-cascade';

const mockDb = vi.mocked(db as unknown as { select: ReturnType<typeof vi.fn> });

const EVENT_ID = 'event-bundle-1';
const VERSION_ID = 'version-bundle-1';
const PERSON_A = 'person-a';
const PERSON_B = 'person-b';

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
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(whereReturn),
      }),
      where: vi.fn().mockReturnValue(whereReturn),
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sendNotification).mockResolvedValue({
    notificationLogId: 'log-1',
    provider: 'resend',
    status: 'sent',
  });
});

describe('buildResponsibilityBundle', () => {
  it('returns empty bundle when faculty has no assignments in snapshot', () => {
    const bundle = buildResponsibilityBundle(
      { sessions: [], assignments: [], halls: [] },
      PERSON_A,
      new Map(),
    );
    expect(bundle.total).toBe(0);
    expect(bundle.byDay.size).toBe(0);
  });

  it('groups one faculty member responsibilities by IST day, ordered by start time', () => {
    const snapshot = {
      sessions: [
        { id: 's1', title: 'Plenary', hallId: 'h1', startAtUtc: '2026-12-15T03:30:00Z', endAtUtc: '2026-12-15T05:00:00Z' },
        { id: 's2', title: 'Workshop', hallId: 'h2', startAtUtc: '2026-12-16T05:00:00Z', endAtUtc: '2026-12-16T06:00:00Z' },
        { id: 's3', title: 'Symposium', hallId: 'h1', startAtUtc: '2026-12-15T07:00:00Z', endAtUtc: '2026-12-15T08:00:00Z' },
      ],
      assignments: [
        { personId: PERSON_A, sessionId: 's1', role: 'speaker' },
        { personId: PERSON_A, sessionId: 's2', role: 'chair' },
        { personId: PERSON_A, sessionId: 's3', role: 'speaker' },
        { personId: PERSON_B, sessionId: 's1', role: 'speaker' },
      ],
      halls: [{ id: 'h1', name: 'Hall A' }, { id: 'h2', name: 'Hall B' }],
    };

    const bundle = buildResponsibilityBundle(
      snapshot,
      PERSON_A,
      new Map([['h1', 'Hall A'], ['h2', 'Hall B']]),
    );

    expect(bundle.total).toBe(3);
    expect(bundle.byDay.size).toBe(2);
    const day1 = bundle.byDay.get('2026-12-15');
    expect(day1).toHaveLength(2);
    expect(day1!.map(r => r.title)).toEqual(['Plenary', 'Symposium']);
  });
});

describe('renderResponsibilityBundleSummary', () => {
  it('renders a multi-day summary with role, hall, IST time per session', () => {
    const snapshot = {
      sessions: [
        { id: 's1', title: 'Plenary', hallId: 'h1', startAtUtc: '2026-12-15T03:30:00Z', endAtUtc: '2026-12-15T05:00:00Z' },
        { id: 's2', title: 'Workshop', hallId: 'h2', startAtUtc: '2026-12-16T05:00:00Z', endAtUtc: '2026-12-16T06:00:00Z' },
      ],
      assignments: [
        { personId: PERSON_A, sessionId: 's1', role: 'speaker' },
        { personId: PERSON_A, sessionId: 's2', role: 'chair' },
      ],
      halls: [{ id: 'h1', name: 'Hall A' }, { id: 'h2', name: 'Hall B' }],
    };
    const bundle = buildResponsibilityBundle(snapshot, PERSON_A, new Map([['h1', 'Hall A'], ['h2', 'Hall B']]));
    const text = renderResponsibilityBundleSummary(bundle);

    expect(text).toMatch(/Hall A/);
    expect(text).toMatch(/Hall B/);
    expect(text).toMatch(/speaker/);
    expect(text).toMatch(/chair/);
    expect(text).toMatch(/IST/);
  });

  it('returns a friendly placeholder when bundle is empty', () => {
    expect(renderResponsibilityBundleSummary({ byDay: new Map(), total: 0 })).toMatch(/No responsibilities/);
  });
});

describe('buildBundleIdempotencyKey', () => {
  it('includes event-scoped version, person, and channel', () => {
    expect(buildBundleIdempotencyKey(EVENT_ID, VERSION_ID, PERSON_A, 'email')).toBe(
      `notify:program-bundle:${EVENT_ID}:${VERSION_ID}:${PERSON_A}:email`,
    );
    expect(buildBundleIdempotencyKey(EVENT_ID, VERSION_ID, PERSON_A, 'whatsapp')).toBe(
      `notify:program-bundle:${EVENT_ID}:${VERSION_ID}:${PERSON_A}:whatsapp`,
    );
  });

  it('appends a force suffix only when explicitly forced', () => {
    const key = buildBundleIdempotencyKey(EVENT_ID, VERSION_ID, PERSON_A, 'email', { at: 12345 });
    expect(key).toBe(`notify:program-bundle:${EVENT_ID}:${VERSION_ID}:${PERSON_A}:email:force:12345`);
  });
});

describe('sendFacultyResponsibilityBundles', () => {
  it('sends one bundle per faculty per channel via sendNotification', async () => {
    const snapshot = {
      sessions: [
        { id: 's1', title: 'Plenary', hallId: 'h1', startAtUtc: '2026-12-15T03:30:00Z', endAtUtc: '2026-12-15T05:00:00Z' },
      ],
      assignments: [{ personId: PERSON_A, sessionId: 's1', role: 'speaker' }],
      halls: [{ id: 'h1', name: 'Hall A' }],
    };

    chainSelect([{ snapshotJson: snapshot, affectedPersonIdsJson: [PERSON_A] }]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', phoneE164: '+919999999999', fullName: 'Dr. A', salutation: 'Dr.' }]);
    chainSelect([{ name: 'Cardio Conf' }]);

    const results = await sendFacultyResponsibilityBundles({
      eventId: EVENT_ID,
      versionId: VERSION_ID,
    });

    expect(vi.mocked(sendNotification)).toHaveBeenCalledTimes(2);
    const channels = vi.mocked(sendNotification).mock.calls.map(c => c[0].channel).sort();
    expect(channels).toEqual(['email', 'whatsapp']);
    expect(results.filter(r => r.status === 'sent')).toHaveLength(2);

    for (const call of vi.mocked(sendNotification).mock.calls) {
      const input = call[0];
      expect(input.templateKey).toBe('faculty_reminder');
      expect(input.eventId).toBe(EVENT_ID);
      expect(input.personId).toBe(PERSON_A);
      expect(input.triggerEntityId).toBe(VERSION_ID);
      expect(input.idempotencyKey).toBe(
        `notify:program-bundle:${EVENT_ID}:${VERSION_ID}:${PERSON_A}:${input.channel}`,
      );
      expect(input.variables.eventName).toBe('Cardio Conf');
      expect(input.variables.fullName).toBe('Dr. A');
      expect(typeof input.variables.responsibilitySummary).toBe('string');
      expect(String(input.variables.responsibilitySummary).length).toBeGreaterThan(0);
    }
  });

  it('sends one aggregated bundle per faculty regardless of how many sessions', async () => {
    const snapshot = {
      sessions: [
        { id: 's1', title: 'A', hallId: 'h1', startAtUtc: '2026-12-15T03:30:00Z', endAtUtc: '2026-12-15T04:00:00Z' },
        { id: 's2', title: 'B', hallId: 'h1', startAtUtc: '2026-12-15T05:30:00Z', endAtUtc: '2026-12-15T06:00:00Z' },
        { id: 's3', title: 'C', hallId: 'h1', startAtUtc: '2026-12-16T05:30:00Z', endAtUtc: '2026-12-16T06:00:00Z' },
      ],
      assignments: [
        { personId: PERSON_A, sessionId: 's1', role: 'speaker' },
        { personId: PERSON_A, sessionId: 's2', role: 'speaker' },
        { personId: PERSON_A, sessionId: 's3', role: 'speaker' },
      ],
      halls: [{ id: 'h1', name: 'Hall A' }],
    };

    chainSelect([{ snapshotJson: snapshot, affectedPersonIdsJson: [PERSON_A] }]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', phoneE164: null, fullName: 'A', salutation: null }]);
    chainSelect([{ name: 'Conf' }]);

    await sendFacultyResponsibilityBundles({
      eventId: EVENT_ID,
      versionId: VERSION_ID,
      options: { channels: ['email'] },
    });

    expect(vi.mocked(sendNotification)).toHaveBeenCalledTimes(1);
    const summary = String(vi.mocked(sendNotification).mock.calls[0][0].variables.responsibilitySummary);
    expect(summary).toMatch(/A/);
    expect(summary).toMatch(/B/);
    expect(summary).toMatch(/C/);
  });

  it('skips channels for which the person has no contact info', async () => {
    const snapshot = {
      sessions: [{ id: 's1', title: 'Plenary', hallId: null, startAtUtc: '2026-12-15T03:30:00Z', endAtUtc: '2026-12-15T05:00:00Z' }],
      assignments: [{ personId: PERSON_A, sessionId: 's1', role: 'speaker' }],
      halls: [],
    };

    chainSelect([{ snapshotJson: snapshot, affectedPersonIdsJson: [PERSON_A] }]);
    chainSelect([{ id: PERSON_A, email: null, phoneE164: '+91999', fullName: 'A', salutation: null }]);
    chainSelect([{ name: 'Conf' }]);

    const results = await sendFacultyResponsibilityBundles({
      eventId: EVENT_ID,
      versionId: VERSION_ID,
    });

    expect(vi.mocked(sendNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendNotification).mock.calls[0][0].channel).toBe('whatsapp');
    expect(results.find(r => r.channel === 'email')?.status).toBe('skipped');
  });

  it('uses the same idempotency key by default and a force-suffixed key when force=true', async () => {
    const snapshot = {
      sessions: [{ id: 's1', title: 'Plenary', hallId: null, startAtUtc: '2026-12-15T03:30:00Z', endAtUtc: '2026-12-15T05:00:00Z' }],
      assignments: [{ personId: PERSON_A, sessionId: 's1', role: 'speaker' }],
      halls: [],
    };

    // Run 1: default — no force.
    chainSelect([{ snapshotJson: snapshot, affectedPersonIdsJson: [PERSON_A] }]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', phoneE164: null, fullName: 'A', salutation: null }]);
    chainSelect([{ name: 'Conf' }]);
    await sendFacultyResponsibilityBundles({
      eventId: EVENT_ID,
      versionId: VERSION_ID,
      options: { channels: ['email'] },
    });
    const firstKey = vi.mocked(sendNotification).mock.calls[0][0].idempotencyKey;
    expect(firstKey).toBe(`notify:program-bundle:${EVENT_ID}:${VERSION_ID}:${PERSON_A}:email`);

    // Run 2: force=true.
    vi.mocked(sendNotification).mockClear();
    chainSelect([{ snapshotJson: snapshot, affectedPersonIdsJson: [PERSON_A] }]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', phoneE164: null, fullName: 'A', salutation: null }]);
    chainSelect([{ name: 'Conf' }]);
    await sendFacultyResponsibilityBundles({
      eventId: EVENT_ID,
      versionId: VERSION_ID,
      options: { channels: ['email'], force: true },
    });
    const forcedKey = vi.mocked(sendNotification).mock.calls[0][0].idempotencyKey;
    expect(forcedKey).toMatch(
      new RegExp(`^notify:program-bundle:${EVENT_ID}:${VERSION_ID}:${PERSON_A}:email:force:\\d+$`),
    );
    expect(forcedKey).not.toBe(firstKey);
  });

  it('skips faculty whose snapshot has no responsibilities', async () => {
    const snapshot = {
      sessions: [],
      assignments: [],
      halls: [],
    };
    chainSelect([{ snapshotJson: snapshot, affectedPersonIdsJson: [PERSON_A] }]);
    chainSelect([{ id: PERSON_A, email: 'a@test.com', phoneE164: '+91999', fullName: 'A', salutation: null }]);
    chainSelect([{ name: 'Conf' }]);

    await sendFacultyResponsibilityBundles({ eventId: EVENT_ID, versionId: VERSION_ID });
    expect(vi.mocked(sendNotification)).not.toHaveBeenCalled();
  });

  it('skips affected person ids that are not linked through event_people', async () => {
    const snapshot = {
      sessions: [{ id: 's1', title: 'Plenary', hallId: null, startAtUtc: '2026-12-15T03:30:00Z', endAtUtc: '2026-12-15T05:00:00Z' }],
      assignments: [{ personId: PERSON_A, sessionId: 's1', role: 'speaker' }],
      halls: [],
    };

    chainSelect([{ snapshotJson: snapshot, affectedPersonIdsJson: [PERSON_A] }]);
    chainSelect([]);
    chainSelect([{ name: 'Conf' }]);

    await sendFacultyResponsibilityBundles({
      eventId: EVENT_ID,
      versionId: VERSION_ID,
      options: { channels: ['email'] },
    });

    expect(vi.mocked(sendNotification)).not.toHaveBeenCalled();
  });
});
