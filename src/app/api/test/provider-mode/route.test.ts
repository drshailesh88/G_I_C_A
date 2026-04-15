import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockRedisSet,
    del: mockRedisDel,
  })),
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new Request('http://localhost:4000/api/test/provider-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
});

describe('POST /api/test/provider-mode', () => {
  it('sets email fail mode in Redis', async () => {
    const res = await POST(makeRequest({ channel: 'email', mode: 'fail' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ channel: 'email', mode: 'fail', status: 'set' });
    expect(mockRedisSet).toHaveBeenCalledWith(
      'test:provider-mode:email',
      'fail',
      { ex: 3600 },
    );
    expect(mockRedisDel).toHaveBeenCalledWith(
      'test:provider-mode-attempts:email',
    );
  });

  it('sets whatsapp failN:3 mode', async () => {
    const res = await POST(
      makeRequest({ channel: 'whatsapp', mode: 'failN:3' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.channel).toBe('whatsapp');
    expect(json.mode).toBe('failN:3');
  });

  it('rejects invalid channel', async () => {
    const res = await POST(makeRequest({ channel: 'sms', mode: 'fail' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid mode', async () => {
    const res = await POST(
      makeRequest({ channel: 'email', mode: 'invalid-mode' }),
    );
    expect(res.status).toBe(400);
  });

  it('resets attempt counter on mode change', async () => {
    await POST(makeRequest({ channel: 'email', mode: 'failN:2' }));
    expect(mockRedisDel).toHaveBeenCalledWith(
      'test:provider-mode-attempts:email',
    );
  });

  it('returns 503 when Redis not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL_TEST;
    delete process.env.UPSTASH_REDIS_REST_TOKEN_TEST;
    const res = await POST(makeRequest({ channel: 'email', mode: 'normal' }));
    expect(res.status).toBe(503);
  });
});
