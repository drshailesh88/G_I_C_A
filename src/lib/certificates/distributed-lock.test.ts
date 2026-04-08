import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildLockKey,
  createStubLock,
  createTestLock,
  type DistributedLock,
} from './distributed-lock';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CERT_TYPE = 'delegate_attendance';

// ── buildLockKey ────────────────────────────────────────────
describe('buildLockKey', () => {
  it('builds key with prefix, eventId, and certificateType', () => {
    const key = buildLockKey(EVENT_ID, CERT_TYPE);
    expect(key).toBe(`cert:lock:${EVENT_ID}:${CERT_TYPE}`);
  });

  it('produces different keys for different types', () => {
    const key1 = buildLockKey(EVENT_ID, 'delegate_attendance');
    const key2 = buildLockKey(EVENT_ID, 'faculty_participation');
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for different events', () => {
    const key1 = buildLockKey('event-1', CERT_TYPE);
    const key2 = buildLockKey('event-2', CERT_TYPE);
    expect(key1).not.toBe(key2);
  });
});

// ── createStubLock ──────────────────────────────────────────
describe('createStubLock', () => {
  let lock: ReturnType<typeof createStubLock>;

  beforeEach(() => {
    lock = createStubLock();
  });

  it('acquires lock when not held', async () => {
    const acquired = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(acquired).toBe(true);
  });

  it('fails to acquire lock when already held', async () => {
    await lock.acquire(EVENT_ID, CERT_TYPE);
    const second = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(second).toBe(false);
  });

  it('releases lock allowing re-acquisition', async () => {
    await lock.acquire(EVENT_ID, CERT_TYPE);
    await lock.release(EVENT_ID, CERT_TYPE);
    const reacquired = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(reacquired).toBe(true);
  });

  it('release is safe when lock is not held', async () => {
    await expect(lock.release(EVENT_ID, CERT_TYPE)).resolves.toBeUndefined();
  });

  it('locks are independent per event/type', async () => {
    await lock.acquire(EVENT_ID, 'delegate_attendance');
    const other = await lock.acquire(EVENT_ID, 'faculty_participation');
    expect(other).toBe(true);
  });

  it('tracks held locks in the locks set', async () => {
    await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(lock.locks.size).toBe(1);
    await lock.release(EVENT_ID, CERT_TYPE);
    expect(lock.locks.size).toBe(0);
  });
});

// ── createTestLock (with mocked Redis) ──────────────────────
describe('createTestLock', () => {
  it('acquires lock via Redis SET NX', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };
    const lock = createTestLock(mockRedis as any);

    const acquired = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(acquired).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `cert:lock:${EVENT_ID}:${CERT_TYPE}`,
      '1',
      { nx: true, ex: 300 },
    );
  });

  it('returns false when Redis SET NX returns null (already locked)', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue(null),
      del: vi.fn(),
    };
    const lock = createTestLock(mockRedis as any);

    const acquired = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(acquired).toBe(false);
  });

  it('releases lock via Redis DEL', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };
    const lock = createTestLock(mockRedis as any);

    await lock.release(EVENT_ID, CERT_TYPE);
    expect(mockRedis.del).toHaveBeenCalledWith(`cert:lock:${EVENT_ID}:${CERT_TYPE}`);
  });

  it('uses custom TTL when provided', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn(),
    };
    const lock = createTestLock(mockRedis as any);

    await lock.acquire(EVENT_ID, CERT_TYPE, 600);
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.any(String),
      '1',
      { nx: true, ex: 600 },
    );
  });
});
