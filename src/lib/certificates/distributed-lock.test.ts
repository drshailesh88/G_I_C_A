import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildLockKey,
  createStubLock,
  createTestLock,
  type DistributedLock,
  type LockHandle,
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
    const key1 = buildLockKey(EVENT_ID, CERT_TYPE);
    const key2 = buildLockKey('660e8400-e29b-41d4-a716-446655440000', CERT_TYPE);
    expect(key1).not.toBe(key2);
  });

  it('throws when eventId is empty', () => {
    expect(() => buildLockKey('', CERT_TYPE)).toThrow('Invalid eventId');
  });

  it('throws when certificateType is empty', () => {
    expect(() => buildLockKey(EVENT_ID, '')).toThrow('Invalid certificateType');
  });

  it('canonicalizes scope values so whitespace and case cannot bypass the same lock', () => {
    expect(buildLockKey(` ${EVENT_ID.toUpperCase()} `, ' Delegate_Attendance ')).toBe(
      buildLockKey(EVENT_ID, CERT_TYPE),
    );
  });

  it('rejects malformed certificateType values that could alias another lock scope', () => {
    expect(() => buildLockKey(EVENT_ID, 'delegate:attendance')).toThrow('Invalid certificateType');
  });
});

// ── createStubLock ──────────────────────────────────────────
describe('createStubLock', () => {
  let lock: ReturnType<typeof createStubLock>;

  beforeEach(() => {
    lock = createStubLock();
  });

  it('acquires lock and returns handle', async () => {
    const handle = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(handle).not.toBeNull();
    expect(handle!.key).toContain(EVENT_ID);
    expect(handle!.ownerToken).toBeTruthy();
  });

  it('fails to acquire lock when already held', async () => {
    await lock.acquire(EVENT_ID, CERT_TYPE);
    const second = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(second).toBeNull();
  });

  it('releases lock allowing re-acquisition', async () => {
    const handle = await lock.acquire(EVENT_ID, CERT_TYPE);
    await lock.release(handle!);
    const reacquired = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(reacquired).not.toBeNull();
  });

  it('release is safe with stale handle (wrong owner)', async () => {
    const handle = await lock.acquire(EVENT_ID, CERT_TYPE);
    const fakeHandle: LockHandle = { key: handle!.key, ownerToken: 'wrong-token' };
    await lock.release(fakeHandle);
    // Lock should still be held (fake owner can't release)
    const second = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(second).toBeNull();
  });

  it('locks are independent per event/type', async () => {
    await lock.acquire(EVENT_ID, 'delegate_attendance');
    const other = await lock.acquire(EVENT_ID, 'faculty_participation');
    expect(other).not.toBeNull();
  });

  it('treats canonicalized scope variants as the same lock', async () => {
    await lock.acquire(` ${EVENT_ID.toUpperCase()} `, ' Delegate_Attendance ');
    const second = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(second).toBeNull();
  });

  it('tracks held locks in the locks map', async () => {
    const handle = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(lock.locks.size).toBe(1);
    await lock.release(handle!);
    expect(lock.locks.size).toBe(0);
  });

  it('generates unique owner tokens per acquisition', async () => {
    const handle1 = await lock.acquire(EVENT_ID, 'delegate_attendance');
    await lock.release(handle1!);
    const handle2 = await lock.acquire(EVENT_ID, 'delegate_attendance');
    expect(handle1!.ownerToken).not.toBe(handle2!.ownerToken);
  });
});

// ── createTestLock (with mocked Redis) ──────────────────────
describe('createTestLock', () => {
  it('acquires lock via Redis SET NX with owner token', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
    };
    const lock = createTestLock(mockRedis as any);

    const handle = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(handle).not.toBeNull();
    expect(mockRedis.set).toHaveBeenCalledWith(
      `cert:lock:${EVENT_ID}:${CERT_TYPE}`,
      expect.any(String), // UUID owner token
      { nx: true, ex: 600 },
    );
  });

  it('returns null when Redis SET NX returns null (already locked)', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue(null),
      eval: vi.fn(),
    };
    const lock = createTestLock(mockRedis as any);

    const handle = await lock.acquire(EVENT_ID, CERT_TYPE);
    expect(handle).toBeNull();
  });

  it('releases lock via Lua script with owner token', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
    };
    const lock = createTestLock(mockRedis as any);

    const handle = await lock.acquire(EVENT_ID, CERT_TYPE);
    await lock.release(handle!);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call'),
      [handle!.key],
      [handle!.ownerToken],
    );
  });

  it('uses custom TTL when provided', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn(),
    };
    const lock = createTestLock(mockRedis as any);

    await lock.acquire(EVENT_ID, CERT_TYPE, 900);
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { nx: true, ex: 900 },
    );
  });

  it('rejects invalid TTL values before calling Redis SET', async () => {
    const mockRedis = {
      set: vi.fn(),
      eval: vi.fn(),
    };
    const lock = createTestLock(mockRedis as any);

    await expect(lock.acquire(EVENT_ID, CERT_TYPE, 3601)).rejects.toThrow('ttlSeconds');
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('rejects invalid TTL values before calling Redis EVAL during renewal', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn(),
    };
    const lock = createTestLock(mockRedis as any);
    const handle = await lock.acquire(EVENT_ID, CERT_TYPE);

    await expect(lock.renew(handle!, Number.POSITIVE_INFINITY)).rejects.toThrow('ttlSeconds');
    expect(mockRedis.eval).not.toHaveBeenCalled();
  });
});
