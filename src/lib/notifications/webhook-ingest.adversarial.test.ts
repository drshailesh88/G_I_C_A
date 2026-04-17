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

const {
  parseResendWebhook,
  parseEvolutionWebhook,
} = vi.hoisted(() => ({
  parseResendWebhook: vi.fn(),
  parseEvolutionWebhook: vi.fn(),
}));

const { pushToDlq } = vi.hoisted(() => ({
  pushToDlq: vi.fn(),
}));

vi.mock('./delivery-event-queries', () => ({
  insertDeliveryEvent,
  findLogByProviderMessageId,
  updateLogStatus,
}));

vi.mock('./webhook-parsers', () => ({
  parseResendWebhook,
  parseEvolutionWebhook,
}));

vi.mock('./webhook-dlq', () => ({
  pushToDlq,
}));

import { ingestEmailStatus, ingestWhatsAppStatus } from './webhook-ingest';

describe('webhook-ingest adversarial hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('drops duplicate email replays before they can append extra delivery-event rows', async () => {
    parseResendWebhook.mockReturnValue({
      providerMessageId: 'msg-1',
      eventType: 'delivered',
      timestamp: '2026-04-18T12:00:00Z',
    });
    findLogByProviderMessageId.mockResolvedValue({
      id: 'log-1',
      channel: 'email',
      status: 'delivered',
    });
    updateLogStatus.mockResolvedValue(null);

    await ingestEmailStatus({
      provider: 'resend',
      rawPayload: {
        type: 'email.delivered',
        data: { email_id: 'msg-1', created_at: '2026-04-18T12:00:00Z' },
      },
    });

    expect(updateLogStatus).toHaveBeenCalledWith('log-1', 'delivered', '2026-04-18T12:00:00Z');
    expect(insertDeliveryEvent).not.toHaveBeenCalled();
    expect(pushToDlq).not.toHaveBeenCalled();
  });

  it('drops regressive whatsapp statuses that lose the CAS race to a newer state', async () => {
    parseEvolutionWebhook.mockReturnValue({
      providerMessageId: 'wa-msg-1',
      eventType: 'sent',
      timestamp: '2026-04-18T12:05:00Z',
    });
    findLogByProviderMessageId.mockResolvedValue({
      id: 'log-wa-1',
      channel: 'whatsapp',
      status: 'read',
    });
    updateLogStatus.mockResolvedValue(null);

    await ingestWhatsAppStatus({
      provider: 'evolution_api',
      rawPayload: {
        event: 'messages.update',
        data: {
          key: { id: 'wa-msg-1' },
          update: { status: 2 },
        },
      },
    });

    expect(updateLogStatus).toHaveBeenCalledWith('log-wa-1', 'sent', '2026-04-18T12:05:00Z');
    expect(insertDeliveryEvent).not.toHaveBeenCalled();
  });

  it('normalizes malformed provider timestamps before updating status', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T12:34:56Z'));

    parseResendWebhook.mockReturnValue({
      providerMessageId: 'msg-2',
      eventType: 'delivered',
      timestamp: 'not-a-real-date',
    });
    findLogByProviderMessageId.mockResolvedValue({
      id: 'log-2',
      channel: 'email',
      status: 'sent',
    });
    updateLogStatus.mockResolvedValue({
      id: 'log-2',
      status: 'delivered',
    });
    insertDeliveryEvent.mockResolvedValue({ id: 'de-2' });

    await ingestEmailStatus({
      provider: 'resend',
      rawPayload: {
        type: 'email.delivered',
        data: { email_id: 'msg-2', created_at: 'not-a-real-date' },
      },
    });

    expect(updateLogStatus).toHaveBeenCalledWith('log-2', 'delivered', '2026-04-18T12:34:56.000Z');
    expect(insertDeliveryEvent).toHaveBeenCalledWith({
      notificationLogId: 'log-2',
      eventType: 'delivered',
      providerPayloadJson: {
        type: 'email.delivered',
        data: { email_id: 'msg-2', created_at: 'not-a-real-date' },
      },
    });
  });
});
