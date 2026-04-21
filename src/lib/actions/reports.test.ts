import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockGenerateExport } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
  },
  mockGenerateExport: vi.fn(),
}));

vi.mock('exceljs', () => {
  const fakeBuffer = Buffer.from('fake-xlsx-content');
  const makeMockWs = () => ({
    addRow: vi.fn(),
    getRow: vi.fn(() => ({ eachCell: vi.fn(), height: 0 })),
    eachCell: vi.fn(),
    columns: [] as unknown[],
  });
  return {
    default: {
      Workbook: vi.fn(() => ({
        addWorksheet: vi.fn(makeMockWs),
        xlsx: { writeBuffer: vi.fn().mockResolvedValue(fakeBuffer) },
      })),
    },
  };
});

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/exports/excel', () => ({ generateExport: mockGenerateExport }));

import { getEventsForGlobalReports, generateGlobalExport } from './reports';
import { ROLES } from '@/lib/auth/roles';

const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

function authAsSuperAdmin() {
  mockAuth.mockResolvedValue({
    userId: 'user_sa',
    sessionClaims: { metadata: { appRole: 'super_admin' } },
  });
}

function authAsCoordinator() {
  mockAuth.mockResolvedValue({
    userId: 'user_coord',
    sessionClaims: { metadata: { appRole: 'event_coordinator' } },
  });
}

function makeChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r);
  chain.catch = (r: (e: unknown) => unknown) => Promise.resolve(rows).catch(r);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGenerateExport.mockResolvedValue(Buffer.from('excel-data'));
});

// ── getEventsForGlobalReports ────────────────────────────────────

describe('getEventsForGlobalReports', () => {
  it('returns forbidden error for non-Super-Admin', async () => {
    authAsCoordinator();

    const result = await getEventsForGlobalReports();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Forbidden/);
    }
  });

  it('returns event list for Super Admin', async () => {
    authAsSuperAdmin();
    const eventRows = [
      { id: VALID_EVENT_ID, name: 'Conference 2026', startDate: new Date('2026-03-01'), status: 'published' },
    ];
    mockDb.select.mockReturnValue(makeChain(eventRows));

    const result = await getEventsForGlobalReports();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('Conference 2026');
    }
  });
});

// ── generateGlobalExport ─────────────────────────────────────────

describe('generateGlobalExport', () => {
  it('returns forbidden error for non-Super-Admin', async () => {
    authAsCoordinator();

    const result = await generateGlobalExport(VALID_EVENT_ID, 'attendee-list');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Forbidden/);
    }
  });

  it('returns error for invalid event UUID', async () => {
    authAsSuperAdmin();

    const result = await generateGlobalExport('not-a-uuid', 'attendee-list');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Invalid event ID');
    }
  });

  it('calls generateExport for single-event known type and returns base64', async () => {
    authAsSuperAdmin();

    const result = await generateGlobalExport(VALID_EVENT_ID, 'attendee-list');

    expect(result.ok).toBe(true);
    expect(mockGenerateExport).toHaveBeenCalledWith(VALID_EVENT_ID, 'attendee-list');
    if (result.ok) {
      expect(typeof result.base64).toBe('string');
      expect(result.base64.length).toBeGreaterThan(0);
    }
  });

  it('includes the export type and event id in the filename for single-event mode', async () => {
    authAsSuperAdmin();

    const result = await generateGlobalExport(VALID_EVENT_ID, 'travel-roster');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filename).toContain('travel-roster');
      expect(result.filename).toContain(VALID_EVENT_ID);
    }
  });

  it('handles notification-log type for a specific event without calling generateExport', async () => {
    authAsSuperAdmin();
    mockDb.select.mockReturnValue(makeChain([]));

    const result = await generateGlobalExport(VALID_EVENT_ID, 'notification-log');

    expect(result.ok).toBe(true);
    expect(mockGenerateExport).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.filename).toContain('notification-log');
    }
  });

  it('returns combined base64 for all-events attendee-list without calling generateExport', async () => {
    authAsSuperAdmin();
    mockDb.select.mockReturnValue(makeChain([]));

    const result = await generateGlobalExport('all', 'attendee-list');

    expect(result.ok).toBe(true);
    expect(mockGenerateExport).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.filename).toBe('attendee-list-all-events.xlsx');
      expect(typeof result.base64).toBe('string');
    }
  });

  it('returns combined base64 for all-events notification-log', async () => {
    authAsSuperAdmin();
    mockDb.select.mockReturnValue(makeChain([]));

    const result = await generateGlobalExport('all', 'notification-log');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filename).toBe('notification-log-all-events.xlsx');
    }
  });

  it('makes three DB queries for all-events transport-plan', async () => {
    authAsSuperAdmin();
    mockDb.select
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));

    const result = await generateGlobalExport('all', 'transport-plan');

    expect(result.ok).toBe(true);
    expect(mockDb.select).toHaveBeenCalledTimes(3);
  });

  it('returns error when db throws', async () => {
    authAsSuperAdmin();
    mockDb.select.mockImplementation(() => {
      throw new Error('DB connection failed');
    });

    const result = await generateGlobalExport('all', 'rooming-list');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/DB connection failed/);
    }
  });

  it('all-events mode does not leak data — non-SA receives forbidden error', async () => {
    authAsCoordinator();

    const result = await generateGlobalExport('all', 'faculty-responsibilities');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Forbidden/);
    }
  });

  it('returns valid base64 string that can be decoded', async () => {
    authAsSuperAdmin();

    const result = await generateGlobalExport(VALID_EVENT_ID, 'rooming-list');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => Buffer.from(result.base64, 'base64')).not.toThrow();
    }
  });
});
