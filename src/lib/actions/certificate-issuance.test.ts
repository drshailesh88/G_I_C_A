import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import {
  issueCertificate,
  revokeCertificate,
  listIssuedCertificates,
  getIssuedCertificate,
  getCertificateDownloadUrl,
  verifyCertificate,
  resendCertificateNotification,
} from './certificate-issuance';

// ── Chain helpers ─────────────────────────────────────────────
let selectCallCount = 0;
function chainedSelectSequence(calls: unknown[][]) {
  selectCallCount = 0;
  mockDb.select.mockImplementation(() => {
    const rows = calls[selectCallCount] || [];
    selectCallCount++;
    // Chain is thenable (works when awaited directly without .limit())
    const chain: any = {
      from: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
      for: vi.fn().mockResolvedValue(rows),
      then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  });
}

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
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

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440002';
const CERT_ID = '550e8400-e29b-41d4-a716-446655440003';
const BASIS_ID = '550e8400-e29b-41d4-a716-446655440004';

const mockTemplate = {
  id: TEMPLATE_ID,
  eventId: EVENT_ID,
  certificateType: 'delegate_attendance',
  status: 'active',
  versionNo: 1,
  brandingSnapshotJson: { logo: 'url' },
  templateJson: { schemas: [] },
};

const mockIssuedCert = {
  id: CERT_ID,
  eventId: EVENT_ID,
  personId: PERSON_ID,
  templateId: TEMPLATE_ID,
  certificateType: 'delegate_attendance',
  certificateNumber: 'GEM2026-ATT-00001',
  status: 'issued',
  supersededById: null,
  supersedesId: null,
  revokedAt: null,
  revokeReason: null,
};

const validIssueInput = {
  personId: PERSON_ID,
  templateId: TEMPLATE_ID,
  certificateType: 'delegate_attendance' as const,
  eligibilityBasisType: 'registration' as const,
  eligibilityBasisId: BASIS_ID,
  renderedVariablesJson: { full_name: 'Dr. Smith' },
};

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
});

