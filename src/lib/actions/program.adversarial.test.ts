import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: vi.fn(),
}));

vi.mock('@/lib/validations/registration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validations/registration')>();
  return {
    ...actual,
    generateQrToken: vi.fn().mockReturnValue('qr-token-deterministic'),
  };
});

import { updateFacultyInviteStatus } from './program';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';
const INVITE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_TOKEN = 'test-token-fa004';

function makeInvite(status: string) {
  return {
    id: INVITE_ID,
    eventId: EVENT_ID,
    personId: PERSON_ID,
    status,
    token: VALID_TOKEN,
    updatedAt: new Date('2026-04-17T10:00:00Z'),
  };
}

function makeEvent() {
  return { id: EVENT_ID, slug: 'gem2026-del' };
}

function makeRegistration(status: string) {
  return {
    id: 'reg-001',
    eventId: EVENT_ID,
    personId: PERSON_ID,
    status,
    registrationNumber: 'GEM2026DEL-FAC-00001',
  };
}

function setupSelectSequence(...responses: unknown[][]) {
  let call = 0;
  mockDb.select.mockImplementation(() => {
    const rows = responses[Math.min(call++, responses.length - 1)];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() => Object.assign(Promise.resolve(rows), chain));
    chain.limit = vi.fn().mockResolvedValue(rows);
    return chain;
  });
}

function setupUpdateOnce(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValueOnce(chain);
  return chain;
}

function setupInsertOnce() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValueOnce(chain);
  return chain;
}

describe('updateFacultyInviteStatus adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should confirm an existing cancelled registration when the invite is accepted', async () => {
    setupSelectSequence(
      [makeInvite('opened')],
      [makeEvent()],
      [makeRegistration('cancelled')],
    );
    setupUpdateOnce([{ ...makeInvite('accepted'), status: 'accepted' }]);
    const registrationUpdate = setupUpdateOnce([{ ...makeRegistration('cancelled'), status: 'confirmed' }]);
    setupInsertOnce();

    // BUG: accepting an invite leaves cancelled registrations cancelled instead of restoring them to confirmed.
    await updateFacultyInviteStatus(EVENT_ID, {
      inviteId: INVITE_ID,
      newStatus: 'accepted',
      token: VALID_TOKEN,
    });

    expect(registrationUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'confirmed',
        updatedBy: 'system:faculty-accept',
      }),
    );
  });
});
