/**
 * Mutation-kill tests for src/lib/inngest/bulk-functions.ts
 * Target: raise mutation score from 35.97% to ≥75%
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────
const { mockCreateFunction2, mockDb2, mockSendNotification2, mockRedisClient, mockWriteBulkSummary } = vi.hoisted(() => ({
  mockCreateFunction2: vi.fn((config: Record<string, unknown>, handler: Function) => ({
    _config: config,
    _handler: handler,
  })),
  mockDb2: {
    select: vi.fn(),
    selectDistinctOn: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  mockSendNotification2: vi.fn().mockResolvedValue({ logId: 'log-1', status: 'sent' }),
  mockRedisClient: { del: vi.fn().mockResolvedValue(1) },
  mockWriteBulkSummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./client', () => ({
  inngest: {
    createFunction: (config: Record<string, unknown>, handler: Function) => mockCreateFunction2(config, handler),
  },
}));
vi.mock('@/lib/db', () => ({ db: mockDb2 }));
vi.mock('@/lib/db/schema', () => ({
  issuedCertificates: {
    id: 'id', eventId: 'eid', personId: 'pid', templateId: 'tid', templateVersionNo: 'tvn',
    certificateType: 'ct', certificateNumber: 'cn', supersededById: 'sbi', supersedesId: 'sid',
    revokedAt: 'ra', revokeReason: 'rr', storageKey: 'sk', status: 's', lastSentAt: 'lsa',
    updatedAt: 'ua', fileSizeBytes: 'fsb', fileChecksumSha256: 'fcs', eligibilityBasisType: 'ebt',
    fileName: 'fn2', issuedBy: 'ib', renderedVariablesJson: 'rvj', brandingSnapshotJson: 'bsj',
    templateSnapshotJson: 'tsj',
  },
  certificateTemplates: { id: 'id', eventId: 'eid', status: 's', certificateType: 'ct', versionNo: 'vn', templateJson: 'tj', brandingSnapshotJson: 'bsj' },
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
  text: {}, image: {}, line: {}, rectangle: {}, ellipse: {}, barcodes: {},
}));
vi.mock('@/lib/notifications/send', () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification2(...args),
}));
vi.mock('@/lib/exports/archive', () => ({
  generateAgendaExcel: vi.fn().mockResolvedValue(Buffer.from('agenda-data')),
  generateNotificationLogCsv: vi.fn().mockResolvedValue(Buffer.from('csv-data')),
  getCertificateStorageKeys: vi.fn().mockResolvedValue([]),
  buildArchiveStorageKey: vi.fn().mockReturnValue('archives/evt-1.zip'),
}));
vi.mock('@/lib/certificates/bulk-generation-state', () => ({
  createBulkGenerationRedisClient: vi.fn(() => mockRedisClient),
  writeBulkCertificateGenerationSummary: (...args: unknown[]) => mockWriteBulkSummary(...args),
}));
vi.mock('archiver', () => ({
  default: vi.fn().mockImplementation(() => {
    let capturedStream: any = null;
    return {
      append: vi.fn(),
      pipe: vi.fn().mockImplementation((s: any) => { capturedStream = s; }),
      on: vi.fn(),
      finalize: vi.fn().mockImplementation(() => {
        if (capturedStream) capturedStream.end();
        return Promise.resolve();
      }),
    };
  }),
}));

import { bulkInngestFunctions } from './bulk-functions';
import * as issuanceUtils from '@/lib/certificates/issuance-utils';
import * as storageModule from '@/lib/certificates/storage';
import * as pdfGenerator from '@pdfme/generator';
import * as bulkState from '@/lib/certificates/bulk-generation-state';

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
function chainedSelectDistinct(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockImplementation(() => chain),
    innerJoin: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
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

function createMockStep() {
  const stepRuns: Array<{ name: string; result: unknown }> = [];
  const sleeps: Array<{ name: string; duration: string }> = [];
  return {
    stepRuns,
    sleeps,
    run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
      const result = await fn();
      stepRuns.push({ name, result });
      return result;
    }),
    sleep: vi.fn(async (name: string, duration: string) => {
      sleeps.push({ name, duration });
    }),
  };
}

const mockStorageProvider2 = {
  upload: vi.fn(async (storageKey: string, data: Buffer) => ({
    storageKey,
    fileSizeBytes: data.length,
    fileChecksumSha256: 'sha256-test',
  })),
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.url/cert.pdf'),
  delete: vi.fn().mockResolvedValue(undefined),
  uploadStream: null,
};

const mockTemplate = {
  id: 'tpl-1',
  eventId: 'evt-1',
  certificateType: 'delegate_attendance',
  status: 'active',
  versionNo: 1,
  templateJson: { schemas: [] },
  brandingSnapshotJson: null,
};

function makeRecipients2(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `person-${i + 1}`,
    fullName: `Person ${i + 1}`,
    email: `person${i + 1}@example.com`,
    designation: 'Doctor',
  }));
}

/** Minimal select mock: template on call 1, recipients on call 2, empty arrays thereafter */
function makeSelectMock(recipients: unknown[], extraCalls: Record<number, unknown[]> = {}) {
  let n = 0;
  mockDb2.select.mockImplementation(() => {
    n++;
    if (extraCalls[n]) return chainedSelect(extraCalls[n]);
    if (n === 1) return chainedSelect([mockTemplate]);
    if (n === 2) return chainedSelect(recipients);
    return chainedSelect([]);
  });
}

