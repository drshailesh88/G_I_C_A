import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() } }));
vi.mock('@/lib/db/schema', () => new Proxy({}, { get: (_t, prop) => prop }));
vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((config: Record<string, unknown>, _handler: unknown) => ({ __config: config })),
    send: vi.fn().mockResolvedValue({ ids: ['test-id'] }),
  },
}));
vi.mock('@/lib/cascade/handlers/travel-cascade', () => ({
  handleTravelUpdated: vi.fn(),
  handleTravelCancelled: vi.fn(),
  handleTravelSaved: vi.fn(),
}));
vi.mock('@/lib/cascade/handlers/accommodation-cascade', () => ({
  handleAccommodationUpdated: vi.fn(),
  handleAccommodationCancelled: vi.fn(),
  handleAccommodationSaved: vi.fn(),
}));
vi.mock('@/lib/cascade/handlers/registration-cascade', () => ({
  handleRegistrationCreated: vi.fn(),
}));
vi.mock('@/lib/cascade/handlers/session-cascade', () => ({
  handleSessionUpdated: vi.fn(),
}));
vi.mock('@/lib/cascade/handlers/certificate-cascade', () => ({
  handleCertificateGenerated: vi.fn(),
}));
vi.mock('./bulk-functions', () => ({ bulkInngestFunctions: [] }));
vi.mock('@/lib/exports/emergency-kit', () => ({
  findEventsNeedingBackup: vi.fn(),
  generateEmergencyKit: vi.fn(),
  buildCronBackupStorageKey: vi.fn(),
}));
vi.mock('@/lib/certificates/storage', () => ({ createR2Provider: vi.fn() }));
vi.mock('@/lib/sentry', () => ({ captureCascadeError: vi.fn() }));
vi.mock('@/lib/notifications/send', () => ({ sendNotification: vi.fn() }));
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() })),
}));

import { inngestFunctions } from './functions';

describe('cascade-033 — 7 cascade handlers registered', () => {
  const CASCADE_HANDLER_EVENTS = [
    'conference/travel.saved',
    'conference/travel.updated',
    'conference/accommodation.saved',
    'conference/accommodation.updated',
    'conference/registration.created',
    'conference/session.updated',
    'conference/certificate.generated',
  ] as const;

  it('inngestFunctions contains all 7 cascade handlers with correct event triggers', () => {
    const triggeredEvents = new Set<string>();
    for (const fn of inngestFunctions) {
      const config = (fn as any).__config ?? {};
      const triggers: Array<{ event?: string }> = config.triggers ?? [];
      for (const t of triggers) {
        if (t.event) triggeredEvents.add(t.event);
      }
    }

    for (const eventName of CASCADE_HANDLER_EVENTS) {
      expect(
        triggeredEvents.has(eventName),
        `Missing Inngest handler for ${eventName}`,
      ).toBe(true);
    }
  });

  it('CE6 — each cascade handler is an independent Inngest function (failure isolation)', () => {
    const cascadeFnIds = inngestFunctions
      .map((fn) => {
        const config = (fn as any).__config ?? {};
        return config.id as string | undefined;
      })
      .filter((id): id is string => id?.startsWith('cascade-') === true);

    const uniqueIds = new Set(cascadeFnIds);
    expect(uniqueIds.size).toBe(cascadeFnIds.length);
    expect(uniqueIds.size).toBeGreaterThanOrEqual(7);
  });
});
