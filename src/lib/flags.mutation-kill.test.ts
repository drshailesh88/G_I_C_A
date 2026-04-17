/**
 * Mutation-killing tests for src/lib/flags.ts
 *
 * Targets: BooleanLiteral on defaults, singleton caching, key format strings,
 * ConditionalExpression branches, LogicalOperator on convenience helpers,
 * and _resetDefaultFlagService NoCoverage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @upstash/redis
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockPipelineGet = vi.fn();
const mockPipelineExec = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    pipeline: () => ({
      get: mockPipelineGet,
      exec: mockPipelineExec,
    }),
  })),
}));

import {
  createFlagService,
  FLAG_DEFAULTS,
  GLOBAL_FLAGS,
  EVENT_FLAGS,
  isChannelEnabled,
  isCertificateGenerationEnabled,
  isRegistrationOpen,
  isMaintenanceMode,
  getDefaultFlagService,
  _resetDefaultFlagService,
  type FlagReader,
} from './flags';

const VALID_EVENT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  _resetDefaultFlagService();
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

// ── FLAG_DEFAULTS: kill BooleanLiteral mutations on default values ──

describe('FLAG_DEFAULTS specification', () => {
  it('email_enabled defaults to true (channels enabled by default)', () => {
    expect(FLAG_DEFAULTS.email_enabled).toBe(true);
  });

  it('whatsapp_enabled defaults to true', () => {
    expect(FLAG_DEFAULTS.whatsapp_enabled).toBe(true);
  });

  it('certificate_generation_enabled defaults to true', () => {
    expect(FLAG_DEFAULTS.certificate_generation_enabled).toBe(true);
  });

  it('maintenance_mode defaults to false (system available by default)', () => {
    expect(FLAG_DEFAULTS.maintenance_mode).toBe(false);
  });

  it('registration_open defaults to true (events accept registrations by default)', () => {
    expect(FLAG_DEFAULTS.registration_open).toBe(true);
  });
});

// ── GLOBAL_FLAGS and EVENT_FLAGS: kill ArrayDeclaration mutations ──

describe('Flag key registries', () => {
  it('GLOBAL_FLAGS contains exactly 4 entries', () => {
    expect(GLOBAL_FLAGS).toHaveLength(4);
  });

  it('EVENT_FLAGS contains exactly 1 entry', () => {
    expect(EVENT_FLAGS).toHaveLength(1);
    expect(EVENT_FLAGS[0]).toBe('registration_open');
  });
});

// ── getDefaultFlagService: kill singleton caching mutations ──

describe('getDefaultFlagService singleton', () => {
  it('returns a service with all expected methods', () => {
    const svc = getDefaultFlagService();
    expect(svc.getGlobalFlag).toBeTypeOf('function');
    expect(svc.getEventFlag).toBeTypeOf('function');
    expect(svc.getAllGlobalFlags).toBeTypeOf('function');
    expect(svc.getAllEventFlags).toBeTypeOf('function');
    expect(svc.setGlobalFlag).toBeTypeOf('function');
    expect(svc.setEventFlag).toBeTypeOf('function');
  });

  it('returns the same instance on second call (caching)', () => {
    const svc1 = getDefaultFlagService();
    const svc2 = getDefaultFlagService();
    expect(svc1).toBe(svc2);
  });

  it('returns a new instance after _resetDefaultFlagService', () => {
    const svc1 = getDefaultFlagService();
    _resetDefaultFlagService();
    const svc2 = getDefaultFlagService();
    expect(svc1).not.toBe(svc2);
  });
});

// ── getGlobalFlag: kill ConditionalExpression on val === '1' ──

describe('getGlobalFlag value parsing', () => {
  it('returns true when Redis value is "1"', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    expect(await svc.getGlobalFlag('maintenance_mode')).toBe(true);
  });

  it('returns false when Redis value is "0"', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('0');
    expect(await svc.getGlobalFlag('whatsapp_enabled')).toBe(false);
  });

  it('returns FLAG_DEFAULTS value when Redis returns null', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue(null);
    // maintenance_mode default is false
    expect(await svc.getGlobalFlag('maintenance_mode')).toBe(false);
    // whatsapp_enabled default is true
    mockGet.mockResolvedValue(null);
    expect(await svc.getGlobalFlag('whatsapp_enabled')).toBe(true);
  });
});

// ── getEventFlag: kill StringLiteral on key format ──

describe('getEventFlag key format and value parsing', () => {
  it('constructs key as flags:event:{eventId}:{flag}', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    await svc.getEventFlag(VALID_EVENT_ID, 'registration_open');
    expect(mockGet).toHaveBeenCalledWith(`flags:event:${VALID_EVENT_ID}:registration_open`);
  });

  it('returns true when Redis value is "1"', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    expect(await svc.getEventFlag(VALID_EVENT_ID, 'registration_open')).toBe(true);
  });

  it('returns false when Redis value is "0"', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('0');
    expect(await svc.getEventFlag(VALID_EVENT_ID, 'registration_open')).toBe(false);
  });

  it('returns default when Redis returns null', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue(null);
    // registration_open default is true
    expect(await svc.getEventFlag(VALID_EVENT_ID, 'registration_open')).toBe(true);
  });
});

// ── setGlobalFlag: kill StringLiteral on key format ──

describe('setGlobalFlag key format', () => {
  it('writes to flags:global:{flag} key', async () => {
    const svc = createFlagService();
    mockSet.mockResolvedValue('OK');
    await svc.setGlobalFlag('maintenance_mode', true);
    expect(mockSet).toHaveBeenCalledWith('flags:global:maintenance_mode', '1');
  });

  it('writes "0" for false', async () => {
    const svc = createFlagService();
    mockSet.mockResolvedValue('OK');
    await svc.setGlobalFlag('maintenance_mode', false);
    expect(mockSet).toHaveBeenCalledWith('flags:global:maintenance_mode', '0');
  });
});

// ── setEventFlag: kill StringLiteral on key format ──

describe('setEventFlag key format', () => {
  it('writes to flags:event:{eventId}:{flag} key with "1"', async () => {
    const svc = createFlagService();
    mockSet.mockResolvedValue('OK');
    await svc.setEventFlag(VALID_EVENT_ID, 'registration_open', true);
    expect(mockSet).toHaveBeenCalledWith(`flags:event:${VALID_EVENT_ID}:registration_open`, '1');
  });

  it('writes "0" for false', async () => {
    const svc = createFlagService();
    mockSet.mockResolvedValue('OK');
    await svc.setEventFlag(VALID_EVENT_ID, 'registration_open', false);
    expect(mockSet).toHaveBeenCalledWith(`flags:event:${VALID_EVENT_ID}:registration_open`, '0');
  });
});

// ── getAllGlobalFlags: kill ConditionalExpression on null check + val === '1' ──

describe('getAllGlobalFlags pipeline parsing', () => {
  it('treats null pipeline result as default, non-null as parsed', async () => {
    const svc = createFlagService();
    // GLOBAL_FLAGS order: whatsapp_enabled, email_enabled, certificate_generation_enabled, maintenance_mode
    mockPipelineExec.mockResolvedValue([null, '1', '0', null]);
    const flags = await svc.getAllGlobalFlags();
    expect(flags.whatsapp_enabled).toBe(true);         // null → default true
    expect(flags.email_enabled).toBe(true);             // '1' → true
    expect(flags.certificate_generation_enabled).toBe(false); // '0' → false
    expect(flags.maintenance_mode).toBe(false);         // null → default false
  });

  it('all "0" values return false regardless of defaults', async () => {
    const svc = createFlagService();
    mockPipelineExec.mockResolvedValue(['0', '0', '0', '0']);
    const flags = await svc.getAllGlobalFlags();
    expect(flags.whatsapp_enabled).toBe(false);
    expect(flags.email_enabled).toBe(false);
    expect(flags.certificate_generation_enabled).toBe(false);
    expect(flags.maintenance_mode).toBe(false);
  });
});

// ── getAllEventFlags: kill ConditionalExpression + StringLiteral ──

describe('getAllEventFlags pipeline parsing', () => {
  it('null pipeline value falls back to default (registration_open=true)', async () => {
    const svc = createFlagService();
    mockPipelineExec.mockResolvedValue([null]);
    const flags = await svc.getAllEventFlags(VALID_EVENT_ID);
    expect(flags.registration_open).toBe(true);
  });

  it('"1" pipeline value returns true', async () => {
    const svc = createFlagService();
    mockPipelineExec.mockResolvedValue(['1']);
    const flags = await svc.getAllEventFlags(VALID_EVENT_ID);
    expect(flags.registration_open).toBe(true);
  });

  it('"0" pipeline value returns false', async () => {
    const svc = createFlagService();
    mockPipelineExec.mockResolvedValue(['0']);
    const flags = await svc.getAllEventFlags(VALID_EVENT_ID);
    expect(flags.registration_open).toBe(false);
  });
});

// ── isChannelEnabled: kill ConditionalExpression on channel === 'email' ──

describe('isChannelEnabled routing', () => {
  it('routes "email" to email_enabled flag', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    await isChannelEnabled('email', svc);
    expect(mockGet).toHaveBeenCalledWith('flags:global:email_enabled');
  });

  it('routes "whatsapp" to whatsapp_enabled flag', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    await isChannelEnabled('whatsapp', svc);
    expect(mockGet).toHaveBeenCalledWith('flags:global:whatsapp_enabled');
  });

  it('email channel returns false when email_enabled is "0"', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('0');
    expect(await isChannelEnabled('email', svc)).toBe(false);
  });

  it('whatsapp channel returns true when whatsapp_enabled is "1"', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    expect(await isChannelEnabled('whatsapp', svc)).toBe(true);
  });
});

// ── isCertificateGenerationEnabled: kill StringLiteral + LogicalOperator ──

describe('isCertificateGenerationEnabled', () => {
  it('reads certificate_generation_enabled flag', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    await isCertificateGenerationEnabled(svc);
    expect(mockGet).toHaveBeenCalledWith('flags:global:certificate_generation_enabled');
  });

  it('returns true when enabled', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    expect(await isCertificateGenerationEnabled(svc)).toBe(true);
  });

  it('returns false when disabled', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('0');
    expect(await isCertificateGenerationEnabled(svc)).toBe(false);
  });
});

// ── isRegistrationOpen: kill StringLiteral + LogicalOperator ──

describe('isRegistrationOpen', () => {
  it('reads event-scoped registration_open flag', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('0');
    await isRegistrationOpen(VALID_EVENT_ID, svc);
    expect(mockGet).toHaveBeenCalledWith(`flags:event:${VALID_EVENT_ID}:registration_open`);
  });
});

// ── isMaintenanceMode: kill StringLiteral + LogicalOperator ──

describe('isMaintenanceMode', () => {
  it('reads maintenance_mode global flag', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('0');
    await isMaintenanceMode(svc);
    expect(mockGet).toHaveBeenCalledWith('flags:global:maintenance_mode');
  });

  it('returns false when "0"', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('0');
    expect(await isMaintenanceMode(svc)).toBe(false);
  });

  it('returns true when "1"', async () => {
    const svc = createFlagService();
    mockGet.mockResolvedValue('1');
    expect(await isMaintenanceMode(svc)).toBe(true);
  });
});

// ── Convenience helpers use injected service (kill LogicalOperator ?? ) ──

describe('convenience helpers use provided flagService', () => {
  it('isChannelEnabled uses injected service, not default singleton', async () => {
    const mockSvc: FlagReader = {
      getGlobalFlag: vi.fn().mockResolvedValue(true),
      getEventFlag: vi.fn(),
      getAllGlobalFlags: vi.fn(),
      getAllEventFlags: vi.fn(),
      setGlobalFlag: vi.fn(),
      setEventFlag: vi.fn(),
    };
    await isChannelEnabled('email', mockSvc);
    expect(mockSvc.getGlobalFlag).toHaveBeenCalledWith('email_enabled');
    // Ensure it did NOT create a new Redis instance
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('isCertificateGenerationEnabled uses injected service', async () => {
    const mockSvc: FlagReader = {
      getGlobalFlag: vi.fn().mockResolvedValue(false),
      getEventFlag: vi.fn(),
      getAllGlobalFlags: vi.fn(),
      getAllEventFlags: vi.fn(),
      setGlobalFlag: vi.fn(),
      setEventFlag: vi.fn(),
    };
    const result = await isCertificateGenerationEnabled(mockSvc);
    expect(result).toBe(false);
    expect(mockSvc.getGlobalFlag).toHaveBeenCalledWith('certificate_generation_enabled');
  });

  it('isRegistrationOpen uses injected service', async () => {
    const mockSvc: FlagReader = {
      getGlobalFlag: vi.fn(),
      getEventFlag: vi.fn().mockResolvedValue(true),
      getAllGlobalFlags: vi.fn(),
      getAllEventFlags: vi.fn(),
      setGlobalFlag: vi.fn(),
      setEventFlag: vi.fn(),
    };
    const result = await isRegistrationOpen(VALID_EVENT_ID, mockSvc);
    expect(result).toBe(true);
    expect(mockSvc.getEventFlag).toHaveBeenCalledWith(VALID_EVENT_ID, 'registration_open');
  });

  it('isMaintenanceMode uses injected service', async () => {
    const mockSvc: FlagReader = {
      getGlobalFlag: vi.fn().mockResolvedValue(true),
      getEventFlag: vi.fn(),
      getAllGlobalFlags: vi.fn(),
      getAllEventFlags: vi.fn(),
      setGlobalFlag: vi.fn(),
      setEventFlag: vi.fn(),
    };
    const result = await isMaintenanceMode(mockSvc);
    expect(result).toBe(true);
    expect(mockSvc.getGlobalFlag).toHaveBeenCalledWith('maintenance_mode');
  });
});

// ── getRedisClient: kill error throw when env vars missing ──

describe('Redis client validation', () => {
  it('throws when UPSTASH_REDIS_REST_URL is missing', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect(() => createFlagService()).toThrow(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    );
  });

  it('throws when UPSTASH_REDIS_REST_TOKEN is missing', () => {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(() => createFlagService()).toThrow(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    );
  });
});
