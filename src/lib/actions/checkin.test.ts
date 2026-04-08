import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { processQrScan, processManualCheckIn } from './checkin';

// ── Chain helpers ─────────────────────────────────────────────
let selectCallCount = 0;
function chainedSelectSequence(calls: unknown[][]) {
  selectCallCount = 0;
  mockDb.select.mockImplementation(() => {
    const rows = calls[selectCallCount] || [];
    selectCallCount++;
    const chain: any = {
      from: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
      then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  });
}

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const REG_ID = '550e8400-e29b-41d4-a716-446655440002';
const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
});

// ── processQrScan ────────────────────────────────────────────
describe('processQrScan', () => {
  const validCompactPayload = `${EVENT_ID}:${TOKEN}`;

  it('successfully checks in a confirmed registration', async () => {
    // Call 1: registration lookup, Call 2: person lookup, Call 3: existing attendance
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [], // no existing attendance
    ]);
    chainedInsert([{ id: 'new-attendance-id' }]);

    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(result.type).toBe('success');
    expect(result.personName).toBe('Dr. Sharma');
    expect(result.registrationNumber).toBe('GEM-DEL-00001');
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/qr`);
  });

  it('returns invalid for unparseable QR payload', async () => {
    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: 'garbage-data',
    });

    expect(result.type).toBe('invalid');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns invalid when event ID does not match', async () => {
    const differentEventId = '550e8400-e29b-41d4-a716-446655440099';
    const payload = `${differentEventId}:${TOKEN}`;

    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: payload,
    });

    expect(result.type).toBe('invalid');
    expect(result.message).toContain('different event');
  });

  it('returns invalid when registration not found', async () => {
    chainedSelectSequence([
      [], // no registration
    ]);

    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(result.type).toBe('invalid');
    expect(result.message).toContain('No matching registration');
  });

  it('returns duplicate when already checked in', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [{ id: 'existing-attendance-id' }], // already checked in
    ]);

    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(result.type).toBe('duplicate');
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns ineligible for pending registration', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'pending', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [], // no existing attendance
    ]);

    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(result.type).toBe('ineligible');
    expect(result.message).toContain('pending');
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('returns ineligible for cancelled registration', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: new Date(), registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);

    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(result.type).toBe('ineligible');
    expect(result.message).toContain('cancelled');
  });

  it('requires write access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    })).rejects.toThrow('Forbidden');
  });

  it('validates input with Zod', async () => {
    await expect(processQrScan(EVENT_ID, {
      eventId: 'not-a-uuid',
      qrPayload: '',
    })).rejects.toThrow();
  });

  it('passes deviceId to attendance record on success', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
      deviceId: 'ipad-crew-1',
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ offlineDeviceId: 'ipad-crew-1' }),
    );
  });

  it('handles missing person gracefully', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [], // person not found
      [],
    ]);
    chainedInsert([{ id: 'new-id' }]);

    const result = await processQrScan(EVENT_ID, {
      eventId: EVENT_ID,
      qrPayload: validCompactPayload,
    });

    expect(result.type).toBe('success');
    expect(result.personName).toBe('Unknown');
  });
});

// ── processManualCheckIn ─────────────────────────────────────
describe('processManualCheckIn', () => {
  it('successfully checks in by registration ID', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    chainedInsert([{ id: 'new-attendance-id' }]);

    const result = await processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
    });

    expect(result.type).toBe('success');
    expect(result.personName).toBe('Dr. Sharma');
  });

  it('returns invalid for missing registration', async () => {
    chainedSelectSequence([[]]);

    const result = await processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
    });

    expect(result.type).toBe('invalid');
    expect(result.message).toContain('Registration not found');
  });

  it('returns duplicate for already checked-in', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [{ id: 'existing-id' }],
    ]);

    const result = await processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
    });

    expect(result.type).toBe('duplicate');
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('uses manual_search as check-in method', async () => {
    chainedSelectSequence([
      [{ id: REG_ID, personId: PERSON_ID, status: 'confirmed', cancelledAt: null, registrationNumber: 'GEM-DEL-00001', category: 'delegate' }],
      [{ fullName: 'Dr. Sharma' }],
      [],
    ]);
    const insertChain = chainedInsert([{ id: 'new-id' }]);

    await processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ checkInMethod: 'manual_search' }),
    );
  });

  it('requires write access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(processManualCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      registrationId: REG_ID,
    })).rejects.toThrow('Forbidden');
  });
});