// ── Archived event guard ────────────────────────────────────
describe('issueCertificate — archived event', () => {
  it('short-circuits on archived event before any DB insert', async () => {
    chainedSelectSequence([
      [{ status: 'archived' }],  // event status check
    ]);

    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow(
      /event.*archived/i,
    );
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});

// ── Issue Certificate ────────────────────────────────────────
describe('issueCertificate', () => {
  it('rejects a malformed eventId before auth or database access', async () => {
    await expect(issueCertificate('not-a-uuid', validIssueInput)).rejects.toThrow();

    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('issues a new certificate when none exists', async () => {
    chainedSelectSequence([
      [{ status: 'published' }], // event not archived
      [{ id: PERSON_ID }],    // person exists
      [{ id: 'ep-1' }],        // event_people row exists
      [mockTemplate],           // active template exists
      [{ id: BASIS_ID }],       // eligibility basis belongs to event/person
      [],                       // no existing certs for this person/type
      [],                       // no existing cert numbers
    ]);
    chainedInsert([mockIssuedCert]);

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    expect(result).toEqual(mockIssuedCert);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
  });

  it('returns id, certificateNumber, and verificationToken on success', async () => {
    const VERIFICATION_TOKEN_ID = '550e8400-e29b-41d4-a716-446655440099';
    const certWithToken = {
      ...mockIssuedCert,
      verificationToken: VERIFICATION_TOKEN_ID,
    };
    chainedSelectSequence([
      [{ status: 'published' }],
      [{ id: PERSON_ID }],
      [{ id: 'ep-1' }],
      [mockTemplate],
      [{ id: BASIS_ID }],
      [],
      [],
    ]);
    chainedInsert([certWithToken]);

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    expect(typeof result.id).toBe('string');
    expect(result.id).toBe(CERT_ID);
    expect(typeof result.certificateNumber).toBe('string');
    expect(result.certificateNumber).toBe('GEM2026-ATT-00001');
    expect(typeof result.verificationToken).toBe('string');
    expect(result.verificationToken).toBe(VERIFICATION_TOKEN_ID);
  });

  it('throws when person not found', async () => {
    chainedSelectSequence([[{ status: 'published' }], []]);
    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('Person not found');
  });

  it('rejects cross-event person not attached to event', async () => {
    chainedSelectSequence([
      [{ status: 'published' }], // event not archived
      [{ id: PERSON_ID }],       // person exists in people table
      [],                        // NO event_people row → not attached
    ]);
    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow(
      'person not attached to event',
    );
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('throws when template not found or not active', async () => {
    chainedSelectSequence([[{ status: 'published' }], [{ id: PERSON_ID }], [{ id: 'ep-1' }], []]);
    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('Active certificate template not found');
  });

  it('rejects active templates whose certificate type does not match the requested certificate type', async () => {
    chainedSelectSequence([
      [{ status: 'published' }],
      [{ id: PERSON_ID }],
      [{ id: 'ep-1' }],
      [{ ...mockTemplate, certificateType: 'cme_attendance' }],
    ]);

    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('Active certificate template not found');
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rejects eligibility basis records that are not scoped to the event and person', async () => {
    chainedSelectSequence([
      [{ status: 'published' }],
      [{ id: PERSON_ID }],
      [{ id: 'ep-1' }],
      [mockTemplate],
      [],
    ]);

    await expect(issueCertificate(EVENT_ID, {
      ...validIssueInput,
      eligibilityBasisId: BASIS_ID,
    })).rejects.toThrow('Eligibility basis does not belong to this event/person');
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rejects manual eligibility with an arbitrary backing record ID', async () => {
    chainedSelectSequence([
      [{ status: 'published' }],
      [{ id: PERSON_ID }],
      [{ id: 'ep-1' }],
      [mockTemplate],
    ]);

    await expect(issueCertificate(EVENT_ID, {
      ...validIssueInput,
      eligibilityBasisType: 'manual',
      eligibilityBasisId: BASIS_ID,
    })).rejects.toThrow('Manual eligibility cannot reference another record');
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    await expect(issueCertificate(EVENT_ID, {})).rejects.toThrow();
  });

  it('rejects unauthorized access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('Forbidden');
  });

  it('supersedes existing certificate when one exists', async () => {
    const existingCert = { ...mockIssuedCert, id: 'old-cert-id' };
    chainedSelectSequence([
      [{ status: 'published' }],
      [{ id: PERSON_ID }],
      [{ id: 'ep-1' }],
      [mockTemplate],
      [{ id: BASIS_ID }],
      [existingCert],
      [{ certificateNumber: 'GEM2026-ATT-00001' }],
    ]);
    const newCert = { ...mockIssuedCert, id: 'new-cert-id', supersedesId: 'old-cert-id' };
    chainedInsert([newCert]);
    chainedUpdate([{ ...existingCert, status: 'superseded' }]);

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    expect(result.supersedesId).toBe('old-cert-id');
  });

  it('retries on certificate_number collision and succeeds on second attempt', async () => {
    let insertCallCount = 0;
    const collisionError = Object.assign(
      new Error('duplicate key value violates unique constraint "issued_certificates_certificate_number_unique"'),
      { code: '23505' },
    );

    // Global select counter across both outer calls and inner transaction calls
    let globalSelectCount = 0;
    const selectResponses = [
      // Outer: event status
      [{ status: 'published' }],
      // Outer: person
      [{ id: PERSON_ID }],
      // Outer: event_people
      [{ id: 'ep-1' }],
      // Outer: template
      [mockTemplate],
      // Outer: eligibility basis
      [{ id: BASIS_ID }],
      // Attempt 1: existing certs
      [],
      // Attempt 1: cert numbers
      [{ certificateNumber: 'GEM2026-ATT-00001' }],
      // Attempt 2: existing certs
      [],
      // Attempt 2: cert numbers
      [{ certificateNumber: 'GEM2026-ATT-00001' }],
    ];

    mockDb.select.mockImplementation(() => {
      const rows = selectResponses[globalSelectCount] ?? [];
      globalSelectCount++;
      const chain: any = {
        from: vi.fn().mockImplementation(() => chain),
        where: vi.fn().mockImplementation(() => chain),
        limit: vi.fn().mockResolvedValue(rows),
        for: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockResolvedValue(rows),
        then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    });

    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      return {
        values: vi.fn().mockReturnThis(),
        returning: insertCallCount === 1
          ? vi.fn().mockRejectedValue(collisionError)
          : vi.fn().mockResolvedValue([{ ...mockIssuedCert, certificateNumber: 'GEM2026-ATT-00002' }]),
      };
    });

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    expect(result).toBeDefined();
    expect(insertCallCount).toBe(2);
  });

  it('gives up after 3 collision retries', async () => {
    const collisionError = Object.assign(
      new Error('duplicate key value violates unique constraint "issued_certificates_certificate_number_unique"'),
      { code: '23505' },
    );

    let globalSelectCount = 0;
    const selectResponses = [
      [{ status: 'published' }],
      [{ id: PERSON_ID }], [{ id: 'ep-1' }], [mockTemplate], [{ id: BASIS_ID }],
      [], [], // attempt 1
      [], [], // attempt 2
      [], [], // attempt 3
    ];

    mockDb.select.mockImplementation(() => {
      const rows = selectResponses[globalSelectCount] ?? [];
      globalSelectCount++;
      const chain: any = {
        from: vi.fn().mockImplementation(() => chain),
        where: vi.fn().mockImplementation(() => chain),
        limit: vi.fn().mockResolvedValue(rows),
        for: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockResolvedValue(rows),
        then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    });

    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValue(collisionError),
    }));

    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('certificate_number');
  });

  it('issues new cert after revocation without supersession link (CP-33)', async () => {
    const revokedCert = { ...mockIssuedCert, id: 'revoked-id', status: 'revoked' };
    chainedSelectSequence([
      [{ status: 'published' }], // event not archived
      [{ id: PERSON_ID }],    // person exists
      [{ id: 'ep-1' }],        // event_people row exists
      [mockTemplate],           // active template
      [{ id: BASIS_ID }],       // eligibility basis belongs to event/person
      [revokedCert],             // existing cert is revoked
      [],                       // no existing cert numbers
    ]);
    const newCert = { ...mockIssuedCert, id: 'fresh-id', supersedesId: null };
    chainedInsert([newCert]);

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    // Should NOT link to the revoked cert (buildSupersessionChain returns nulls for revoked)
    expect(result.supersedesId).toBeNull();
  });

  it('does not retry on non-certificate_number unique violations', async () => {
    let insertCallCount = 0;
    const otherUniqueError = Object.assign(
      new Error('duplicate key value violates unique constraint "uq_issued_cert_one_current"'),
      { code: '23505' },
    );

    let globalSelectCount = 0;
    const selectResponses = [
      [{ status: 'published' }],
      [{ id: PERSON_ID }], [{ id: 'ep-1' }], [mockTemplate], [{ id: BASIS_ID }],
      [], [],
    ];

    mockDb.select.mockImplementation(() => {
      const rows = selectResponses[globalSelectCount] ?? [];
      globalSelectCount++;
      const chain: any = {
        from: vi.fn().mockImplementation(() => chain),
        where: vi.fn().mockImplementation(() => chain),
        limit: vi.fn().mockResolvedValue(rows),
        for: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockResolvedValue(rows),
        then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    });

    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      return {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(otherUniqueError),
      };
    });

    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow();
    expect(insertCallCount).toBe(1);
  });

  it('captures templateSnapshotJson from template at issue time', async () => {
    const templateWithRichJson = {
      ...mockTemplate,
      templateJson: { layout: 'formal', fields: ['name', 'date'], version: 42 },
    };
    chainedSelectSequence([
      [{ status: 'published' }],
      [{ id: PERSON_ID }],
      [{ id: 'ep-1' }],
      [templateWithRichJson],
      [{ id: BASIS_ID }],
      [],
      [],
    ]);
    const insertChain = chainedInsert([mockIssuedCert]);

    await issueCertificate(EVENT_ID, validIssueInput);

    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.templateSnapshotJson).toEqual(templateWithRichJson.templateJson);
  });

  it('captures renderedVariablesJson from validated input at issue time', async () => {
    const inputWithVars = {
      ...validIssueInput,
      renderedVariablesJson: { full_name: 'Dr. Priya', designation: 'Professor' },
    };
    chainedSelectSequence([
      [{ status: 'published' }],
      [{ id: PERSON_ID }],
      [{ id: 'ep-1' }],
      [mockTemplate],
      [{ id: BASIS_ID }],
      [],
      [],
    ]);
    const insertChain = chainedInsert([mockIssuedCert]);

    await issueCertificate(EVENT_ID, inputWithVars);

    const insertCall = insertChain.values.mock.calls[0][0];
    expect(insertCall.renderedVariablesJson).toEqual({ full_name: 'Dr. Priya', designation: 'Professor' });
  });

  it('rejects stale supersession when the current certificate changed before it could be superseded', async () => {
    const existingCert = { ...mockIssuedCert, id: 'old-cert-id' };
    chainedSelectSequence([
      [{ status: 'published' }],
      [{ id: PERSON_ID }],
      [{ id: 'ep-1' }],
      [mockTemplate],
      [{ id: BASIS_ID }],
      [existingCert],
      [{ certificateNumber: 'GEM2026-ATT-00001' }],
    ]);
    chainedUpdate([]);

    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('changed during issuance');
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

// ── Transaction retry (cert-code-002) ───────────────────────
describe('issueCertificate — transaction retry', () => {
  it('transaction retried once on first failure', async () => {
    let txCallCount = 0;
    const serializationError = Object.assign(
      new Error('could not serialize access due to concurrent update'),
      { code: '40001' },
    );

    let globalSelectCount = 0;
    const selectResponses = [
      [{ status: 'published' }],
      [{ id: PERSON_ID }], [{ id: 'ep-1' }], [mockTemplate], [{ id: BASIS_ID }],
      [], [],
      // retry attempt also needs full sequence
      [{ status: 'published' }],
      [{ id: PERSON_ID }], [{ id: 'ep-1' }], [mockTemplate], [{ id: BASIS_ID }],
      [], [],
    ];
    mockDb.select.mockImplementation(() => {
      const rows = selectResponses[globalSelectCount] ?? [];
      globalSelectCount++;
      const chain: any = {
        from: vi.fn().mockImplementation(() => chain),
        where: vi.fn().mockImplementation(() => chain),
        limit: vi.fn().mockResolvedValue(rows),
        for: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockResolvedValue(rows),
        then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
      };
      return chain;
    });

    chainedInsert([mockIssuedCert]);

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => {
      txCallCount++;
      if (txCallCount === 1) throw serializationError;
      return callback(mockDb);
    });

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    expect(result).toBeDefined();
    expect(txCallCount).toBe(2);
  });

  it('no retry when first attempt succeeds', async () => {
    let txCallCount = 0;

    chainedSelectSequence([
      [{ status: 'published' }], [{ id: PERSON_ID }], [{ id: 'ep-1' }], [mockTemplate], [{ id: BASIS_ID }], [], [],
    ]);
    chainedInsert([mockIssuedCert]);

    mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => {
      txCallCount++;
      return callback(mockDb);
    });

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    expect(result).toBeDefined();
    expect(txCallCount).toBe(1);
  });

  it('second failure re-throws original error', async () => {
    let txCallCount = 0;
    const deadlockError = Object.assign(
      new Error('deadlock detected'),
      { code: '40P01' },
    );

    chainedSelectSequence([
      [{ status: 'published' }], [{ id: PERSON_ID }], [{ id: 'ep-1' }], [mockTemplate], [{ id: BASIS_ID }], [], [],
      [{ status: 'published' }], [{ id: PERSON_ID }], [{ id: 'ep-1' }], [mockTemplate], [{ id: BASIS_ID }], [], [],
    ]);

    mockDb.transaction.mockImplementation(async () => {
      txCallCount++;
      throw deadlockError;
    });

    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('deadlock detected');
    expect(txCallCount).toBe(2);
  });
});

// ── Revoke Certificate ───────────────────────────────────────
describe('revokeCertificate', () => {
  it('rejects a malformed eventId before auth or database access', async () => {
    await expect(revokeCertificate('not-a-uuid', {
      certificateId: CERT_ID,
      revokeReason: 'Issued in error',
    })).rejects.toThrow();

    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('revokes an issued certificate', async () => {
    chainedSelectSequence([[mockIssuedCert]]);
    chainedUpdate([{ ...mockIssuedCert, status: 'revoked', revokeReason: 'Issued in error' }]);

    const result = await revokeCertificate(EVENT_ID, {
      certificateId: CERT_ID,
      revokeReason: 'Issued in error',
    });
    expect(result.status).toBe('revoked');
  });

  it('throws when certificate not found', async () => {
    chainedSelectSequence([[]]);
    await expect(revokeCertificate(EVENT_ID, {
      certificateId: CERT_ID,
      revokeReason: 'Error',
    })).rejects.toThrow('Certificate not found');
  });

  it('throws when revoking already revoked certificate', async () => {
    chainedSelectSequence([[{ ...mockIssuedCert, status: 'revoked' }]]);
    await expect(revokeCertificate(EVENT_ID, {
      certificateId: CERT_ID,
      revokeReason: 'Double revoke',
    })).rejects.toThrow('already revoked');
  });

  it('throws when revoking superseded certificate', async () => {
    chainedSelectSequence([[{ ...mockIssuedCert, status: 'superseded' }]]);
    await expect(revokeCertificate(EVENT_ID, {
      certificateId: CERT_ID,
      revokeReason: 'Wrong version',
    })).rejects.toThrow('superseded');
  });

  it('rejects empty revoke reason', async () => {
    await expect(revokeCertificate(EVENT_ID, {
      certificateId: CERT_ID,
      revokeReason: '',
    })).rejects.toThrow();
  });

  it('rejects stale revocation when the certificate changed after validation', async () => {
    chainedSelectSequence([[mockIssuedCert]]);
    chainedUpdate([]);

    await expect(revokeCertificate(EVENT_ID, {
      certificateId: CERT_ID,
      revokeReason: 'Issued in error',
    })).rejects.toThrow('changed during revocation');
  });
});

// ── List Issued Certificates ─────────────────────────────────
describe('listIssuedCertificates', () => {
  function chainedSelectWithJoins(rows: unknown[]) {
    const chain: any = {
      from: vi.fn().mockImplementation(() => chain),
      innerJoin: vi.fn().mockImplementation(() => chain),
      leftJoin: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    mockDb.select.mockReturnValue(chain);
    return chain;
  }

  it('returns certificates with recipient info', async () => {
    const certWithPerson = {
      ...mockIssuedCert,
      recipientName: 'Dr. Smith',
      registrationNumber: 'GEM2026-DEL-00001',
    };
    const chain = chainedSelectWithJoins([certWithPerson]);
    const result = await listIssuedCertificates(EVENT_ID);
    expect(result).toEqual([certWithPerson]);
    expect(chain.innerJoin).toHaveBeenCalledTimes(1);
    expect(chain.leftJoin).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed eventId before auth or database access', async () => {
    await expect(listIssuedCertificates('not-a-uuid')).rejects.toThrow();

    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns empty array when no certificates', async () => {
    chainedSelectWithJoins([]);
    const result = await listIssuedCertificates(EVENT_ID);
    expect(result).toEqual([]);
  });

  it('calls orderBy for issuedAt DESC ordering (CP-40)', async () => {
    const chain = chainedSelectWithJoins([]);
    await listIssuedCertificates(EVENT_ID);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
  });
});

// ── Get Issued Certificate ───────────────────────────────────
describe('getIssuedCertificate', () => {
  it('rejects a malformed eventId before auth or database access', async () => {
    await expect(getIssuedCertificate('not-a-uuid', CERT_ID)).rejects.toThrow();

    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns certificate by ID', async () => {
    chainedSelectSequence([[mockIssuedCert]]);
    const result = await getIssuedCertificate(EVENT_ID, CERT_ID);
    expect(result).toEqual(mockIssuedCert);
  });

  it('throws when not found', async () => {
    chainedSelectSequence([[]]);
    await expect(getIssuedCertificate(EVENT_ID, CERT_ID)).rejects.toThrow('Certificate not found');
  });

  it('rejects non-UUID certificate ID', async () => {
    await expect(getIssuedCertificate(EVENT_ID, 'not-a-uuid')).rejects.toThrow();
  });
});

// ── Get Certificate Download URL ────────────────────────────
describe('getCertificateDownloadUrl', () => {
  const mockStorageProvider = {
    upload: vi.fn(),
    getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed?token=abc'),
    delete: vi.fn(),
  };

  it('rejects a malformed eventId before auth or database access', async () => {
    await expect(getCertificateDownloadUrl('not-a-uuid', CERT_ID, mockStorageProvider)).rejects.toThrow();

    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockStorageProvider.getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns download result with correct format (CP-43)', async () => {
    const cert = {
      ...mockIssuedCert,
      storageKey: 'certificates/ev/type/id.pdf',
      fileName: 'GEM2026-ATT-00001.pdf',
    };
    chainedSelectSequence([[cert]]);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve: () => void) => { resolve(); return { catch: vi.fn() }; }),
    };
    mockDb.update.mockReturnValue(updateChain);

    const result = await getCertificateDownloadUrl(EVENT_ID, CERT_ID, mockStorageProvider);
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('fileName');
    expect(result).toHaveProperty('expiresInSeconds');
    expect(typeof result.url).toBe('string');
    expect(typeof result.fileName).toBe('string');
    expect(result.expiresInSeconds).toBe(3600);
  });

  it('triggers fire-and-forget update for downloadCount (CP-47)', async () => {
    const cert = {
      ...mockIssuedCert,
      storageKey: 'certificates/ev/type/id.pdf',
      fileName: 'GEM2026-ATT-00001.pdf',
    };
    chainedSelectSequence([[cert]]);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve: () => void) => { resolve(); return { catch: vi.fn() }; }),
    };
    mockDb.update.mockReturnValue(updateChain);

    await getCertificateDownloadUrl(EVENT_ID, CERT_ID, mockStorageProvider);
    // Verify the fire-and-forget update was triggered
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('returns signed URL for issued certificate', async () => {
    const cert = {
      ...mockIssuedCert,
      storageKey: 'certificates/ev/type/id.pdf',
      fileName: 'GEM2026-ATT-00001.pdf',
    };
    chainedSelectSequence([[cert]]);
    // Mock the fire-and-forget update
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve: () => void) => { resolve(); return { catch: vi.fn() }; }),
    };
    mockDb.update.mockReturnValue(updateChain);

    const result = await getCertificateDownloadUrl(EVENT_ID, CERT_ID, mockStorageProvider);
    expect(result.url).toBe('https://r2.example.com/signed?token=abc');
    expect(result.fileName).toBe('GEM2026-ATT-00001.pdf');
    expect(result.expiresInSeconds).toBe(3600);
    expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith('certificates/ev/type/id.pdf', 3600);
  });

  it('throws when certificate not found', async () => {
    chainedSelectSequence([[]]);
    await expect(getCertificateDownloadUrl(EVENT_ID, CERT_ID, mockStorageProvider)).rejects.toThrow('Certificate not found');
  });

  it('throws when certificate is revoked', async () => {
    chainedSelectSequence([[{ ...mockIssuedCert, status: 'revoked', storageKey: 'k' }]]);
    await expect(getCertificateDownloadUrl(EVENT_ID, CERT_ID, mockStorageProvider)).rejects.toThrow('revoked');
  });

  it('throws when certificate is superseded', async () => {
    chainedSelectSequence([[{ ...mockIssuedCert, status: 'superseded', storageKey: 'k' }]]);
    await expect(getCertificateDownloadUrl(EVENT_ID, CERT_ID, mockStorageProvider)).rejects.toThrow('superseded');
  });

  it('rejects non-UUID certificate ID', async () => {
    await expect(getCertificateDownloadUrl(EVENT_ID, 'not-a-uuid', mockStorageProvider)).rejects.toThrow();
  });

  it('rejects unauthorized access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(getCertificateDownloadUrl(EVENT_ID, CERT_ID, mockStorageProvider)).rejects.toThrow('Forbidden');
  });

  it('throws when storageKey is null (PDF not generated)', async () => {
    const cert = {
      ...mockIssuedCert,
      storageKey: null,
      fileName: 'GEM2026-ATT-00001.pdf',
    };
    chainedSelectSequence([[cert]]);
    await expect(getCertificateDownloadUrl(EVENT_ID, CERT_ID, mockStorageProvider)).rejects.toThrow('not been generated');
  });
});

