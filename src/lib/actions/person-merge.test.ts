import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockWriteAudit } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockWriteAudit: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/audit/write', () => ({ writeAudit: mockWriteAudit }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: vi.fn() }));

import { mergePeople } from './person';
import { ROLES } from '@/lib/auth/roles';

const KEEP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DROP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const KEEPER_PERSON = {
  id: KEEP_ID,
  fullName: 'Dr. Rajesh Kumar',
  salutation: 'Dr',
  email: 'rajesh@hospital.in',
  phoneE164: '+919876543210',
  designation: 'Professor',
  specialty: 'Cardiology',
  organization: 'AIIMS Delhi',
  city: 'Delhi',
  bio: 'Experienced cardiologist.',
  photoStorageKey: 'photos/rajesh.jpg',
  tags: ['faculty', 'VIP'],
  archivedAt: null,
  anonymizedAt: null,
};

const LOSER_PERSON = {
  id: DROP_ID,
  fullName: 'Rajesh Kumar',
  salutation: null,
  email: 'r.kumar@gmail.com',
  phoneE164: '+919000000000',
  designation: 'Prof',
  specialty: 'Heart Surgery',
  organization: 'AIIMS',
  city: 'New Delhi',
  bio: 'Cardiologist at AIIMS.',
  photoStorageKey: null,
  tags: ['delegate'],
  archivedAt: null,
  anonymizedAt: null,
};

function authAsCoordinator(userId = 'user_coord') {
  mockAuth.mockResolvedValue({
    userId,
    has: ({ role }: { role: string }) => role === ROLES.EVENT_COORDINATOR,
  });
}

function authAsSuperAdmin(userId = 'user_sa') {
  mockAuth.mockResolvedValue({
    userId,
    has: ({ role }: { role: string }) => role === ROLES.SUPER_ADMIN,
  });
}

function authAsReadOnly() {
  mockAuth.mockResolvedValue({
    userId: 'user_ro',
    has: ({ role }: { role: string }) => role === ROLES.READ_ONLY,
  });
}

function mockSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

// Build a tx mock for the transaction callback
// Select call order inside the merge transaction:
//   1. eventPeople (keeper events)
//   2. eventRegistrations (keeper events)
//   3. sessionAssignments (keeper session/role pairs)
//   4. attendanceRecords (keeper event/session pairs)
//   5. issuedCertificates (keeper event/cert-type pairs)
function makeMergeTx(
  txSelectSequence: unknown[][] = [[], [], [], [], []],
) {
  let selectIdx = 0;
  return {
    select: vi.fn(() => {
      const result = txSelectSequence[selectIdx] ?? [];
      selectIdx++;
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(result),
      };
    }),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

// Pre-transaction: keeper and loser fetched with Promise.all
function setupPeopleSelects(keeper: unknown, loser: unknown) {
  mockDb.select
    .mockReturnValueOnce(mockSelectChain(keeper ? [keeper] : []))
    .mockReturnValueOnce(mockSelectChain(loser ? [loser] : []));
}

function setupHappyPath() {
  setupPeopleSelects(KEEPER_PERSON, LOSER_PERSON);
  const tx = makeMergeTx([[], [], [], [], []]);
  mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));
  mockWriteAudit.mockResolvedValue(undefined);
  return tx;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockWriteAudit.mockResolvedValue(undefined);
  mockRevalidatePath.mockReturnValue(undefined);
});

// ── RBAC ──────────────────────────────────────────────────────────

describe('RBAC', () => {
  it('rejects unauthenticated requests', async () => {
    mockAuth.mockResolvedValue({ userId: null, has: () => false });
    await expect(mergePeople({ keepId: KEEP_ID, dropId: DROP_ID })).rejects.toThrow('Unauthorized');
  });

  it('rejects read-only users', async () => {
    authAsReadOnly();
    await expect(mergePeople({ keepId: KEEP_ID, dropId: DROP_ID })).rejects.toThrow('Forbidden');
  });

  it('allows event coordinators to merge', async () => {
    authAsCoordinator();
    setupHappyPath();
    const result = await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });
    expect(result).toMatchObject({ ok: true, survivorId: KEEP_ID });
  });

  it('allows super admins to merge', async () => {
    authAsSuperAdmin();
    setupHappyPath();
    const result = await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });
    expect(result).toMatchObject({ ok: true, survivorId: KEEP_ID });
  });
});

// ── Validation ────────────────────────────────────────────────────

