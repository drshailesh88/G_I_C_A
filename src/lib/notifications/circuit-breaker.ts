/**
 * Circuit Breaker — Redis-backed
 *
 * Tracks consecutive failures per provider. After FAILURE_THRESHOLD consecutive
 * failures the circuit opens and rejects all new sends immediately with
 * CIRCUIT_OPEN. After OPEN_DURATION_MS the circuit enters half-open state
 * and allows one probe request through (via SET NX lock). If the probe
 * succeeds the circuit resets; if it fails the circuit returns to open.
 *
 * Redis keys per provider:
 *   notif:circuit:{provider}:failures  — atomic counter (INCR)
 *   notif:circuit:{provider}:opened    — timestamp when circuit opened
 *   notif:circuit:{provider}:probe     — SET NX lock for single half-open probe
 */

import { Redis } from '@upstash/redis';

const KEY_PREFIX = 'notif:circuit:';
const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 60_000; // 60 seconds
const KEY_TTL_SECONDS = 300;     // 5-minute TTL for auto-cleanup

export type CircuitState = 'closed' | 'open' | 'half-open';

export type CircuitStatus = {
  state: CircuitState;
  failures: number;
  openedAt: number | null;
};

export class CircuitOpenError extends Error {
  constructor(provider: string) {
    super(`Circuit breaker is open for provider "${provider}"`);
    this.name = 'CircuitOpenError';
  }
}

export interface CircuitBreakerService {
  checkCircuit(provider: string): Promise<CircuitState>;
  recordSuccess(provider: string): Promise<void>;
  recordFailure(provider: string): Promise<void>;
  getStatus(provider: string): Promise<CircuitStatus>;
}

function failuresKey(provider: string): string {
  return `${KEY_PREFIX}${provider}:failures`;
}
function openedKey(provider: string): string {
  return `${KEY_PREFIX}${provider}:opened`;
}
function probeKey(provider: string): string {
  return `${KEY_PREFIX}${provider}:probe`;
}

export function createCircuitBreaker(redis: Redis): CircuitBreakerService {
  return {
    async checkCircuit(provider: string): Promise<CircuitState> {
      const failures = (await redis.get<number>(failuresKey(provider))) ?? 0;

      if (failures < FAILURE_THRESHOLD) {
        return 'closed';
      }

      // Circuit has reached threshold — check if cooldown has elapsed
      const opened = await redis.get<number>(openedKey(provider));
      if (opened !== null) {
        const elapsed = Date.now() - opened;
        if (elapsed >= OPEN_DURATION_MS) {
          // Try to claim the probe slot — only one caller wins
          const claimed = await redis.set(probeKey(provider), '1', {
            nx: true,
            ex: 60, // probe lock expires after 60s
          });
          if (claimed !== null) {
            return 'half-open';
          }
          // Another caller already claimed the probe — circuit stays open for us
        }
      }

      throw new CircuitOpenError(provider);
    },

    async recordSuccess(provider: string): Promise<void> {
      // Reset the circuit completely — delete all keys
      await Promise.all([
        redis.del(failuresKey(provider)),
        redis.del(openedKey(provider)),
        redis.del(probeKey(provider)),
      ]);
    },

    async recordFailure(provider: string): Promise<void> {
      // Atomic increment — no read-modify-write race
      const newCount = await redis.incr(failuresKey(provider));
      // Set TTL on the failures key so stale breakers auto-clear
      await redis.expire(failuresKey(provider), KEY_TTL_SECONDS);

      if (newCount >= FAILURE_THRESHOLD) {
        // Set/refresh openedAt to (re)start the cooldown window
        await redis.set(openedKey(provider), Date.now(), { ex: KEY_TTL_SECONDS });
        // Clear any existing probe lock so a new probe window starts
        await redis.del(probeKey(provider));
      }
    },

    async getStatus(provider: string): Promise<CircuitStatus> {
      const failures = (await redis.get<number>(failuresKey(provider))) ?? 0;
      const opened = await redis.get<number>(openedKey(provider));

      let state: CircuitState = 'closed';
      if (failures >= FAILURE_THRESHOLD) {
        if (opened !== null && (Date.now() - opened) >= OPEN_DURATION_MS) {
          state = 'half-open';
        } else {
          state = 'open';
        }
      }

      return { state, failures, openedAt: opened };
    },
  };
}

/** Default circuit breaker using environment Redis. Lazy-initialized. */
let _defaultBreaker: CircuitBreakerService | null = null;

export function getDefaultCircuitBreaker(): CircuitBreakerService {
  if (!_defaultBreaker) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set for circuit breaker',
      );
    }
    _defaultBreaker = createCircuitBreaker(new Redis({ url, token }));
  }
  return _defaultBreaker;
}

export function resetDefaultCircuitBreaker(): void {
  _defaultBreaker = null;
}

export { FAILURE_THRESHOLD, OPEN_DURATION_MS };
