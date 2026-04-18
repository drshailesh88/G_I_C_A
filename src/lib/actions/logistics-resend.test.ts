/**
 * Tests for getLastLogisticsNotification and resendLogisticsNotification.
 * Expectations derived from PKT-C-006 spec, CLAUDE.md domain rules, and
 * ROLES constant — never from reading implementation code.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock vars ─────────────────────────────────────────

const { mockLimit, mockSelect } = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  return { mockLimit, mockSelect };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: vi.fn(),
}));

vi.mock('@/lib/notifications/send', () => ({
  resendNotification: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ op: 'eq', val })),
  and: vi.fn((...args) => ({ op: 'and', args })),
  desc: vi.fn((col) => ({ op: 'desc', col })),
}));

vi.mock('@/lib/db', () => ({ db: { select: mockSelect } }));

vi.mock('@/lib/db/schema', () => ({
  notificationLog: {
    id: 'id',
    eventId: 'event_id',
    channel: 'channel',
    sentAt: 'sent_at',
    queuedAt: 'queued_at',
    status: 'status',
    triggerEntityId: 'trigger_entity_id',
  },
}));

// ── Import under test (after mocks) ──────────────────────────

import { assertEventAccess } from '@/lib/auth/event-access';
import { resendNotification } from '@/lib/notifications/send';
import {
  getLastLogisticsNotification,
  resendLogisticsNotification,
} from './logistics-notifications';

const mockAssertEventAccess = vi.mocked(assertEventAccess);
const mockResendNotification = vi.mocked(resendNotification);

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const RECORD_ID = '22222222-2222-2222-2222-222222222222';
const LOG_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = 'user_abc';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getLastLogisticsNotification ──────────────────────────────

describe('getLastLogisticsNotification', () => {
  it('returns null when no notification log exists for the record', async () => {
    mockAssertEventAccess.mockResolvedValue({ role: 'org:super_admin', userId: USER_ID });
    mockLimit.mockResolvedValue([]);

    const result = await getLastLogisticsNotification({ eventId: EVENT_ID, recordId: RECORD_ID });

    expect(result).toBeNull();
  });

  it('returns the most recent log entry when one exists', async () => {
    mockAssertEventAccess.mockResolvedValue({ role: 'org:super_admin', userId: USER_ID });
    const fakeLog = {
      id: LOG_ID,
      channel: 'email',
      sentAt: new Date('2026-04-18T03:00:00Z'),
      queuedAt: new Date('2026-04-18T03:00:00Z'),
      status: 'sent',
    };
    mockLimit.mockResolvedValue([fakeLog]);

    const result = await getLastLogisticsNotification({ eventId: EVENT_ID, recordId: RECORD_ID });

    expect(result).toEqual(fakeLog);
  });

  it('throws forbidden for an unknown role', async () => {
    mockAssertEventAccess.mockResolvedValue({ role: 'org:unknown', userId: USER_ID });

    await expect(
      getLastLogisticsNotification({ eventId: EVENT_ID, recordId: RECORD_ID }),
    ).rejects.toThrow('forbidden');
  });

  it('rejects with zod error for non-UUID eventId', async () => {
    await expect(
      getLastLogisticsNotification({ eventId: 'not-a-uuid', recordId: RECORD_ID }),
    ).rejects.toThrow();
  });

  it('rejects with zod error for non-UUID recordId', async () => {
    await expect(
      getLastLogisticsNotification({ eventId: EVENT_ID, recordId: 'not-a-uuid' }),
    ).rejects.toThrow();
  });
});

// ── resendLogisticsNotification ───────────────────────────────

describe('resendLogisticsNotification', () => {
  it('returns no_prior_notification when no matching log exists for channel', async () => {
    mockAssertEventAccess.mockResolvedValue({ role: 'org:ops', userId: USER_ID });
    mockLimit.mockResolvedValue([]);

    const result = await resendLogisticsNotification({
      eventId: EVENT_ID,
      recordId: RECORD_ID,
      channel: 'email',
    });

    expect(result).toEqual({ status: 'no_prior_notification' });
    expect(mockResendNotification).not.toHaveBeenCalled();
  });

  it('calls resendNotification with the found log id and returns the result', async () => {
    mockAssertEventAccess.mockResolvedValue({ role: 'org:ops', userId: USER_ID });
    mockLimit.mockResolvedValue([{ id: LOG_ID }]);
    mockResendNotification.mockResolvedValue({
      notificationLogId: 'new-log-id',
      provider: 'resend',
      providerMessageId: 'msg-123',
      status: 'sent',
    });

    const result = await resendLogisticsNotification({
      eventId: EVENT_ID,
      recordId: RECORD_ID,
      channel: 'email',
    });

    expect(mockResendNotification).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      notificationLogId: LOG_ID,
      initiatedByUserId: USER_ID,
    });
    expect(result).toMatchObject({ status: 'sent' });
  });

  it('throws forbidden for read_only role', async () => {
    mockAssertEventAccess.mockResolvedValue({ role: 'org:read_only', userId: USER_ID });

    await expect(
      resendLogisticsNotification({ eventId: EVENT_ID, recordId: RECORD_ID, channel: 'whatsapp' }),
    ).rejects.toThrow('forbidden');
  });

  it('allows org:ops role to resend', async () => {
    mockAssertEventAccess.mockResolvedValue({ role: 'org:ops', userId: USER_ID });
    mockLimit.mockResolvedValue([{ id: LOG_ID }]);
    mockResendNotification.mockResolvedValue({
      notificationLogId: 'new-log-id',
      provider: 'resend',
      providerMessageId: null,
      status: 'sent',
    });

    await expect(
      resendLogisticsNotification({ eventId: EVENT_ID, recordId: RECORD_ID, channel: 'email' }),
    ).resolves.toMatchObject({ status: 'sent' });
  });

  it('rejects with zod error for invalid channel value', async () => {
    mockAssertEventAccess.mockResolvedValue({ role: 'org:ops', userId: USER_ID });

    await expect(
      resendLogisticsNotification({ eventId: EVENT_ID, recordId: RECORD_ID, channel: 'sms' as 'email' }),
    ).rejects.toThrow();
  });

  it('rejects with zod error for missing recordId', async () => {
    await expect(
      resendLogisticsNotification({ eventId: EVENT_ID, channel: 'email' }),
    ).rejects.toThrow();
  });
});
