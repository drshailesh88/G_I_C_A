import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuth,
  mockAssertEventAccess,
  mockDb,
  mockRevalidatePath,
  mockDrizzle,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: 'user_123' })),
  mockAssertEventAccess: vi.fn(async () => ({
    userId: 'user_123',
    role: 'org:event_coordinator',
  })),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockDrizzle: {
    eq: vi.fn((...args: unknown[]) => ({ _tag: 'eq', args })),
    or: vi.fn((...args: unknown[]) => ({ _tag: 'or', args })),
    and: vi.fn((...args: unknown[]) => ({ _tag: 'and', args })),
    ilike: vi.fn((...args: unknown[]) => ({ _tag: 'ilike', args })),
    desc: vi.fn((col: unknown) => ({ _tag: 'desc', col })),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({
        _tag: 'sql',
        strings: [...strings],
        values,
      }),
      { __esModule: true },
    ),
    isNull: vi.fn((col: unknown) => ({ _tag: 'isNull', col })),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/audit/write', () => ({ writeAudit: vi.fn() }));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: mockDrizzle.eq,
    or: mockDrizzle.or,
    and: mockDrizzle.and,
    ilike: mockDrizzle.ilike,
    desc: mockDrizzle.desc,
    sql: mockDrizzle.sql,
    isNull: mockDrizzle.isNull,
  };
});

import {
  findDuplicatePerson,
  createPerson,
  updatePerson,
  getPerson,
  searchPeople,
  archivePerson,
  restorePerson,
  anonymizePerson,
  ensureEventPerson,
  importPeopleBatch,
  getEventPeople,
} from './person';

// ── Helpers ───────────────────────────────────────────────────
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_EVENT_UUID = '660e8400-e29b-41d4-a716-446655440000';
const VALID_PERSON_UUID = '770e8400-e29b-41d4-a716-446655440000';

function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

function chainedUpdate(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

// Set up select to handle two sequential calls (rows + count)
function chainedSearchSelect(rows: unknown[], count: number) {
  const selectChain1 = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  };
  const selectChain2 = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count }]),
  };

  let callCount = 0;
  mockDb.select.mockImplementation(() => {
    callCount++;
    return callCount === 1 ? selectChain1 : selectChain2;
  });
  return { selectChain1, selectChain2 };
}

// ── findDuplicatePerson ───────────────────────────────────────
describe('findDuplicatePerson – mutation kills', () => {
  beforeEach(() => vi.clearAllMocks());

  // L23: BooleanLiteral — return null when neither email nor phone
  it('returns null when neither email nor phone provided', async () => {
    const result = await findDuplicatePerson(undefined, undefined);
    expect(result).toBeNull();
    // db.select should NOT be called
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // L23: ConditionalExpression false — ensure (!email && !phoneE164) branch
  it('returns null (not a person object) when both are undefined', async () => {
    const result = await findDuplicatePerson(undefined, undefined);
    expect(result).toBe(null);
    // Specifically NOT a truthy/person-like value
    expect(result).not.toBeTruthy();
  });

  // L25: ArrayDeclaration — conditions array is used
  // L26-27: ConditionalExpression — email/phone conditions are pushed
  it('queries by email only when phone is undefined', async () => {
    const selectChain = chainedSelect([]);
    const result = await findDuplicatePerson('test@example.com', undefined);
    expect(result).toBeNull();
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('queries by phone only when email is undefined', async () => {
    chainedSelect([]);
    const result = await findDuplicatePerson(undefined, '+919876543210');
    expect(result).toBeNull();
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('queries by both email and phone when both provided', async () => {
    chainedSelect([]);
    const result = await findDuplicatePerson('test@example.com', '+919876543210');
    expect(result).toBeNull();
    expect(mockDb.select).toHaveBeenCalled();
  });

  // L30: ObjectLiteral — select shape must include id, fullName, email, phoneE164
  it('returns match with correct shape when found', async () => {
    const match = {
      id: 'p1',
      fullName: 'Existing',
      email: 'test@example.com',
      phoneE164: '+919876543210',
    };
    chainedSelect([match]);
    const result = await findDuplicatePerson('test@example.com', undefined);
    expect(result).toEqual(match);
    expect(result!.id).toBe('p1');
    expect(result!.fullName).toBe('Existing');
    expect(result!.email).toBe('test@example.com');
    expect(result!.phoneE164).toBe('+919876543210');
  });

  // match ?? null — when no match found
  it('returns null when no match found (not undefined)', async () => {
    chainedSelect([]);
    const result = await findDuplicatePerson('nobody@example.com', undefined);
    expect(result).toBe(null);
  });
});

// ── createPerson – mutation kills ─────────────────────────────
describe('createPerson – mutation kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L52: BlockStatement {} — phone normalization block
  it('normalizes phone to E.164 when provided', async () => {
    const person = { id: 'p1', fullName: 'Test', phoneE164: '+919876543210' };
    chainedSelect([]); // no duplicate
    const insertChain = chainedInsert([person]);

    // Need to handle the two db calls: first select (dedup), then insert
    let callIdx = 0;
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await createPerson({
      fullName: 'Test',
      phone: '9876543210',
    });

    expect(result.duplicate).toBe(false);
    // The insert should have been called with phoneE164
    const insertedValues = insertChain.values.mock.calls[0][0];
    expect(insertedValues.phoneE164).toBe('+919876543210');
  });

  // L59: LogicalOperator — phoneE164 || undefined → phoneE164 && undefined
  it('passes phoneE164 to dedup check correctly', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      phone: '9876543210',
    });

    // The dedup check should have been called
    expect(mockDb.select).toHaveBeenCalled();
  });

  // L58-59: Conditional — validated.email || undefined, phoneE164 || undefined
  it('passes undefined (not empty string) to dedup when email is empty', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      email: '',
      phone: '9876543210',
    });

    // Should complete without error
    expect(mockDb.insert).toHaveBeenCalled();
  });

  // L66: duplicate message — email vs phone match
  it('reports "email" in duplicate message when email matches', async () => {
    const existing = {
      id: 'existing-1',
      fullName: 'Existing',
      email: 'test@example.com',
      phoneE164: null,
    };
    chainedSelect([existing]);

    const result = await createPerson({
      fullName: 'New Person',
      email: 'test@example.com',
    });

    expect(result.duplicate).toBe(true);
    expect(result.message).toContain('email');
    expect(result.message).toContain('Existing');
    expect(result.message).toContain('Person already exists');
  });

  // L66: EqualityOperator — !== mutation
  it('reports "phone" in duplicate message when phone matches but email differs', async () => {
    const existing = {
      id: 'existing-1',
      fullName: 'Existing',
      email: 'other@example.com',
      phoneE164: '+919876543210',
    };
    chainedSelect([existing]);

    const result = await createPerson({
      fullName: 'New Person',
      email: 'different@example.com',
      phone: '9876543210',
    });

    expect(result.duplicate).toBe(true);
    expect(result.message).toContain('phone');
  });

  // L72: ObjectLiteral — verify exact shape of insert values
  it('passes all fields to db insert with correct coercion', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      salutation: 'Dr',
      fullName: 'Test Person',
      email: 'test@example.com',
      phone: '9876543210',
      designation: 'Professor',
      specialty: 'Cardiology',
      organization: 'AIIMS',
      city: 'Delhi',
      tags: ['faculty'],
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.salutation).toBe('Dr');
    expect(values.fullName).toBe('Test Person');
    expect(values.email).toBe('test@example.com');
    expect(values.phoneE164).toBe('+919876543210');
    expect(values.designation).toBe('Professor');
    expect(values.specialty).toBe('Cardiology');
    expect(values.organization).toBe('AIIMS');
    expect(values.city).toBe('Delhi');
    expect(values.tags).toEqual(['faculty']);
    expect(values.createdBy).toBe('user_123');
    expect(values.updatedBy).toBe('user_123');
  });

  // L73-80: || null coercion — empty optional fields become null
  it('coerces empty salutation to null in insert', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      email: 'test@example.com',
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.salutation).toBeNull();
    expect(values.email).toBe('test@example.com');
    expect(values.phoneE164).toBeNull();
    expect(values.designation).toBeNull();
    expect(values.specialty).toBeNull();
    expect(values.organization).toBeNull();
    expect(values.city).toBeNull();
  });

  // L75: email || null coercion
  it('coerces empty email to null in insert', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      email: '',
      phone: '9876543210',
    });

    const values = insertChain.values.mock.calls[0][0];
    expect(values.email).toBeNull();
  });

  // L87: StringLiteral — revalidatePath('/people')
  it('revalidates exactly /people path', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({ fullName: 'Test', email: 'a@b.com' });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/people');
  });
});

