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

// ── Hoisted mocks ──────────────────────────────────────────

const { mockCreateFunction, mockDb, mockSendNotification } = vi.hoisted(() => ({
  mockCreateFunction: vi.fn((config: Record<string, unknown>, handler: Function) => ({
    _config: config,
    _handler: handler,
  })),
  mockDb: {
    select: vi.fn(),
    selectDistinctOn: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  mockSendNotification: vi.fn().mockResolvedValue({ logId: 'log-1', status: 'sent' }),
}));

// ── Mock Inngest client ────────────────────────────────────

vi.mock('./client', () => ({
  inngest: {
    createFunction: (config: Record<string, unknown>, handler: Function) => mockCreateFunction(config, handler),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema', () => ({
  issuedCertificates: {
    id: 'id',
    eventId: 'eid',
    personId: 'pid',
    templateId: 'tid',
    templateVersionNo: 'tvn',
    certificateType: 'ct',
    certificateNumber: 'cn',
    supersededById: 'sbi',
    supersedesId: 'sid',
    revokedAt: 'ra',
    revokeReason: 'rr',
    storageKey: 'sk',
    status: 's',
  },
  certificateTemplates: { id: 'id', eventId: 'eid', status: 's' },
  people: { id: 'id', fullName: 'fn', email: 'em', phoneE164: 'ph', designation: 'des' },
  eventRegistrations: { eventId: 'eid', personId: 'pid', status: 's', category: 'cat' },
  sessionAssignments: { eventId: 'eid', personId: 'pid' },
  attendanceRecords: { eventId: 'eid', personId: 'pid' },
  eventPeople: { eventId: 'eid', personId: 'pid' },
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
vi.mock('@pdfme/generator', () => ({
  generate: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4])),
}));
vi.mock('@pdfme/schemas', () => ({
  text: {},
  image: {},
  line: {},
  rectangle: {},
  ellipse: {},
  barcodes: {},
}));
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));
vi.mock('@/lib/exports/archive', () => ({
  generateAgendaExcel: vi.fn().mockResolvedValue(Buffer.from('agenda')),
  generateNotificationLogCsv: vi.fn().mockResolvedValue(Buffer.from('csv')),
  getCertificateStorageKeys: vi.fn().mockResolvedValue([]),
  buildArchiveStorageKey: vi.fn().mockReturnValue('archives/test.zip'),
}));

const mockStorageProvider = {
  upload: vi.fn(async (storageKey: string, data: Buffer) => ({
    storageKey,
    fileSizeBytes: data.length,
    fileChecksumSha256: 'sha256-test',
  })),
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.url/archive.zip'),
  delete: vi.fn().mockResolvedValue(undefined),
  uploadStream: null,
};

// Mock archiver for archive test — returns a fake archive object
vi.mock('archiver', () => ({
  default: vi.fn(() => {
    const archive = {
      append: vi.fn(),
      pipe: vi.fn(),
      finalize: vi.fn().mockImplementation(() => Promise.resolve()),
      on: vi.fn(),
    };
    return archive;
  }),
}));

