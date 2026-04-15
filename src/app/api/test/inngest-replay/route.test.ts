import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../_guard', () => ({ guard: () => null }));

const mockGetCapturedEvent = vi.fn();
vi.mock('@/lib/inngest/captured-events', () => ({
  getCapturedEvent: (...args: unknown[]) => mockGetCapturedEvent(...args),
}));

const mockSend = vi.fn();
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockSend(...args) },
}));

import { POST } from './route';

describe('POST /api/test/inngest-replay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replays a captured event via inngest.send', async () => {
    const captured = {
      id: 'evt-123',
      name: 'conference/travel.saved',
      data: { eventId: 'e1', actor: { type: 'system', id: 's' }, payload: {} },
      timestamp: '2026-04-15T00:00:00Z',
    };
    mockGetCapturedEvent.mockResolvedValue(captured);
    mockSend.mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/test/inngest-replay', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'evt-123' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(mockSend).toHaveBeenCalledWith({
      id: 'evt-123',
      name: 'conference/travel.saved',
      data: captured.data,
    });
    expect(body.ok).toBe(true);
    expect(body.replayed.id).toBe('evt-123');
  });

  it('returns 404 when event not found', async () => {
    mockGetCapturedEvent.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/test/inngest-replay', {
      method: 'POST',
      body: JSON.stringify({ eventId: 'nonexistent' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 when eventId missing', async () => {
    const req = new NextRequest('http://localhost/api/test/inngest-replay', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