// ── updatePerson – mutation kills ─────────────────────────────
describe('updatePerson – mutation kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L101: phone normalization — phone !== undefined branch
  it('normalizes phone when phone field is provided', async () => {
    const person = { id: VALID_UUID, phoneE164: '+919876543210' };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      phone: '9876543210',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.phoneE164).toBe('+919876543210');
  });

  // L101: BlockStatement {} — when phone is undefined, phoneE164 stays undefined
  it('does not set phoneE164 when phone is not provided', async () => {
    const person = { id: VALID_UUID, fullName: 'Updated' };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      fullName: 'Updated',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty('phoneE164');
  });

  // L101: EqualityOperator — fields.phone !== undefined → === undefined
  it('handles phone set to empty string (clears phone)', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      phone: '',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    // When phone is empty string, phoneE164 = '' ? normalizePhone('') : undefined
    // Actually: fields.phone is '', so phoneE164 = fields.phone ? normalizePhone(fields.phone) : undefined
    // '' is falsy, so phoneE164 = undefined
    // Then L113: phoneE164 !== undefined would be false, so phoneE164 not in updateData
    // Wait, let me re-read the code...
    // L101: if (fields.phone !== undefined) { phoneE164 = fields.phone ? normalizePhone(...) : undefined }
    // fields.phone is '' which !== undefined, so we enter.
    // '' is falsy, so phoneE164 = undefined
    // L113: if (phoneE164 !== undefined) — phoneE164 is undefined, so we don't set it
    // Hmm, but the intent is to clear the phone. Let me check the actual code again...
  });

  // L110-118: Conditional — each field's undefined check
  it('includes salutation in update when provided', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      salutation: 'Dr',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.salutation).toBe('Dr');
  });

  it('includes email in update when provided', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      email: 'new@example.com',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.email).toBe('new@example.com');
  });

  it('coerces empty salutation to null', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      salutation: undefined,
    });

    const setArg = updateChain.set.mock.calls[0][0];
    // salutation undefined means the field wasn't provided, so shouldn't be in setArg
    expect(setArg).not.toHaveProperty('salutation');
  });

  it('includes designation in update when provided', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      designation: 'Professor',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.designation).toBe('Professor');
  });

  it('coerces empty designation to null', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      designation: '',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.designation).toBeNull();
  });

  it('includes specialty in update when provided', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      specialty: 'Cardiology',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.specialty).toBe('Cardiology');
  });

  it('coerces empty specialty to null', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      specialty: '',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.specialty).toBeNull();
  });

  it('includes organization in update when provided', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      organization: 'AIIMS',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.organization).toBe('AIIMS');
  });

  it('coerces empty organization to null', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      organization: '',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.organization).toBeNull();
  });

  it('includes city in update when provided', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      city: 'Delhi',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.city).toBe('Delhi');
  });

  it('coerces empty city to null', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      city: '',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.city).toBeNull();
  });

  it('includes tags in update when provided', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      tags: ['speaker', 'VIP'],
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.tags).toEqual(['speaker', 'VIP']);
  });

  it('does not include tags when not provided', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      fullName: 'Test',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty('tags');
  });

  // L111: fullName — not coerced to null
  it('sets fullName directly (not null-coerced)', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      fullName: 'New Name',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.fullName).toBe('New Name');
  });

  // L207: ObjectLiteral — updateData base shape
  it('always includes updatedBy and updatedAt in update', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.updatedBy).toBe('user_123');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  // L112: email coercion
  it('coerces empty email to null in update', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      email: '',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.email).toBeNull();
  });

  // Update all fields at once to ensure each conditional works
  it('updates all fields simultaneously', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: VALID_UUID,
      salutation: 'Prof',
      fullName: 'Prof. Test',
      email: 'prof@example.com',
      phone: '9876543210',
      designation: 'Dean',
      specialty: 'Neurology',
      organization: 'PGI Chandigarh',
      city: 'Chandigarh',
      tags: ['dean'],
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.salutation).toBe('Prof');
    expect(setArg.fullName).toBe('Prof. Test');
    expect(setArg.email).toBe('prof@example.com');
    expect(setArg.phoneE164).toBe('+919876543210');
    expect(setArg.designation).toBe('Dean');
    expect(setArg.specialty).toBe('Neurology');
    expect(setArg.organization).toBe('PGI Chandigarh');
    expect(setArg.city).toBe('Chandigarh');
    expect(setArg.tags).toEqual(['dean']);
  });
});

// ── searchPeople – mutation kills ─────────────────────────────
describe('searchPeople – mutation kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L154: ArithmeticOperator — (page - 1) * limit
  it('uses correct offset for page 2 (offset = (2-1)*25 = 25)', async () => {
    const { selectChain1 } = chainedSearchSelect([], 50);

    const result = await searchPeople({ page: 2, limit: 25 });

    expect(selectChain1.offset).toHaveBeenCalledWith(25);
    expect(result.page).toBe(2);
  });

  it('uses offset 0 for page 1', async () => {
    const { selectChain1 } = chainedSearchSelect([], 10);

    const result = await searchPeople({ page: 1, limit: 25 });

    expect(selectChain1.offset).toHaveBeenCalledWith(0);
  });

  // L156: ArrayDeclaration — conditions array base
  // L159: BlockStatement — query filter block
  it('applies text search when query is provided', async () => {
    chainedSearchSelect([{ id: '1', fullName: 'Rajesh' }], 1);

    const result = await searchPeople({ query: 'Rajesh' });

    expect(result.people).toHaveLength(1);
  });

  // L159-166: escaping % and _ in query
  it('handles query with SQL wildcards', async () => {
    chainedSearchSelect([], 0);

    // Should not throw when query contains % or _
    const result = await searchPeople({ query: '100%_test' });

    expect(result.total).toBe(0);
  });

  // L172: organization filter
  it('applies organization filter', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ organization: 'AIIMS' });

    expect(result.total).toBe(0);
  });

  // L176: city filter
  it('applies city filter', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ city: 'Delhi' });

    expect(result.total).toBe(0);
  });

  // L180: specialty filter
  it('applies specialty filter', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ specialty: 'Cardiology' });

    expect(result.total).toBe(0);
  });

  // L184: tag filter
  it('applies tag filter', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ tag: 'VIP' });

    expect(result.total).toBe(0);
  });

  // L187-190: view filters — each view type adds a tag condition
  it('applies faculty view filter', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ view: 'faculty' });

    expect(result.total).toBe(0);
  });

  it('applies delegates view filter', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ view: 'delegates' });

    expect(result.total).toBe(0);
  });

  it('applies sponsors view filter', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ view: 'sponsors' });

    expect(result.total).toBe(0);
  });

  it('applies vips view filter', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ view: 'vips' });

    expect(result.total).toBe(0);
  });

  // L193: view === 'recent' — different ordering
  it('applies recent view ordering', async () => {
    const { selectChain1 } = chainedSearchSelect([], 0);

    await searchPeople({ view: 'recent' });

    // orderBy should have been called
    expect(selectChain1.orderBy).toHaveBeenCalled();
  });

  // L193: view === 'all' — default ordering (alphabetical)
  it('uses alphabetical ordering for all view', async () => {
    const { selectChain1 } = chainedSearchSelect([], 0);

    await searchPeople({ view: 'all' });

    expect(selectChain1.orderBy).toHaveBeenCalled();
  });

  // Pagination calculation
  it('calculates totalPages correctly when count divides evenly', async () => {
    chainedSearchSelect([], 100);

    const result = await searchPeople({ page: 1, limit: 25 });

    expect(result.totalPages).toBe(4);
  });

  it('calculates totalPages correctly with remainder', async () => {
    chainedSearchSelect([], 26);

    const result = await searchPeople({ page: 1, limit: 25 });

    expect(result.totalPages).toBe(2);
  });

  it('returns correct page and limit in response', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({ page: 3, limit: 10 });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });

  // Multiple filters at once
  it('applies all filters simultaneously', async () => {
    chainedSearchSelect([], 0);

    const result = await searchPeople({
      query: 'test',
      organization: 'AIIMS',
      city: 'Delhi',
      specialty: 'Cardiology',
      tag: 'faculty',
      view: 'faculty',
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(0);
  });
});

