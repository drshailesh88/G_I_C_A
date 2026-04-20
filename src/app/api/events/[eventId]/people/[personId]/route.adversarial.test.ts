import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  EventNotFoundError,
  mockAssertEventAccess,
  mockDb,
  resetSelectResults,
  setSelectResults,
} = vi.hoisted(() => {
  class EventNotFoundError extends Error {
    constructor(message = 'Not found') {
      super(message);
      this.name = 'EventNotFoundError';
    }
  }

  const mockAssertEventAccess = vi.fn();
  let selectResults: unknown[][] = [];
  let selectIndex = 0;

  function createChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.from = vi.fn(self);
    chain.where = vi.fn(() => {
      const result = selectResults[selectIndex] ?? [];
      selectIndex += 1;
      const resolvedChain = createChain();
      resolvedChain.then = (resolve: (value: unknown) => unknown) => resolve(result);
      resolvedChain.limit = vi.fn(() => result);
      return resolvedChain;
    });
    chain.innerJoin = vi.fn(self);
    chain.leftJoin = vi.fn(self);
    chain.limit = vi.fn(() => selectResults[selectIndex++] ?? []);
    return chain;
  }

  return {
    EventNotFoundError,
    mockAssertEventAccess,
    mockDb: {
      select: vi.fn(() => createChain()),
    },
    resetSelectResults: () => {
      selectResults = [];
      selectIndex = 0;
    },
    setSelectResults: (rows: unknown[][]) => {
      selectResults = rows;
      selectIndex = 0;
    },
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
  EventNotFoundError,
}));

vi.mock('@/lib/auth/sanitize-cross-event-404', () => ({
  crossEvent404Response: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn(),
}));

import { GET } from './route';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const PERSON_ID = '33333333-3333-3333-3333-333333333333';

function makeParams() {
  return {
    params: Promise.resolve({ eventId: EVENT_ID, personId: PERSON_ID }),
  };
}

describe('GET /api/events/[eventId]/people/[personId] adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectResults();
    mockAssertEventAccess.mockResolvedValue({ userId: 'ops-1', role: 'org:ops' });
  });

  it('should reject ops users before reading per-person event data', async () => {
    setSelectResults([
      [{ id: 'ep-1', eventId: EVENT_ID, personId: PERSON_ID }],
      [{ id: PERSON_ID, fullName: 'Dr. Outside Scope', email: 'outside@example.com', phoneE164: '+919876543210' }],
      [{ id: 'travel-1', eventId: EVENT_ID, personId: PERSON_ID }],
      [{ id: 'session-1', eventId: EVENT_ID, personId: PERSON_ID }],
      [{ id: 'reg-1', eventId: EVENT_ID, personId: PERSON_ID }],
    ]);

    const res = await GET(
      new Request(`http://localhost:4000/api/events/${EVENT_ID}/people/${PERSON_ID}`),
      makeParams(),
    );

    // BUG: the route relies on assertEventAccess only, so org:ops can read people-module PII.
    expect(res.status).toBe(403);
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
