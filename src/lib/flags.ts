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

// ── Flag definitions ────────────────────────────────────────

export const GLOBAL_FLAGS = [
  'whatsapp_enabled',
  'email_enabled',
  'certificate_generation_enabled',
  'maintenance_mode',
] as const;

export const EVENT_FLAGS = [
  'registration_open',
] as const;

export type GlobalFlag = (typeof GLOBAL_FLAGS)[number];
export type EventFlag = (typeof EVENT_FLAGS)[number];
export type FlagKey = GlobalFlag | EventFlag;

/** Defaults when a flag has never been set in Redis */
export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  whatsapp_enabled: true,
  email_enabled: true,
  certificate_generation_enabled: true,
  maintenance_mode: false,
  registration_open: true,
};

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
      const val = await client.get<string>(globalKey(flag));
      if (val === null) return FLAG_DEFAULTS[flag];
      return val === '1';
    },

    async getEventFlag(eventId: string, flag: EventFlag): Promise<boolean> {
      const val = await client.get<string>(eventKey(eventId, flag));
      if (val === null) return FLAG_DEFAULTS[flag];
      return val === '1';
    },

    async getAllGlobalFlags(): Promise<Record<GlobalFlag, boolean>> {
      const pipeline = client.pipeline();
      for (const flag of GLOBAL_FLAGS) {
        pipeline.get(globalKey(flag));
      }
      const results = await pipeline.exec<(string | null)[]>();

      const flags = {} as Record<GlobalFlag, boolean>;
      GLOBAL_FLAGS.forEach((flag, i) => {
        const val = results[i];
        flags[flag] = val === null ? FLAG_DEFAULTS[flag] : val === '1';
      });
      return flags;
    },

    async getAllEventFlags(eventId: string): Promise<Record<EventFlag, boolean>> {
      const pipeline = client.pipeline();
      for (const flag of EVENT_FLAGS) {
        pipeline.get(eventKey(eventId, flag));
      }
      const results = await pipeline.exec<(string | null)[]>();

      const flags = {} as Record<EventFlag, boolean>;
      EVENT_FLAGS.forEach((flag, i) => {
        const val = results[i];
        flags[flag] = val === null ? FLAG_DEFAULTS[flag] : val === '1';
      });
      return flags;
    },

    async setGlobalFlag(flag: GlobalFlag, enabled: boolean): Promise<void> {
      await client.set(globalKey(flag), enabled ? '1' : '0');
    },

    async setEventFlag(eventId: string, flag: EventFlag, enabled: boolean): Promise<void> {
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
