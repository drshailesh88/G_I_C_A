import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert, mockValues } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  auditLog: Symbol('auditLog'),
}));

import { writeAudit } from './write';
import { auditLog } from '@/lib/db/schema';

describe('writeAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('inserts a row with all fields', async () => {
    const params = {
      actorUserId: 'user_abc123',
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'create' as const,
      resource: 'travel',
      resourceId: '660e8400-e29b-41d4-a716-446655440001',
      meta: { oldStatus: 'draft', newStatus: 'confirmed' },
    };

    await writeAudit(params);

    expect(mockInsert).toHaveBeenCalledWith(auditLog);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user_abc123',
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'create',
        resource: 'travel',
        resourceId: '660e8400-e29b-41d4-a716-446655440001',
        meta: { oldStatus: 'draft', newStatus: 'confirmed' },
      }),
    );
  });

  it('inserts with nullable eventId (cross-event reads)', async () => {
    const params = {
      actorUserId: 'user_super',
      eventId: null,
      action: 'read' as const,
      resource: 'people',
      resourceId: '770e8400-e29b-41d4-a716-446655440002',
      meta: {},
    };

    await writeAudit(params);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: null,
        action: 'read',
        resource: 'people',
      }),
    );
  });

  it('inserts with no meta (defaults to empty object)', async () => {
    const params = {
      actorUserId: 'user_xyz',
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      action: 'delete' as const,
      resource: 'certificate',
      resourceId: '880e8400-e29b-41d4-a716-446655440003',
    };

    await writeAudit(params);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: {},
      }),
    );
  });
});
