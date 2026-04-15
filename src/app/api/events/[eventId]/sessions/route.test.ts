import { describe, it, expect, vi, beforeEach } from 'vitest';

const { EventNotFoundError, mockAssertEventAccess } = vi.hoisted(() => {
  class EventNotFoundError extends Error {
    constructor() {
      super('Not found');
      this.name = 'EventNotFoundError';
    }
  }
  return {
    EventNotFoundError,
    mockAssertEventAccess: vi.fn(),
  };
});

const { EventIdMismatchError } = vi.hoisted(() => {
  class EventIdMismatchError extends Error {
    constructor() {
      super('eventId mismatch');
      this.name = 'EventIdMismatchError';
    }
  }
  return { EventIdMismatchError };
});

const mockAssertEventIdMatch = vi.hoisted(() => vi.fn());

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return { values: (...vArgs: unknown[]) => {
        mockValues(...vArgs);
        return { returning: () => {
          mockReturning();
          return [{ id: 'new-session-id' }];
        }};
      }};
    },
  },
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  EventNotFoundError,
}));

vi.mock('@/lib/auth/event-id-mismatch', () => ({
  assertEventIdMatch: mockAssertEventIdMatch,
  EventIdMismatchError,
}));

vi.mock('@/lib/auth/sanitize-cross-event-404', () => ({
  crossEvent404Response: () =>
    new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/db/schema/program', () => ({
  sessions: 'sessions-table',
}));

import { POST } from './route';

const EVENT_A = '11111111-1111-1111-1111-111111111111';
const EVENT_B = '22222222-2222-2222-2222-222222222222';

function makeRequest(body: unknown) {
  return new Request('http://localhost:4000/api/events/' + EVENT_A + '/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

describe('POST /api/events/[eventId]/sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAssertEventAccess.mockResolvedValue({
      userId: 'user-1',
      role: 'org:event_coordinator',
    });
  });

  it('rejects missing title with 400', async () => {
    const res = await POST(
      makeRequest({ starts_at: '2026-05-01T09:00:00Z', ends_at: '2026-05-01T10:00:00Z' }),
      makeParams(EVENT_A),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('validation_failed');
  });

  it('returns 201 with id on valid create', async () => {
    const res = await POST(
      makeRequest({
        title: 'Keynote Address',
        starts_at: '2026-05-01T09:00:00Z',
        ends_at: '2026-05-01T10:00:00Z',
      }),
      makeParams(EVENT_A),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('new-session-id');
  });

  it('returns 400 on eventId mismatch', async () => {
    mockAssertEventIdMatch.mockImplementation(() => {
      throw new EventIdMismatchError();
    });

    const res = await POST(
      makeRequest({
        title: 'Keynote',
        starts_at: '2026-05-01T09:00:00Z',
        ends_at: '2026-05-01T10:00:00Z',
        event_id: EVENT_B,
      }),
      makeParams(EVENT_A),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('eventId mismatch');
  });

  it('returns 404 for cross-event access', async () => {
    mockAssertEventAccess.mockRejectedValue(new EventNotFoundError());

    const res = await POST(
      makeRequest({ title: 'Keynote' }),
      makeParams(EVENT_B),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not Found');
  });

  it('returns 400 for invalid eventId param', async () => {
    const res = await POST(
      makeRequest({ title: 'Keynote' }),
      makeParams('not-a-uuid'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 for unauthorized role', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('forbidden'));

    const res = await POST(
      makeRequest({ title: 'Keynote' }),
      makeParams(EVENT_A),
    );
    expect(res.status).toBe(403);
  });

  it('inserts with createdBy/updatedBy from session user', async () => {
    const res = await POST(
      makeRequest({
        title: 'Panel Discussion',
        starts_at: '2026-05-01T11:00:00Z',
        ends_at: '2026-05-01T12:00:00Z',
        hall_id: '33333333-3333-3333-3333-333333333333',
        session_type: 'panel',
      }),
      makeParams(EVENT_A),
    );
    expect(res.status).toBe(201);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT_A,
        title: 'Panel Discussion',
        createdBy: 'user-1',
        updatedBy: 'user-1',
      }),
    );
  });
});
