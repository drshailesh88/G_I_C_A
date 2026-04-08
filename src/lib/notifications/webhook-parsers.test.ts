import { describe, expect, it } from 'vitest';
import {
  parseResendWebhook,
  parseEvolutionWebhook,
  isStatusForward,
} from './webhook-parsers';
import type { NotificationStatus } from './types';

// ── isStatusForward ────────────────────────────────────────────

describe('isStatusForward', () => {
  it('allows progression from queued to sent', () => {
    expect(isStatusForward('queued', 'sent')).toBe(true);
  });

  it('allows progression from sent to delivered', () => {
    expect(isStatusForward('sent', 'delivered')).toBe(true);
  });

  it('allows progression from delivered to read', () => {
    expect(isStatusForward('delivered', 'read')).toBe(true);
  });

  it('does NOT allow regression from read to delivered', () => {
    expect(isStatusForward('read', 'delivered')).toBe(false);
  });

  it('does NOT allow regression from delivered to sent', () => {
    expect(isStatusForward('delivered', 'sent')).toBe(false);
  });

  it('does NOT allow same-status "progression"', () => {
    expect(isStatusForward('sent', 'sent')).toBe(false);
  });

  it('allows failed to override any status', () => {
    const statuses: NotificationStatus[] = ['queued', 'sending', 'sent', 'delivered', 'read'];
    for (const status of statuses) {
      expect(isStatusForward(status, 'failed')).toBe(true);
    }
  });

  it('allows queued to sending', () => {
    expect(isStatusForward('queued', 'sending')).toBe(true);
  });

  it('allows sending to sent', () => {
    expect(isStatusForward('sending', 'sent')).toBe(true);
  });
});

// ── parseResendWebhook ─────────────────────────────────────────

describe('parseResendWebhook', () => {
  it('parses email.sent event', () => {
    const result = parseResendWebhook({
      type: 'email.sent',
      data: { email_id: 'msg_123', created_at: '2026-04-08T10:00:00Z' },
    });
    expect(result).toEqual({
      providerMessageId: 'msg_123',
      eventType: 'sent',
      timestamp: '2026-04-08T10:00:00Z',
    });
  });

  it('parses email.delivered event', () => {
    const result = parseResendWebhook({
      type: 'email.delivered',
      data: { email_id: 'msg_123', created_at: '2026-04-08T10:01:00Z' },
    });
    expect(result).toEqual({
      providerMessageId: 'msg_123',
      eventType: 'delivered',
      timestamp: '2026-04-08T10:01:00Z',
    });
  });

  it('parses email.bounced as failed', () => {
    const result = parseResendWebhook({
      type: 'email.bounced',
      data: { email_id: 'msg_123', created_at: '2026-04-08T10:02:00Z' },
    });
    expect(result).toEqual({
      providerMessageId: 'msg_123',
      eventType: 'failed',
      timestamp: '2026-04-08T10:02:00Z',
    });
  });

  it('parses email.complained as failed', () => {
    const result = parseResendWebhook({
      type: 'email.complained',
      data: { email_id: 'msg_456', created_at: '2026-04-08T10:03:00Z' },
    });
    expect(result).toEqual({
      providerMessageId: 'msg_456',
      eventType: 'failed',
      timestamp: '2026-04-08T10:03:00Z',
    });
  });

  it('parses email.opened as read', () => {
    const result = parseResendWebhook({
      type: 'email.opened',
      data: { email_id: 'msg_789', created_at: '2026-04-08T11:00:00Z' },
    });
    expect(result).toEqual({
      providerMessageId: 'msg_789',
      eventType: 'read',
      timestamp: '2026-04-08T11:00:00Z',
    });
  });

  it('returns null for unknown event type', () => {
    expect(parseResendWebhook({
      type: 'email.clicked',
      data: { email_id: 'msg_123', created_at: '2026-04-08T10:00:00Z' },
    })).toBeNull();
  });

  it('returns null for null payload', () => {
    expect(parseResendWebhook(null)).toBeNull();
  });

  it('returns null for non-object payload', () => {
    expect(parseResendWebhook('not-an-object')).toBeNull();
  });

  it('returns null when data is missing', () => {
    expect(parseResendWebhook({ type: 'email.sent' })).toBeNull();
  });

  it('returns null when email_id is missing', () => {
    expect(parseResendWebhook({
      type: 'email.sent',
      data: { created_at: '2026-04-08T10:00:00Z' },
    })).toBeNull();
  });

  it('uses current time when created_at is missing', () => {
    const result = parseResendWebhook({
      type: 'email.sent',
      data: { email_id: 'msg_no_time' },
    });
    expect(result).not.toBeNull();
    expect(result!.providerMessageId).toBe('msg_no_time');
    expect(result!.eventType).toBe('sent');
    // Timestamp should be a valid ISO string
    expect(() => new Date(result!.timestamp)).not.toThrow();
  });
});