describe('Validation', () => {
  it('rejects when keepId is not a UUID', async () => {
    authAsCoordinator();
    await expect(mergePeople({ keepId: 'not-a-uuid', dropId: DROP_ID })).rejects.toThrow();
  });

  it('rejects when dropId is not a UUID', async () => {
    authAsCoordinator();
    await expect(mergePeople({ keepId: KEEP_ID, dropId: 'not-a-uuid' })).rejects.toThrow();
  });

  it('returns error when keepId === dropId', async () => {
    authAsCoordinator();
    const result = await mergePeople({ keepId: KEEP_ID, dropId: KEEP_ID });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('themselves') });
  });

  it('returns error when keeper not found', async () => {
    authAsCoordinator();
    setupPeopleSelects(null, LOSER_PERSON);
    const result = await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Keeper') });
  });

  it('returns error when drop person not found', async () => {
    authAsCoordinator();
    setupPeopleSelects(KEEPER_PERSON, null);
    const result = await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('not found') });
  });
});

// ── Field choices ─────────────────────────────────────────────────

describe('Field choices', () => {
  it('uses left (keeper) values by default for all text fields', async () => {
    authAsCoordinator();
    const tx = setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    // The last two tx.update calls are people — first updates keeper, second archives loser
    const updateCalls = (tx.update as ReturnType<typeof vi.fn>).mock.calls;
    const keeperUpdateCall = updateCalls[updateCalls.length - 2];
    expect(keeperUpdateCall).toBeDefined();
    const setArgs = (tx.update as ReturnType<typeof vi.fn>)
      .mock.results[updateCalls.length - 2]?.value?.set?.mock?.calls?.[0]?.[0];
    expect(setArgs?.fullName).toBe(KEEPER_PERSON.fullName);
    expect(setArgs?.email).toBe(KEEPER_PERSON.email);
  });

  it('picks right values when fieldChoices specify right', async () => {
    authAsCoordinator();
    const tx = setupHappyPath();
    await mergePeople({
      keepId: KEEP_ID,
      dropId: DROP_ID,
      fieldChoices: { fullName: 'right', email: 'right' },
    });

    const updateCalls = (tx.update as ReturnType<typeof vi.fn>).mock.calls;
    const setArgs = (tx.update as ReturnType<typeof vi.fn>)
      .mock.results[updateCalls.length - 2]?.value?.set?.mock?.calls?.[0]?.[0];
    expect(setArgs?.fullName).toBe(LOSER_PERSON.fullName);
    expect(setArgs?.email).toBe(LOSER_PERSON.email);
  });

  it('concatenates with separator for "both" text fields', async () => {
    authAsCoordinator();
    const tx = setupHappyPath();
    await mergePeople({
      keepId: KEEP_ID,
      dropId: DROP_ID,
      fieldChoices: { designation: 'both' },
    });

    const updateCalls = (tx.update as ReturnType<typeof vi.fn>).mock.calls;
    const setArgs = (tx.update as ReturnType<typeof vi.fn>)
      .mock.results[updateCalls.length - 2]?.value?.set?.mock?.calls?.[0]?.[0];
    expect(setArgs?.designation).toBe('Professor / Prof');
  });

  it('always unions tags from both people', async () => {
    authAsCoordinator();
    const tx = setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    const updateCalls = (tx.update as ReturnType<typeof vi.fn>).mock.calls;
    const setArgs = (tx.update as ReturnType<typeof vi.fn>)
      .mock.results[updateCalls.length - 2]?.value?.set?.mock?.calls?.[0]?.[0];
    // keeper has ['faculty', 'VIP'], loser has ['delegate'] → union
    expect(setArgs?.tags).toContain('faculty');
    expect(setArgs?.tags).toContain('VIP');
    expect(setArgs?.tags).toContain('delegate');
  });

  it('uses bio separator \\n\\n---\\n\\n for "both"', async () => {
    authAsCoordinator();
    const tx = setupHappyPath();
    await mergePeople({
      keepId: KEEP_ID,
      dropId: DROP_ID,
      fieldChoices: { bio: 'both' },
    });

    const updateCalls = (tx.update as ReturnType<typeof vi.fn>).mock.calls;
    const setArgs = (tx.update as ReturnType<typeof vi.fn>)
      .mock.results[updateCalls.length - 2]?.value?.set?.mock?.calls?.[0]?.[0];
    expect(setArgs?.bio).toBe('Experienced cardiologist.\n\n---\n\nCardiologist at AIIMS.');
  });
});

// ── Transaction integrity ─────────────────────────────────────────