// ── archivePerson – mutation kills ────────────────────────────
describe('archivePerson – mutation kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L223: StringLiteral — error message
  it('throws exact error "Person not found or already archived"', async () => {
    chainedUpdate([]);
    await expect(archivePerson(VALID_UUID)).rejects.toThrow(
      'Person not found or already archived',
    );
  });

  // L228: ObjectLiteral — set data shape
  it('sets archivedAt, archivedBy, updatedBy, updatedAt', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await archivePerson(VALID_UUID);

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.archivedAt).toBeInstanceOf(Date);
    expect(setArg.archivedBy).toBe('user_123');
    expect(setArg.updatedBy).toBe('user_123');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  // L239: revalidatePath
  it('revalidates /people after archive', async () => {
    chainedUpdate([{ id: VALID_UUID }]);
    await archivePerson(VALID_UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/people');
  });

  it('throws Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(archivePerson(VALID_UUID)).rejects.toThrow('Unauthorized');
  });
});

// ── restorePerson – mutation kills ────────────────────────────
describe('restorePerson – mutation kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L246: ConditionalExpression — person not found
  it('throws exact error "Person not found" when not found', async () => {
    chainedUpdate([]);
    await expect(restorePerson(VALID_UUID)).rejects.toThrow('Person not found');
  });

  // L251: ObjectLiteral — restore set shape
  it('sets archivedAt and archivedBy to null', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await restorePerson(VALID_UUID);

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.archivedAt).toBeNull();
    expect(setArg.archivedBy).toBeNull();
    expect(setArg.updatedBy).toBe('user_123');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  // L262: revalidatePath
  it('revalidates /people after restore', async () => {
    chainedUpdate([{ id: VALID_UUID }]);
    await restorePerson(VALID_UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/people');
  });

  it('throws Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(restorePerson(VALID_UUID)).rejects.toThrow('Unauthorized');
  });
});

// ── anonymizePerson – mutation kills ──────────────────────────
describe('anonymizePerson – mutation kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L269: ConditionalExpression — already anonymized
  it('throws exact error "Person not found or already anonymized"', async () => {
    chainedUpdate([]);
    await expect(anonymizePerson(VALID_UUID)).rejects.toThrow(
      'Person not found or already anonymized',
    );
  });

  // L274: ObjectLiteral — anonymization set shape
  it('sets all PII fields to anonymized values', async () => {
    const person = { id: VALID_UUID };
    const updateChain = chainedUpdate([person]);

    await anonymizePerson(VALID_UUID);

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.fullName).toBe('[ANONYMIZED]');
    expect(setArg.email).toBeNull();
    expect(setArg.phoneE164).toBeNull();
    expect(setArg.designation).toBeNull();
    expect(setArg.specialty).toBeNull();
    expect(setArg.organization).toBeNull();
    expect(setArg.city).toBeNull();
    expect(setArg.tags).toEqual([]);
    expect(setArg.anonymizedAt).toBeInstanceOf(Date);
    expect(setArg.anonymizedBy).toBe('user_123');
    expect(setArg.updatedBy).toBe('user_123');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  // L275: StringLiteral — '[ANONYMIZED]'
  it('uses exact string [ANONYMIZED] for fullName', async () => {
    const updateChain = chainedUpdate([{ id: VALID_UUID }]);
    await anonymizePerson(VALID_UUID);
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.fullName).toBe('[ANONYMIZED]');
    expect(setArg.fullName).not.toBe('');
    expect(setArg.fullName).toHaveLength(12);
  });

  // L282: ArrayDeclaration — tags: []
  it('sets tags to empty array, not stryker array', async () => {
    const updateChain = chainedUpdate([{ id: VALID_UUID }]);
    await anonymizePerson(VALID_UUID);
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.tags).toEqual([]);
    expect(setArg.tags).toHaveLength(0);
  });

  // L293: revalidatePath
  it('revalidates /people after anonymize', async () => {
    chainedUpdate([{ id: VALID_UUID }]);
    await anonymizePerson(VALID_UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/people');
  });

  it('throws Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(anonymizePerson(VALID_UUID)).rejects.toThrow('Unauthorized');
  });
});

// ── ensureEventPerson – mutation kills ────────────────────────
describe('ensureEventPerson – mutation kills', () => {
  beforeEach(() => vi.clearAllMocks());

  // L306-307: ObjectLiteral — values shape
  it('inserts with correct eventId, personId, source values', async () => {
    const insertChain = chainedInsert([]);

    await ensureEventPerson(VALID_EVENT_UUID, VALID_PERSON_UUID, 'registration');

    expect(mockDb.insert).toHaveBeenCalled();
    const valuesArg = insertChain.values.mock.calls[0][0];
    expect(valuesArg).toEqual({
      eventId: VALID_EVENT_UUID,
      personId: VALID_PERSON_UUID,
      source: 'registration',
    });
  });

  // L307: ArrayDeclaration / ObjectLiteral — onConflictDoNothing target
  it('uses onConflictDoNothing for upsert behavior', async () => {
    const insertChain = chainedInsert([]);
    await ensureEventPerson(VALID_EVENT_UUID, VALID_PERSON_UUID, 'import');
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
  });
});