// ── parseEvolutionWebhook ──────────────────────────────────────

describe('parseEvolutionWebhook', () => {
  it('parses DELIVERY_ACK (status 3) as delivered', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'wa_456' },
        update: { status: 3 },
      },
      instance: 'gem-india',
    });
    expect(result).toEqual({
      providerMessageId: 'wa_456',
      eventType: 'delivered',
      timestamp: expect.any(String),
    });
  });

  it('parses READ (status 4) as read', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'wa_789' },
        update: { status: 4 },
      },
      instance: 'gem-india',
    });
    expect(result).toEqual({
      providerMessageId: 'wa_789',
      eventType: 'read',
      timestamp: expect.any(String),
    });
  });

  it('parses PLAYED (status 5) as read', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'wa_audio' },
        update: { status: 5 },
      },
      instance: 'gem-india',
    });
    expect(result).toEqual({
      providerMessageId: 'wa_audio',
      eventType: 'read',
      timestamp: expect.any(String),
    });
  });

  it('parses SERVER_ACK (status 2) as sent', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'wa_ack' },
        update: { status: 2 },
      },
      instance: 'gem-india',
    });
    expect(result).toEqual({
      providerMessageId: 'wa_ack',
      eventType: 'sent',
      timestamp: expect.any(String),
    });
  });

  it('parses ERROR (status 0) as failed', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'wa_err' },
        update: { status: 0 },
      },
      instance: 'gem-india',
    });
    expect(result).toEqual({
      providerMessageId: 'wa_err',
      eventType: 'failed',
      timestamp: expect.any(String),
    });
  });

  it('parses PENDING (status 1) as sending', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'wa_pending' },
        update: { status: 1 },
      },
      instance: 'gem-india',
    });
    expect(result).toEqual({
      providerMessageId: 'wa_pending',
      eventType: 'sending',
      timestamp: expect.any(String),
    });
  });

  it('returns null for non-messages.update events', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.upsert',
      data: { key: { id: 'wa_456' }, update: { status: 3 } },
    })).toBeNull();
  });

  it('returns null for null payload', () => {
    expect(parseEvolutionWebhook(null)).toBeNull();
  });

  it('returns null when key is missing', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { update: { status: 3 } },
    })).toBeNull();
  });

  it('returns null when status is not a number', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 'wa_456' }, update: { status: 'delivered' } },
    })).toBeNull();
  });

  it('returns null when message id is empty', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: '' }, update: { status: 3 } },
    })).toBeNull();
  });

  it('uses provided timestamp when available', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'wa_ts' },
        update: { status: 3 },
        timestamp: '2026-04-08T12:00:00Z',
      },
      instance: 'gem-india',
    });
    expect(result!.timestamp).toBe('2026-04-08T12:00:00Z');
  });
});

// ── Status progression integration scenarios ───────────────────

describe('Status progression scenarios', () => {
  it('full happy path: queued → sending → sent → delivered → read', () => {
    const steps: Array<[NotificationStatus, NotificationStatus, boolean]> = [
      ['queued', 'sending', true],
      ['sending', 'sent', true],
      ['sent', 'delivered', true],
      ['delivered', 'read', true],
    ];
    for (const [current, next, expected] of steps) {
      expect(isStatusForward(current, next)).toBe(expected);
    }
  });

  it('late "sent" webhook after "delivered" is ignored', () => {
    expect(isStatusForward('delivered', 'sent')).toBe(false);
  });

  it('late "delivered" webhook after "read" is ignored', () => {
    expect(isStatusForward('read', 'delivered')).toBe(false);
  });

  it('"failed" can interrupt at any stage', () => {
    expect(isStatusForward('queued', 'failed')).toBe(true);
    expect(isStatusForward('sent', 'failed')).toBe(true);
    expect(isStatusForward('delivered', 'failed')).toBe(true);
    expect(isStatusForward('read', 'failed')).toBe(true);
  });
});
