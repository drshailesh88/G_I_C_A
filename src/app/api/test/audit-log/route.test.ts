import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSelect, mockFrom, mockWhere, mockLimit, mockClerkGetUserList } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockClerkGetUserList: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock('@/lib/db/schema/audit-log', () => ({
  auditLog: {
    eventId: Symbol('eventId'),
    actorUserId: Symbol('actorUserId'),
    resource: Symbol('resource'),
    resourceId: Symbol('resourceId'),
    meta: Symbol('meta'),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: { getUserList: mockClerkGetUserList },
  }),
}));

vi.mock('../_guard', () => ({
  guard: vi.fn().mockReturnValue(null),
}));

import { GET } from './route';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    eventId: 'evt-aaa',
    actorUserId: 'user_abc',
    action: 'create',
    resource: 'travel',
    resourceId: 'res-111',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    meta: {},
    ...overrides,
  };
}

describe('GET /api/test/audit-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it('filter by event_id returns only matching rows', async () => {
    const row = makeRow({ eventId: 'evt-aaa' });
    mockLimit.mockResolvedValue([row]);

    const req = new NextRequest('http://localhost:4000/api/test/audit-log?event_id=evt-aaa');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].eventId).toBe('evt-aaa');
    expect(mockWhere).toHaveBeenCalled();
  });

  it('filter by actor_username resolves via Clerk lookup', async () => {
    mockClerkGetUserList.mockResolvedValue({
      data: [{ id: 'user_resolved_123' }],
    });
    const row = makeRow({ actorUserId: 'user_resolved_123' });
    mockLimit.mockResolvedValue([row]);

    const req = new NextRequest(
      'http://localhost:4000/api/test/audit-log?actor_username=e2e-super@example.com',
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockClerkGetUserList).toHaveBeenCalledWith(
      expect.objectContaining({ emailAddress: ['e2e-super@example.com'] }),
    );
    expect(body).toHaveLength(1);
    expect(body[0].actorUserId).toBe('user_resolved_123');
  });

  it('filter by actor_username returns 200 empty when user not found', async () => {
    mockClerkGetUserList.mockResolvedValue({ data: [] });

    const req = new NextRequest(
      'http://localhost:4000/api/test/audit-log?actor_username=nonexistent@example.com',
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('filter by cert_id matches resource_id or meta cert_id', async () => {
    const row = makeRow({ resource: 'certificate', resourceId: 'cert-999' });
    mockLimit.mockResolvedValue([row]);

    const req = new NextRequest(
      'http://localhost:4000/api/test/audit-log?cert_id=cert-999',
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockWhere).toHaveBeenCalled();
  });

  it('no filters returns capped result (max 200)', async () => {
    mockLimit.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:4000/api/test/audit-log');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockLimit).toHaveBeenCalledWith(200);
  });

  it('returns camelCase field names', async () => {
    const row = makeRow();
    mockLimit.mockResolvedValue([row]);

    const req = new NextRequest('http://localhost:4000/api/test/audit-log?event_id=evt-aaa');
    const res = await GET(req);
    const body = await res.json();

    expect(body[0]).toHaveProperty('eventId');
    expect(body[0]).toHaveProperty('actorUserId');
    expect(body[0]).toHaveProperty('resourceId');
    expect(body[0]).not.toHaveProperty('event_id');
    expect(body[0]).not.toHaveProperty('actor_user_id');
  });
});