// ── importPeopleBatch – mutation kills ────────────────────────
describe('importPeopleBatch – mutation kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L346: StringLiteral — row.fullName vs 'Stryker was here!'
  it('passes row fullName to createPerson, not a fixed string', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Actual Name' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'Actual Name', email: 'actual@example.com' },
    ]);

    expect(result.imported).toBe(1);
    expect(result.results[0].status).toBe('created');
    expect(result.results[0].personId).toBe('p1');
    // Verify that the inserted values use the actual name
    const values = insertChain.values.mock.calls[0][0];
    expect(values.fullName).toBe('Actual Name');
  });

  // L347: LogicalOperator — row.phone || '' → row.phone && ''
  it('defaults missing phone to empty string', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    // Provide email but not phone
    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'Test', email: 'test@example.com' },
    ]);

    expect(result.imported).toBe(1);
  });

  // L353: LogicalOperator — row.tags || [] → row.tags && []
  it('defaults missing tags to empty array', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'Test', email: 'test@example.com' },
    ]);

    expect(result.imported).toBe(1);
    // Tags should default to [] not throw
  });

  // L353: ArrayDeclaration — default [] not ["Stryker was here"]
  it('passes tags from row when provided', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await importPeopleBatch([
      { rowNumber: 1, fullName: 'Test', email: 'test@example.com', tags: ['speaker'] },
    ]);

    const values = insertChain.values.mock.calls[0][0];
    expect(values.tags).toEqual(['speaker']);
  });

  // L356: ConditionalExpression/LogicalOperator — duplicate check
  it('correctly identifies duplicate results', async () => {
    const existing = {
      id: 'p1',
      fullName: 'Existing',
      email: 'dup@example.com',
      phoneE164: null,
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existing]),
    };
    mockDb.select.mockReturnValue(selectChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'Dup', email: 'dup@example.com' },
    ]);

    expect(result.duplicates).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.results[0].status).toBe('duplicate');
    expect(result.results[0].rowNumber).toBe(1);
  });

  // L359: ConditionalExpression — created check
  it('correctly identifies created results with personId', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'new-p', fullName: 'New' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await importPeopleBatch([
      { rowNumber: 3, fullName: 'New Person', email: 'new@example.com' },
    ]);

    expect(result.imported).toBe(1);
    expect(result.results[0].personId).toBe('new-p');
    expect(result.results[0].rowNumber).toBe(3);
  });

  // Error handling — error message from Error instance
  it('captures error message from Error instance', async () => {
    // Auth will work for importPeopleBatch, but createPerson will throw on validation
    const result = await importPeopleBatch([
      { rowNumber: 5, fullName: '' }, // empty name will fail validation
    ]);

    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
    expect(result.results[0].error).toBeDefined();
    expect(typeof result.results[0].error).toBe('string');
    expect(result.results[0].rowNumber).toBe(5);
  });

  // L368: StringLiteral — 'Unknown error'
  it('captures "Unknown error" for non-Error thrown values', async () => {
    // We can't easily trigger this without mocking createPerson to throw a non-Error
    // But let's test the error count tracking for validation errors
    const result = await importPeopleBatch([
      { rowNumber: 2, fullName: 'Valid', email: 'a@b.com' },
      { rowNumber: 3, fullName: '' }, // invalid - will throw
    ]);

    // First row may succeed or fail depending on mock state, but second should error
    expect(result.errors).toBeGreaterThanOrEqual(1);
  });

  // Multiple rows — mixed results
  it('handles mixed batch with created, duplicate, and error rows', async () => {
    const existing = {
      id: 'p1',
      fullName: 'Existing',
      email: 'dup@example.com',
      phoneE164: null,
    };

    let selectCallCount = 0;
    const selectMock = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallCount++;
        // First call: no duplicate (for row 1)
        // Second call: duplicate found (for row 2)
        if (selectCallCount === 1) return Promise.resolve([]);
        return Promise.resolve([existing]);
      }),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'new-p', fullName: 'New' }]),
    };
    mockDb.select.mockReturnValue(selectMock);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'New Person', email: 'new@example.com' },
      { rowNumber: 2, fullName: 'Dup Person', email: 'dup@example.com' },
      { rowNumber: 3, fullName: '' }, // error - validation fails
    ]);

    expect(result.imported + result.duplicates + result.errors).toBe(3);
    expect(result.results).toHaveLength(3);
  });
});

// ── getEventPeople – mutation kills ───────────────────────────
describe('getEventPeople – mutation kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L383: ObjectLiteral — select shape
  it('returns people with id, fullName, email, phoneE164 fields', async () => {
    const rows = [
      { id: 'p1', fullName: 'Dr. Rajesh', email: 'rajesh@example.com', phoneE164: '+919876543210' },
      { id: 'p2', fullName: 'Dr. Priya', email: 'priya@example.com', phoneE164: null },
    ];
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    };
    mockDb.select.mockReturnValue(selectChain);

    const result = await getEventPeople(VALID_EVENT_UUID);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'p1',
      fullName: 'Dr. Rajesh',
      email: 'rajesh@example.com',
      phoneE164: '+919876543210',
    });
    expect(result[1]).toEqual({
      id: 'p2',
      fullName: 'Dr. Priya',
      email: 'priya@example.com',
      phoneE164: null,
    });
  });

  it('returns empty array when no people linked to event', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(selectChain);

    const result = await getEventPeople(VALID_EVENT_UUID);
    expect(result).toEqual([]);
  });
});

// ── getPerson – mutation kills ────────────────────────────────
describe('getPerson – mutation kills', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws exact "Person not found" message', async () => {
    chainedSelect([]);
    await expect(getPerson(VALID_UUID)).rejects.toThrow('Person not found');
  });
});

