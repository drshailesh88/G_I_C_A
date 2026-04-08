import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  insertDeliveryEvent,
  findLogByProviderMessageId,
  updateLogStatus,
} = vi.hoisted(() => ({
  insertDeliveryEvent: vi.fn(),
  findLogByProviderMessageId: vi.fn(),
  updateLogStatus: vi.fn(),
}));

vi.mock('./delivery-event-queries', () => ({
  insertDeliveryEvent,
  findLogByProviderMessageId,
  updateLogStatus,
}));

import { ingestEmailStatus, ingestWhatsAppStatus } from './webhook-ingest';

describe('webhook ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ignore a WhatsApp webhook when the located log row belongs to email delivery', async () => {
    findLogByProviderMessageId.mockResolvedValue({
      id: 'log-email-1',
      status: 'sent',
      channel: 'email',
      provider: 'resend',
    });

    await ingestWhatsAppStatus({
      provider: 'evolution_api',
      rawPayload: {
        event: 'messages.update',
        data: {
          key: { id: 'shared-provider-id' },
          update: { status: 3 },
        },
      },
    });

    expect(insertDeliveryEvent).not.toHaveBeenCalled();
    expect(updateLogStatus).not.toHaveBeenCalled();
  });

  it('should process both webhooks when both are forward progress from current status', async () => {
    // Both "delivered" and "read" are forward from "sent", so both should update.
    // In production, the DB row status advances between calls, but with mocked
    // findLogByProviderMessageId always returning "sent", both pass isStatusForward.
    findLogByProviderMessageId.mockImplementation(async () => ({
      id: 'log-1',
      status: 'sent',
      channel: 'email',
      provider: 'resend',
    }));
    insertDeliveryEvent.mockResolvedValue(undefined);
    updateLogStatus.mockResolvedValue(undefined);

    await Promise.all([
      ingestEmailStatus({
        provider: 'resend',
        rawPayload: {
          type: 'email.delivered',
          data: {
            email_id: 'msg-1',
            created_at: '2026-04-08T10:00:00Z',
          },
        },
      }),
      ingestEmailStatus({
        provider: 'resend',
        rawPayload: {
          type: 'email.opened',
          data: {
            email_id: 'msg-1',
            created_at: '2026-04-08T10:00:01Z',
          },
        },
      }),
    ]);

    // Both are forward from "sent", both delivery events recorded
    expect(insertDeliveryEvent).toHaveBeenCalledTimes(2);
    expect(updateLogStatus).toHaveBeenCalledTimes(2);
  });
});
