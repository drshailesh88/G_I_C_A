import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockSendNotification, mockCaptureCascadeError } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockSendNotification: vi.fn(),
  mockCaptureCascadeError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/notifications/send', () => ({ sendNotification: mockSendNotification }));
vi.mock('@/lib/sentry', () => ({ captureCascadeError: mockCaptureCascadeError }));
vi.mock('../red-flags', () => ({ upsertRedFlag: vi.fn().mockResolvedValue({ action: 'created' }) }));
vi.mock('../emit', () => ({ onCascadeEvent: vi.fn() }));

import { handleTravelSaved } from './travel-cascade';

describe('cascade-037: handler does not check archive state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendNotification.mockResolvedValue(undefined);
  });

  it('handler runs normally with archived event — notification_log row inserted', async () => {
    const archivedEventId = 'archived-event-111';

    await handleTravelSaved({
      eventId: archivedEventId,
      actor: { type: 'user', id: 'user-1' },
      payload: {
        personId: 'person-1',
        travelRecordId: 'tr-1',
        direction: 'inbound',
        travelMode: 'flight',
        fromCity: 'Delhi',
        toCity: 'Mumbai',
        departureAtUtc: '2026-04-20T10:00:00Z',
        arrivalAtUtc: '2026-04-20T12:00:00Z',
        variables: {
          recipientEmail: 'test@example.com',
          recipientPhoneE164: '+919999999999',
          recipientName: 'Test Person',
        },
      },
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: archivedEventId,
        channel: 'email',
      }),
    );
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: archivedEventId,
        channel: 'whatsapp',
      }),
    );
  });
});