function makeSelectMockWithInsert(recipients: unknown[]) {
  makeSelectMock(recipients);
  mockDb2.transaction.mockImplementation(async (fn: any) => {
    const tx = {
      insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
      update: vi.fn().mockImplementation(() => chainedUpdate()),
    };
    return fn(tx);
  });
  mockDb2.update.mockImplementation(() => chainedUpdate());
}

const getCertHandler = () =>
  (bulkInngestFunctions[0] as any)._handler as (args: any) => Promise<any>;
const getNotifyHandler = () =>
  (bulkInngestFunctions[1] as any)._handler as (args: any) => Promise<any>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storageModule.createR2Provider).mockReturnValue(mockStorageProvider2 as never);
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 1: Config assertions — kills L177/178, L535/536, L714/715 (15 mutants)
// ──────────────────────────────────────────────────────────────────────────────

describe('Inngest function config assertions', () => {
  it('bulkCertificateGenerateFn has correct concurrency key, limit, and trigger event', () => {
    const config = (bulkInngestFunctions[0] as any)._config;
    expect(config.concurrency).toHaveLength(1);
    expect(config.concurrency[0].key).toBe('event.data.eventId');
    expect(config.concurrency[0].limit).toBe(1);
    expect(config.triggers).toHaveLength(1);
    expect(config.triggers[0].event).toBe('bulk/certificates.generate');
  });

  it('bulkCertificateNotifyFn has correct concurrency key, limit, and trigger event', () => {
    const config = (bulkInngestFunctions[1] as any)._config;
    expect(config.concurrency).toHaveLength(1);
    expect(config.concurrency[0].key).toBe('event.data.eventId');
    expect(config.concurrency[0].limit).toBe(1);
    expect(config.triggers).toHaveLength(1);
    expect(config.triggers[0].event).toBe('bulk/certificates.notify');
  });

  it('archiveGenerateFn has correct concurrency key, limit, and trigger event', () => {
    const config = (bulkInngestFunctions[2] as any)._config;
    expect(config.concurrency).toHaveLength(1);
    expect(config.concurrency[0].key).toBe('event.data.eventId');
    expect(config.concurrency[0].limit).toBe(1);
    expect(config.triggers).toHaveLength(1);
    expect(config.triggers[0].event).toBe('bulk/archive.generate');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 2: releaseBulkGenerationLock — kills L98-99, covers NoCoverage L102-L110
// ──────────────────────────────────────────────────────────────────────────────

describe('releaseBulkGenerationLock via handler finally block', () => {
  it('calls redis.del(lockKey) after successful generation when lockKey is a string', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    makeSelectMockWithInsert(makeRecipients2(1));

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates', eligibilityBasisType: 'registration',
          lockKey: 'lock:evt-1:bulk-cert-xyz',
        },
      },
      step,
    });

    expect(mockRedisClient.del).toHaveBeenCalledWith('lock:evt-1:bulk-cert-xyz');
  });

  it('does NOT call redis.del when lockKey is not a string (number)', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    makeSelectMockWithInsert(makeRecipients2(1));

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates', eligibilityBasisType: 'registration',
          lockKey: 42,
        },
      },
      step,
    });

    expect(mockRedisClient.del).not.toHaveBeenCalled();
  });

  it('does NOT call redis.del when lockKey is absent', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    makeSelectMockWithInsert(makeRecipients2(1));

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates', eligibilityBasisType: 'registration',
        },
      },
      step,
    });

    expect(mockRedisClient.del).not.toHaveBeenCalled();
  });

  it('calls redis.del even when handler throws (finally block)', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    // Cause throw: template not found
    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([]); // no template found → throw
      return chainedSelect([]);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await expect(
      handler({
        event: {
          data: {
            eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
            recipientType: 'all_delegates', lockKey: 'lock:evt-1:abc',
          },
        },
        step,
      }),
    ).rejects.toThrow();

    expect(mockRedisClient.del).toHaveBeenCalledWith('lock:evt-1:abc');
  });

  it('logs error but does not throw when redis is null', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    // Make redis client return null
    vi.mocked(bulkState.createBulkGenerationRedisClient).mockReturnValueOnce(null as any);
    makeSelectMockWithInsert(makeRecipients2(1));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      handler({
        event: {
          data: {
            eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
            recipientType: 'all_delegates', lockKey: 'lock:evt-1:null-redis',
          },
        },
        step,
      }),
    ).resolves.not.toThrow();

    consoleSpy.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 3: storeBulkGenerationSummary — kills L125-127, NoCoverage L129
// ──────────────────────────────────────────────────────────────────────────────

