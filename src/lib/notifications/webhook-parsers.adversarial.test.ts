import { describe, expect, it } from 'vitest';

import { parseEvolutionWebhook, parseResendWebhook } from './webhook-parsers';

describe('webhook-parsers adversarial hardening', () => {
  it('rejects Resend event types that only resolve through the registry prototype chain', () => {
    expect(
      parseResendWebhook({
        type: '__proto__',
        data: { email_id: 'msg-1', created_at: '2026-04-18T12:00:00Z' },
      }),
    ).toBeNull();
  });

  it('rejects Resend payload fields supplied only through the payload prototype chain', () => {
    const payload = Object.create({
      type: 'email.sent',
      data: Object.create({
        email_id: 'msg-2',
        created_at: '2026-04-18T12:05:00Z',
      }),
    });

    expect(parseResendWebhook(payload)).toBeNull();
  });

  it('rejects Evolution payload fields supplied only through the payload prototype chain', () => {
    const payload = Object.create({
      event: 'messages.update',
      data: Object.create({
        key: Object.create({ id: 'wa-msg-1' }),
        update: Object.create({ status: 3 }),
        timestamp: '2026-04-18T12:10:00Z',
      }),
    });

    expect(parseEvolutionWebhook(payload)).toBeNull();
  });
});