import { bulkInngestFunctions, chunk } from './bulk-functions';
import * as issuanceUtils from '@/lib/certificates/issuance-utils';
import * as storageModule from '@/lib/certificates/storage';
import * as pdfGenerator from '@pdfme/generator';

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
  vi.mocked(storageModule.createR2Provider).mockReturnValue(mockStorageProvider as never);
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
    const fn = bulkInngestFunctions[0] as unknown as { _handler: (args: { event: unknown; step: unknown }) => Promise<unknown> };
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
    mockDb.update.mockImplementation(() => chainedUpdate());

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
    expect(vi.mocked(pdfGenerator.generate)).toHaveBeenCalledTimes(100);
    expect(mockStorageProvider.upload).toHaveBeenCalledTimes(100);
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
    mockDb.update.mockImplementation(() => chainedUpdate());

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

  it('renders, uploads, and persists PDF metadata for generated certificates', async () => {
    const handler = getHandler();
    const step = createMockStep();
    const txInsert = vi.fn().mockImplementation(() => chainedInsert([{ id: 'cert-1' }]));

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainedSelect([mockTemplate]);
      if (selectCallCount === 2) return chainedSelect(makeRecipients(1));
      if (selectCallCount === 3) return chainedSelect([]);
      if (selectCallCount === 4) return chainedSelect([]);
      if (selectCallCount === 5) return chainedSelect([]);
      if (selectCallCount === 6) return chainedSelect([]);
      return chainedSelect([]);
    });

    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: txInsert,
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb.update.mockImplementation(() => chainedUpdate());

    await handler({
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

    expect(vi.mocked(pdfGenerator.generate)).toHaveBeenCalledTimes(1);
    expect(mockStorageProvider.upload).toHaveBeenCalledWith(
      expect.stringContaining('certs/evt-1/delegate_attendance/'),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(txInsert).toHaveBeenCalled();
  });

  it('reuses the current certificate on retry and uploads the missing PDF without inserting a duplicate row', async () => {
    const handler = getHandler();
    const step = createMockStep();
    const existingCert = {
      id: 'cert-existing',
      eventId: 'evt-1',
      personId: 'person-1',
      templateId: 'tpl-1',
      templateVersionNo: 1,
      certificateType: 'delegate_attendance',
      certificateNumber: 'GEM-00042',
      status: 'issued',
      supersededById: null,
      supersedesId: null,
      revokedAt: null,
      revokeReason: null,
      storageKey: 'certs/evt-1/delegate_attendance/cert-existing.pdf',
    };

    vi.mocked(issuanceUtils.findCurrentCertificate).mockReturnValueOnce(existingCert);

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainedSelect([mockTemplate]);
      if (selectCallCount === 2) return chainedSelect(makeRecipients(1));
      if (selectCallCount === 3) return chainedSelect([]);
      if (selectCallCount === 4) return chainedSelect([{ certificateNumber: 'GEM-00042' }]);
      if (selectCallCount === 5) return chainedSelect([existingCert]);
      if (selectCallCount === 6) return chainedSelect([{ certificateNumber: 'GEM-00042' }]);
      return chainedSelect([]);
    });

    const txInsert = vi.fn().mockImplementation(() => chainedInsert([{ id: 'unexpected' }]));
    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: txInsert,
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb.update.mockImplementation(() => chainedUpdate());

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

    const res = result as { certificateIds: string[] };
    expect(txInsert).not.toHaveBeenCalled();
    expect(res.certificateIds).toEqual(['cert-existing']);
    expect(mockStorageProvider.upload).toHaveBeenCalledWith(
      'certs/evt-1/delegate_attendance/cert-existing.pdf',
      expect.any(Buffer),
      'application/pdf',
    );
  });

  it('does not insert new certificate rows when PDF rendering fails', async () => {
    const handler = getHandler();
    const step = createMockStep();
    const renderError = new Error('template render failed');
    vi.mocked(pdfGenerator.generate).mockRejectedValueOnce(renderError);

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainedSelect([mockTemplate]);
      if (selectCallCount === 2) return chainedSelect(makeRecipients(1));
      if (selectCallCount === 3) return chainedSelect([]);
      if (selectCallCount === 4) return chainedSelect([]);
      if (selectCallCount === 5) return chainedSelect([]);
      if (selectCallCount === 6) return chainedSelect([]);
      return chainedSelect([]);
    });

    const txInsert = vi.fn().mockImplementation(() => chainedInsert([{ id: 'unexpected' }]));
    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: txInsert,
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

    const res = result as { issued: number; errors: string[] };
    expect(res.issued).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('template render failed');
    expect(mockStorageProvider.upload).not.toHaveBeenCalled();
    expect(txInsert).not.toHaveBeenCalled();
  });

  it('reports failure and continues when DB transaction fails after upload', async () => {
    const handler = getHandler();
    const step = createMockStep();

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainedSelect([mockTemplate]);
      if (selectCallCount === 2) return chainedSelect(makeRecipients(1));
      if (selectCallCount === 3) return chainedSelect([]);
      if (selectCallCount === 4) return chainedSelect([]);
      if (selectCallCount === 5) return chainedSelect([]);
      if (selectCallCount === 6) return chainedSelect([]);
      return chainedSelect([]);
    });

    mockDb.transaction.mockRejectedValueOnce(new Error('insert failed'));

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

    const res = result as { issued: number; errors: string[] };
    expect(res.issued).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('insert failed');
    expect(mockStorageProvider.upload).toHaveBeenCalledTimes(1);
  });
});

// ── Test: Per-cert transaction isolation (cert-api-011) ──────