// ── Verify Certificate (public) ─────────────────────────────
describe('verifyCertificate', () => {
  const VERIFICATION_TOKEN = '660e8400-e29b-41d4-a716-446655440099';

  it('returns valid for issued certificate and increments count', async () => {
    const cert = {
      id: CERT_ID,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      status: 'issued',
      issuedAt: new Date('2026-04-01'),
      revokedAt: null,
      personId: PERSON_ID,
      eventId: EVENT_ID,
    };
    chainedSelectSequence([[cert]]);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve: () => void) => { resolve(); return { catch: vi.fn() }; }),
    };
    mockDb.update.mockReturnValue(updateChain);

    const result = await verifyCertificate(VERIFICATION_TOKEN);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.certificateNumber).toBe('GEM2026-ATT-00001');
      expect(result.certificateType).toBe('delegate_attendance');
    }
    // Verification count should be incremented for valid certificates
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('returns invalid for revoked certificate without incrementing count', async () => {
    const cert = {
      id: CERT_ID,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      status: 'revoked',
      issuedAt: new Date('2026-04-01'),
      revokedAt: new Date('2026-04-05'),
      personId: PERSON_ID,
      eventId: EVENT_ID,
    };
    chainedSelectSequence([[cert]]);

    const result = await verifyCertificate(VERIFICATION_TOKEN);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('revoked');
      expect(result.revokedAt).toBeDefined();
    }
    // Should NOT increment count for revoked certs
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns invalid for superseded certificate without incrementing count', async () => {
    const cert = {
      id: CERT_ID,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      status: 'superseded',
      issuedAt: new Date('2026-04-01'),
      revokedAt: null,
      personId: PERSON_ID,
      eventId: EVENT_ID,
    };
    chainedSelectSequence([[cert]]);

    const result = await verifyCertificate(VERIFICATION_TOKEN);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('superseded');
    }
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns invalid when not found', async () => {
    chainedSelectSequence([[]]);
    const result = await verifyCertificate(VERIFICATION_TOKEN);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('not found');
    }
  });

  it('increments verificationCount via fire-and-forget update (CP-52)', async () => {
    const cert = {
      id: CERT_ID,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      status: 'issued',
      issuedAt: new Date('2026-04-01'),
      revokedAt: null,
      personId: PERSON_ID,
      eventId: EVENT_ID,
    };
    chainedSelectSequence([[cert]]);
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((resolve: () => void) => { resolve(); return { catch: vi.fn() }; }),
    };
    mockDb.update.mockReturnValue(updateChain);

    await verifyCertificate('660e8400-e29b-41d4-a716-446655440099');
    // Update should have been called to increment verificationCount
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('rejects non-UUID token', async () => {
    await expect(verifyCertificate('not-a-uuid')).rejects.toThrow();
  });
});