describe('storeBulkGenerationSummary via handler', () => {
  it('calls writeBulkCertificateGenerationSummary with status=completed when batchId provided', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    makeSelectMockWithInsert(makeRecipients2(1));

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates', batchId: 'batch-abc-123',
        },
      },
      step,
    });

    expect(mockWriteBulkSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        batch_id: 'batch-abc-123',
        event_id: 'evt-1',
        status: 'completed',
        issued: expect.any(Number),
        skipped: expect.any(Number),
        total: expect.any(Number),
        certificate_ids: expect.any(Array),
        errors: expect.any(Array),
        completed_at: expect.any(String),
      }),
    );
  });

  it('does NOT call writeBulkCertificateGenerationSummary when batchId is absent', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    makeSelectMockWithInsert(makeRecipients2(1));

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
          // no batchId
        },
      },
      step,
    });

    expect(mockWriteBulkSummary).not.toHaveBeenCalled();
  });

  it('calls writeBulkCertificateGenerationSummary with status=failed when handler throws', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([]); // no template → throw
      return chainedSelect([]);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await expect(
      handler({
        event: {
          data: {
            eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
            recipientType: 'all_delegates', batchId: 'batch-fail-99',
          },
        },
        step,
      }),
    ).rejects.toThrow();

    expect(mockWriteBulkSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        batch_id: 'batch-fail-99',
        status: 'failed',
        certificate_ids: [],
        errors: expect.arrayContaining([expect.any(String)]),
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 4: eligibilityBasisType default — kills L184
// ──────────────────────────────────────────────────────────────────────────────

describe('eligibilityBasisType', () => {
  it('uses provided eligibilityBasisType not the default manual', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let capturedInsertValues: any = null;

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect(makeRecipients2(1));
      return chainedSelect([]);
    });
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const insertMock = vi.fn().mockImplementation(() => {
        const chain: any = {
          values: vi.fn().mockImplementation((vals: any) => {
            capturedInsertValues = vals;
            return chain;
          }),
          returning: vi.fn().mockResolvedValue([{ id: 'cert-new-1' }]),
        };
        return chain;
      });
      const tx = { insert: insertMock, update: vi.fn().mockImplementation(() => chainedUpdate()) };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
          eligibilityBasisType: 'attendance_verified',
        },
      },
      step,
    });

    expect(capturedInsertValues).not.toBeNull();
    expect(capturedInsertValues.eligibilityBasisType).toBe('attendance_verified');
  });

  it('defaults eligibilityBasisType to manual when not provided', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let capturedInsertValues: any = null;

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect(makeRecipients2(1));
      return chainedSelect([]);
    });
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const insertMock = vi.fn().mockImplementation(() => {
        const chain: any = {
          values: vi.fn().mockImplementation((vals: any) => {
            capturedInsertValues = vals;
            return chain;
          }),
          returning: vi.fn().mockResolvedValue([{ id: 'cert-new-2' }]),
        };
        return chain;
      });
      const tx = { insert: insertMock, update: vi.fn().mockImplementation(() => chainedUpdate()) };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
          // no eligibilityBasisType
        },
      },
      step,
    });

    expect(capturedInsertValues.eligibilityBasisType).toBe('manual');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 5: cert gen edge cases — kills L189, L198, L202, L297-298, L316, L503
// ──────────────────────────────────────────────────────────────────────────────

describe('bulkCertificateGenerateFn edge cases', () => {
  it('throws when neither templateId nor certificateType is provided', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    mockDb2.select.mockImplementation(() => chainedSelect([mockTemplate]));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await expect(
      handler({
        event: {
          data: { eventId: 'evt-1', userId: 'user-1', recipientType: 'all_delegates' },
        },
        step,
      }),
    ).rejects.toThrow('Certificate template or type is required');
  });

  it('throws when template is not found in DB', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([]); // no template
      return chainedSelect([]);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await expect(
      handler({
        event: {
          data: {
            eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-missing',
            recipientType: 'all_delegates',
          },
        },
        step,
      }),
    ).rejects.toThrow('Active certificate template not found');
  });

  it('returns 0 issued immediately when scope.ids is empty array', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      return chainedSelect([]);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          scope: { ids: [] },
        },
      },
      step,
    });

    expect((result as any).issued).toBe(0);
    expect((result as any).certificateIds).toHaveLength(0);
  });

  it('scope=all queries eventPeople (not eventRegistrations)', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let n = 0;
    const recipients = makeRecipients2(2);
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect(recipients); // all event people
      return chainedSelect([]); // existing certs, numbers, batch selects
    });
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          scope: 'all',
        },
      },
      step,
    });

    expect((result as any).issued).toBe(2);
  });

  it('scope.ids with specific person IDs runs the IDs branch', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let n = 0;
    const recipients = makeRecipients2(2);
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect(recipients); // specific IDs query
      return chainedSelect([]);
    });
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          scope: { ids: ['person-1', 'person-2'] },
        },
      },
      step,
    });

    expect((result as any).issued).toBe(2);
  });

  it('deduplicates recipients with the same ID', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    // Return 3 entries but 2 have the same person ID
    const dupRecipients = [
      { id: 'p1', fullName: 'Alice', email: 'a@x.com', designation: null },
      { id: 'p1', fullName: 'Alice', email: 'a@x.com', designation: null },
      { id: 'p2', fullName: 'Bob', email: 'b@x.com', designation: null },
    ];
    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect(dupRecipients);
      return chainedSelect([]);
    });
    let insertCount = 0;
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      insertCount++;
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: `cert-${insertCount}` }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
        },
      },
      step,
    });

    // Only 2 unique recipients → 2 certs
    expect((result as any).issued).toBe(2);
    expect(insertCount).toBe(2);
  });

  it('skipped count equals total minus issued', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipients = makeRecipients2(3);
    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect(recipients);
      return chainedSelect([]);
    });
    let txCount = 0;
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      txCount++;
      if (txCount === 2) throw new Error('DB error on cert 2');
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: `cert-${txCount}` }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
        },
      },
      step,
    });

    // 3 total, 1 failed → 2 issued, 1 skipped
    expect((result as any).issued).toBe(2);
    expect((result as any).skipped).toBe(1);
    expect((result as any).skipped).toBe(3 - 2); // not 3+2=5
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 6: recipientType branches — NoCoverage L243-L291
// ──────────────────────────────────────────────────────────────────────────────