describe('bulkCertificateGenerateFn per-cert isolation', () => {
  const getHandler = () => {
    const fn = bulkInngestFunctions[0] as unknown as { _handler: (args: { event: unknown; step: unknown }) => Promise<unknown> };
    return fn._handler;
  };

  it('failure on cert 5 of 10 commits 1-4 and 6-10 (9 total)', async () => {
    const handler = getHandler();
    const step = createMockStep();
    const recipients = makeRecipients(10);

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainedSelect([mockTemplate]);
      if (selectCallCount === 2) return chainedSelect(recipients);
      if (selectCallCount === 3) return chainedSelect([]);
      if (selectCallCount === 4) return chainedSelect([]);
      return chainedSelect([]);
    });

    // Track per-cert inserts
    let certInsertCount = 0;
    mockDb.transaction.mockImplementation(async (fn: any) => {
      certInsertCount++;
      // Fail on the 5th cert
      if (certInsertCount === 5) {
        throw new Error('DB error on cert 5');
      }
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: `cert-${certInsertCount}` }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb.update.mockImplementation(() => chainedUpdate());

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

    const res = result as { issued: number; errors: string[]; certificateIds: string[] };
    // 9 successes (1-4 + 6-10), 1 failure
    expect(res.issued).toBe(9);
    expect(res.certificateIds).toHaveLength(9);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('person-5');
  });

  it('resume skips already-issued persons (no duplicates)', async () => {
    const handler = getHandler();
    const step = createMockStep();
    const recipients = makeRecipients(3);

    // Person-1 already has an issued cert with the same template+version
    const existingCert = {
      id: 'cert-existing-1',
      eventId: 'evt-1',
      personId: 'person-1',
      templateId: 'tpl-1',
      templateVersionNo: 1,
      certificateType: 'delegate_attendance',
      certificateNumber: 'GEM-00001',
      status: 'issued',
      supersededById: null,
      supersedesId: null,
      revokedAt: null,
      revokeReason: null,
      storageKey: 'certs/evt-1/delegate_attendance/cert-existing-1.pdf',
    };

    vi.mocked(issuanceUtils.findCurrentCertificate).mockImplementation(
      (_certs: any, personId: string) => {
        if (personId === 'person-1') return existingCert;
        return null;
      },
    );

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainedSelect([mockTemplate]);
      if (selectCallCount === 2) return chainedSelect(recipients);
      if (selectCallCount === 3) return chainedSelect([existingCert]);
      if (selectCallCount === 4) return chainedSelect([{ certificateNumber: 'GEM-00001' }]);
      if (selectCallCount === 5) return chainedSelect([existingCert]);
      if (selectCallCount === 6) return chainedSelect([{ certificateNumber: 'GEM-00001' }]);
      return chainedSelect([]);
    });

    let txCallCount = 0;
    mockDb.transaction.mockImplementation(async (fn: any) => {
      txCallCount++;
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: `new-cert-${txCallCount}` }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb.update.mockImplementation(() => chainedUpdate());

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

    const res = result as { issued: number; certificateIds: string[] };
    // Person-1 reused, person-2 and person-3 get new certs
    expect(res.certificateIds).toContain('cert-existing-1');
    // Only 2 new transactions (for person-2 and person-3)
    expect(txCallCount).toBe(2);
  });
});

// ── Test 4 & 5: Bulk notification batching ─────────────────

describe('bulkCertificateNotifyFn handler', () => {
  const getHandler = () => {
    const fn = bulkInngestFunctions[1] as unknown as { _handler: (args: { event: unknown; step: unknown }) => Promise<unknown> };
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
    const handler = (bulkInngestFunctions[2] as unknown as { _handler: (args: { event: unknown; step: unknown }) => Promise<unknown> })._handler;

    // For the archive test, the build-and-upload step involves archiver + stream.
    // We verify the steps run by checking only the first 3 steps complete.
    // The 4th step (build-and-upload) uses archiver which pipes to PassThrough,
    // so we use a simpler mock that tracks step names only.
    const stepNames: string[] = [];
    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        stepNames.push(name);
        // For the first 3 steps, execute normally (they use mocked imports)
        if (name !== 'build-and-upload-archive') {
          return fn();
        }
        // For build-and-upload, return a mock result to avoid stream complexity
        return {
          archiveStorageKey: 'archives/test.zip',
          archiveUrl: 'https://signed.url/archive.zip',
          fileCount: 2,
          archiveSizeBytes: 1024,
        };
      }),
      sleep: vi.fn(),
    };

    const result = await handler({
      event: { data: { eventId: 'evt-1' } },
      step,
    });

    expect(stepNames).toEqual([
      'generate-agenda',
      'generate-notification-csv',
      'collect-certificate-keys',
      'build-and-upload-archive',
    ]);

    const res = result as { archiveStorageKey: string; fileCount: number };
    expect(res.archiveStorageKey).toBe('archives/test.zip');
    expect(res.fileCount).toBe(2);
  });
});
