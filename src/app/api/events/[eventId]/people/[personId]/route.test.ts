import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  EventNotFoundError,
  mockAssertEventAccess,
  mockDb,
  getSelectResults,
  setSelectResults,
  resetSelectIndex,
} = vi.hoisted(() => {
  class EventNotFoundError extends Error {
    constructor(msg = 'Not found') {
      super(msg);
      this.name = 'EventNotFoundError';
    }
  }
  const mockAssertEventAccess = vi.fn();

  let _selectResults: unknown[][] = [];
  let _selectCallIndex = 0;

  function createChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.from = vi.fn(self);
    chain.where = vi.fn(() => {
      const result = _selectResults[_selectCallIndex] ?? [];
      _selectCallIndex++;
      const resolvedChain = createChain();
      resolvedChain.then = (resolve: (v: unknown) => unknown) => resolve(result);
      resolvedChain.limit = vi.fn(() => result);
      return resolvedChain;
    });
    chain.innerJoin = vi.fn(self);
    chain.leftJoin = vi.fn(self);
    chain.limit = vi.fn(() => _selectResults[_selectCallIndex++] ?? []);
    return chain;
  }

  const mockChain = createChain();
  const mockDb = { select: vi.fn(() => mockChain) };

  return {
    EventNotFoundError,
    mockAssertEventAccess,
    mockDb,
    getSelectResults: () => _selectResults,
    setSelectResults: (r: unknown[][]) => { _selectResults = r; },
    resetSelectIndex: () => { _selectCallIndex = 0; },
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

const EVENT_A = '11111111-1111-1111-1111-111111111111';
const PERSON_ID = '33333333-3333-3333-3333-333333333333';

function buildRequest(eventId: string, personId: string) {
  const request = new Request(`http://localhost:4000/api/events/${eventId}/people/${personId}`);
  return { request, params: Promise.resolve({ eventId, personId }) };
}

describe('GET /api/events/[eventId]/people/[personId]', () => {
  beforeEach(() => {
    setSelectResults([]);
    resetSelectIndex();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:event_coordinator' });
  });

  it('returns 400 for invalid eventId', async () => {
    const { request, params } = buildRequest('not-a-uuid', PERSON_ID);
    const res = await GET(request, { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid personId', async () => {
    const { request, params } = buildRequest(EVENT_A, 'not-a-uuid');
    const res = await GET(request, { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 (cross-event) when assertEventAccess throws EventNotFoundError', async () => {
    mockAssertEventAccess.mockRejectedValue(new EventNotFoundError());
    const { request, params } = buildRequest(EVENT_A, PERSON_ID);
    const res = await GET(request, { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when assertEventAccess throws generic error', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('forbidden'));
    const { request, params } = buildRequest(EVENT_A, PERSON_ID);
    const res = await GET(request, { params });
    expect(res.status).toBe(403);
  });

  it('returns 404 when person not attached to event (no event_people row)', async () => {
    setSelectResults([
      [], // event_people: empty
    ]);
    const { request, params } = buildRequest(EVENT_A, PERSON_ID);
    const res = await GET(request, { params });
    expect(res.status).toBe(404);
  });

  it('travel filtered by eventId — person shared across A+B returns only A row', async () => {
    const travelA = { id: 'travel-a', eventId: EVENT_A, personId: PERSON_ID, direction: 'inbound' };

    setSelectResults([
      [{ id: 'ep-1', eventId: EVENT_A, personId: PERSON_ID }], // event_people
      [{ id: PERSON_ID, fullName: 'Test Person', email: 'test@example.com', phoneE164: '+911234567890', designation: 'Dr', salutation: null, specialty: null, organization: null, city: null }], // person
      [travelA], // travel (eventId-filtered)
      [], // sessions
      [], // registration
    ]);

    const { request, params } = buildRequest(EVENT_A, PERSON_ID);
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.person.id).toBe(PERSON_ID);
    expect(body.person.full_name).toBe('Test Person');
    expect(body.travel).toEqual([travelA]);
    expect(body.sessions).toEqual([]);
    expect(body.registration).toBeNull();
  });

  it('returns 200 with full person + event-scoped attributes', async () => {
    const registration = {
      id: 'reg-1', eventId: EVENT_A, personId: PERSON_ID,
      category: 'delegate', status: 'confirmed',
    };
    const session = {
      id: 'sa-1', eventId: EVENT_A, personId: PERSON_ID,
      sessionId: 'sess-1', role: 'speaker',
    };

    setSelectResults([
      [{ id: 'ep-1', eventId: EVENT_A, personId: PERSON_ID }], // event_people
      [{ id: PERSON_ID, fullName: 'Full Person', email: 'full@test.com', phoneE164: '+919876543210', designation: 'Prof', salutation: 'Prof', specialty: 'Cardiology', organization: 'AIIMS', city: 'Delhi' }],
      [], // travel
      [session], // sessions
      [registration], // registration
    ]);

    const { request, params } = buildRequest(EVENT_A, PERSON_ID);
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.person.full_name).toBe('Full Person');
    expect(body.person.email).toBe('full@test.com');
    expect(body.person.phone_e164).toBe('+919876543210');
    expect(body.sessions).toEqual([session]);
    expect(body.registration).toEqual(registration);
  });
});