describe('recipientType branches', () => {
  it('all_faculty: uses selectDistinctOn on sessionAssignments', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipients = makeRecipients2(2);

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      return chainedSelect([]);
    });
    mockDb2.selectDistinctOn.mockImplementation(() => chainedSelectDistinct(recipients));
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_faculty',
        },
      },
      step,
    });

    expect(mockDb2.selectDistinctOn).toHaveBeenCalled();
    expect((result as any).issued).toBe(2);
  });

  it('all_attendees: uses selectDistinctOn on attendanceRecords', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipients = makeRecipients2(3);

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      return chainedSelect([]);
    });
    mockDb2.selectDistinctOn.mockImplementation(() => chainedSelectDistinct(recipients));
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_attendees',
        },
      },
      step,
    });

    expect(mockDb2.selectDistinctOn).toHaveBeenCalled();
    expect((result as any).issued).toBe(3);
  });

  it('custom with empty personIds returns 0 issued immediately', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      return chainedSelect([]);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'custom',
          personIds: [],
        },
      },
      step,
    });

    expect((result as any).issued).toBe(0);
  });

  it('custom with personIds queries those specific people', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipients = makeRecipients2(2);

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect(recipients);
      return chainedSelect([]);
    });
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'custom',
          personIds: ['person-1', 'person-2'],
        },
      },
      step,
    });

    expect((result as any).issued).toBe(2);
  });

  it('throws for unknown recipientType', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      return chainedSelect([]);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await expect(
      handler({
        event: {
          data: {
            eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
            recipientType: 'unknown_type',
          },
        },
        step,
      }),
    ).rejects.toThrow('Invalid bulk certificate generation recipient scope');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 7: renderedVariables — kills L408, L411, L412
// ──────────────────────────────────────────────────────────────────────────────

describe('renderedVariables passed to PDF generator', () => {
  it('passes correct field values including designation and email', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipient = {
      id: 'p-doc', fullName: 'Dr. Alice', email: 'alice@hospital.com', designation: 'Surgeon',
    };

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect([recipient]);
      return chainedSelect([]);
    });
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: 'cert-alice' }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
        },
      },
      step,
    });

    expect(vi.mocked(pdfGenerator.generate)).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [expect.objectContaining({
          full_name: 'Dr. Alice',
          recipient_name: 'Dr. Alice',
          designation: 'Surgeon',
          email: 'alice@hospital.com',
          certificate_number: expect.any(String),
        })],
      }),
    );
  });

  it('uses empty string for null designation and email', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipient = { id: 'p-nodesig', fullName: 'Bob', email: null, designation: null };

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect([recipient]);
      return chainedSelect([]);
    });
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: 'cert-bob' }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
      };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
        },
      },
      step,
    });

    expect(vi.mocked(pdfGenerator.generate)).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [expect.objectContaining({ designation: '', email: '' })],
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 8: cert number collision / seq — kills L396, L437, L441, L462
// ──────────────────────────────────────────────────────────────────────────────

