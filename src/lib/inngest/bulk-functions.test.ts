/**
 * Inngest Bulk Operation Tests — Req 8A-2
 *
 * Tests:
 * 1. All 3 bulk functions are registered with correct IDs and retries
 * 2. Bulk cert gen: 100 recipients → split into 2 batches of 50
 * 3. Bulk cert gen: failure at batch 2 → batch 1 persisted, batch 2 retried
 * 4. Bulk email: 25 certs → split into 2 batches of 20+5, sleep between batches
 * 5. Bulk WhatsApp: per-message step.run + step.sleep('2s') between each
 * 6. Archive gen: 4 steps (agenda, CSV, cert keys, ZIP)
 * 7. chunk() helper splits arrays correctly
 * 8. Bulk cert notify: certs without storageKey are filtered out
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Inngest client ────────────────────────────────────

const mockCreateFunction = vi.fn((config: unknown, handler: unknown) => ({
  _config: config,
  _handler: handler,
}));

vi.mock('./client', () => ({
  inngest: {
    createFunction: (...args: unknown[]) => mockCreateFunction(...args),
  },
}));

// ── Mock DB + dependencies ─────────────────────────────────

const mockDb = {
  select: vi.fn(),
  selectDistinctOn: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema', () => ({
  issuedCertificates: { id: 'id', eventId: 'eid', personId: 'pid', certificateType: 'ct', certificateNumber: 'cn', storageKey: 'sk', status: 's' },
  certificateTemplates: { id: 'id', eventId: 'eid', status: 's' },
  people: { id: 'id', fullName: 'fn', email: 'em', phoneE164: 'ph', designation: 'des' },
  eventRegistrations: { eventId: 'eid', personId: 'pid', status: 's', category: 'cat' },
  sessionAssignments: { eventId: 'eid', personId: 'pid' },
  attendanceRecords: { eventId: 'eid', personId: 'pid' },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(), and: vi.fn(), inArray: vi.fn(), relations: vi.fn(),
}));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((...args: unknown[]) => args),
}));
vi.mock('@/lib/certificates/issuance-utils', () => ({
  findCurrentCertificate: vi.fn().mockReturnValue(null),
  buildSupersessionChain: vi.fn().mockReturnValue({ newCertLink: null, oldCertUpdate: null }),
  getNextSequence: vi.fn().mockReturnValue(1),
}));
vi.mock('@/lib/certificates/certificate-types', () => ({
  generateCertificateNumber: vi.fn((type: string, seq: number) => `GEM-${String(seq).padStart(5, '0')}`),
  getCertificateTypeConfig: vi.fn().mockReturnValue({ certificateNumberPrefix: 'GEM' }),
}));
vi.mock('@/lib/certificates/storage', () => ({
  buildCertificateStorageKey: vi.fn((eid: string, ct: string, cid: string) => `certs/${eid}/${ct}/${cid}.pdf`),
  createR2Provider: vi.fn(),
}));
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: vi.fn().mockResolvedValue({ logId: 'log-1', status: 'sent' }),
}));
vi.mock('@/lib/exports/archive', () => ({
  generateAgendaExcel: vi.fn().mockResolvedValue(Buffer.from('agenda')),
  generateNotificationLogCsv: vi.fn().mockResolvedValue(Buffer.from('csv')),
  getCertificateStorageKeys: vi.fn().mockResolvedValue([]),
  buildArchiveStorageKey: vi.fn().mockReturnValue('archives/test.zip'),
}));

import { bulkInngestFunctions, chunk } from './bulk-functions';

// ── Helpers ────────────────────────────────────────────────

function chainedSelect(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockImplementation(() => chain),
    innerJoin: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockResolvedValue(rows),
    then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function chainedInsert(rows: unknown[]) {
  const chain: any = {
    values: vi.fn().mockImplementation(() => chain),
    returning: vi.fn().mockResolvedValue(rows),
    then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function chainedUpdate() {
  const chain: any = {
    set: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    returning: vi.fn().mockResolvedValue([]),
    then: (resolve: (val: unknown) => void) => Promise.resolve([]).then(resolve),
  };
  return chain;
}

function makeRecipients(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `person-${i + 1}`,
    fullName: `Person ${i + 1}`,
    email: `person${i + 1}@example.com`,
    designation: 'Doctor',
  }));
}

const mockTemplate = {
  id: 'tpl-1',
  eventId: 'evt-1',
  certificateType: 'delegate_attendance',
  status: 'active',
  versionNo: 1,
  templateJson: {},
  brandingSnapshotJson: null,
};

/** Create a mock step object that tracks step.run and step.sleep calls */
function createMockStep() {
  const stepRuns: Array<{ name: string; result: unknown }> = [];
  const sleeps: string[] = [];

  return {
    stepRuns,
    sleeps,
    run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      stepRuns.push({ name, result });
      return result;
    }),
    sleep: vi.fn(async (name: string, _duration: string) => {
      sleeps.push(name);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Test 1: Function registration ──────────────────────────

describe('Inngest bulk function registration', () => {
  it('registers 3 bulk functions with correct IDs and retry config', () => {
    expect(bulkInngestFunctions).toHaveLength(3);

    const configs = bulkInngestFunctions.map(
      (fn: unknown) => (fn as { _config: { id: string; retries: number } })._config,
    );

    expect(configs.map(c => c.id)).toEqual([
      'bulk-certificate-generate',
      'bulk-certificate-notify',
      'bulk-archive-generate',
    ]);

    for (const config of configs) {
      expect(config.retries).toBe(3);
    }
  });
});

// ── Test 7: chunk() helper ─────────────────────────────────

describe('chunk helper', () => {
  it('splits arrays into correct chunk sizes', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3], 50)).toEqual([[1, 2, 3]]);
    expect(chunk([], 10)).toEqual([]);
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

// ── Test 2 & 3: Bulk cert generation batching ──────────────

describe('bulkCertificateGenerateFn handler', () => {
  const getHandler = () => {
    const fn = bulkInngestFunctions[0] as { _handler: (args: { event: unknown; step: unknown }) => Promise<unknown> };
    return fn._handler;
  };

  it('splits 100 recipients into 2 batches of 50 via step.run', async () => {
    const handler = getHandler();
    const step = createMockStep();
    const recipients = makeRecipients(100);

    // Mock DB calls in the step.run callbacks
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainedSelect([mockTemplate]); // template
      if (selectCallCount === 2) return chainedSelect(recipients); // recipients (delegates)
      if (selectCallCount === 3) return chainedSelect([]); // existing certs
      if (selectCallCount === 4) return chainedSelect([]); // existing numbers
      return chainedSelect([]);
    });

    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1',
          userId: 'user-1',
          templateId: 'tpl-1',
          recipientType: 'all_delegates',
          eligibilityBasisType: 'registration',
        },
      },
      step,
    });

    // Verify batching: load-template-and-recipients, load-existing-certs, generate-batch-1, generate-batch-2
    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).toContain('load-template-and-recipients');
    expect(stepNames).toContain('load-existing-certs');
    expect(stepNames).toContain('generate-batch-1');
    expect(stepNames).toContain('generate-batch-2');
    expect(stepNames).not.toContain('generate-batch-3'); // 100/50 = 2 batches

    // Verify result
    const res = result as { issued: number; certificateIds: string[] };
    expect(res.issued).toBe(100);
    expect(res.certificateIds).toHaveLength(100);
  });

  it('persists batch 1 even when batch 2 fails (step isolation)', async () => {
    const handler = getHandler();
    const stepRuns: Array<{ name: string; result: unknown }> = [];
    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        // Simulate batch 2 failure
        if (name === 'generate-batch-2') {
          stepRuns.push({ name, result: 'FAILED' });
          throw new Error('DB connection lost at batch 2');
        }
        const result = await fn();
        stepRuns.push({ name, result });
        return result;
      }),
      sleep: vi.fn(),
    };

    const recipients = makeRecipients(100);
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainedSelect([mockTemplate]);
      if (selectCallCount === 2) return chainedSelect(recipients);
      if (selectCallCount === 3) return chainedSelect([]);
      if (selectCallCount === 4) return chainedSelect([]);
      return chainedSelect([]);
    });

    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });

    await expect(
      handler({
        event: {
          data: {
            eventId: 'evt-1',
            userId: 'user-1',
            templateId: 'tpl-1',
            recipientType: 'all_delegates',
            eligibilityBasisType: 'registration',
          },
        },
        step,
      }),
    ).rejects.toThrow('DB connection lost at batch 2');

    // Verify batch 1 was executed successfully before batch 2 failed
    const completedSteps = stepRuns.filter(s => s.result !== 'FAILED');
    expect(completedSteps.some(s => s.name === 'generate-batch-1')).toBe(true);
    // Inngest retries the function — batch 1's step.run is memoized (already completed),
    // so only batch 2 re-executes on retry. This is Inngest's core value proposition.
  });
});

