/**
 * Mutation-kill-4 tests for actions/program.ts
 *
 * Targets survivors in:
 *   - getPublicProgramData: snapshot filter (isPublic + !cancelled),
 *     session sort by sessionDate / startAtUtc / sortOrder with null coercion,
 *     hall sort by sortOrder
 *   - buildChangesSummaryText (via sendVersionEmails): count>0
 *     gates, singular vs plural pluralization, fallback message when all
 *     counts are zero, full fallback when summary is null
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockSendNotification } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  mockRevalidatePath: vi.fn(),
  mockSendNotification: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: vi.fn(async () => ({ userId: 'user-1', role: 'org:event_coordinator' })),
}));
vi.mock('@/lib/notifications/send', () => ({ sendNotification: mockSendNotification }));

import { getPublicProgramData, sendVersionEmails } from './program';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VERSION_ID = '550e8400-e29b-41d4-a716-446655440001';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440002';

type SelectResult = unknown[];

function setSelectSequence(calls: SelectResult[]) {
  let idx = 0;
  mockDb.select.mockImplementation(() => {
    const rows = calls[idx++] ?? [];
    const chain: Record<string, any> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => Object.assign(Promise.resolve(rows), chain));
    chain.innerJoin = vi.fn(() => chain);
    chain.leftJoin = vi.fn(() => chain);
    chain.limit = vi.fn().mockResolvedValue(rows);
    chain.orderBy = vi.fn(() => Object.assign(Promise.resolve(rows), chain));
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.update.mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  });
});

// ──────────────────────────────────────────────────────────
// getPublicProgramData: filters and sorts the published snapshot
// ──────────────────────────────────────────────────────────
describe('getPublicProgramData — filter + sort', () => {
  it('returns empty structures when no version is published', async () => {
    // Every row in program_versions is a published snapshot (drafts don't create
    // rows), so "no published version" is represented by an empty result set.
    setSelectSequence([[]]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result).toEqual({ sessions: [], halls: [], hasPublishedVersion: false });
  });

  it('filters out private sessions (isPublic !== true)', async () => {
    setSelectSequence([
      [{
        id: VERSION_ID,
        status: 'published',
        snapshotJson: {
          sessions: [
            { id: 's1', title: 'Public', isPublic: true, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z' },
            { id: 's2', title: 'Private', isPublic: false, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z' },
          ],
          assignments: [], halls: [],
        },
      }],
      [], // personRows (no assignments)
    ]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('filters out cancelled sessions (status === "cancelled")', async () => {
    setSelectSequence([
      [{
        id: VERSION_ID,
        status: 'published',
        snapshotJson: {
          sessions: [
            { id: 's1', title: 'Live', isPublic: true, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z' },
            { id: 's2', title: 'Dead', isPublic: true, status: 'cancelled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z' },
          ],
          assignments: [], halls: [],
        },
      }],
      [],
    ]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('sorts sessions by sessionDate ascending', async () => {
    setSelectSequence([
      [{
        id: VERSION_ID,
        status: 'published',
        snapshotJson: {
          sessions: [
            { id: 'late', title: 'Late', isPublic: true, status: 'scheduled', sessionDate: '2026-05-10', startAtUtc: '2026-05-10T09:00:00Z', endAtUtc: '2026-05-10T10:00:00Z', sortOrder: 0 },
            { id: 'early', title: 'Early', isPublic: true, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z', sortOrder: 0 },
          ],
          assignments: [], halls: [],
        },
      }],
      [],
    ]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions.map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('sorts by startAtUtc when sessionDate is equal', async () => {
    setSelectSequence([
      [{
        id: VERSION_ID,
        status: 'published',
        snapshotJson: {
          sessions: [
            { id: 'afternoon', title: 'PM', isPublic: true, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T14:00:00Z', endAtUtc: '2026-05-01T15:00:00Z', sortOrder: 0 },
            { id: 'morning', title: 'AM', isPublic: true, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z', sortOrder: 0 },
          ],
          assignments: [], halls: [],
        },
      }],
      [],
    ]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions.map((s) => s.id)).toEqual(['morning', 'afternoon']);
  });

  it('sorts by sortOrder when sessionDate and startAtUtc are equal', async () => {
    setSelectSequence([
      [{
        id: VERSION_ID,
        status: 'published',
        snapshotJson: {
          sessions: [
            { id: 'second', title: 'Second', isPublic: true, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z', sortOrder: 2 },
            { id: 'first',  title: 'First',  isPublic: true, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z', sortOrder: 1 },
          ],
          assignments: [], halls: [],
        },
      }],
      [],
    ]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions.map((s) => s.id)).toEqual(['first', 'second']);
  });

  it('treats null sessionDate / startAtUtc / sortOrder as 0 (sorts to the front)', async () => {
    setSelectSequence([
      [{
        id: VERSION_ID,
        status: 'published',
        snapshotJson: {
          sessions: [
            { id: 'dated', title: 'D', isPublic: true, status: 'scheduled', sessionDate: '2026-05-01', startAtUtc: '2026-05-01T09:00:00Z', endAtUtc: '2026-05-01T10:00:00Z', sortOrder: 5 },
            { id: 'undated', title: 'U', isPublic: true, status: 'scheduled', sessionDate: null, startAtUtc: null, endAtUtc: null, sortOrder: null },
          ],
          assignments: [], halls: [],
        },
      }],
      [],
    ]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].id).toBe('undated');
  });

  it('sorts halls by sortOrder ascending (null treated as 0)', async () => {
    setSelectSequence([
      [{
        id: VERSION_ID,
        status: 'published',
        snapshotJson: {
          sessions: [],
          assignments: [],
          halls: [
            { id: 'h3', name: 'H3', sortOrder: 3 },
            { id: 'h1', name: 'H1', sortOrder: 1 },
            { id: 'h2', name: 'H2', sortOrder: null },
          ],
        },
      }],
    ]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.halls.map((h) => h.id)).toEqual(['h2', 'h1', 'h3']);
  });

  it('treats a non-array snapshot.sessions as empty', async () => {
    setSelectSequence([
      [{
        id: VERSION_ID,
        status: 'published',
        snapshotJson: { sessions: 'not an array', assignments: [], halls: [] },
      }],
    ]);
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────
// buildChangesSummaryText via sendVersionEmails
// ──────────────────────────────────────────────────────────
describe('buildChangesSummaryText (via sendVersionEmails)', () => {
  function stubVersion(changesSummaryJson: unknown, affectedPersonIds: string[] = [PERSON_ID]) {
    setSelectSequence([
      // assertProgramEventAccess → handled by mocked assertEventAccess
      [{
        id: VERSION_ID,
        versionNo: 3,
        status: 'published',
        affectedPersonIdsJson: affectedPersonIds,
        changesSummaryJson,
      }],
      [{ name: 'Conference' }], // event name lookup
      [{ id: PERSON_ID, fullName: 'Dr. Smith', salutation: null, email: 'smith@x.co' }], // faculty
    ]);
  }

  it('falls back to "Program has been updated." when summary is null', async () => {
    stubVersion(null);
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    expect(mockSendNotification).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ changesSummary: 'Program has been updated.' }),
    }));
  });

  it('falls back to "Sessions have been updated." when summary is present but all counts are 0', async () => {
    stubVersion({});
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    expect(mockSendNotification).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ changesSummary: 'Sessions have been updated.' }),
    }));
  });

  it('singular / plural: 1 added session → "1 session added"', async () => {
    stubVersion({ added_sessions: [{ id: 's1' }] });
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    const changesSummary = mockSendNotification.mock.calls[0][0].variables.changesSummary;
    expect(changesSummary).toContain('1 session added');
    expect(changesSummary).not.toContain('1 sessions');
  });

  it('plural: 3 added sessions → "3 sessions added"', async () => {
    stubVersion({ added_sessions: [{}, {}, {}] });
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    const changesSummary = mockSendNotification.mock.calls[0][0].variables.changesSummary;
    expect(changesSummary).toContain('3 sessions added');
  });

  it('composes multiple counts separated by ", " and terminated with "."', async () => {
    stubVersion({
      added_sessions: [{}],
      moved_sessions: [{}, {}],
      removed_sessions: [{}],
    });
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    const changesSummary = mockSendNotification.mock.calls[0][0].variables.changesSummary;
    expect(changesSummary).toContain('1 session added');
    expect(changesSummary).toContain('2 sessions changed or moved');
    expect(changesSummary).toContain('1 session removed');
    expect(changesSummary.endsWith('.')).toBe(true);
    expect(changesSummary.split(', ').length).toBeGreaterThanOrEqual(3);
  });

  it('handles singular "1 assignment changed" vs plural "N assignments changed"', async () => {
    stubVersion({ assignment_changes: [{ id: 'a1' }] });
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    const changesSummary = mockSendNotification.mock.calls[0][0].variables.changesSummary;
    expect(changesSummary).toContain('1 assignment changed');
    expect(changesSummary).not.toContain('1 assignments');
  });

  it('handles singular "1 TBA slot filled" vs plural "N TBA slots filled"', async () => {
    stubVersion({ tba_filled: [{}] });
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    const changesSummary = mockSendNotification.mock.calls[0][0].variables.changesSummary;
    expect(changesSummary).toContain('1 TBA slot filled');
    expect(changesSummary).not.toContain('1 TBA slots');
  });

  it('handles plural "N TBA slots filled" for count > 1', async () => {
    stubVersion({ tba_filled: [{}, {}] });
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    const changesSummary = mockSendNotification.mock.calls[0][0].variables.changesSummary;
    expect(changesSummary).toContain('2 TBA slots filled');
  });

  it('treats non-array changes_summary entries as count 0 (no section emitted)', async () => {
    stubVersion({ added_sessions: 'not-array', removed_sessions: { not: 'array' } });
    mockSendNotification.mockResolvedValue({ notificationLogId: 'x', provider: 'resend', providerMessageId: 'm', status: 'sent' });
    await sendVersionEmails(EVENT_ID, VERSION_ID);
    const changesSummary = mockSendNotification.mock.calls[0][0].variables.changesSummary;
    expect(changesSummary).toBe('Sessions have been updated.');
  });
});