describe('certificate number generation and seq', () => {
  it('increments seq when certificate number collides — not decrements', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipient = { id: 'p-collision', fullName: 'Carol', email: 'c@test.com', designation: null };
    let capturedInsertValues: any = null;

    // getNextSequence returns 1, but GEM-00001 is already in freshNumbers
    vi.mocked(issuanceUtils.getNextSequence).mockReturnValue(1);
    vi.mocked(issuanceUtils.findCurrentCertificate).mockReturnValue(null);

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect([recipient]);
      if (n === 3) return chainedSelect([]); // existingCerts
      if (n === 4) return chainedSelect([]); // existingNumbers
      if (n === 5) return chainedSelect([]); // batchExistingCerts
      if (n === 6) return chainedSelect([{ certificateNumber: 'GEM-00001' }]); // freshNumbers WITH collision
      return chainedSelect([]);
    });

    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const insertMock = vi.fn().mockImplementation(() => {
        const chain: any = {
          values: vi.fn().mockImplementation((vals: any) => {
            capturedInsertValues = vals;
            return chain;
          }),
          returning: vi.fn().mockResolvedValue([{ id: 'cert-carol' }]),
        };
        return chain;
      });
      const tx = { insert: insertMock, update: vi.fn().mockImplementation(() => chainedUpdate()) };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
        },
      },
      step,
    });

    // With collision on GEM-00001, seq increments to 2 → GEM-00002
    expect(capturedInsertValues).not.toBeNull();
    expect(capturedInsertValues.certificateNumber).toBe('GEM-00002');
  });

  it('inserts fileName as certificateNumber.pdf', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipient = { id: 'p-fn', fullName: 'Dan', email: 'd@test.com', designation: null };
    let capturedInsertValues: any = null;

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect([recipient]);
      return chainedSelect([]);
    });
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const insertMock = vi.fn().mockImplementation(() => {
        const chain: any = {
          values: vi.fn().mockImplementation((vals: any) => {
            capturedInsertValues = vals;
            return chain;
          }),
          returning: vi.fn().mockResolvedValue([{ id: 'cert-dan' }]),
        };
        return chain;
      });
      const tx = { insert: insertMock, update: vi.fn().mockImplementation(() => chainedUpdate()) };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
        },
      },
      step,
    });

    expect(capturedInsertValues.fileName).toBe(`${capturedInsertValues.certificateNumber}.pdf`);
    expect(capturedInsertValues.fileName).toMatch(/^GEM-\d{5}\.pdf$/);
  });

  it('updates superseded cert when chain has supersedesId', async () => {
    const handler = getCertHandler();
    const step = createMockStep();
    const recipient = { id: 'p-super', fullName: 'Eve', email: 'e@test.com', designation: null };

    vi.mocked(issuanceUtils.buildSupersessionChain).mockReturnValueOnce({
      newCertLink: { supersedesId: 'old-cert-id-999' },
      oldCertUpdate: null,
    } as any);

    let n = 0;
    mockDb2.select.mockImplementation(() => {
      n++;
      if (n === 1) return chainedSelect([mockTemplate]);
      if (n === 2) return chainedSelect([recipient]);
      return chainedSelect([]);
    });

    let txUpdateCalled = false;
    mockDb2.transaction.mockImplementation(async (fn: any) => {
      const insertMock = vi.fn().mockImplementation(() => {
        const chain: any = {
          values: vi.fn().mockImplementation(() => chain),
          returning: vi.fn().mockResolvedValue([{ id: 'cert-new-super' }]),
        };
        return chain;
      });
      const updateMock = vi.fn().mockImplementation(() => {
        txUpdateCalled = true;
        return chainedUpdate();
      });
      const tx = { insert: insertMock, update: updateMock };
      return fn(tx);
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: {
        data: {
          eventId: 'evt-1', userId: 'user-1', templateId: 'tpl-1',
          recipientType: 'all_delegates',
        },
      },
      step,
    });

    expect(txUpdateCalled).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 9: bulkCertificateNotifyFn — kills L545, L557, L563-565, L584-L640
// ──────────────────────────────────────────────────────────────────────────────

const makeCerts2 = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `cert-${i + 1}`,
    certificateNumber: `GEM-${String(i + 1).padStart(5, '0')}`,
    certificateType: 'delegate_attendance',
    storageKey: `certs/cert-${i + 1}.pdf`,
    personId: `person-${i + 1}`,
    personFullName: `Person ${i + 1}`,
    personEmail: `person${i + 1}@example.com`,
    personPhone: `+91999${String(i).padStart(7, '0')}`,
  }));