// ── Test 4 & 5: Bulk notification batching ─────────────────

describe('bulkCertificateNotifyFn handler', () => {
  const getHandler = () => {
    const fn = bulkInngestFunctions[1] as { _handler: (args: { event: unknown; step: unknown }) => Promise<unknown> };
    return fn._handler;
  };

  const makeCerts = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `cert-${i + 1}`,
      certificateNumber: `GEM-${String(i + 1).padStart(5, '0')}`,
      certificateType: 'delegate_attendance',
      storageKey: `certs/cert-${i + 1}.pdf`,
      personId: `person-${i + 1}`,
      personFullName: `Person ${i + 1}`,
      personEmail: `person${i + 1}@example.com`,
      personPhone: `+9199999${String(i).padStart(5, '0')}`,
    }));

  it('batches 25 email certs into 2 batches (20+5) with step.sleep between', async () => {
    const handler = getHandler();
    const step = createMockStep();
    const certs = makeCerts(25);

    // Mock load-certificates step
    mockDb.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: { eventId: 'evt-1', certificateIds: certs.map(c => c.id), channel: 'email' },
      },
      step,
    });

    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).toContain('load-certificates');
    expect(stepNames).toContain('email-batch-1');
    expect(stepNames).toContain('email-batch-2');
    expect(stepNames).not.toContain('email-batch-3');

    // Verify sleep was called between batches
    expect(step.sleeps).toContain('email-cooldown-1');
    // No cooldown after last batch
    expect(step.sleeps).not.toContain('email-cooldown-2');

    const res = result as { sent: number; failed: number; total: number };
    expect(res.sent).toBe(25);
    expect(res.total).toBe(25);
  });

  it('sends WhatsApp per message with step.sleep(2s) between each', async () => {
    const handler = getHandler();
    const step = createMockStep();
    const certs = makeCerts(3);

    mockDb.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: { eventId: 'evt-1', certificateIds: certs.map(c => c.id), channel: 'whatsapp' },
      },
      step,
    });

    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).toContain('whatsapp-msg-1');
    expect(stepNames).toContain('whatsapp-msg-2');
    expect(stepNames).toContain('whatsapp-msg-3');

    // Verify 2s sleep between messages (not after last)
    expect(step.sleeps).toContain('whatsapp-cooldown-1');
    expect(step.sleeps).toContain('whatsapp-cooldown-2');
    expect(step.sleeps).not.toContain('whatsapp-cooldown-3');

    const res = result as { sent: number; failed: number };
    expect(res.sent).toBe(3);
  });

  // Test 8: certs without storageKey filtered out
  it('filters out certs without storageKey before sending', async () => {
    const handler = getHandler();
    const step = createMockStep();

    const certs = [
      { id: 'cert-1', certificateNumber: 'GEM-001', certificateType: 'att', storageKey: 'key.pdf', personId: 'p1', personFullName: 'A', personEmail: 'a@x.com', personPhone: null },
      { id: 'cert-2', certificateNumber: 'GEM-002', certificateType: 'att', storageKey: null, personId: 'p2', personFullName: 'B', personEmail: 'b@x.com', personPhone: null },
    ];

    mockDb.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: { eventId: 'evt-1', certificateIds: ['cert-1', 'cert-2'], channel: 'email' },
      },
      step,
    });

    const res = result as { sent: number; total: number };
    // Only 1 cert has storageKey
    expect(res.total).toBe(1);
    expect(res.sent).toBe(1);
  });
});

// ── Test 6: Archive generation steps ───────────────────────

describe('archiveGenerateFn handler', () => {
  it('runs 4 steps: agenda, CSV, cert keys, build-and-upload', async () => {
    const handler = (bulkInngestFunctions[2] as { _handler: (args: { event: unknown; step: unknown }) => Promise<unknown> })._handler;
    const step = createMockStep();

    // The archive handler uses dynamic imports inside step.run.
    // The mocks above handle generateAgendaExcel, generateNotificationLogCsv, getCertificateStorageKeys.
    // For build-and-upload-archive, we need to mock archiver and storage.
    vi.doMock('archiver', () => ({
      default: vi.fn().mockImplementation(() => {
        const archive = {
          append: vi.fn(),
          pipe: vi.fn(),
          finalize: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
        };
        return archive;
      }),
    }));

    const result = await handler({
      event: { data: { eventId: 'evt-1' } },
      step,
    });

    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).toContain('generate-agenda');
    expect(stepNames).toContain('generate-notification-csv');
    expect(stepNames).toContain('collect-certificate-keys');
    expect(stepNames).toContain('build-and-upload-archive');
    expect(stepNames).toHaveLength(4);
  });
});
