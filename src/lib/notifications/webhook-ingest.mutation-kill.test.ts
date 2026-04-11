/**
 * Mutation-killing tests for webhook-ingest.ts
 *
 * Targets: 7 Survived mutations (ConditionalExpression, BooleanLiteral,
 * StringLiteral, BlockStatement).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./webhook-parsers', () => ({
  parseResendWebhook: vi.fn(),
  parseEvolutionWebhook: vi.fn(),
}));

vi.mock('./delivery-event-queries', () => ({
  insertDeliveryEvent: vi.fn().mockResolvedValue({ id: 'de-1' }),
  findLogByProviderMessageId: vi.fn(),
  updateLogStatus: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));

vi.mock('./webhook-dlq', () => ({
  pushToDlq: vi.fn().mockResolvedValue(true),
}));

import { ingestEmailStatus, ingestWhatsAppStatus } from './webhook-ingest';
import { parseResendWebhook, parseEvolutionWebhook } from './webhook-parsers';
import { insertDeliveryEvent, findLogByProviderMessageId, updateLogStatus } from './delivery-event-queries';
import { pushToDlq } from './webhook-dlq';

const mockedParseResend = vi.mocked(parseResendWebhook);
const mockedParseEvolution = vi.mocked(parseEvolutionWebhook);
const mockedFindLog = vi.mocked(findLogByProviderMessageId);
const mockedInsertDeliveryEvent = vi.mocked(insertDeliveryEvent);
const mockedUpdateLogStatus = vi.mocked(updateLogStatus);
const mockedPushToDlq = vi.mocked(pushToDlq);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ingestEmailStatus', () => {
  it('does nothing when parser returns null', async () => {
    mockedParseResend.mockReturnValue(null);

    await ingestEmailStatus({ provider: 'resend', rawPayload: {} });

    expect(mockedFindLog).not.toHaveBeenCalled();
  });

  it('does nothing when log not found for providerMessageId', async () => {
    mockedParseResend.mockReturnValue({
      providerMessageId: 'msg-1',
      eventType: 'sent',
      timestamp: '2026-01-01T00:00:00Z',
    });
    mockedFindLog.mockResolvedValue(null);

    await ingestEmailStatus({ provider: 'resend', rawPayload: {} });

    expect(mockedInsertDeliveryEvent).not.toHaveBeenCalled();
  });

  it('rejects channel mismatch (log is whatsapp, webhook is email)', async () => {
    mockedParseResend.mockReturnValue({
      providerMessageId: 'msg-1',
      eventType: 'sent',
      timestamp: '2026-01-01T00:00:00Z',
    });
    mockedFindLog.mockResolvedValue({
      id: 'log-1',
      channel: 'whatsapp', // mismatch!
    } as any);

    await ingestEmailStatus({ provider: 'resend', rawPayload: {} });

    expect(mockedInsertDeliveryEvent).not.toHaveBeenCalled();
  });

  it('processes valid email webhook: inserts delivery event and updates status', async () => {
    mockedParseResend.mockReturnValue({
      providerMessageId: 'msg-1',
      eventType: 'delivered',
      timestamp: '2026-01-01T00:00:00Z',
    });
    mockedFindLog.mockResolvedValue({
      id: 'log-1',
      channel: 'email',
    } as any);

    await ingestEmailStatus({ provider: 'resend', rawPayload: { type: 'email.delivered' } });

    expect(mockedInsertDeliveryEvent).toHaveBeenCalledWith({
      notificationLogId: 'log-1',
      eventType: 'delivered',
      providerPayloadJson: { type: 'email.delivered' },
    });
    expect(mockedUpdateLogStatus).toHaveBeenCalledWith('log-1', 'delivered', '2026-01-01T00:00:00Z');
  });

  it('pushes to DLQ on processing failure', async () => {
    mockedParseResend.mockReturnValue({
      providerMessageId: 'msg-1',
      eventType: 'sent',
      timestamp: '2026-01-01T00:00:00Z',
    });
    mockedFindLog.mockRejectedValue(new Error('DB connection failed'));

    await ingestEmailStatus({ provider: 'resend', rawPayload: { type: 'email.sent' } });

    expect(mockedPushToDlq).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'resend',
        channel: 'email',
        rawPayload: { type: 'email.sent' },
        errorMessage: 'DB connection failed',
      }),
    );
  });
});

describe('ingestWhatsAppStatus', () => {
  it('does nothing when parser returns null', async () => {
    mockedParseEvolution.mockReturnValue(null);

    await ingestWhatsAppStatus({ provider: 'evolution_api', rawPayload: {} });

    expect(mockedFindLog).not.toHaveBeenCalled();
  });

  it('processes valid whatsapp webhook', async () => {
    mockedParseEvolution.mockReturnValue({
      providerMessageId: 'wa-msg-1',
      eventType: 'delivered',
      timestamp: '2026-01-01T00:00:00Z',
    });
    mockedFindLog.mockResolvedValue({
      id: 'log-1',
      channel: 'whatsapp',
    } as any);

    await ingestWhatsAppStatus({ provider: 'evolution_api', rawPayload: { event: 'messages.update' } });

    expect(mockedInsertDeliveryEvent).toHaveBeenCalledWith({
      notificationLogId: 'log-1',
      eventType: 'delivered',
      providerPayloadJson: { event: 'messages.update' },
    });
  });

  it('rejects channel mismatch (log is email, webhook is whatsapp)', async () => {
    mockedParseEvolution.mockReturnValue({
      providerMessageId: 'wa-msg-1',
      eventType: 'sent',
      timestamp: '2026-01-01T00:00:00Z',
    });
    mockedFindLog.mockResolvedValue({
      id: 'log-1',
      channel: 'email', // mismatch!
    } as any);

    await ingestWhatsAppStatus({ provider: 'evolution_api', rawPayload: {} });

    expect(mockedInsertDeliveryEvent).not.toHaveBeenCalled();
  });

  it('pushes to DLQ with non-Error thrown', async () => {
    mockedParseEvolution.mockReturnValue({
      providerMessageId: 'wa-msg-1',
      eventType: 'sent',
      timestamp: '2026-01-01T00:00:00Z',
    });
    mockedFindLog.mockRejectedValue('string error');

    await ingestWhatsAppStatus({ provider: 'evolution_api', rawPayload: {} });

    expect(mockedPushToDlq).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'evolution_api',
        channel: 'whatsapp',
        errorMessage: 'string error',
      }),
    );
  });
});
