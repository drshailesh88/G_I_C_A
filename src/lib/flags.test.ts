import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  type FlagReader,
} from './flags';

describe('Feature Flags (flags.ts)', () => {
  let svc: FlagReader;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    svc = createFlagService();
  });

  // ── Test 1: getGlobalFlag returns default when key missing ──
  it('returns default value when flag is not set in Redis', async () => {
    mockGet.mockResolvedValue(null);

    const whatsapp = await svc.getGlobalFlag('whatsapp_enabled');
    const maintenance = await svc.getGlobalFlag('maintenance_mode');

    expect(whatsapp).toBe(true); // default: enabled
    expect(maintenance).toBe(false); // default: disabled
  });

  // ── Test 2: getGlobalFlag reads stored value ──
  it('reads stored flag value from Redis', async () => {
    mockGet.mockResolvedValue('0');

    const result = await svc.getGlobalFlag('whatsapp_enabled');

    expect(result).toBe(false);
    expect(mockGet).toHaveBeenCalledWith('flags:global:whatsapp_enabled');
  });

  // ── Test 3: setGlobalFlag round-trip ──
  it('setGlobalFlag writes "1" or "0" to Redis', async () => {
    mockSet.mockResolvedValue('OK');

    await svc.setGlobalFlag('email_enabled', false);
    expect(mockSet).toHaveBeenCalledWith('flags:global:email_enabled', '0');

    await svc.setGlobalFlag('email_enabled', true);
    expect(mockSet).toHaveBeenCalledWith('flags:global:email_enabled', '1');
  });

  // ── Test 4: per-event flag isolation ──
  it('event flags are scoped by eventId', async () => {
    mockGet.mockResolvedValue('0');

    const result = await svc.getEventFlag('event-abc', 'registration_open');

    expect(result).toBe(false);
    expect(mockGet).toHaveBeenCalledWith('flags:event:event-abc:registration_open');
  });

  // ── Test 5: setEventFlag writes per-event key ──
  it('setEventFlag writes event-scoped key', async () => {
    mockSet.mockResolvedValue('OK');

    await svc.setEventFlag('event-xyz', 'registration_open', false);

    expect(mockSet).toHaveBeenCalledWith('flags:event:event-xyz:registration_open', '0');
  });

  // ── Test 6: getAllGlobalFlags uses pipeline ──
  it('getAllGlobalFlags batches reads via pipeline', async () => {
    // Return values matching GLOBAL_FLAGS order: whatsapp, email, cert_gen, maintenance
    mockPipelineExec.mockResolvedValue(['1', '0', null, '1']);

    const flags = await svc.getAllGlobalFlags();

    expect(flags.whatsapp_enabled).toBe(true);
    expect(flags.email_enabled).toBe(false);
    expect(flags.certificate_generation_enabled).toBe(true); // null → default true
    expect(flags.maintenance_mode).toBe(true); // explicitly set to "1"
    expect(mockPipelineGet).toHaveBeenCalledTimes(GLOBAL_FLAGS.length);
  });

  // ── Test 7: isChannelEnabled → whatsapp_enabled=false → false ──
  it('isChannelEnabled returns false when whatsapp_enabled is disabled', async () => {
    mockGet.mockResolvedValue('0');

    const result = await isChannelEnabled('whatsapp', svc);

    expect(result).toBe(false);
  });

  // ── Test 8: isChannelEnabled → email check ──
  it('isChannelEnabled checks email_enabled for email channel', async () => {
    mockGet.mockResolvedValue('1');

    const result = await isChannelEnabled('email', svc);

    expect(result).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('flags:global:email_enabled');
  });

  // ── Test 9: isCertificateGenerationEnabled → disabled ──
  it('isCertificateGenerationEnabled returns false when disabled', async () => {
    mockGet.mockResolvedValue('0');

    const result = await isCertificateGenerationEnabled(svc);

    expect(result).toBe(false);
  });

  // ── Test 10: isRegistrationOpen per-event ──
  it('isRegistrationOpen checks per-event flag', async () => {
    mockGet.mockResolvedValue('0');

    const result = await isRegistrationOpen('event-123', svc);

    expect(result).toBe(false);
    expect(mockGet).toHaveBeenCalledWith('flags:event:event-123:registration_open');
  });

  // ── Test 11: isMaintenanceMode ──
  it('isMaintenanceMode returns true when flag set', async () => {
    mockGet.mockResolvedValue('1');

    const result = await isMaintenanceMode(svc);

    expect(result).toBe(true);
  });

  // ── Test 12: getAllEventFlags uses pipeline ──
  it('getAllEventFlags returns per-event flags via pipeline', async () => {
    mockPipelineExec.mockResolvedValue(['0']);

    const flags = await svc.getAllEventFlags('event-abc');

    expect(flags.registration_open).toBe(false);
    expect(mockPipelineGet).toHaveBeenCalledTimes(EVENT_FLAGS.length);
  });
});
