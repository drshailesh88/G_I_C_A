import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
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

const mockTemplate = {
  id: TEMPLATE_ID,
  eventId: EVENT_ID,
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
  renderedVariablesJson: { full_name: 'Dr. Smith' },
};

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
});

// ── Issue Certificate ────────────────────────────────────────
describe('issueCertificate', () => {
  it('issues a new certificate when none exists', async () => {
    chainedSelectSequence([
      [{ id: PERSON_ID }],    // person exists
      [mockTemplate],           // active template exists
      [],                       // no existing certs for this person/type
      [],                       // no existing cert numbers
    ]);
    chainedInsert([mockIssuedCert]);

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    expect(result).toEqual(mockIssuedCert);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
  });

  it('throws when person not found', async () => {
    chainedSelectSequence([[]]);
    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('Person not found');
  });

  it('throws when template not found or not active', async () => {
    chainedSelectSequence([[{ id: PERSON_ID }], []]);
    await expect(issueCertificate(EVENT_ID, validIssueInput)).rejects.toThrow('Active certificate template not found');
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
      [{ id: PERSON_ID }],
      [mockTemplate],
      [existingCert],
      [{ certificateNumber: 'GEM2026-ATT-00001' }],
    ]);
    const newCert = { ...mockIssuedCert, id: 'new-cert-id', supersedesId: 'old-cert-id' };
    chainedInsert([newCert]);
    chainedUpdate([{ ...existingCert, status: 'superseded' }]);

    const result = await issueCertificate(EVENT_ID, validIssueInput);
    expect(result.supersedesId).toBe('old-cert-id');
  });
});

// ── Revoke Certificate ───────────────────────────────────────
describe('revokeCertificate', () => {
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
});

// ── List Issued Certificates ─────────────────────────────────
describe('listIssuedCertificates', () => {
  it('returns certificates for the event', async () => {
    chainedSelectSequence([[mockIssuedCert]]);
    const result = await listIssuedCertificates(EVENT_ID);
    expect(result).toEqual([mockIssuedCert]);
  });

  it('returns empty array when no certificates', async () => {
    chainedSelectSequence([[]]);
    const result = await listIssuedCertificates(EVENT_ID);
    expect(result).toEqual([]);
  });
});

// ── Get Issued Certificate ───────────────────────────────────
describe('getIssuedCertificate', () => {
  it('returns certificate by ID', async () => {
    chainedSelectSequence([[mockIssuedCert]]);
    const result = await getIssuedCertificate(EVENT_ID, CERT_ID);
    expect(result).toEqual(mockIssuedCert);
  });

  it('throws when not found', async () => {
    chainedSelectSequence([[]]);
    await expect(getIssuedCertificate(EVENT_ID, CERT_ID)).rejects.toThrow('Certificate not found');
  });
});