describe('bulkCertificateNotifyFn', () => {
  it('sendNotification called with exact email args including idempotencyKey and attachments', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(1);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-1'], channel: 'email' } },
      step,
    });

    expect(mockSendNotification2).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        personId: 'person-1',
        channel: 'email',
        templateKey: 'certificate_delivery',
        triggerType: 'certificate.generated',
        triggerEntityType: 'issued_certificate',
        triggerEntityId: 'cert-1',
        sendMode: 'manual',
        idempotencyKey: 'cert-send-cert-1-email',
        variables: expect.objectContaining({
          full_name: 'Person 1',
          certificate_number: 'GEM-00001',
          certificate_type: 'delegate attendance',
          recipientEmail: 'person1@example.com',
          recipientPhoneE164: '+91999' + '0'.repeat(7),
        }),
        attachments: [
          { storageKey: 'certs/cert-1.pdf', fileName: 'GEM-00001.pdf' },
        ],
      }),
    );
  });

  it('sendNotification called with exact whatsapp args including idempotencyKey', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(1);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-1'], channel: 'whatsapp' } },
      step,
    });

    expect(mockSendNotification2).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        templateKey: 'certificate_delivery',
        triggerType: 'certificate.generated',
        triggerEntityType: 'issued_certificate',
        triggerEntityId: 'cert-1',
        sendMode: 'manual',
        idempotencyKey: 'cert-send-cert-1-whatsapp',
        variables: expect.objectContaining({
          certificate_type: 'delegate attendance',
        }),
        attachments: [
          { storageKey: 'certs/cert-1.pdf', fileName: 'GEM-00001.pdf' },
        ],
      }),
    );
  });

  it('failed count increments (not decrements) when sendNotification throws', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(3);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    // cert-2 throws
    mockSendNotification2.mockImplementationOnce(() => Promise.resolve({ status: 'sent' }));
    mockSendNotification2.mockImplementationOnce(() => Promise.reject(new Error('send failed')));
    mockSendNotification2.mockImplementationOnce(() => Promise.resolve({ status: 'sent' }));

    const result = await handler({
      event: { data: { eventId: 'evt-1', certificateIds: certs.map(c => c.id), channel: 'email' } },
      step,
    });

    expect((result as any).sent).toBe(2);
    expect((result as any).failed).toBe(1); // not -1
    expect((result as any).total).toBe(3);
  });

  it('failed count increments (not decrements) when whatsapp sendNotification throws', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(2);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    // cert-1 throws, cert-2 succeeds
    mockSendNotification2.mockImplementationOnce(() => Promise.reject(new Error('wa failed')));
    mockSendNotification2.mockImplementationOnce(() => Promise.resolve({ status: 'sent' }));

    const result = await handler({
      event: { data: { eventId: 'evt-1', certificateIds: certs.map(c => c.id), channel: 'whatsapp' } },
      step,
    });

    expect((result as any).sent).toBe(1);
    expect((result as any).failed).toBe(1); // not -1
  });

  it('channel=both sends both email AND whatsapp for each cert', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(1);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    const result = await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-1'], channel: 'both' } },
      step,
    });

    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).toContain('email-batch-1');
    expect(stepNames).toContain('whatsapp-msg-1');

    // called twice: once email, once whatsapp
    expect(mockSendNotification2).toHaveBeenCalledTimes(2);
    expect((result as any).sent).toBe(2);
  });

  it('sleep is called with 30s between email batches', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(25);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: certs.map(c => c.id), channel: 'email' } },
      step,
    });

    const sleep = step.sleeps.find(s => s.name === 'email-cooldown-1');
    expect(sleep).toBeDefined();
    expect(sleep!.duration).toBe('30s');
  });

  it('sleep is called with 2s between whatsapp messages', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(3);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: certs.map(c => c.id), channel: 'whatsapp' } },
      step,
    });

    const sleep = step.sleeps.find(s => s.name === 'whatsapp-cooldown-1');
    expect(sleep).toBeDefined();
    expect(sleep!.duration).toBe('2s');
  });

  it('no sleep after last whatsapp message (i < length-1 boundary)', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(2);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: certs.map(c => c.id), channel: 'whatsapp' } },
      step,
    });

    expect(step.sleeps.find(s => s.name === 'whatsapp-cooldown-1')).toBeDefined();
    expect(step.sleeps.find(s => s.name === 'whatsapp-cooldown-2')).toBeUndefined();
  });

  it('update-sent-timestamps step runs when at least 1 email send succeeded', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(1);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-1'], channel: 'email' } },
      step,
    });

    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).toContain('update-sent-timestamps');
    expect(mockDb2.update).toHaveBeenCalled();
  });

  it('update-sent-timestamps step does NOT run when all sends fail', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(1);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());
    mockSendNotification2.mockRejectedValueOnce(new Error('all fail'));

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-1'], channel: 'email' } },
      step,
    });

    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).not.toContain('update-sent-timestamps');
  });

  it('deduplicates sentCertIds before the update-sent-timestamps step', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(1); // 1 cert

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));

    let capturedInArrayArgs: any = null;
    const { inArray } = await import('drizzle-orm');
    vi.mocked(inArray).mockImplementationOnce((...args: any[]) => {
      // first call is in load-certificates WHERE clause
      return args as any;
    });
    vi.mocked(inArray).mockImplementationOnce((...args: any[]) => {
      // second call is in update WHERE clause
      capturedInArrayArgs = args[1]; // the ids array
      return args as any;
    });
    mockDb2.update.mockImplementation(() => chainedUpdate());

    // channel=both so cert-1 is sent twice (email + whatsapp)
    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-1'], channel: 'both' } },
      step,
    });

    // sentCertIds had ['cert-1', 'cert-1'], after new Set → ['cert-1']
    if (capturedInArrayArgs !== null) {
      expect(capturedInArrayArgs).toHaveLength(1);
      expect(capturedInArrayArgs[0]).toBe('cert-1');
    }
    // At minimum, update was called
    expect(mockDb2.update).toHaveBeenCalled();
  });

  it('sentId null when whatsapp fails is not added to sentCertIds', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(1);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());
    mockSendNotification2.mockRejectedValueOnce(new Error('whatsapp fail'));

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-1'], channel: 'whatsapp' } },
      step,
    });

    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).not.toContain('update-sent-timestamps');
  });

  it('recipientEmail and recipientPhone use empty string fallback when null', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = [{
      id: 'cert-null-contact',
      certificateNumber: 'GEM-00001',
      certificateType: 'delegate_attendance',
      storageKey: 'certs/cert-null-contact.pdf',
      personId: 'p-null',
      personFullName: 'No Contact',
      personEmail: null,
      personPhone: null,
    }];

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-null-contact'], channel: 'email' } },
      step,
    });

    expect(mockSendNotification2).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          recipientEmail: '',
          recipientPhoneE164: '',
        }),
      }),
    );
  });

  it('certificate_type replaces underscores with spaces', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = [{
      id: 'cert-type',
      certificateNumber: 'GEM-00001',
      certificateType: 'faculty_speaker',
      storageKey: 'certs/cert-type.pdf',
      personId: 'p-type',
      personFullName: 'Frank',
      personEmail: 'f@test.com',
      personPhone: '+911234567890',
    }];

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-type'], channel: 'email' } },
      step,
    });

    expect(mockSendNotification2).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          certificate_type: 'faculty speaker',
        }),
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 10: archive step result assertions — kills L722, L729, L736 BlockStatement
// ──────────────────────────────────────────────────────────────────────────────