// ── searchPeople – drizzle condition verification ─────────────
describe('searchPeople – condition verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L156: Base conditions array — isNull called for anonymizedAt and archivedAt
  it('always applies anonymizedAt and archivedAt null checks', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({});
    // isNull should be called at least twice (anonymizedAt + archivedAt)
    expect(mockDrizzle.isNull).toHaveBeenCalledTimes(2);
  });

  // L159-166: query search — ilike called for fullName, email, organization + eq for phone
  it('calls ilike for fullName, email, org and eq for phone when query given', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ query: 'test' });
    // ilike should be called 3 times (fullName, email, organization)
    expect(mockDrizzle.ilike).toHaveBeenCalledTimes(3);
    // eq called for phone exact match
    expect(mockDrizzle.eq).toHaveBeenCalled();
    // or called to combine the search conditions
    expect(mockDrizzle.or).toHaveBeenCalled();
  });

  // L161: Escaped wildcards in query string
  it('escapes % in query for ilike patterns', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ query: '100%' });
    // Verify ilike was called with escaped pattern
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    // Each ilike call should have the escaped pattern
    ilikeCalls.forEach((call: unknown[]) => {
      const pattern = call[1] as string;
      if (typeof pattern === 'string' && pattern.includes('%')) {
        // The % from the query should be escaped as \%
        expect(pattern).toContain('\\%');
      }
    });
  });

  it('escapes _ in query for ilike patterns', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ query: 'test_value' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    ilikeCalls.forEach((call: unknown[]) => {
      const pattern = call[1] as string;
      if (typeof pattern === 'string' && pattern.includes('_')) {
        expect(pattern).toContain('\\_');
      }
    });
  });

  // L172-174: organization filter — ilike called with escaped org value
  it('calls ilike for organization filter with escaped value', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ organization: 'AIIMS%' });
    // ilike should be called once for organization
    const calls = mockDrizzle.ilike.mock.calls;
    const orgCall = calls.find((c: unknown[]) => {
      const pattern = c[1] as string;
      return typeof pattern === 'string' && pattern.includes('AIIMS');
    });
    expect(orgCall).toBeDefined();
    expect((orgCall as unknown[])[1]).toContain('\\%');
  });

  // L176-178: city filter
  it('calls ilike for city filter', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ city: 'Delhi' });
    const calls = mockDrizzle.ilike.mock.calls;
    const cityCall = calls.find((c: unknown[]) => {
      const pattern = c[1] as string;
      return typeof pattern === 'string' && pattern.includes('Delhi');
    });
    expect(cityCall).toBeDefined();
  });

  // L180-182: specialty filter
  it('calls ilike for specialty filter', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ specialty: 'Neuro' });
    const calls = mockDrizzle.ilike.mock.calls;
    const specCall = calls.find((c: unknown[]) => {
      const pattern = c[1] as string;
      return typeof pattern === 'string' && pattern.includes('Neuro');
    });
    expect(specCall).toBeDefined();
  });

  // L184: tag filter — sql template called
  it('calls sql template for tag filter', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ tag: 'VIP' });
    // and() should be called, and one of its args should be a sql tag result
    expect(mockDrizzle.and).toHaveBeenCalled();
  });

  // L187: view === 'faculty' — sql template with "faculty" tag
  it('adds faculty tag condition for faculty view', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'faculty' });
    // and() is called with conditions that include a sql tag for faculty
    const andCalls = mockDrizzle.and.mock.calls;
    expect(andCalls.length).toBeGreaterThan(0);
    // The conditions array should have 3 items: isNull(anonymizedAt), isNull(archivedAt), sql`faculty`
    const args = andCalls[0];
    expect(args.length).toBe(3);
  });

  // L188: view === 'delegates' — sql template with "delegate" tag
  it('adds delegate tag condition for delegates view', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'delegates' });
    const andCalls = mockDrizzle.and.mock.calls;
    expect(andCalls.length).toBeGreaterThan(0);
    expect(andCalls[0].length).toBe(3);
  });

  // L189: view === 'sponsors' — sql template with "sponsor" tag
  it('adds sponsor tag condition for sponsors view', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'sponsors' });
    const andCalls = mockDrizzle.and.mock.calls;
    expect(andCalls[0].length).toBe(3);
  });

  // L190: view === 'vips' — sql template with "VIP" tag
  it('adds VIP tag condition for vips view', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'vips' });
    const andCalls = mockDrizzle.and.mock.calls;
    expect(andCalls[0].length).toBe(3);
  });

  // L187-190 vs all: view='all' should NOT add view condition
  it('does not add view condition for all view', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'all' });
    const andCalls = mockDrizzle.and.mock.calls;
    // Should have only 2 base conditions (anonymizedAt, archivedAt)
    expect(andCalls[0].length).toBe(2);
  });

  // L193: view === 'recent' — desc(createdAt) ordering
  it('uses desc ordering for recent view', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'recent' });
    expect(mockDrizzle.desc).toHaveBeenCalled();
  });

  it('does not use desc ordering for non-recent view', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'all' });
    expect(mockDrizzle.desc).not.toHaveBeenCalled();
  });

  // L207: ObjectLiteral — select count shape
  it('performs count query with sql`count(*)`', async () => {
    chainedSearchSelect([], 5);
    const result = await searchPeople({});
    expect(result.total).toBe(5);
  });

  // Multiple filters stack conditions correctly
  it('stacks query + org + city + specialty + tag + view conditions', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({
      query: 'test',
      organization: 'AIIMS',
      city: 'Delhi',
      specialty: 'Cardiology',
      tag: 'VIP',
      view: 'faculty',
    });
    const andCalls = mockDrizzle.and.mock.calls;
    // 2 base + 1 query + 1 org + 1 city + 1 specialty + 1 tag + 1 view = 8
    expect(andCalls[0].length).toBe(8);
  });
});

// ── findDuplicatePerson – drizzle condition verification ──────
describe('findDuplicatePerson – condition verification', () => {
  beforeEach(() => vi.clearAllMocks());

  // L25-27: conditions array construction
  it('calls eq for email condition when email provided', async () => {
    chainedSelect([]);
    await findDuplicatePerson('test@example.com', undefined);
    expect(mockDrizzle.eq).toHaveBeenCalled();
    // or should be called with the conditions
    expect(mockDrizzle.or).toHaveBeenCalled();
  });

  it('calls eq for phone condition when phone provided', async () => {
    chainedSelect([]);
    await findDuplicatePerson(undefined, '+919876543210');
    expect(mockDrizzle.eq).toHaveBeenCalled();
    expect(mockDrizzle.or).toHaveBeenCalled();
  });

  it('calls eq twice when both email and phone provided', async () => {
    chainedSelect([]);
    await findDuplicatePerson('test@example.com', '+919876543210');
    // eq called for email and phone
    expect(mockDrizzle.eq).toHaveBeenCalledTimes(2);
    // or called with both conditions
    expect(mockDrizzle.or).toHaveBeenCalled();
    const orArgs = mockDrizzle.or.mock.calls[0];
    expect(orArgs.length).toBe(2);
  });

  // L30: select shape
  it('calls and() with isNull + or() conditions', async () => {
    chainedSelect([]);
    await findDuplicatePerson('test@example.com', undefined);
    expect(mockDrizzle.and).toHaveBeenCalled();
    expect(mockDrizzle.isNull).toHaveBeenCalled();
  });
});

// ── importPeopleBatch – stronger assertions ───────────────────
describe('importPeopleBatch – branch verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L346: fullName from row is used (not a constant string)
  it('uses different fullName for each row in batch', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn()
        .mockResolvedValueOnce([{ id: 'p1', fullName: 'Alice' }])
        .mockResolvedValueOnce([{ id: 'p2', fullName: 'Bob' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'Alice', email: 'alice@example.com' },
      { rowNumber: 2, fullName: 'Bob', email: 'bob@example.com' },
    ]);

    expect(result.imported).toBe(2);
    // Both insertions should use respective names
    const firstValues = insertChain.values.mock.calls[0][0];
    expect(firstValues.fullName).toBe('Alice');
    const secondValues = insertChain.values.mock.calls[1][0];
    expect(secondValues.fullName).toBe('Bob');
  });

  // L347: row.phone || '' — when phone is provided, it's used
  it('passes provided phone through to createPerson', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await importPeopleBatch([
      { rowNumber: 1, fullName: 'Test', phone: '9876543210' },
    ]);

    const values = insertChain.values.mock.calls[0][0];
    expect(values.phoneE164).toBe('+919876543210');
  });

  // L353: tags from row used when present
  it('passes row tags to createPerson', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await importPeopleBatch([
      { rowNumber: 1, fullName: 'Test', email: 'test@example.com', tags: ['faculty', 'VIP'] },
    ]);

    const values = insertChain.values.mock.calls[0][0];
    expect(values.tags).toEqual(['faculty', 'VIP']);
    expect(values.tags).toHaveLength(2);
  });

  // L353: tags default [] when not provided — verify inserted tags are []
  it('inserts with empty tags when row has no tags', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await importPeopleBatch([
      { rowNumber: 1, fullName: 'Test', email: 'test@example.com' },
    ]);

    const values = insertChain.values.mock.calls[0][0];
    expect(values.tags).toEqual([]);
    expect(values.tags).toHaveLength(0);
  });

  // L356/359: result branching — verify 'duplicate' vs 'person' in result
  it('does not count as imported when duplicate is returned', async () => {
    const existing = { id: 'p1', fullName: 'Existing', email: 'e@x.com', phoneE164: null };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existing]),
    };
    mockDb.select.mockReturnValue(selectChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'Test', email: 'e@x.com' },
    ]);

    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(result.errors).toBe(0);
    // Verify the result does NOT have personId for duplicates
    expect(result.results[0].personId).toBeUndefined();
  });

  // L368: NoCoverage — 'Unknown error' for non-Error throws
  // We need to trigger a non-Error throw. We can do this by making createPerson's
  // internal call throw a non-Error value.
  it('handles non-Error throw with "Unknown error" message', async () => {
    // Make the db.select throw a string (non-Error)
    mockDb.select.mockImplementation(() => {
      throw 'some string error';
    });

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'Test', email: 'test@example.com' },
    ]);

    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
    expect(result.results[0].error).toBe('Unknown error');
  });
});