// ── Resend Certificate Notification (7A-3) ─────────────────────
describe('resendCertificateNotification', () => {
  const mockSendNotification = vi.fn().mockResolvedValue({ success: true });

  beforeEach(() => {
    mockSendNotification.mockClear();
    // Mock dynamic import of notification send
    vi.doMock('@/lib/notifications/send', () => ({
      sendNotification: mockSendNotification,
    }));
  });

  function chainedSelectWithJoin(rows: unknown[]) {
    const chain: any = {
      from: vi.fn().mockImplementation(() => chain),
      innerJoin: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    };
    mockDb.select.mockReturnValue(chain);
    return chain;
  }

  it('resends notification for an issued certificate', async () => {
    const certWithPerson = {
      id: CERT_ID,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      status: 'issued',
      storageKey: 'certificates/ev/type/id.pdf',
      personId: PERSON_ID,
      personFullName: 'Dr. Smith',
      personEmail: 'smith@example.com',
      personPhone: '+919876543210',
    };
    chainedSelectWithJoin([certWithPerson]);
    chainedUpdate([]);

    const result = await resendCertificateNotification(EVENT_ID, {
      certificateId: CERT_ID,
      channel: 'email',
    });
    expect(result.sent).toBe(true);
    expect(result.channels).toBe(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
  });

  it('throws when certificate not found', async () => {
    chainedSelectWithJoin([]);
    await expect(resendCertificateNotification(EVENT_ID, {
      certificateId: CERT_ID,
      channel: 'email',
    })).rejects.toThrow('Certificate not found');
  });

  it('throws when certificate is revoked', async () => {
    chainedSelectWithJoin([{
      id: CERT_ID,
      status: 'revoked',
      storageKey: 'k',
      personId: PERSON_ID,
    }]);
    await expect(resendCertificateNotification(EVENT_ID, {
      certificateId: CERT_ID,
      channel: 'email',
    })).rejects.toThrow('Can only resend issued certificates');
  });

  it('throws when PDF not generated', async () => {
    chainedSelectWithJoin([{
      id: CERT_ID,
      status: 'issued',
      storageKey: null,
      personId: PERSON_ID,
    }]);
    await expect(resendCertificateNotification(EVENT_ID, {
      certificateId: CERT_ID,
      channel: 'email',
    })).rejects.toThrow('not been generated');
  });

  it('rejects invalid input', async () => {
    await expect(resendCertificateNotification(EVENT_ID, {
      certificateId: 'not-a-uuid',
      channel: 'carrier_pigeon',
    })).rejects.toThrow();
  });

  it('rejects unauthorized access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));
    await expect(resendCertificateNotification(EVENT_ID, {
      certificateId: CERT_ID,
      channel: 'email',
    })).rejects.toThrow('Forbidden');
  });

  it('uses a stable idempotencyKey so rapid duplicate manual resends collapse', async () => {
    const certWithPerson = {
      id: CERT_ID,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      status: 'issued',
      storageKey: 'certificates/ev/type/id.pdf',
      personId: PERSON_ID,
      personFullName: 'Dr. Smith',
      personEmail: 'smith@example.com',
      personPhone: '+919876543210',
    };
    chainedSelectWithJoin([certWithPerson]);
    chainedUpdate([]);

    await resendCertificateNotification(EVENT_ID, {
      certificateId: CERT_ID,
      channel: 'email',
    });

    const call = mockSendNotification.mock.calls[0][0];
    expect(call.idempotencyKey).toBe(`cert-send-${CERT_ID}-email`);
  });

  it('sends to both channels when channel is both (CP-125)', async () => {
    const certWithPerson = {
      id: CERT_ID,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      status: 'issued',
      storageKey: 'certificates/ev/type/id.pdf',
      personId: PERSON_ID,
      personFullName: 'Dr. Smith',
      personEmail: 'smith@example.com',
      personPhone: '+919876543210',
    };
    chainedSelectWithJoin([certWithPerson]);
    chainedUpdate([]);

    const result = await resendCertificateNotification(EVENT_ID, {
      certificateId: CERT_ID,
      channel: 'both',
    });

    expect(result.sent).toBe(true);
    expect(result.channels).toBe(2);
    expect(mockSendNotification).toHaveBeenCalledTimes(2);

    const channels = mockSendNotification.mock.calls.map((c: any[]) => c[0].channel);
    expect(channels).toContain('email');
    expect(channels).toContain('whatsapp');
  });

  it('fails when the notification service reports a failed send instead of marking the certificate as sent', async () => {
    chainedSelectWithJoin([{
      id: CERT_ID,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      status: 'issued',
      storageKey: 'certificates/ev/type/id.pdf',
      personId: PERSON_ID,
      personFullName: 'Dr. Smith',
      personEmail: 'smith@example.com',
      personPhone: '+919876543210',
    }]);
    chainedUpdate([]);
    mockSendNotification.mockResolvedValueOnce({
      notificationLogId: 'log-1',
      provider: 'resend',
      providerMessageId: null,
      status: 'failed',
    });

    await expect(resendCertificateNotification(EVENT_ID, {
      certificateId: CERT_ID,
      channel: 'email',
    })).rejects.toThrow('failed');
  });
});

