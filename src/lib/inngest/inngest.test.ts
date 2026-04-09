/**
 * Inngest Integration Tests — Req 8A-1
 *
 * Tests:
 * 1. emitCascadeEvent sends Inngest event with correct name + data (production mode)
 * 2. emitCascadeEvent sends accommodation events correctly
 * 3. Inngest send failure is caught and reported (does not throw)
 * 4. All 4 cascade functions are registered
 * 5. All functions configured with 3 retries
 * 6. Each function triggers on the correct event name
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Inngest client
const mockSend = vi.fn().mockResolvedValue({ ids: ['evt-inngest-1'] });
vi.mock('./client', () => ({
  inngest: {
    send: (...args: unknown[]) => mockSend(...args),
    createFunction: vi.fn((config: unknown, handler: unknown) => ({
      _config: config,
      _handler: handler,
    })),
  },
}));

// Mock cascade handler dependencies
vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }));
vi.mock('@/lib/db/schema', () => ({
  accommodationRecords: { id: 'id', eventId: 'eid', personId: 'pid', recordStatus: 'rs', sharedRoomGroup: 'srg' },
  transportPassengerAssignments: { id: 'id', eventId: 'eid', personId: 'pid', travelRecordId: 'trid', assignmentStatus: 'as' },
}));
vi.mock('@/lib/db/schema/people', () => ({
  people: { id: 'id', email: 'email', phoneE164: 'phone', fullName: 'name' },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(), ne: vi.fn(), and: vi.fn(), relations: vi.fn(),
}));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => args),
}));
vi.mock('../cascade/red-flags', () => ({
  upsertRedFlag: vi.fn().mockResolvedValue({ id: 'flag-1' }),
}));
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: vi.fn().mockResolvedValue({ notificationLogId: 'log-1', status: 'sent' }),
}));
vi.mock('@/lib/sentry', () => ({
  captureCascadeError: vi.fn(),
}));

import {
  emitCascadeEvent,
  disableTestMode,
  enableTestMode,
} from '../cascade/emit';
import { CASCADE_EVENTS } from '../cascade/events';
import { inngestFunctions } from './functions';

describe('Inngest cascade integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disableTestMode(); // Use Inngest (production) mode
  });

  afterEach(() => {
    enableTestMode(); // Reset to test mode for safety
  });

  // Test 1: emitCascadeEvent sends event to Inngest with correct data
  it('sends travel.updated event to Inngest with correct payload', async () => {
    const result = await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_UPDATED,
      'evt-100',
      { type: 'user', id: 'user_1' },
      { travelRecordId: 'tr-1', personId: 'p-1', changeSummary: { city: { from: 'A', to: 'B' } } },
    );

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith({
      name: 'conference/travel.updated',
      data: {
        eventId: 'evt-100',
        actor: { type: 'user', id: 'user_1' },
        payload: { travelRecordId: 'tr-1', personId: 'p-1', changeSummary: { city: { from: 'A', to: 'B' } } },
      },
    });
    expect(result.handlersRun).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  // Test 2: emitCascadeEvent sends accommodation.cancelled event
  it('sends accommodation.cancelled event to Inngest', async () => {
    await emitCascadeEvent(
      CASCADE_EVENTS.ACCOMMODATION_CANCELLED,
      'evt-200',
      { type: 'system', id: 'system:cascade' },
      { accommodationRecordId: 'accom-1', personId: 'p-2', cancelledAt: '2026-04-09', reason: 'Overbooked' },
    );

    expect(mockSend).toHaveBeenCalledWith({
      name: 'conference/accommodation.cancelled',
      data: {
        eventId: 'evt-200',
        actor: { type: 'system', id: 'system:cascade' },
        payload: { accommodationRecordId: 'accom-1', personId: 'p-2', cancelledAt: '2026-04-09', reason: 'Overbooked' },
      },
    });
  });

  // Test 3: Inngest send failure is caught, reported to Sentry, does not throw
  it('catches Inngest send failure, reports to Sentry, and returns error', async () => {
    const { captureCascadeError } = await import('@/lib/sentry');
    mockSend.mockRejectedValueOnce(new Error('Inngest unreachable'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await emitCascadeEvent(
      CASCADE_EVENTS.TRAVEL_CANCELLED,
      'evt-300',
      { type: 'user', id: 'user_2' },
      { travelRecordId: 'tr-2', personId: 'p-3' },
    );

    expect(result.handlersRun).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('Inngest unreachable');

    // Verify Sentry capture was called
    expect(captureCascadeError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        handler: 'inngest-emit',
        eventId: 'evt-300',
        cascadeEvent: 'conference/travel.cancelled',
      }),
    );
    consoleSpy.mockRestore();
  });

  // Test 4: All 8 Inngest functions are registered (4 cascade + 3 bulk + 1 scheduled)
  it('registers all 8 Inngest functions', () => {
    expect(inngestFunctions).toHaveLength(8);

    // Since createFunction is mocked, we get { _config, _handler } objects
    const configs = inngestFunctions.map((fn: unknown) => (fn as { _config: { id: string } })._config);
    const ids = configs.map(c => c.id);
    // Cascade functions
    expect(ids).toContain('cascade-travel-updated');
    expect(ids).toContain('cascade-travel-cancelled');
    expect(ids).toContain('cascade-accommodation-updated');
    expect(ids).toContain('cascade-accommodation-cancelled');
    // Bulk operation functions (8A-2)
    expect(ids).toContain('bulk-certificate-generate');
    expect(ids).toContain('bulk-certificate-notify');
    expect(ids).toContain('bulk-archive-generate');
    // Scheduled functions (8B-4)
    expect(ids).toContain('pre-event-backup');
  });

  // Test 5: Functions configured with correct retry counts
  it('cascade and bulk functions have 3 retries, scheduled functions have 2 retries', () => {
    const threeRetryIds = [
      'cascade-travel-updated', 'cascade-travel-cancelled',
      'cascade-accommodation-updated', 'cascade-accommodation-cancelled',
      'bulk-certificate-generate', 'bulk-certificate-notify', 'bulk-archive-generate',
    ];
    for (const fn of inngestFunctions) {
      const config = (fn as unknown as { _config: { id: string; retries: number } })._config;
      if (threeRetryIds.includes(config.id)) {
        expect(config.retries).toBe(3);
      } else {
        expect(config.retries).toBe(2);
      }
    }
  });

  // Test 6: Each function triggers on the correct event or cron
  it('functions trigger on correct cascade event names and cron schedule', () => {
    const triggers = inngestFunctions.map((fn: unknown) => {
      const config = (fn as { _config: { triggers: Array<Record<string, string>> } })._config;
      return config.triggers[0];
    });
    const eventTriggers = triggers.filter((t) => 'event' in t).map((t) => t.event);
    expect(eventTriggers).toContain('conference/travel.updated');
    expect(eventTriggers).toContain('conference/travel.cancelled');
    expect(eventTriggers).toContain('conference/accommodation.updated');
    expect(eventTriggers).toContain('conference/accommodation.cancelled');

    // Verify cron trigger for pre-event backup
    const cronTriggers = triggers.filter((t) => 'cron' in t);
    expect(cronTriggers).toHaveLength(1);
    expect(cronTriggers[0].cron).toBe('0 0 * * *');
  });
});
