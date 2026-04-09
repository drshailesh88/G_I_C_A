/**
 * Circuit Breaker — Redis-backed
 *
 * Tracks consecutive failures per provider. After FAILURE_THRESHOLD consecutive
 * failures the circuit opens and rejects all new sends immediately with
 * CIRCUIT_OPEN. After OPEN_DURATION_MS the circuit enters half-open state
 * and allows one probe request through. If the probe succeeds the circuit
 * resets; if it fails the circuit returns to open.
 *
 * Redis key pattern: notif:circuit:{provider}
 * Stored value: JSON { failures: number, openedAt: number | null }
 */

import { Redis } from '@upstash/redis';

const KEY_PREFIX = 'notif:circuit:';
const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 60_000; // 60 seconds

export type CircuitState = 'closed' | 'open' | 'half-open';

export type CircuitStatus = {
  state: CircuitState;
  failures: number;
  openedAt: number | null;
};

type StoredCircuit = {
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
  /** Check if the circuit allows a request. Throws CircuitOpenError if open. */
  checkCircuit(provider: string): Promise<CircuitState>;
  /** Record a successful provider call — resets the failure counter. */
  recordSuccess(provider: string): Promise<void>;
  /** Record a failed provider call — increments counter, may open circuit. */
  recordFailure(provider: string): Promise<void>;
  /** Get current circuit status (for monitoring/debugging). */
  getStatus(provider: string): Promise<CircuitStatus>;
}

function circuitKey(provider: string): string {
  return `${KEY_PREFIX}${provider}`;
}

export function createCircuitBreaker(redis: Redis): CircuitBreakerService {
  async function getStoredCircuit(provider: string): Promise<StoredCircuit> {
    const raw = await redis.get<StoredCircuit>(circuitKey(provider));
    return raw ?? { failures: 0, openedAt: null };
  }

  return {
    async checkCircuit(provider: string): Promise<CircuitState> {
      const circuit = await getStoredCircuit(provider);

      if (circuit.failures < FAILURE_THRESHOLD) {
        return 'closed';
      }

      // Circuit has reached threshold — check if it's time for half-open
      if (circuit.openedAt !== null) {
        const elapsed = Date.now() - circuit.openedAt;
        if (elapsed >= OPEN_DURATION_MS) {
          return 'half-open';
        }
      }

      throw new CircuitOpenError(provider);
    },

    async recordSuccess(provider: string): Promise<void> {
      // Reset the circuit completely
      await redis.del(circuitKey(provider));
    },

    async recordFailure(provider: string): Promise<void> {
      const circuit = await getStoredCircuit(provider);
      const newFailures = circuit.failures + 1;

      let openedAt: number | null = null;
      if (newFailures >= FAILURE_THRESHOLD) {
        // If already at/above threshold (failed probe), refresh openedAt to restart the window.
        // If crossing threshold for the first time, set openedAt now.
        openedAt = circuit.failures >= FAILURE_THRESHOLD ? Date.now() : (circuit.openedAt ?? Date.now());
      }

      const updated: StoredCircuit = { failures: newFailures, openedAt };

      // Store with 5-minute TTL so stale breakers auto-clear
      await redis.set(circuitKey(provider), updated, { ex: 300 });
    },

    async getStatus(provider: string): Promise<CircuitStatus> {
      const circuit = await getStoredCircuit(provider);

      let state: CircuitState = 'closed';
      if (circuit.failures >= FAILURE_THRESHOLD) {
        if (circuit.openedAt !== null && (Date.now() - circuit.openedAt) >= OPEN_DURATION_MS) {
          state = 'half-open';
        } else {
          state = 'open';
        }
      }

      return {
        state,
        failures: circuit.failures,
        openedAt: circuit.openedAt,
      };
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

/** Reset the cached default instance (for testing) */
export function resetDefaultCircuitBreaker(): void {
  _defaultBreaker = null;
}

/** Exported constants for testing */
export { FAILURE_THRESHOLD, OPEN_DURATION_MS };