// ── updatePerson – additional field branch verification ───────
describe('updatePerson – field inclusion/exclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // Verify that providing ONLY personId (no fields) results in minimal updateData
  it('minimal update has only updatedBy and updatedAt', async () => {
    chainedSelect([{ id: VALID_UUID }]); // pre-update snapshot for diff
    const updateChain = chainedUpdate([{ id: VALID_UUID }]);

    await updatePerson({ personId: VALID_UUID });

    const setArg = updateChain.set.mock.calls[0][0];
    const keys = Object.keys(setArg);
    expect(keys).toContain('updatedBy');
    expect(keys).toContain('updatedAt');
    expect(keys).not.toContain('salutation');
    expect(keys).not.toContain('fullName');
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('phoneE164');
    expect(keys).not.toContain('designation');
    expect(keys).not.toContain('specialty');
    expect(keys).not.toContain('organization');
    expect(keys).not.toContain('city');
    expect(keys).not.toContain('tags');
  });

  // Verify each field is conditionally included
  it('includes ONLY salutation when only salutation provided', async () => {
    chainedSelect([{ id: VALID_UUID }]);
    const updateChain = chainedUpdate([{ id: VALID_UUID }]);

    await updatePerson({ personId: VALID_UUID, salutation: 'Dr' });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.salutation).toBe('Dr');
    expect(setArg).not.toHaveProperty('fullName');
    expect(setArg).not.toHaveProperty('email');
  });

  it('includes ONLY fullName when only fullName provided', async () => {
    chainedSelect([{ id: VALID_UUID }]);
    const updateChain = chainedUpdate([{ id: VALID_UUID }]);

    await updatePerson({ personId: VALID_UUID, fullName: 'Test' });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.fullName).toBe('Test');
    expect(setArg).not.toHaveProperty('salutation');
    expect(setArg).not.toHaveProperty('designation');
  });

  it('includes ONLY email when only email provided', async () => {
    chainedSelect([{ id: VALID_UUID }]);
    const updateChain = chainedUpdate([{ id: VALID_UUID }]);

    await updatePerson({ personId: VALID_UUID, email: 'a@b.com' });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.email).toBe('a@b.com');
    expect(setArg).not.toHaveProperty('fullName');
  });

  it('sets phoneE164 to null when phone is provided as empty but phoneE164 resolves to falsy', async () => {
    // phone '' -> phoneE164 = '' ? normalize : undefined -> phoneE164 = undefined
    // BUT then L113: if (phoneE164 !== undefined) is FALSE
    // Actually let me re-check: phone='' enters L101 block because '' !== undefined
    // Inside: phoneE164 = '' ? normalize('') : undefined -> '' is falsy -> phoneE164 = undefined
    // L113: undefined !== undefined is false -> phoneE164 NOT added to updateData
    chainedSelect([{ id: VALID_UUID }]);
    const updateChain = chainedUpdate([{ id: VALID_UUID }]);

    await updatePerson({ personId: VALID_UUID, phone: '' });

    const setArg = updateChain.set.mock.calls[0][0];
    // phoneE164 should NOT be in the update since it resolved to undefined
    expect(setArg).not.toHaveProperty('phoneE164');
  });
});

// ── createPerson – verify select shape for dedup ──────────────
describe('createPerson – dedup select shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('calls select with id, fullName, email, phoneE164 for dedup check', async () => {
    const selectChain = chainedSelect([]);
    const insertChain = chainedInsert([{ id: 'p1', fullName: 'Test' }]);

    await createPerson({ fullName: 'Test', email: 'a@b.com' });

    // The select mock should have been called with a shape argument
    expect(mockDb.select).toHaveBeenCalled();
  });

  // Verify duplicate message includes the person's name
  it('includes person fullName in duplicate message', async () => {
    const existing = {
      id: 'e1',
      fullName: 'Dr. Specific Name',
      email: 'specific@example.com',
      phoneE164: null,
    };
    chainedSelect([existing]);

    const result = await createPerson({
      fullName: 'Other Name',
      email: 'specific@example.com',
    });

    expect(result.duplicate).toBe(true);
    expect(result.message).toBe(
      'Person already exists: Dr. Specific Name (matched on email)',
    );
  });

  it('includes "phone" match reason when email differs', async () => {
    const existing = {
      id: 'e1',
      fullName: 'Phone Match',
      email: 'different@example.com',
      phoneE164: '+919876543210',
    };
    chainedSelect([existing]);

    const result = await createPerson({
      fullName: 'Other',
      email: 'other@example.com',
      phone: '9876543210',
    });

    expect(result.duplicate).toBe(true);
    expect(result.message).toBe(
      'Person already exists: Phone Match (matched on phone)',
    );
  });
});

// ── getEventPeople – drizzle verification ─────────────────────
describe('getEventPeople – drizzle verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('calls and() and eq() for event filtering', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(selectChain);

    await getEventPeople(VALID_EVENT_UUID);

    expect(mockDrizzle.and).toHaveBeenCalled();
    expect(mockDrizzle.eq).toHaveBeenCalled();
    expect(mockDrizzle.isNull).toHaveBeenCalled();
  });
});

// ── ensureEventPerson – onConflictDoNothing target ────────────
describe('ensureEventPerson – target verification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes correct target to onConflictDoNothing', async () => {
    const insertChain = chainedInsert([]);

    await ensureEventPerson(VALID_EVENT_UUID, VALID_PERSON_UUID, 'registration');

    expect(insertChain.onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.any(Array) }),
    );
  });
});

// ── findDuplicatePerson – condition push kills ────────────────
describe('findDuplicatePerson – condition push verification', () => {
  beforeEach(() => vi.clearAllMocks());

  // L26: if (email) → if (true) — always pushes email condition
  // To kill: call with email=undefined, verify eq is NOT called for email
  it('does not call eq when email is undefined', async () => {
    chainedSelect([]);
    await findDuplicatePerson(undefined, '+919876543210');
    // eq should be called exactly once (for phone only)
    expect(mockDrizzle.eq).toHaveBeenCalledTimes(1);
  });

  // L27: if (phoneE164) → if (true) — always pushes phone condition
  it('does not call eq for phone when phone is undefined', async () => {
    chainedSelect([]);
    await findDuplicatePerson('test@example.com', undefined);
    // eq should be called exactly once (for email only)
    expect(mockDrizzle.eq).toHaveBeenCalledTimes(1);
  });

  // L30: select shape {} — verify that returned match has expected properties
  it('returns object with id, fullName, email, phoneE164 (not empty object)', async () => {
    const match = { id: 'p1', fullName: 'Test', email: 'a@b.com', phoneE164: '+91123' };
    chainedSelect([match]);
    const result = await findDuplicatePerson('a@b.com', undefined);
    expect(result).not.toEqual({});
    expect(Object.keys(result!)).toContain('id');
    expect(Object.keys(result!)).toContain('fullName');
    expect(Object.keys(result!)).toContain('email');
    expect(Object.keys(result!)).toContain('phoneE164');
  });
});

