/**
 * Feature Flags — Upstash Redis-backed
 *
 * Global flags apply to the whole system.
 * Per-event flags scope to a single event (e.g., registration_open).
 *
 * Redis keys:
 *   Global:    flags:global:{flagKey}
 *   Per-event: flags:event:{eventId}:{flagKey}
 *
 * Values: "1" (enabled) or "0" (disabled).
 * Missing key = default value (see FLAG_DEFAULTS).
 */

import { Redis } from '@upstash/redis';
import { eventIdSchema } from '@/lib/validations/event';

// ── Flag definitions ────────────────────────────────────────

function freezeTuple<const T extends readonly string[]>(values: T): T {
  return Object.freeze([...values]) as T;
}

function createFlagLookup<const T extends readonly string[]>(
  values: T,
): Readonly<Record<T[number], true>> {
  const lookup = Object.create(null) as Record<T[number], true>;

  for (const value of values) {
    lookup[value] = true;
  }

  return Object.freeze(lookup);
}

function createDefaults<const T extends Record<string, boolean>>(
  defaults: T,
): Readonly<T> {
  const registry = Object.create(null) as T;

  for (const [key, value] of Object.entries(defaults)) {
    registry[key as keyof T] = value as T[keyof T];
  }

  return Object.freeze(registry);
}

export const GLOBAL_FLAGS = freezeTuple([
  'whatsapp_enabled',
  'email_enabled',
  'certificate_generation_enabled',
  'maintenance_mode',
] as const);

export const EVENT_FLAGS = freezeTuple([
  'registration_open',
] as const);

export type GlobalFlag = (typeof GLOBAL_FLAGS)[number];
export type EventFlag = (typeof EVENT_FLAGS)[number];
export type FlagKey = GlobalFlag | EventFlag;

/** Defaults when a flag has never been set in Redis */
export const FLAG_DEFAULTS = createDefaults({
  whatsapp_enabled: true,
  email_enabled: true,
  certificate_generation_enabled: true,
  maintenance_mode: false,
  registration_open: true,
} satisfies Record<FlagKey, boolean>);

const GLOBAL_FLAG_LOOKUP = createFlagLookup(GLOBAL_FLAGS);
const EVENT_FLAG_LOOKUP = createFlagLookup(EVENT_FLAGS);

function assertGlobalFlag(flag: string): asserts flag is GlobalFlag {
  if (!Object.hasOwn(GLOBAL_FLAG_LOOKUP, flag)) {
    throw new Error(`Invalid global flag: ${flag}`);
  }
}

function assertEventFlag(flag: string): asserts flag is EventFlag {
  if (!Object.hasOwn(EVENT_FLAG_LOOKUP, flag)) {
    throw new Error(`Invalid event flag: ${flag}`);
  }
}

function assertEventId(eventId: string): void {
  if (!eventIdSchema.safeParse(eventId).success) {
    throw new Error('Invalid event ID');
  }
}

function parseFlagValue(flag: FlagKey, value: string | null): boolean {
  if (value === null) {
    return FLAG_DEFAULTS[flag];
  }

  return value === '1';
}

// ── Redis client ────────────────────────────────────────────

function getRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    );
  }
  return new Redis({ url, token });
}

// ── Key builders ────────────────────────────────────────────

function globalKey(flag: GlobalFlag): string {
  return `flags:global:${flag}`;
}

function eventKey(eventId: string, flag: EventFlag): string {
  return `flags:event:${eventId}:${flag}`;
}

// ── Read flags ──────────────────────────────────────────────

export type FlagReader = {
  getGlobalFlag: (flag: GlobalFlag) => Promise<boolean>;
  getEventFlag: (eventId: string, flag: EventFlag) => Promise<boolean>;
  getAllGlobalFlags: () => Promise<Record<GlobalFlag, boolean>>;
  getAllEventFlags: (eventId: string) => Promise<Record<EventFlag, boolean>>;
  setGlobalFlag: (flag: GlobalFlag, enabled: boolean) => Promise<void>;
  setEventFlag: (eventId: string, flag: EventFlag, enabled: boolean) => Promise<void>;
};