// ── List Issued Certificates — Enhanced (7A-3) ─────────────────
describe('listIssuedCertificates — enhanced with joins', () => {
  it('calls select with join fields', async () => {
    const certWithRecipient = {
      ...mockIssuedCert,
      recipientName: 'Dr. Sharma',
      registrationNumber: 'GEM2026-DEL-00042',
    };
    // Enhanced query chains through innerJoin and leftJoin
    const chain: any = {
      from: vi.fn().mockImplementation(() => chain),
      innerJoin: vi.fn().mockImplementation(() => chain),
      leftJoin: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      orderBy: vi.fn().mockResolvedValue([certWithRecipient]),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await listIssuedCertificates(EVENT_ID);
    expect(result).toEqual([certWithRecipient]);
    expect(result[0].recipientName).toBe('Dr. Sharma');
    expect(result[0].registrationNumber).toBe('GEM2026-DEL-00042');
    // Verify joins were called
    expect(chain.innerJoin).toHaveBeenCalledTimes(1);
    expect(chain.leftJoin).toHaveBeenCalledTimes(1);
  });
});

// ── Snapshot immutability (cert-api-007) ─────────────────────
describe('snapshot immutability — no UPDATE of snapshot columns', () => {
  it('no code path sets templateSnapshotJson or renderedVariablesJson in an update', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const srcDir = path.resolve(__dirname, '..');
    const files = [
      path.join(srcDir, 'actions', 'certificate-issuance.ts'),
      path.join(srcDir, 'inngest', 'bulk-functions.ts'),
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const setBlocks = content.match(/\.set\(\{[\s\S]*?\}\)/g) ?? [];

      for (const block of setBlocks) {
        expect(block).not.toContain('templateSnapshotJson');
        expect(block).not.toContain('renderedVariablesJson');
      }
    }
  });
});