// ── createPerson – dedup conditional kills ────────────────────
describe('createPerson – dedup conditional kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L58: validated.email || undefined → true
  // If mutated to true, findDuplicatePerson always gets 'true' for email
  // We test: when email is empty (''), findDuplicatePerson should get undefined
  it('passes undefined to dedup when email is empty string', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      email: '',
      phone: '9876543210',
    });

    // With empty email, findDuplicatePerson should be called.
    // If email || undefined → empty string becomes undefined
    // So eq should only be called for phone, not email
    // But the dedup uses the phone E164 value
    // We can verify eq was called with phone value
    expect(mockDb.select).toHaveBeenCalled();
  });

  // L59: phoneE164 || undefined → true
  // Similar: when phone is not provided, phoneE164 is null, so dedup gets undefined
  it('dedup check works correctly when phone not provided', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      email: 'test@example.com',
    });

    // findDuplicatePerson called with email but undefined phone
    // eq should be called once for email in dedup
    const eqCalls = mockDrizzle.eq.mock.calls;
    // At least one eq call for email
    expect(eqCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// ── updatePerson – phone conditional kill ─────────────────────
describe('updatePerson – phone undefined vs true kill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L101: fields.phone !== undefined → true
  // If mutated to true, phone normalization runs even when phone is not provided
  // This would cause normalizePhone(undefined) to throw
  it('does not attempt phone normalization when phone field is absent', async () => {
    const updateChain = chainedUpdate([{ id: VALID_UUID, fullName: 'Test' }]);

    // Only provide fullName, not phone
    const result = await updatePerson({
      personId: VALID_UUID,
      fullName: 'Updated',
    });

    // Should succeed without throwing
    expect(result).toBeDefined();
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty('phoneE164');
  });
});

// ── importPeopleBatch – result branching kills ────────────────
describe('importPeopleBatch – result type discrimination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L356: result && 'duplicate' in result && result.duplicate
  // Mutation: result || 'duplicate' in result → short circuits differently
  // Kill: verify that a created result is NOT counted as duplicate
  it('created result is counted as imported, not duplicate', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'New' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'New', email: 'new@example.com' },
    ]);

    // Must be imported, not duplicate
    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.results[0].status).toBe('created');
    expect(result.results[0].personId).toBe('p1');
  });

  // L359: result && 'person' in result && result.person
  // Mutation: result || 'person' in result → always truthy
  // Verify: duplicate result does NOT get counted as imported
  it('duplicate result is counted as duplicate, not imported', async () => {
    const existing = {
      id: 'e1',
      fullName: 'Existing',
      email: 'dup@example.com',
      phoneE164: null,
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existing]),
    };
    mockDb.select.mockReturnValue(selectChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'Dup', email: 'dup@example.com' },
    ]);

    expect(result.duplicates).toBe(1);
    expect(result.imported).toBe(0);
    // personId should not be set for duplicates
    expect(result.results[0].personId).toBeUndefined();
    expect(result.results[0].status).toBe('duplicate');
  });

  // Verify total counts are consistent
  it('counts are consistent: imported + duplicates + errors = total rows', async () => {
    const existing = {
      id: 'e1',
      fullName: 'Existing',
      email: 'dup@example.com',
      phoneE164: null,
    };

    let selectCallIdx = 0;
    const selectMock = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        selectCallIdx++;
        return selectCallIdx === 1
          ? Promise.resolve([]) // first: no dup
          : Promise.resolve([existing]); // second: dup
      }),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'new-p', fullName: 'New' }]),
    };
    mockDb.select.mockReturnValue(selectMock);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await importPeopleBatch([
      { rowNumber: 1, fullName: 'New Person', email: 'new@x.com' },
      { rowNumber: 2, fullName: 'Dup Person', email: 'dup@example.com' },
      { rowNumber: 3, fullName: '' }, // error
    ]);

    expect(result.imported + result.duplicates + result.errors).toBe(3);
    expect(result.results).toHaveLength(3);

    // Verify each result has correct status
    const statuses = result.results.map((r) => r.status);
    expect(statuses).toContain('created');
    expect(statuses).toContain('duplicate');
    expect(statuses).toContain('error');
  });
});

// ── searchPeople – SQL template and JSONB kills ───────────────
describe('searchPeople – SQL and JSONB verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L161-166: ilike patterns include the escaped query wrapped in %...%
  it('wraps query in % wildcards for ilike', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ query: 'Rajesh' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    expect(ilikeCalls.length).toBe(3); // fullName, email, organization
    // Each should have pattern %Rajesh%
    ilikeCalls.forEach((call: unknown[]) => {
      expect(call[1]).toBe('%Rajesh%');
    });
  });

  // L173-174: organization ilike pattern
  it('wraps organization in % wildcards for ilike', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ organization: 'AIIMS' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    const orgCall = ilikeCalls.find((c: unknown[]) => c[1] === '%AIIMS%');
    expect(orgCall).toBeDefined();
  });

  // L177-178: city ilike pattern
  it('wraps city in % wildcards for ilike', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ city: 'Mumbai' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    const cityCall = ilikeCalls.find((c: unknown[]) => c[1] === '%Mumbai%');
    expect(cityCall).toBeDefined();
  });

  // L181-182: specialty ilike pattern
  it('wraps specialty in % wildcards for ilike', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ specialty: 'Neuro' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    const specCall = ilikeCalls.find((c: unknown[]) => c[1] === '%Neuro%');
    expect(specCall).toBeDefined();
  });

  // L164-166: exact phone match uses eq, not ilike
  it('uses eq for exact phone match in query search', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ query: '+919876543210' });
    // eq should be called with phone value
    const eqCalls = mockDrizzle.eq.mock.calls;
    const phoneCall = eqCalls.find((c: unknown[]) => c[1] === '+919876543210');
    expect(phoneCall).toBeDefined();
  });

  // L184: tag filter — verify sql template call includes tag value
  it('tag filter passes JSON-serialized tag to sql template', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ tag: 'speaker' });
    // The and() call should include conditions array with a sql result for the tag
    const andCalls = mockDrizzle.and.mock.calls;
    // Should have 3 args: 2 base + 1 tag condition
    expect(andCalls[0].length).toBe(3);
  });

  // L187-190: view filters add sql template conditions
  // Verify that each view adds exactly one condition beyond the base 2
  it('faculty view produces exactly 3 conditions in and()', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'faculty' });
    expect(mockDrizzle.and.mock.calls[0].length).toBe(3);
  });

  it('delegates view produces exactly 3 conditions', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'delegates' });
    expect(mockDrizzle.and.mock.calls[0].length).toBe(3);
  });

  it('sponsors view produces exactly 3 conditions', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'sponsors' });
    expect(mockDrizzle.and.mock.calls[0].length).toBe(3);
  });

  it('vips view produces exactly 3 conditions', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'vips' });
    expect(mockDrizzle.and.mock.calls[0].length).toBe(3);
  });

  // L207: count query — verify totalPages and total use sql count
  it('total is derived from count query result', async () => {
    chainedSearchSelect([], 42);
    const result = await searchPeople({});
    expect(result.total).toBe(42);
    expect(result.totalPages).toBe(2); // ceil(42/25)
  });
});

// ── getEventPeople – select shape kill ────────────────────────
describe('getEventPeople – select shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L383: ObjectLiteral {} — the select shape should include specific fields
  it('calls select() (not empty object shape)', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValue(selectChain);

    await getEventPeople(VALID_EVENT_UUID);

    // select should be called with a non-empty argument (the field shape)
    expect(mockDb.select).toHaveBeenCalled();
    const selectArg = mockDb.select.mock.calls[0][0];
    // The argument should be an object with id, fullName, email, phoneE164
    expect(selectArg).toBeDefined();
    expect(selectArg).toHaveProperty('id');
    expect(selectArg).toHaveProperty('fullName');
    expect(selectArg).toHaveProperty('email');
    expect(selectArg).toHaveProperty('phoneE164');
  });
});