/** Production flag service backed by Upstash Redis */
export function createFlagService(redis?: Redis): FlagReader {
  const client = redis ?? getRedisClient();

  return {
    async getGlobalFlag(flag: GlobalFlag): Promise<boolean> {
      assertGlobalFlag(flag);
      const val = await client.get<string>(globalKey(flag));
      return parseFlagValue(flag, val);
    },

    async getEventFlag(eventId: string, flag: EventFlag): Promise<boolean> {
      assertEventId(eventId);
      assertEventFlag(flag);
      const val = await client.get<string>(eventKey(eventId, flag));
      return parseFlagValue(flag, val);
    },

    async getAllGlobalFlags(): Promise<Record<GlobalFlag, boolean>> {
      const pipeline = client.pipeline();
      for (const flag of GLOBAL_FLAGS) {
        pipeline.get(globalKey(flag));
      }
      const results = await pipeline.exec<(string | null)[]>();

      const flags = {} as Record<GlobalFlag, boolean>;
      GLOBAL_FLAGS.forEach((flag, i) => {
        flags[flag] = parseFlagValue(flag, results[i]);
      });
      return flags;
    },

    async getAllEventFlags(eventId: string): Promise<Record<EventFlag, boolean>> {
      assertEventId(eventId);
      const pipeline = client.pipeline();
      for (const flag of EVENT_FLAGS) {
        pipeline.get(eventKey(eventId, flag));
      }
      const results = await pipeline.exec<(string | null)[]>();

      const flags = {} as Record<EventFlag, boolean>;
      EVENT_FLAGS.forEach((flag, i) => {
        flags[flag] = parseFlagValue(flag, results[i]);
      });
      return flags;
    },

    async setGlobalFlag(flag: GlobalFlag, enabled: boolean): Promise<void> {
      assertGlobalFlag(flag);
      await client.set(globalKey(flag), enabled ? '1' : '0');
    },

    async setEventFlag(eventId: string, flag: EventFlag, enabled: boolean): Promise<void> {
      assertEventId(eventId);
      assertEventFlag(flag);
      await client.set(eventKey(eventId, flag), enabled ? '1' : '0');
    },
  };
}

// ── Convenience singleton (lazy, uses env vars) ─────────────

let _defaultService: FlagReader | null = null;

export function getDefaultFlagService(): FlagReader {
  if (!_defaultService) {
    _defaultService = createFlagService();
  }
  return _defaultService;
}

/** Reset the cached singleton (for testing) */
export function _resetDefaultFlagService(): void {
  _defaultService = null;
}

// ── Guard helpers for integration points ────────────────────

/**
 * Check if a notification channel is enabled.
 * Returns true if the channel should proceed, false if skipped.
 */
export async function isChannelEnabled(
  channel: 'email' | 'whatsapp',
  flagService?: FlagReader,
): Promise<boolean> {
  const svc = flagService ?? getDefaultFlagService();
  if (channel === 'email') return svc.getGlobalFlag('email_enabled');
  return svc.getGlobalFlag('whatsapp_enabled');
}

/**
 * Check if certificate generation is enabled.
 */
export async function isCertificateGenerationEnabled(
  flagService?: FlagReader,
): Promise<boolean> {
  const svc = flagService ?? getDefaultFlagService();
  return svc.getGlobalFlag('certificate_generation_enabled');
}

/**
 * Check if registration is open for a specific event.
 */
export async function isRegistrationOpen(
  eventId: string,
  flagService?: FlagReader,
): Promise<boolean> {
  const svc = flagService ?? getDefaultFlagService();
  return svc.getEventFlag(eventId, 'registration_open');
}

/**
 * Check if maintenance mode is active.
 */
export async function isMaintenanceMode(
  flagService?: FlagReader,
): Promise<boolean> {
  const svc = flagService ?? getDefaultFlagService();
  return svc.getGlobalFlag('maintenance_mode');
}
