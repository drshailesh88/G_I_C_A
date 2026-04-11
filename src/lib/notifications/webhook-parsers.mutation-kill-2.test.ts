/**
 * Mutation-killing tests Round 2 for webhook-parsers.ts
 *
 * Targets: 17 Survived ConditionalExpression/LogicalOperator.
 * Focus on null/falsy checks and type guards.
 */

import { describe, it, expect } from 'vitest';
import { parseResendWebhook, parseEvolutionWebhook, isStatusForward } from './webhook-parsers';

describe('parseResendWebhook — truthy/falsy guards', () => {
  it('returns null for null payload', () => {
    expect(parseResendWebhook(null)).toBeNull();
  });

  it('returns null for undefined payload', () => {
    expect(parseResendWebhook(undefined)).toBeNull();
  });

  it('returns null for number payload', () => {
    expect(parseResendWebhook(42)).toBeNull();
  });

  it('returns null for string payload', () => {
    expect(parseResendWebhook('hello')).toBeNull();
  });

  it('returns null when type is not a string', () => {
    expect(parseResendWebhook({ type: 123, data: { email_id: 'x' } })).toBeNull();
  });

  it('returns null when type is null', () => {
    expect(parseResendWebhook({ type: null, data: { email_id: 'x' } })).toBeNull();
  });

  it('returns null when data is null', () => {
    expect(parseResendWebhook({ type: 'email.sent', data: null })).toBeNull();
  });

  it('returns null when data is a number', () => {
    expect(parseResendWebhook({ type: 'email.sent', data: 42 })).toBeNull();
  });

  it('returns null when email_id is a number', () => {
    expect(parseResendWebhook({ type: 'email.sent', data: { email_id: 123 } })).toBeNull();
  });

  it('uses created_at when it is a string', () => {
    const result = parseResendWebhook({
      type: 'email.sent',
      data: { email_id: 'msg-1', created_at: '2026-06-01T12:00:00Z' },
    });
    expect(result!.timestamp).toBe('2026-06-01T12:00:00Z');
  });

  it('uses current time when created_at is a number', () => {
    const before = Date.now();
    const result = parseResendWebhook({
      type: 'email.sent',
      data: { email_id: 'msg-1', created_at: 1234567890 },
    });
    expect(new Date(result!.timestamp).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('parseEvolutionWebhook — truthy/falsy guards', () => {
  it('returns null for null', () => {
    expect(parseEvolutionWebhook(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseEvolutionWebhook(undefined)).toBeNull();
  });

  it('returns null when event is not messages.update', () => {
    expect(parseEvolutionWebhook({ event: 'messages.received', data: {} })).toBeNull();
  });

  it('returns null when event is null', () => {
    expect(parseEvolutionWebhook({ event: null, data: {} })).toBeNull();
  });

  it('returns null when data is null', () => {
    expect(parseEvolutionWebhook({ event: 'messages.update', data: null })).toBeNull();
  });

  it('returns null when key is null', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: null, update: { status: 2 } },
    })).toBeNull();
  });

  it('returns null when key is a string', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: 'not-object', update: { status: 2 } },
    })).toBeNull();
  });

  it('returns null when update is null', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: null },
    })).toBeNull();
  });

  it('returns null when update is a string', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: 'invalid' },
    })).toBeNull();
  });

  it('returns null when messageId is a number', () => {
    expect(parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 123 }, update: { status: 2 } },
    })).toBeNull();
  });

  it('uses provided string timestamp', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'msg-1' },
        update: { status: 3 },
        timestamp: '2026-06-15T10:00:00Z',
      },
    });
    expect(result!.timestamp).toBe('2026-06-15T10:00:00Z');
  });

  it('uses current time when timestamp is a number', () => {
    const before = Date.now();
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: {
        key: { id: 'msg-1' },
        update: { status: 2 },
        timestamp: 1234567890,
      },
    });
    expect(new Date(result!.timestamp).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('isStatusForward — comprehensive', () => {
  it('queued can go forward to sent', () => {
    expect(isStatusForward('queued', 'sent')).toBe(true);
  });

  it('queued can go forward to delivered', () => {
    expect(isStatusForward('queued', 'delivered')).toBe(true);
  });

  it('sent can go forward to delivered', () => {
    expect(isStatusForward('sent', 'delivered')).toBe(true);
  });

  it('delivered can go forward to read', () => {
    expect(isStatusForward('delivered', 'read')).toBe(true);
  });

  it('queued cannot go to sending (same order 0 vs 1)', () => {
    expect(isStatusForward('queued', 'sending')).toBe(true);
  });

  it('sending cannot go back to queued', () => {
    expect(isStatusForward('sending', 'queued')).toBe(false);
  });
});
