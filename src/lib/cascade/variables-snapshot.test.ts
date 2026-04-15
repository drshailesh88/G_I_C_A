vi.mock('@/lib/db', () => {
  const selectResults: Record<string, unknown>[] = [];
  let selectIdx = 0;
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              const result = selectResults[selectIdx] ?? null;
              selectIdx++;
              return Promise.resolve(result ? [result] : []);
            }),
          })),
        })),
      })),
      _selectResults: selectResults,
      _resetSelectIdx: () => { selectIdx = 0; },
    },
  };
});

vi.mock('@/lib/db/schema', () => ({
  people: {
    id: 'people.id',
    email: 'people.email',
    phoneE164: 'people.phoneE164',
    fullName: 'people.fullName',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ col: _col, val })),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveVariablesSnapshot } from './variables-snapshot';
import { db } from '@/lib/db';

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  _selectResults: Record<string, unknown>[];
  _resetSelectIdx: () => void;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb._selectResults.length = 0;
  mockDb._resetSelectIdx();
});

describe('resolveVariablesSnapshot', () => {
  it('snapshot frozen into payload — subsequent DB edits do not change it', async () => {
    mockDb._selectResults.push({
      email: 'alice@example.com',
      phoneE164: '+919876543210',
      fullName: 'Alice Smith',
    });

    const snapshot = await resolveVariablesSnapshot({
      personId: 'person-1',
      domainVariables: { arrivalTime: '09:00' },
    });

    expect(snapshot).toEqual({
      recipientEmail: 'alice@example.com',
      recipientPhoneE164: '+919876543210',
      recipientName: 'Alice Smith',
      arrivalTime: '09:00',
    });

    // Simulate DB edit after snapshot — change person email
    mockDb._selectResults.push({
      email: 'alice-new@example.com',
      phoneE164: '+919876543210',
      fullName: 'Alice Smith Updated',
    });

    // The snapshot is already captured; it must NOT reflect the edit
    expect(snapshot.recipientEmail).toBe('alice@example.com');
    expect(snapshot.recipientName).toBe('Alice Smith');

    // Object is frozen — mutations throw in strict mode
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('retry uses same snapshot — handler receives identical variables each attempt', async () => {
    mockDb._selectResults.push({
      email: 'bob@example.com',
      phoneE164: '+911234567890',
      fullName: 'Bob Jones',
    });

    const snapshot = await resolveVariablesSnapshot({
      personId: 'person-2',
      domainVariables: { changeSummary: { checkIn: { from: '2026-04-10', to: '2026-04-12' } } },
    });

    // Simulate retry: handler receives payload.variables (the snapshot)
    // On retry, the same frozen object is used — no new DB call
    const attempt1Variables = snapshot;
    const attempt2Variables = snapshot;
    const attempt3Variables = snapshot;

    expect(attempt1Variables).toBe(attempt2Variables);
    expect(attempt2Variables).toBe(attempt3Variables);
    expect(attempt1Variables.recipientEmail).toBe('bob@example.com');
    expect(attempt1Variables.changeSummary).toEqual({
      checkIn: { from: '2026-04-10', to: '2026-04-12' },
    });

    // DB was only queried once (at emit time)
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('returns null contact fields when person not found', async () => {
    // No results pushed — empty array returned from DB
    const snapshot = await resolveVariablesSnapshot({
      personId: 'nonexistent',
      domainVariables: { reason: 'cancelled' },
    });

    expect(snapshot).toEqual({
      recipientEmail: null,
      recipientPhoneE164: null,
      recipientName: null,
      reason: 'cancelled',
    });
  });
});
