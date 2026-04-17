import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  type SeedRow = {
    id: string;
    eventId: null;
    templateKey: string;
    channel: string;
    createdBy: string;
    updatedBy: string;
  };

  type Condition =
    | { _type: 'and'; args: Condition[] }
    | { _type: 'eq'; args: [string, string] }
    | { _type: 'isNull'; col: string };

  let rows: SeedRow[] = [];
  let nextId = 1;
  let insertCount = 0;
  let failOnInsertNumber: number | null = null;
  let lockQueue = Promise.resolve();

  function reset() {
    rows = [];
    nextId = 1;
    insertCount = 0;
    failOnInsertNumber = null;
    lockQueue = Promise.resolve();
  }

  function setFailOnInsertNumber(value: number | null) {
    failOnInsertNumber = value;
  }

  function getRows() {
    return rows;
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function extractIdentity(condition: Extract<Condition, { _type: 'and' }>) {
    const templateKeyCondition = condition.args.find(
      (entry: Condition): entry is Extract<Condition, { _type: 'eq' }> =>
        entry._type === 'eq' && entry.args[0] === 'templateKey',
    );
    const channelCondition = condition.args.find(
      (entry: Condition): entry is Extract<Condition, { _type: 'eq' }> =>
        entry._type === 'eq' && entry.args[0] === 'channel',
    );

    return {
      templateKey: templateKeyCondition?.args[1] ?? null,
      channel: channelCondition?.args[1] ?? null,
    };
  }

  function createChain(state: {
    getVisibleRows: () => SeedRow[];
    insertRow: (payload: Omit<SeedRow, 'id'>) => Promise<void>;
    acquireLock?: () => Promise<void>;
  }) {
    const chain: Record<string, any> = {};
    let lastWhere: Condition | null = null;

    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn((condition: Condition) => {
      lastWhere = condition;
      return chain;
    });
    chain.limit = vi.fn(async () => {
      if (!lastWhere || lastWhere._type !== 'and') {
        throw new Error('test harness expected an and() condition');
      }

      const { templateKey, channel } = extractIdentity(lastWhere);
      const snapshot = state
        .getVisibleRows()
        .filter((row) => row.eventId === null && row.templateKey === templateKey && row.channel === channel)
        .map((row) => ({ id: row.id }));

      await sleep(5);
      return snapshot.slice(0, 1);
    });
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.values = vi.fn(async (payload: Omit<SeedRow, 'id'>) => {
      insertCount += 1;
      if (failOnInsertNumber !== null && insertCount === failOnInsertNumber) {
        throw new Error('simulated insert failure');
      }

      await state.insertRow(payload);
      return [{ id: `row-${nextId - 1}` }];
    });
    chain.execute = vi.fn(async () => {
      await state.acquireLock?.();
    });

    return chain;
  }

  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(async (callback: (tx: Record<string, any>) => Promise<unknown>) => {
      const pendingRows: SeedRow[] = [];
      let releaseLock: (() => void) | undefined;

      const tx = createChain({
        getVisibleRows: () => [...rows, ...pendingRows],
        insertRow: async (payload) => {
          pendingRows.push({ ...payload, id: `row-${nextId++}` });
        },
        acquireLock: async () => {
          const previousLock = lockQueue;
          lockQueue = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          await previousLock;
        },
      });

      try {
        const result = await callback(tx);
        rows.push(...pendingRows);
        return result;
      } finally {
        if (releaseLock) {
          releaseLock();
        }
      }
    }),
  };

  const autocommitChain = createChain({
    getVisibleRows: () => rows,
    insertRow: async (payload) => {
      rows.push({ ...payload, id: `row-${nextId++}` });
    },
  });

  db.select.mockImplementation(() => autocommitChain);
  db.insert.mockImplementation(() => autocommitChain);

  return {
    db,
    getRows,
    reset,
    setFailOnInsertNumber,
  };
});

vi.mock('@/lib/db', () => ({
  db: harness.db,
}));

vi.mock('@/lib/db/schema', () => ({
  notificationTemplates: {
    id: 'id',
    eventId: 'eventId',
    templateKey: 'templateKey',
    channel: 'channel',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  eq: vi.fn((...args: unknown[]) => ({ _type: 'eq', args })),
  isNull: vi.fn((col: unknown) => ({ _type: 'isNull', col })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

vi.mock('./system-templates', () => ({
  SYSTEM_TEMPLATE_SEEDS: [
    {
      templateKey: 'registration_confirmation',
      channel: 'email',
      templateName: 'Registration Confirmation Email',
      metaCategory: 'registration',
      triggerType: 'registration.created',
      sendMode: 'automatic',
      subjectLine: 'Registration confirmed',
      bodyContent: 'Body 1',
      previewText: 'Preview 1',
      allowedVariablesJson: ['fullName'],
      requiredVariablesJson: ['fullName'],
      isSystemTemplate: true,
    },
    {
      templateKey: 'registration_confirmation',
      channel: 'whatsapp',
      templateName: 'Registration Confirmation WhatsApp',
      metaCategory: 'registration',
      triggerType: 'registration.created',
      sendMode: 'automatic',
      subjectLine: null,
      bodyContent: 'Body 2',
      previewText: null,
      allowedVariablesJson: ['fullName'],
      requiredVariablesJson: ['fullName'],
      isSystemTemplate: true,
    },
  ],
}));

import { seedSystemTemplates } from './seed-system-templates';

describe('seedSystemTemplates adversarial hardening', () => {
  beforeEach(() => {
    harness.reset();
    vi.clearAllMocks();
  });

  it('rejects blank actor IDs before writing audit metadata', async () => {
    await expect(seedSystemTemplates('   ')).rejects.toThrow(
      'seedSystemTemplates: actorId must be a non-empty string',
    );

    expect(harness.getRows()).toEqual([]);
  });

  it('serializes concurrent seed runs so duplicate global templates are not created', async () => {
    const [firstResult, secondResult] = await Promise.all([
      seedSystemTemplates('admin-1'),
      seedSystemTemplates('admin-1'),
    ]);

    expect(firstResult).toEqual({ inserted: 2, skipped: 0 });
    expect(secondResult).toEqual({ inserted: 0, skipped: 2 });
    expect(harness.getRows()).toHaveLength(2);
    expect(
      harness.getRows().map((row) => `${row.templateKey}:${row.channel}`),
    ).toEqual([
      'registration_confirmation:email',
      'registration_confirmation:whatsapp',
    ]);
  });

  it('rolls back earlier inserts when a later seed fails', async () => {
    harness.setFailOnInsertNumber(2);

    await expect(seedSystemTemplates('admin-1')).rejects.toThrow('simulated insert failure');

    expect(harness.getRows()).toEqual([]);
  });
});