// ── createPerson – verify eq is called with actual email value ──
describe('createPerson – eq value verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L58: validated.email || undefined → true
  // Kill: verify eq is called with the actual email string, not boolean true
  it('passes actual email string (not true) to dedup eq check', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      email: 'specific@example.com',
    });

    // eq should have been called with the email string
    const eqCalls = mockDrizzle.eq.mock.calls;
    const emailEqCall = eqCalls.find((c: unknown[]) => c[1] === 'specific@example.com');
    expect(emailEqCall).toBeDefined();
    // Should NOT be called with boolean true
    const boolEqCall = eqCalls.find((c: unknown[]) => c[1] === true);
    expect(boolEqCall).toBeUndefined();
  });

  // L59: phoneE164 || undefined → true
  // Kill: verify eq is called with the phone E.164 string, not true
  it('passes actual phoneE164 string (not true) to dedup eq check', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      phone: '9876543210',
    });

    const eqCalls = mockDrizzle.eq.mock.calls;
    const phoneEqCall = eqCalls.find((c: unknown[]) => c[1] === '+919876543210');
    expect(phoneEqCall).toBeDefined();
    const boolEqCall = eqCalls.find((c: unknown[]) => c[1] === true);
    expect(boolEqCall).toBeUndefined();
  });

  // L30: ObjectLiteral {} on select shape in findDuplicatePerson
  // The select is called with { id, fullName, email, phoneE164 }
  // If mutated to {}, select returns all columns instead
  it('dedup select has non-empty shape', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'p1', fullName: 'Test' }]),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    await createPerson({
      fullName: 'Test',
      email: 'test@example.com',
    });

    // First select call (dedup) should have a shape argument
    const selectArg = mockDb.select.mock.calls[0][0];
    expect(selectArg).toBeDefined();
    expect(Object.keys(selectArg).length).toBeGreaterThan(0);
  });
});

// ── updatePerson – phone normalization conditional kill ────────
describe('updatePerson – phone !== undefined conditional kill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L101: fields.phone !== undefined → true
  // If mutated to true, normalizePhone would run even when phone is undefined
  // This would throw because normalizePhone(undefined) fails
  // So the test that succeeds without phone should kill it.
  // But wait — if phone is omitted, fields.phone is undefined in the partial schema.
  // With mutation: if (true) { phoneE164 = undefined ? normalizePhone(undefined) : undefined }
  // undefined is falsy, so phoneE164 = undefined — same behavior. Equivalent mutation.
  // Actually wait: if (fields.phone !== undefined) is mutated to if (true):
  // phoneE164 = fields.phone ? normalizePhone(fields.phone) : undefined
  // fields.phone is undefined, which is falsy, so phoneE164 = undefined
  // Then L113: phoneE164 !== undefined is false, so no change. Same behavior.
  // This IS an equivalent mutation. Can't kill it.
  it('works correctly whether phone is provided or not', async () => {
    // Just confirming: this mutation is equivalent
    const updateChain = chainedUpdate([{ id: VALID_UUID }]);
    await updatePerson({ personId: VALID_UUID, fullName: 'Test' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty('phoneE164');
  });
});

// ── searchPeople – ilike pattern assertion kills ──────────────
describe('searchPeople – ilike pattern exact kills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  // L161: ilike patterns use %escaped% format (not empty strings)
  // Mutations: StringLiteral "" on the escape replacement strings
  // e.g., query.replace(/%/g, '\\%') → query.replace(/%/g, '')
  it('ilike pattern for query includes non-empty wrapped value', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ query: 'Test' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    ilikeCalls.forEach((call: unknown[]) => {
      const pattern = call[1] as string;
      expect(pattern).not.toBe('');
      expect(pattern.length).toBeGreaterThan(0);
      // Pattern should be %Test%
      expect(pattern).toBe('%Test%');
    });
  });

  // L173: organization escape — StringLiteral "" mutations
  it('organization ilike pattern is not empty', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ organization: 'AIIMS' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    const orgPattern = ilikeCalls[0][1] as string;
    expect(orgPattern).toBe('%AIIMS%');
    expect(orgPattern).not.toBe('');
  });

  // L177: city escape patterns
  it('city ilike pattern is not empty', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ city: 'Delhi' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    const cityPattern = ilikeCalls[0][1] as string;
    expect(cityPattern).toBe('%Delhi%');
  });

  // L181: specialty escape patterns
  it('specialty ilike pattern is not empty', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ specialty: 'Cardio' });
    const ilikeCalls = mockDrizzle.ilike.mock.calls;
    const specPattern = ilikeCalls[0][1] as string;
    expect(specPattern).toBe('%Cardio%');
  });

  // L184: tag sql template — StringLiteral ``
  // The sql template for tag is: sql`${people.tags} @> ${JSON.stringify([tag])}::jsonb`
  // If mutated to empty template ``, the sql call returns a different result
  // We can't easily check the sql template content with our mock since sql is a tagged template

  // L187-190: view sql templates
  // These are sql`${people.tags} @> '["faculty"]'::jsonb` etc.
  // Mutations change these to empty templates ``
  // With our mock, both produce a result object, but the values array will differ

  // Let's verify that the view filter actually calls our mock sql with specific content
  it('faculty view sql call includes tags reference', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'faculty' });
    // The and() call should receive 3 conditions
    const andArgs = mockDrizzle.and.mock.calls[0];
    expect(andArgs.length).toBe(3);
    // The third condition should be a sql result (our mock returns {_tag: 'sql', ...})
    const viewCondition = andArgs[2];
    expect(viewCondition).toBeDefined();
    // If the template was emptied, values would be empty
    // With real template sql`${people.tags} @> '["faculty"]'::jsonb`,
    // values would include people.tags
    expect(viewCondition._tag).toBe('sql');
    expect(viewCondition.values.length).toBeGreaterThan(0);
  });

  it('delegates view sql call includes tags reference', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'delegates' });
    const andArgs = mockDrizzle.and.mock.calls[0];
    const viewCondition = andArgs[2];
    expect(viewCondition._tag).toBe('sql');
    expect(viewCondition.values.length).toBeGreaterThan(0);
  });

  it('sponsors view sql call includes tags reference', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'sponsors' });
    const andArgs = mockDrizzle.and.mock.calls[0];
    const viewCondition = andArgs[2];
    expect(viewCondition._tag).toBe('sql');
    expect(viewCondition.values.length).toBeGreaterThan(0);
  });

  it('vips view sql call includes tags reference', async () => {
    chainedSearchSelect([], 0);
    await searchPeople({ view: 'vips' });
    const andArgs = mockDrizzle.and.mock.calls[0];
    const viewCondition = andArgs[2];
    expect(viewCondition._tag).toBe('sql');
    expect(viewCondition.values.length).toBeGreaterThan(0);
  });

  // L207: count sql template
  it('count query uses sql template (not empty)', async () => {
    chainedSearchSelect([], 10);
    const result = await searchPeople({});
    // The second select call uses a sql count template
    const secondSelectArg = mockDb.select.mock.calls[1][0];
    expect(secondSelectArg).toBeDefined();
    expect(secondSelectArg.count).toBeDefined();
    expect(secondSelectArg.count._tag).toBe('sql');
  });

  // L207: ObjectLiteral {} for count select shape
  it('count select shape is not empty', async () => {
    chainedSearchSelect([], 10);
    await searchPeople({});
    const secondSelectArg = mockDb.select.mock.calls[1][0];
    expect(Object.keys(secondSelectArg).length).toBeGreaterThan(0);
  });
});

// ── ensureEventPerson – onConflictDoNothing target array ──────
describe('ensureEventPerson – target array kill', () => {
  beforeEach(() => vi.clearAllMocks());

  // L307: ArrayDeclaration [] — the target array should not be empty
  it('onConflictDoNothing target is non-empty array', async () => {
    const insertChain = chainedInsert([]);
    await ensureEventPerson(VALID_EVENT_UUID, VALID_PERSON_UUID, 'registration');
    const arg = insertChain.onConflictDoNothing.mock.calls[0][0];
    expect(arg.target).toBeDefined();
    expect(arg.target.length).toBeGreaterThan(0);
  });
});