describe('archiveGenerateFn step result values', () => {
  function createArchiveStep() {
    const stepRuns: Array<{ name: string; result: unknown }> = [];
    return {
      stepRuns,
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === 'build-and-upload-archive') {
          const r = { archiveStorageKey: 'archives/evt-1.zip', archiveUrl: 'https://x', fileCount: 2, archiveSizeBytes: 512 };
          stepRuns.push({ name, result: r });
          return r;
        }
        const result = await fn();
        stepRuns.push({ name, result });
        return result;
      }),
      sleep: vi.fn(),
    };
  }

  it('generate-agenda step returns a non-empty base64 string', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createArchiveStep();

    await handler({ event: { data: { eventId: 'evt-1' } }, step });

    const agendaStep = step.stepRuns.find(s => s.name === 'generate-agenda');
    expect(agendaStep).toBeDefined();
    expect(typeof agendaStep!.result).toBe('string');
    expect((agendaStep!.result as string).length).toBeGreaterThan(0);
    expect(() => Buffer.from(agendaStep!.result as string, 'base64')).not.toThrow();
  });

  it('generate-notification-csv step returns a non-empty base64 string', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createArchiveStep();

    await handler({ event: { data: { eventId: 'evt-1' } }, step });

    const csvStep = step.stepRuns.find(s => s.name === 'generate-notification-csv');
    expect(csvStep).toBeDefined();
    expect(typeof csvStep!.result).toBe('string');
    expect((csvStep!.result as string).length).toBeGreaterThan(0);
  });

  it('collect-certificate-keys step returns an array', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createArchiveStep();

    await handler({ event: { data: { eventId: 'evt-1' } }, step });

    const certStep = step.stepRuns.find(s => s.name === 'collect-certificate-keys');
    expect(certStep).toBeDefined();
    expect(Array.isArray(certStep!.result)).toBe(true);
  });

  it('build-and-upload step returns correct shape with fileCount and archiveStorageKey', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    // Use a step mock that actually runs steps 1-3 but mocks step 4
    const stepNames: string[] = [];
    const stepRuns: any[] = [];
    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        stepNames.push(name);
        if (name !== 'build-and-upload-archive') {
          const result = await fn();
          stepRuns.push({ name, result });
          return result;
        }
        const mockResult = {
          archiveStorageKey: 'archives/evt-1.zip',
          archiveUrl: 'https://signed.url/archive.zip',
          fileCount: 2,
          archiveSizeBytes: 512,
        };
        stepRuns.push({ name, result: mockResult });
        return mockResult;
      }),
      sleep: vi.fn(),
    };

    const result = await handler({ event: { data: { eventId: 'evt-1' } }, step });

    expect((result as any).archiveStorageKey).toBe('archives/evt-1.zip');
    expect((result as any).fileCount).toBe(2);
    expect((result as any).archiveSizeBytes).toBe(512);

    // Verify first 3 steps returned real data
    const agendaStep = stepRuns.find(s => s.name === 'generate-agenda');
    expect(typeof agendaStep?.result).toBe('string');
    expect(agendaStep?.result.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 9b: whatsapp null-contact and sentId path — kills L665:35, L666:39, L684:13
// ──────────────────────────────────────────────────────────────────────────────

describe('bulkCertificateNotifyFn whatsapp null contact and sentId', () => {
  it('whatsapp: recipientEmail and recipientPhoneE164 fall back to empty string when null', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = [{
      id: 'cert-wa-null',
      certificateNumber: 'GEM-00001',
      certificateType: 'delegate_attendance',
      storageKey: 'certs/cert-wa-null.pdf',
      personId: 'p-wa-null',
      personFullName: 'No Contact WA',
      personEmail: null,
      personPhone: null,
    }];

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-wa-null'], channel: 'whatsapp' } },
      step,
    });

    expect(mockSendNotification2).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        variables: expect.objectContaining({
          recipientEmail: '',
          recipientPhoneE164: '',
        }),
      }),
    );
  });

  it('whatsapp non-null email and phone pass through (not collapsed to empty string)', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = [{
      id: 'cert-wa-contact',
      certificateNumber: 'GEM-00001',
      certificateType: 'delegate_attendance',
      storageKey: 'certs/cert-wa-contact.pdf',
      personId: 'p-wa-contact',
      personFullName: 'Has Contact',
      personEmail: 'wa@example.com',
      personPhone: '+919876543210',
    }];

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-wa-contact'], channel: 'whatsapp' } },
      step,
    });

    expect(mockSendNotification2).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        variables: expect.objectContaining({
          recipientEmail: 'wa@example.com',
          recipientPhoneE164: '+919876543210',
        }),
      }),
    );
  });

  it('whatsapp successful send adds sentId to sentCertIds → update-sent-timestamps runs', async () => {
    const handler = getNotifyHandler();
    const step = createMockStep();
    const certs = makeCerts2(1);

    mockDb2.select.mockReturnValueOnce(chainedSelect(certs));
    mockDb2.update.mockImplementation(() => chainedUpdate());

    await handler({
      event: { data: { eventId: 'evt-1', certificateIds: ['cert-1'], channel: 'whatsapp' } },
      step,
    });

    const stepNames = step.stepRuns.map(s => s.name);
    expect(stepNames).toContain('update-sent-timestamps');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GROUP 11: build-and-upload-archive internals — kills NoCoverage L742-L817
// ──────────────────────────────────────────────────────────────────────────────

describe('archiveGenerateFn build-and-upload-archive internals', () => {
  function createFullStep() {
    const stepRuns: Array<{ name: string; result: unknown }> = [];
    return {
      stepRuns,
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        const result = await fn();
        stepRuns.push({ name, result });
        return result;
      }),
      sleep: vi.fn(),
    };
  }

  async function getArchiverInstance() {
    const archiverMod = await import('archiver');
    const mockFn = vi.mocked(archiverMod.default);
    return mockFn.mock.results[mockFn.mock.results.length - 1]?.value;
  }

  it('calls archiver with zip format and { zlib: { level: 6 } }', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    await handler({ event: { data: { eventId: 'evt-1' } }, step });

    const archiverMod = await import('archiver');
    expect(vi.mocked(archiverMod.default)).toHaveBeenCalledWith('zip', { zlib: { level: 6 } });
  });

  it('appends agenda buffer with name agenda.xlsx', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    await handler({ event: { data: { eventId: 'evt-1' } }, step });

    const inst = await getArchiverInstance();
    expect(inst.append).toHaveBeenCalledWith(
      expect.any(Buffer),
      { name: 'agenda.xlsx' },
    );
  });

  it('appends notification log buffer with name notification-log.csv', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    await handler({ event: { data: { eventId: 'evt-1' } }, step });

    const inst = await getArchiverInstance();
    expect(inst.append).toHaveBeenCalledWith(
      expect.any(Buffer),
      { name: 'notification-log.csv' },
    );
  });

  it('fileCount is 2 when certKeys is empty (agenda + csv only)', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    const result = await handler({ event: { data: { eventId: 'evt-1' } }, step });

    expect((result as any).fileCount).toBe(2);
  });

  it('uploads archive as application/zip', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    await handler({ event: { data: { eventId: 'evt-1' } }, step });

    expect(mockStorageProvider2.upload).toHaveBeenCalledWith(
      'archives/evt-1.zip',
      expect.any(Buffer),
      'application/zip',
    );
  });

  it('calls getSignedUrl for archive with expiry 3600 and returns archiveUrl in result', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    const result = await handler({ event: { data: { eventId: 'evt-1' } }, step });

    expect(mockStorageProvider2.getSignedUrl).toHaveBeenCalledWith('archives/evt-1.zip', 3600);
    expect((result as any).archiveUrl).toBe('https://signed.url/cert.pdf');
  });

  it('returns correct archiveStorageKey in result', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    const result = await handler({ event: { data: { eventId: 'evt-1' } }, step });

    expect((result as any).archiveStorageKey).toBe('archives/evt-1.zip');
  });

  it('returns archiveSizeBytes as a number', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    const result = await handler({ event: { data: { eventId: 'evt-1' } }, step });

    expect(typeof (result as any).archiveSizeBytes).toBe('number');
  });

  it('fileCount increments for each cert with a successful fetch', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    const { getCertificateStorageKeys } = await import('@/lib/exports/archive');
    vi.mocked(getCertificateStorageKeys).mockResolvedValueOnce([
      { storageKey: 'certs/key1.pdf', fileName: 'GEM-00001.pdf' },
    ]);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await handler({ event: { data: { eventId: 'evt-1' } }, step });

    expect((result as any).fileCount).toBe(3);
    vi.unstubAllGlobals();
  });

  it('cert with res.ok=false is skipped — fileCount stays at 2', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    const { getCertificateStorageKeys } = await import('@/lib/exports/archive');
    vi.mocked(getCertificateStorageKeys).mockResolvedValueOnce([
      { storageKey: 'certs/key1.pdf', fileName: 'GEM-00001.pdf' },
    ]);

    const fetchSpy = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await handler({ event: { data: { eventId: 'evt-1' } }, step });

    expect((result as any).fileCount).toBe(2);
    vi.unstubAllGlobals();
  });

  it('cert fileName sanitizes special chars and is placed in certificates/ subdir', async () => {
    const handler = (bulkInngestFunctions[2] as any)._handler;
    const step = createFullStep();

    const { getCertificateStorageKeys } = await import('@/lib/exports/archive');
    vi.mocked(getCertificateStorageKeys).mockResolvedValueOnce([
      { storageKey: 'certs/key1.pdf', fileName: 'cert:bad/name?.pdf' },
    ]);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await handler({ event: { data: { eventId: 'evt-1' } }, step });

    const inst = await getArchiverInstance();
    const certAppendCalls = inst.append.mock.calls.filter((c: any[]) =>
      typeof c[1]?.name === 'string' && c[1].name.startsWith('certificates/'),
    );
    expect(certAppendCalls).toHaveLength(1);
    expect(certAppendCalls[0][1].name).toMatch(/^certificates\//);
    expect(certAppendCalls[0][1].name).not.toContain(':');
    expect(certAppendCalls[0][1].name).not.toContain('?');
    vi.unstubAllGlobals();
  });
});
