import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    incr: mockRedisIncr,
    del: mockRedisDel,
  })),
}));

import {
  createShimmedEmailProvider,
  createShimmedWhatsAppProvider,
} from './provider-mode';
import type { EmailProvider, WhatsAppProvider, ProviderSendResult } from './types';

const successResult: ProviderSendResult = {
  provider: 'resend',
  providerMessageId: 'msg-123',
  accepted: true,
  rawStatus: 'accepted',
};

const waSuccessResult: ProviderSendResult = {
  provider: 'evolution_api',
  providerMessageId: 'wa-456',
  accepted: true,
  rawStatus: 'accepted',
};

function makeFakeEmailProvider(): EmailProvider {
  return { send: vi.fn().mockResolvedValue(successResult) };
}

function makeFakeWhatsAppProvider(): WhatsAppProvider {
  return { sendText: vi.fn().mockResolvedValue(waSuccessResult) };
}

const emailInput = {
  eventId: 'evt-1',
  toEmail: 'a@b.com',
  subject: 'Hi',
  htmlBody: '<p>Hello</p>',
  metadata: { 'x-trigger-id': 'trig-1' },
};

const waInput = {
  eventId: 'evt-1',
  toPhoneE164: '+919876543210',
  body: 'Hello via WhatsApp',
  metadata: { 'x-trigger-id': 'trig-2' },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
});

describe('provider-mode shim — email', () => {
  it('normal mode calls real adapter', async () => {
    mockRedisGet.mockResolvedValue(null);
    const real = makeFakeEmailProvider();
    const shimmed = createShimmedEmailProvider(real);

    const result = await shimmed.send(emailInput);

    expect(real.send).toHaveBeenCalledOnce();
    expect(result).toEqual(successResult);
  });

  it('normal mode records sent body to Redis', async () => {
    mockRedisGet.mockResolvedValue('normal');
    const real = makeFakeEmailProvider();
    const shimmed = createShimmedEmailProvider(real);

    await shimmed.send(emailInput);

    expect(mockRedisSet).toHaveBeenCalledWith(
      'test:last-sent:trig-1:email',
      '<p>Hello</p>',
      { ex: 3600 },
    );
  });

  it('fail mode always throws', async () => {
    mockRedisGet.mockResolvedValue('fail');
    const real = makeFakeEmailProvider();
    const shimmed = createShimmedEmailProvider(real);

    await expect(shimmed.send(emailInput)).rejects.toThrow(
      'Provider send failed: simulated failure',
    );
    expect(real.send).not.toHaveBeenCalled();
  });

  it('failN:2 throws twice then succeeds', async () => {
    mockRedisGet.mockResolvedValue('failN:2');
    const real = makeFakeEmailProvider();
    const shimmed = createShimmedEmailProvider(real);

    // Attempt 1 — incr returns 1 (≤ 2) → throw
    mockRedisIncr.mockResolvedValueOnce(1);
    await expect(shimmed.send(emailInput)).rejects.toThrow();

    // Attempt 2 — incr returns 2 (≤ 2) → throw
    mockRedisIncr.mockResolvedValueOnce(2);
    await expect(shimmed.send(emailInput)).rejects.toThrow();

    // Attempt 3 — incr returns 3 (> 2) → call real adapter
    mockRedisIncr.mockResolvedValueOnce(3);
    const result = await shimmed.send(emailInput);

    expect(result).toEqual(successResult);
    expect(real.send).toHaveBeenCalledOnce();
    expect(mockRedisDel).toHaveBeenCalled();
  });

  it('flaky mode throws based on random threshold', async () => {
    mockRedisGet.mockResolvedValue('flaky:1.0'); // 100% fail rate
    const real = makeFakeEmailProvider();
    const shimmed = createShimmedEmailProvider(real);

    await expect(shimmed.send(emailInput)).rejects.toThrow(
      'Provider send failed: simulated failure',
    );
    expect(real.send).not.toHaveBeenCalled();
  });

  it('flaky:0.0 always succeeds', async () => {
    mockRedisGet.mockResolvedValue('flaky:0.0');
    const real = makeFakeEmailProvider();
    const shimmed = createShimmedEmailProvider(real);

    const result = await shimmed.send(emailInput);
    expect(result).toEqual(successResult);
    expect(real.send).toHaveBeenCalledOnce();
  });

  it('no trigger-id metadata skips body recording', async () => {
    mockRedisGet.mockResolvedValue('normal');
    const real = makeFakeEmailProvider();
    const shimmed = createShimmedEmailProvider(real);

    await shimmed.send({ ...emailInput, metadata: undefined });

    expect(real.send).toHaveBeenCalledOnce();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});

describe('provider-mode shim — whatsapp', () => {
  it('normal mode calls real adapter', async () => {
    mockRedisGet.mockResolvedValue(null);
    const real = makeFakeWhatsAppProvider();
    const shimmed = createShimmedWhatsAppProvider(real);

    const result = await shimmed.sendText(waInput);

    expect(real.sendText).toHaveBeenCalledOnce();
    expect(result).toEqual(waSuccessResult);
  });

  it('fail mode always throws for whatsapp', async () => {
    mockRedisGet.mockResolvedValue('fail');
    const real = makeFakeWhatsAppProvider();
    const shimmed = createShimmedWhatsAppProvider(real);

    await expect(shimmed.sendText(waInput)).rejects.toThrow(
      'Provider send failed: simulated failure',
    );
    expect(real.sendText).not.toHaveBeenCalled();
  });

  it('records whatsapp body to Redis', async () => {
    mockRedisGet.mockResolvedValue('normal');
    const real = makeFakeWhatsAppProvider();
    const shimmed = createShimmedWhatsAppProvider(real);

    await shimmed.sendText(waInput);

    expect(mockRedisSet).toHaveBeenCalledWith(
      'test:last-sent:trig-2:whatsapp',
      'Hello via WhatsApp',
      { ex: 3600 },
    );
  });
});
