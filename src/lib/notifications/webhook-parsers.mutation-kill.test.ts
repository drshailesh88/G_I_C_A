/**
 * Mutation-killing tests for webhook-parsers.ts
 *
 * Targets: 21 Survived mutations (ConditionalExpression, LogicalOperator,
 * StringLiteral in parseEvolutionWebhook and isStatusForward).
 */

import { describe, it, expect } from 'vitest';
import {
  parseResendWebhook,
  parseEvolutionWebhook,
  isStatusForward,
} from './webhook-parsers';

describe('isStatusForward — edge cases', () => {
  it('failed always overrides any status', () => {
    expect(isStatusForward('queued', 'failed')).toBe(true);
    expect(isStatusForward('sent', 'failed')).toBe(true);
    expect(isStatusForward('delivered', 'failed')).toBe(true);
    expect(isStatusForward('read', 'failed')).toBe(true);
  });

  it('cannot go backwards', () => {
    expect(isStatusForward('delivered', 'sent')).toBe(false);
    expect(isStatusForward('read', 'delivered')).toBe(false);
    expect(isStatusForward('sent', 'queued')).toBe(false);
  });

  it('same status is not forward', () => {
    expect(isStatusForward('sent', 'sent')).toBe(false);
    expect(isStatusForward('delivered', 'delivered')).toBe(false);
  });

  it('retrying is treated as same level as sending', () => {
    expect(isStatusForward('retrying', 'sending')).toBe(false);
    expect(isStatusForward('sending', 'retrying')).toBe(false);
  });
});

describe('parseResendWebhook — exact event mappings', () => {
  it('maps email.sent to sent', () => {
    const result = parseResendWebhook({
      type: 'email.sent',
      data: { email_id: 'msg-1', created_at: '2026-01-01T00:00:00Z' },
    });
    expect(result).toEqual({
      providerMessageId: 'msg-1',
      eventType: 'sent',
      timestamp: '2026-01-01T00:00:00Z',
    });
  });

  it('maps email.delivered to delivered', () => {
    const result = parseResendWebhook({
      type: 'email.delivered',
      data: { email_id: 'msg-2', created_at: '2026-01-01T00:00:00Z' },
    });
    expect(result!.eventType).toBe('delivered');
  });

  it('maps email.delivery_delayed to sending', () => {
    const result = parseResendWebhook({
      type: 'email.delivery_delayed',
      data: { email_id: 'msg-3', created_at: '2026-01-01T00:00:00Z' },
    });
    expect(result!.eventType).toBe('sending');
  });

  it('maps email.complained to failed', () => {
    const result = parseResendWebhook({
      type: 'email.complained',
      data: { email_id: 'msg-4', created_at: '2026-01-01T00:00:00Z' },
    });
    expect(result!.eventType).toBe('failed');
  });

  it('maps email.bounced to failed', () => {
    const result = parseResendWebhook({
      type: 'email.bounced',
      data: { email_id: 'msg-5', created_at: '2026-01-01T00:00:00Z' },
    });
    expect(result!.eventType).toBe('failed');
  });

  it('maps email.opened to read', () => {
    const result = parseResendWebhook({
      type: 'email.opened',
      data: { email_id: 'msg-6', created_at: '2026-01-01T00:00:00Z' },
    });
    expect(result!.eventType).toBe('read');
  });

  it('returns null for unknown type', () => {
    expect(parseResendWebhook({ type: 'email.unknown', data: { email_id: 'x' } })).toBeNull();
  });

  it('uses current time when created_at is missing', () => {
    const before = new Date().toISOString();
    const result = parseResendWebhook({
      type: 'email.sent',
      data: { email_id: 'msg-7' },
    });
    expect(result!.timestamp).toBeDefined();
    expect(new Date(result!.timestamp).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000);
  });

  it('returns null when email_id is missing', () => {
    expect(parseResendWebhook({ type: 'email.sent', data: {} })).toBeNull();
  });

  it('returns null when email_id is empty string', () => {
    expect(parseResendWebhook({ type: 'email.sent', data: { email_id: '' } })).toBeNull();
  });

  it('returns null when data is missing', () => {
    expect(parseResendWebhook({ type: 'email.sent' })).toBeNull();
  });

  it('returns null for non-object data', () => {
    expect(parseResendWebhook({ type: 'email.sent', data: 'invalid' })).toBeNull();
  });
});

describe('parseEvolutionWebhook — exact status mappings', () => {
  const makePayload = (statusCode: number, messageId = 'wa-msg-1') => ({
    event: 'messages.update',
    data: {
      key: { id: messageId },
      update: { status: statusCode },
    },
  });

  it('maps status 0 (ERROR) to failed', () => {
    const result = parseEvolutionWebhook(makePayload(0));
    expect(result!.eventType).toBe('failed');
  });

  it('maps status 1 (PENDING) to sending', () => {
    const result = parseEvolutionWebhook(makePayload(1));
    expect(result!.eventType).toBe('sending');
  });

  it('maps status 2 (SERVER_ACK) to sent', () => {
    const result = parseEvolutionWebhook(makePayload(2));
    expect(result!.eventType).toBe('sent');
  });

  it('maps status 3 (DELIVERY_ACK) to delivered', () => {
    const result = parseEvolutionWebhook(makePayload(3));
    expect(result!.eventType).toBe('delivered');
  });

  it('maps status 4 (READ) to read', () => {
    const result = parseEvolutionWebhook(makePayload(4));
    expect(result!.eventType).toBe('read');
  });

  it('maps status 5 (PLAYED) to read', () => {
    const result = parseEvolutionWebhook(makePayload(5));
    expect(result!.eventType).toBe('read');
  });

  it('returns null for unknown status code', () => {
    expect(parseEvolutionWebhook(makePayload(99))).toBeNull();
  });

  it('returns null for non-messages.update events', () => {
    expect(parseEvolutionWebhook({ event: 'connection.update', data: {} })).toBeNull();
  });

  it('returns null when key is missing', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { update: { status: 2 } },
    })).toBeNull();
  });

  it('returns null when key.id is missing', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: {}, update: { status: 2 } },
    })).toBeNull();
  });

  it('returns null when key.id is empty', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: '' }, update: { status: 2 } },
    })).toBeNull();
  });

  it('returns null when update is missing', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 'msg-1' } },
    })).toBeNull();
  });

  it('returns null when status is not a number', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: { status: 'sent' } },
    })).toBeNull();
  });

  it('uses provided timestamp when available', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'msg-1' },
        update: { status: 2 },
        timestamp: '2026-01-01T12:00:00Z',
      },
    });
    expect(result!.timestamp).toBe('2026-01-01T12:00:00Z');
  });

  it('falls back to current time when timestamp missing', () => {
    const before = Date.now();
    const result = parseEvolutionWebhook(makePayload(2));
    const ts = new Date(result!.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
  });
});