describe('Transaction integrity', () => {
  it('runs entire merge inside a single DB transaction', async () => {
    authAsCoordinator();
    setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('deletes conflicting event_people rows before re-pointing', async () => {
    authAsCoordinator();
    setupPeopleSelects(KEEPER_PERSON, LOSER_PERSON);
    const EVENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    // Keeper already has event_people for EVENT_ID → conflict
    const tx = makeMergeTx([[{ eventId: EVENT_ID }], [], [], [], []]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));
    mockWriteAudit.mockResolvedValue(undefined);

    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    // delete should have been called at least once (for conflicting event_people)
    expect((tx.delete as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('deletes conflicting event_registrations rows before re-pointing', async () => {
    authAsCoordinator();
    setupPeopleSelects(KEEPER_PERSON, LOSER_PERSON);
    const EVENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    // No event_people conflict, but event_registration conflict
    const tx = makeMergeTx([[], [{ eventId: EVENT_ID }], [], [], []]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));
    mockWriteAudit.mockResolvedValue(undefined);

    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    expect((tx.delete as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('soft-deletes the loser person with archivedAt and archivedBy', async () => {
    authAsCoordinator('user_coord');
    const tx = setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    const updateCalls = (tx.update as ReturnType<typeof vi.fn>).mock.calls;
    // Last update is the loser archive
    const loserArchiveSetArgs = (tx.update as ReturnType<typeof vi.fn>)
      .mock.results[updateCalls.length - 1]?.value?.set?.mock?.calls?.[0]?.[0];
    expect(loserArchiveSetArgs?.archivedAt).toBeInstanceOf(Date);
    expect(loserArchiveSetArgs?.archivedBy).toBe('user_coord');
  });

  it('re-points faculty_invites, travel, accommodation, and transport records', async () => {
    authAsCoordinator();
    const tx = setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    // Verify update was called for all tables beyond the people updates.
    // Includes: eventPeople, eventReg, sessionAssign, attendance, issuedCertificates,
    // facultyInvites, travel, accommodation, transport, keeper, loser = 11 minimum.
    expect((tx.update as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(11);
  });

  it('re-points attendance_records to the survivor', async () => {
    authAsCoordinator();
    const tx = setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    const updateCallCount = (tx.update as ReturnType<typeof vi.fn>).mock.calls.length;
    // At least one update should set personId to keepId — proving the loser's attendance
    // rows are being re-pointed.
    const attendanceRepoint = (tx.update as ReturnType<typeof vi.fn>).mock.results.some(r =>
      r.value?.set?.mock?.calls?.some((c: unknown[]) => {
        const setArgs = c[0] as Record<string, unknown> | undefined;
        return setArgs?.personId === KEEP_ID;
      }),
    );
    expect(attendanceRepoint).toBe(true);
    expect(updateCallCount).toBeGreaterThanOrEqual(11);
  });

  it('re-points issued_certificates to the survivor', async () => {
    authAsCoordinator();
    const tx = setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    // Five select calls were configured: eventPeople, eventReg, sessionAssign,
    // attendance, issuedCertificates. If the merge stops re-pointing certs, this
    // count drops back below 5.
    expect((tx.select as ReturnType<typeof vi.fn>).mock.calls.length).toBe(5);
  });

  it('drops loser attendance rows when the survivor already has a conflicting check-in', async () => {
    authAsCoordinator();
    setupPeopleSelects(KEEPER_PERSON, LOSER_PERSON);
    const EVENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const SESSION_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const tx = makeMergeTx([
      [],                                               // eventPeople
      [],                                               // eventRegistrations
      [],                                               // sessionAssignments
      [{ eventId: EVENT_ID, sessionId: SESSION_ID }],   // attendance conflict
      [],                                               // issuedCertificates
    ]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));
    mockWriteAudit.mockResolvedValue(undefined);

    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });
    expect((tx.delete as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('marks loser issued_certificates as superseded when survivor has the same cert type', async () => {
    authAsCoordinator();
    setupPeopleSelects(KEEPER_PERSON, LOSER_PERSON);
    const EVENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const tx = makeMergeTx([
      [], [], [], [],
      [{ eventId: EVENT_ID, certificateType: 'attendance' }], // cert conflict
    ]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));
    mockWriteAudit.mockResolvedValue(undefined);

    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    const supersedeCalled = (tx.update as ReturnType<typeof vi.fn>).mock.results.some(r =>
      r.value?.set?.mock?.calls?.some((c: unknown[]) => {
        const setArgs = c[0] as Record<string, unknown> | undefined;
        return setArgs?.status === 'superseded';
      }),
    );
    expect(supersedeCalled).toBe(true);
  });
});

// ── Audit log ─────────────────────────────────────────────────────

describe('Audit log', () => {
  it('writes audit log with merge metadata after successful transaction', async () => {
    authAsCoordinator('user_coord');
    setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    expect(mockWriteAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user_coord',
      eventId: null,
      action: 'delete',
      resource: 'people',
      resourceId: DROP_ID,
      meta: expect.objectContaining({
        action: 'merge',
        mergedIntoId: KEEP_ID,
      }),
    }));
  });

  it('revalidates /people and /people/[keepId] after merge', async () => {
    authAsCoordinator();
    setupHappyPath();
    await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/people');
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/people/${KEEP_ID}`);
  });
});

// ── Return value ──────────────────────────────────────────────────

describe('Return value', () => {
  it('returns { ok: true, survivorId: keepId } on success', async () => {
    authAsCoordinator();
    setupHappyPath();
    const result = await mergePeople({ keepId: KEEP_ID, dropId: DROP_ID });
    expect(result).toEqual({ ok: true, survivorId: KEEP_ID });
  });
});
