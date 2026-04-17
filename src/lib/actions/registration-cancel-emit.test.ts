import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuth,
  mockDb,
  mockRevalidatePath,
  mockAssertEventAccess,
  mockEmitCascadeEvent,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockEmitCascadeEvent: vi.fn().mockResolvedValue({ handlersRun: 1, errors: [] }),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/cascade/emit', () => ({ emitCascadeEvent: mockEmitCascadeEvent }));
vi.mock('@/lib/cascade/events', () => ({
  CASCADE_EVENTS: {
    REGISTRATION_CANCELLED: 'conference/registration.cancelled',
  },
}));
vi.mock('@/lib/flags', () => ({ isRegistrationOpen: vi.fn().mockResolvedValue(true) }));
vi.mock('./person', () => ({ findDuplicatePerson: vi.fn() }));

import { updateRegistrationStatus } from './registration';

const EVENT_UUID = '550e8400-e29b-41d4-a716-446655440099';
const REG_UUID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_UUID = '660e8400-e29b-41d4-a716-446655440001';

function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function chainedUpdate(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

describe('updateRegistrationStatus — cancellation cascade emit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'admin-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'admin-1', role: 'org:super_admin' });
  });

  it('emits REGISTRATION_CANCELLED cascade event when status transitions to cancelled', async () => {
    const reg = {
      id: REG_UUID,
      eventId: EVENT_UUID,
      personId: PERSON_UUID,
      status: 'confirmed',
      updatedAt: null,
    };
    chainedSelect([reg]);
    const updated = { ...reg, status: 'cancelled', cancelledAt: new Date() };
    chainedUpdate([updated]);

    await updateRegistrationStatus({
      eventId: EVENT_UUID,
      registrationId: REG_UUID,
      newStatus: 'cancelled',
    });

    expect(mockEmitCascadeEvent).toHaveBeenCalledOnce();
    const [eventName, eventId, actor, payload] = mockEmitCascadeEvent.mock.calls[0];
    expect(eventName).toBe('conference/registration.cancelled');
    expect(eventId).toBe(EVENT_UUID);
    expect(actor).toEqual({ type: 'user', id: 'admin-1' });
    expect(payload).toMatchObject({
      registrationId: REG_UUID,
      personId: PERSON_UUID,
      eventId: EVENT_UUID,
    });
    expect(typeof payload.cancelledAt).toBe('string');
  });

  it('does NOT emit cascade event for non-cancellation transitions', async () => {
    const reg = {
      id: REG_UUID,
      eventId: EVENT_UUID,
      personId: PERSON_UUID,
      status: 'pending',
      updatedAt: null,
    };
    chainedSelect([reg]);
    chainedUpdate([{ ...reg, status: 'confirmed' }]);

    await updateRegistrationStatus({
      eventId: EVENT_UUID,
      registrationId: REG_UUID,
      newStatus: 'confirmed',
    });

    expect(mockEmitCascadeEvent).not.toHaveBeenCalled();
  });

  it('does NOT emit cascade event when the update fails (stale conflict)', async () => {
    const reg = {
      id: REG_UUID,
      eventId: EVENT_UUID,
      personId: PERSON_UUID,
      status: 'confirmed',
      updatedAt: new Date('2026-04-17T09:30:00.000Z'),
    };
    chainedSelect([reg]);
    chainedUpdate([]);

    await expect(
      updateRegistrationStatus({
        eventId: EVENT_UUID,
        registrationId: REG_UUID,
        newStatus: 'cancelled',
      }),
    ).rejects.toThrow('Registration was modified by another request');

    expect(mockEmitCascadeEvent).not.toHaveBeenCalled();
  });
});
