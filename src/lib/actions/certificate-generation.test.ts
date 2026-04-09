import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess, mockSendNotification } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    selectDistinctOn: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockSendNotification: vi.fn(),
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

vi.mock('@/lib/notifications/send', () => ({
  sendNotification: mockSendNotification,
}));

import {
  getEligibleRecipients,
  bulkGenerateCertificates,
  sendCertificateNotifications,
} from './certificate-generation';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEMPLATE_ID = '660e8400-e29b-41d4-a716-446655440001';
const PERSON_1 = '770e8400-e29b-41d4-a716-446655440001';
const PERSON_2 = '770e8400-e29b-41d4-a716-446655440002';

// Chain helper for select queries
function chainedSelect(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockImplementation(() => chain),
    innerJoin: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    for: vi.fn().mockResolvedValue(rows),
    then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function chainedSelectDistinctOn(rows: unknown[]) {
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

const mockRecipients = [
  { id: PERSON_1, fullName: 'Dr. Alice Smith', email: 'alice@example.com', designation: 'Professor' },
  { id: PERSON_2, fullName: 'Dr. Bob Jones', email: 'bob@example.com', designation: 'Lecturer' },
];

const mockTemplate = {
  id: TEMPLATE_ID,
  eventId: EVENT_ID,
  templateName: 'Delegate Attendance',
  certificateType: 'delegate_attendance',
  audienceScope: 'delegate',
  status: 'active',
  versionNo: 1,
  templateJson: { schemas: [], basePdf: '' },
  brandingSnapshotJson: null,
  allowedVariablesJson: ['full_name', 'event_name'],
  requiredVariablesJson: ['full_name'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123' });
  mockSendNotification.mockResolvedValue({ logId: 'log-1', status: 'sent' });
});

// ── getEligibleRecipients ───────────────────────────────────

describe('getEligibleRecipients', () => {
  it('returns confirmed delegates for all_delegates recipient type', async () => {
    mockDb.select.mockReturnValueOnce(chainedSelect(mockRecipients));

    const result = await getEligibleRecipients(EVENT_ID, {
      recipientType: 'all_delegates',
    });

    expect(result).toHaveLength(2);
    expect(result[0].fullName).toBe('Dr. Alice Smith');
    expect(result[1].fullName).toBe('Dr. Bob Jones');
  });

  it('returns distinct faculty for all_faculty recipient type', async () => {
    mockDb.selectDistinctOn.mockReturnValueOnce(chainedSelectDistinctOn(mockRecipients));

    const result = await getEligibleRecipients(EVENT_ID, {
      recipientType: 'all_faculty',
    });

    expect(result).toHaveLength(2);
    expect(mockDb.selectDistinctOn).toHaveBeenCalled();
  });

  it('returns distinct attendees for all_attendees recipient type', async () => {
    mockDb.selectDistinctOn.mockReturnValueOnce(chainedSelectDistinctOn([mockRecipients[0]]));

    const result = await getEligibleRecipients(EVENT_ID, {
      recipientType: 'all_attendees',
    });

    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe('Dr. Alice Smith');
  });

  it('returns empty array for custom type with no personIds', async () => {
    const result = await getEligibleRecipients(EVENT_ID, {
      recipientType: 'custom',
    });

    expect(result).toEqual([]);
  });
});

// ── bulkGenerateCertificates ────────────────────────────────

describe('bulkGenerateCertificates', () => {
  it('issues certificates for all eligible recipients', async () => {
    // select template
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Template lookup
        return chainedSelect([mockTemplate]);
      }
      if (selectCallCount === 2) {
        // Recipients (all_delegates)
        return chainedSelect(mockRecipients);
      }
      if (selectCallCount === 3) {
        // Existing certs for event+type
        return chainedSelect([]);
      }
      if (selectCallCount === 4) {
        // Existing cert numbers
        return chainedSelect([]);
      }
      return chainedSelect([]);
    });

    const createdCerts: unknown[] = [];
    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => {
          const certId = crypto.randomUUID();
          const cert = { id: certId, certificateNumber: `GEM2026-ATT-${String(createdCerts.length + 1).padStart(5, '0')}` };
          createdCerts.push(cert);
          return chainedInsert([cert]);
        }),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
        select: vi.fn().mockImplementation(() => chainedSelect([])),
      };
      return fn(tx);
    });

    const result = await bulkGenerateCertificates(EVENT_ID, {
      templateId: TEMPLATE_ID,
      recipientType: 'all_delegates',
      eligibilityBasisType: 'registration',
    });

    expect(result.issued).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.certificateIds).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/certificates`);
  });

  it('returns zero issued when no recipients found', async () => {
    mockDb.select.mockImplementation(() => {
      return chainedSelect([mockTemplate]);
    });

    // Second call returns empty recipients
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainedSelect([mockTemplate]);
      return chainedSelect([]);
    });

    const result = await bulkGenerateCertificates(EVENT_ID, {
      templateId: TEMPLATE_ID,
      recipientType: 'all_delegates',
      eligibilityBasisType: 'registration',
    });

    expect(result.issued).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.certificateIds).toHaveLength(0);
  });

  it('throws when template not found or not active', async () => {
    mockDb.select.mockReturnValueOnce(chainedSelect([]));

    await expect(
      bulkGenerateCertificates(EVENT_ID, {
        templateId: TEMPLATE_ID,
        recipientType: 'all_delegates',
        eligibilityBasisType: 'registration',
      }),
    ).rejects.toThrow('Active certificate template not found');
  });

  it('deduplicates duplicate recipients before issuing certificates', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return chainedSelect([mockTemplate]);
      }
      if (selectCallCount === 2) {
        return chainedSelect([
          mockRecipients[0],
          { ...mockRecipients[0] },
        ]);
      }
      if (selectCallCount === 3) {
        return chainedSelect([]);
      }
      if (selectCallCount === 4) {
        return chainedSelect([]);
      }
      return chainedSelect([]);
    });

    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => chainedUpdate()),
        select: vi.fn().mockImplementation(() => chainedSelect([])),
      };
      return fn(tx);
    });

    const result = await bulkGenerateCertificates(EVENT_ID, {
      templateId: TEMPLATE_ID,
      recipientType: 'custom',
      personIds: [PERSON_1, PERSON_1],
      eligibilityBasisType: 'registration',
    });

    expect(result.issued).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('fails the bulk operation when supersession update fails after insert', async () => {
    const existingCert = {
      id: '990e8400-e29b-41d4-a716-446655440001',
      eventId: EVENT_ID,
      personId: PERSON_1,
      certificateType: mockTemplate.certificateType,
      status: 'issued',
      supersededById: null,
      supersedesId: null,
      revokedAt: null,
      revokeReason: null,
    };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return chainedSelect([mockTemplate]);
      }
      if (selectCallCount === 2) {
        return chainedSelect([mockRecipients[0]]);
      }
      if (selectCallCount === 3) {
        return chainedSelect([existingCert]);
      }
      if (selectCallCount === 4) {
        return chainedSelect([]);
      }
      return chainedSelect([]);
    });

    mockDb.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        insert: vi.fn().mockImplementation(() => chainedInsert([{ id: crypto.randomUUID() }])),
        update: vi.fn().mockImplementation(() => {
          throw new Error('failed to supersede previous certificate');
        }),
        select: vi.fn().mockImplementation(() => chainedSelect([])),
      };
      return fn(tx);
    });

    await expect(
      bulkGenerateCertificates(EVENT_ID, {
        templateId: TEMPLATE_ID,
        recipientType: 'custom',
        personIds: [PERSON_1],
        eligibilityBasisType: 'registration',
      }),
    ).rejects.toThrow('failed to supersede previous certificate');
  });
});

// ── sendCertificateNotifications ────────────────────────────

describe('sendCertificateNotifications', () => {
  const CERT_ID_1 = '880e8400-e29b-41d4-a716-446655440001';
  const CERT_ID_2 = '880e8400-e29b-41d4-a716-446655440002';

  const mockCerts = [
    {
      id: CERT_ID_1,
      certificateNumber: 'GEM2026-ATT-00001',
      certificateType: 'delegate_attendance',
      storageKey: 'certificates/key1.pdf',
      personId: PERSON_1,
      personFullName: 'Dr. Alice Smith',
      personEmail: 'alice@example.com',
      personPhone: '+919876543210',
    },
    {
      id: CERT_ID_2,
      certificateNumber: 'GEM2026-ATT-00002',
      certificateType: 'delegate_attendance',
      storageKey: 'certificates/key2.pdf',
      personId: PERSON_2,
      personFullName: 'Dr. Bob Jones',
      personEmail: 'bob@example.com',
      personPhone: null,
    },
  ];

  it('sends email notifications for issued certificates', async () => {
    mockDb.select.mockReturnValueOnce(chainedSelect(mockCerts));
    mockDb.update.mockImplementation(() => chainedUpdate());

    const result = await sendCertificateNotifications(EVENT_ID, {
      certificateIds: [CERT_ID_1, CERT_ID_2],
      channel: 'email',
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT_ID,
        personId: PERSON_1,
        channel: 'email',
        templateKey: 'certificate_delivery',
        triggerType: 'certificate.generated',
      }),
    );
  });

  it('sends both email and whatsapp when channel is both', async () => {
    mockDb.select.mockReturnValueOnce(chainedSelect([mockCerts[0]]));
    mockDb.update.mockImplementation(() => chainedUpdate());

    const result = await sendCertificateNotifications(EVENT_ID, {
      certificateIds: [CERT_ID_1],
      channel: 'both',
    });

    expect(result.sent).toBe(1);
    // Should call sendNotification twice (email + whatsapp)
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it('counts failures when sendNotification throws', async () => {
    mockDb.select.mockReturnValueOnce(chainedSelect(mockCerts));
    mockSendNotification.mockRejectedValue(new Error('Provider error'));

    const result = await sendCertificateNotifications(EVENT_ID, {
      certificateIds: [CERT_ID_1, CERT_ID_2],
      channel: 'email',
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(2);
  });

  it('does not send notifications for certificates without generated PDFs', async () => {
    mockDb.select.mockReturnValueOnce(
      chainedSelect([
        {
          ...mockCerts[0],
          storageKey: null,
        },
      ]),
    );
    mockDb.update.mockImplementation(() => chainedUpdate());

    const result = await sendCertificateNotifications(EVENT_ID, {
      certificateIds: [CERT_ID_1],
      channel: 'email',
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('passes recipient delivery details to the notification service', async () => {
    mockDb.select.mockReturnValueOnce(chainedSelect([mockCerts[0]]));
    mockDb.update.mockImplementation(() => chainedUpdate());

    await sendCertificateNotifications(EVENT_ID, {
      certificateIds: [CERT_ID_1],
      channel: 'email',
    });

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          recipientEmail: 'alice@example.com',
        }),
      }),
    );
  });
});
