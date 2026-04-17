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

const { pushToDlq } = vi.hoisted(() => ({
  pushToDlq: vi.fn(),
}));

vi.mock('./delivery-event-queries', () => ({
  insertDeliveryEvent,
  findLogByProviderMessageId,
  updateLogStatus,
}));

vi.mock('./webhook-dlq', () => ({
  pushToDlq,
}));

import { ingestEmailStatus, ingestWhatsAppStatus } from './webhook-ingest';

describe('webhook ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ignore a WhatsApp webhook when the located log row belongs to email', async () => {
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

    expect(findLogByProviderMessageId).toHaveBeenCalledWith('shared-provider-id', 'evolution_api');
    expect(insertDeliveryEvent).not.toHaveBeenCalled();
    expect(updateLogStatus).not.toHaveBeenCalled();
  });

  it('should process valid email webhook and update status', async () => {
    findLogByProviderMessageId.mockResolvedValue({
      id: 'log-1',
      status: 'sent',
      channel: 'email',
      provider: 'resend',
    });
    insertDeliveryEvent.mockResolvedValue(undefined);
    updateLogStatus.mockResolvedValue({ id: 'log-1', status: 'delivered' });

    await ingestEmailStatus({
      provider: 'resend',
      rawPayload: {
        type: 'email.delivered',
        data: { email_id: 'msg-1', created_at: '2026-04-08T10:00:00Z' },
      },
    });

    expect(findLogByProviderMessageId).toHaveBeenCalledWith('msg-1', 'resend');
    expect(insertDeliveryEvent).toHaveBeenCalledWith({
      notificationLogId: 'log-1',
      eventType: 'delivered',
      providerPayloadJson: expect.any(Object),
    });
    expect(updateLogStatus).toHaveBeenCalledWith('log-1', 'delivered', '2026-04-08T10:00:00Z');
  });

  it('should push to DLQ on processing failure instead of swallowing', async () => {
    findLogByProviderMessageId.mockRejectedValue(new Error('DB connection lost'));
    pushToDlq.mockResolvedValue(true);

    await ingestEmailStatus({
      provider: 'resend',
      rawPayload: {
        type: 'email.delivered',
        data: { email_id: 'msg-1', created_at: '2026-04-08T10:00:00Z' },
      },
    });

    expect(pushToDlq).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'resend',
        channel: 'email',
        errorMessage: 'DB connection lost',
      }),
    );
  });

  it('should not push to DLQ when payload is unparseable', async () => {
    await ingestEmailStatus({
      provider: 'resend',
      rawPayload: { type: 'unknown.event' },
    });

    expect(findLogByProviderMessageId).not.toHaveBeenCalled();
    expect(pushToDlq).not.toHaveBeenCalled();
  });

  it('should ignore webhooks with no matching log row', async () => {
    findLogByProviderMessageId.mockResolvedValue(null);

    await ingestEmailStatus({
      provider: 'resend',
      rawPayload: {
        type: 'email.sent',
        data: { email_id: 'unknown-msg', created_at: '2026-04-08T10:00:00Z' },
      },
    });

    expect(findLogByProviderMessageId).toHaveBeenCalledWith('unknown-msg', 'resend');
    expect(insertDeliveryEvent).not.toHaveBeenCalled();
    expect(updateLogStatus).not.toHaveBeenCalled();
  });

  it('should ignore a WhatsApp webhook that resolves to a different WhatsApp provider log', async () => {
    findLogByProviderMessageId.mockResolvedValue(null);

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

    expect(findLogByProviderMessageId).toHaveBeenCalledWith('shared-provider-id', 'evolution_api');
    expect(insertDeliveryEvent).not.toHaveBeenCalled();
    expect(updateLogStatus).not.toHaveBeenCalled();
  });
});
