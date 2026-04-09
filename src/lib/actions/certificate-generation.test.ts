import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockAssertEventAccess, mockInngestSend, mockIsCertificateGenerationEnabled } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    selectDistinctOn: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockInngestSend: vi.fn().mockResolvedValue({ ids: ['evt-1'] }),
  mockIsCertificateGenerationEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/notifications/send', () => ({
  sendNotification: vi.fn().mockResolvedValue({ logId: 'log-1', status: 'sent' }),
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}));

vi.mock('@/lib/flags', () => ({
  isCertificateGenerationEnabled: () => mockIsCertificateGenerationEnabled(),
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
  mockIsCertificateGenerationEnabled.mockResolvedValue(true);
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

// ── bulkGenerateCertificates (now queues via Inngest) ──────

describe('bulkGenerateCertificates', () => {
  it('sends Inngest event with correct data for bulk generation', async () => {
    // Template lookup
    mockDb.select.mockReturnValueOnce(chainedSelect([mockTemplate]));

    const result = await bulkGenerateCertificates(EVENT_ID, {
      templateId: TEMPLATE_ID,
      recipientType: 'all_delegates',
      eligibilityBasisType: 'registration',
    });

    expect(result.queued).toBe(true);
    expect(result.message).toContain('queued');
    expect(mockInngestSend).toHaveBeenCalledOnce();
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'bulk/certificates.generate',
      data: {
        eventId: EVENT_ID,
        userId: 'user_123',
        templateId: TEMPLATE_ID,
        recipientType: 'all_delegates',
        personIds: undefined,
        eligibilityBasisType: 'registration',
      },
    });
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
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it('throws when certificate generation is disabled', async () => {
    mockIsCertificateGenerationEnabled.mockResolvedValueOnce(false);

    await expect(
      bulkGenerateCertificates(EVENT_ID, {
        templateId: TEMPLATE_ID,
        recipientType: 'all_delegates',
        eligibilityBasisType: 'registration',
      }),
    ).rejects.toThrow('currently disabled');
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it('includes personIds for custom recipient type', async () => {
    mockDb.select.mockReturnValueOnce(chainedSelect([mockTemplate]));

    await bulkGenerateCertificates(EVENT_ID, {
      templateId: TEMPLATE_ID,
      recipientType: 'custom',
      personIds: [PERSON_1, PERSON_2],
      eligibilityBasisType: 'manual',
    });

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientType: 'custom',
          personIds: [PERSON_1, PERSON_2],
          eligibilityBasisType: 'manual',
        }),
      }),
    );
  });
});

// ── sendCertificateNotifications (now queues via Inngest) ──

describe('sendCertificateNotifications', () => {
  const CERT_ID_1 = '880e8400-e29b-41d4-a716-446655440001';
  const CERT_ID_2 = '880e8400-e29b-41d4-a716-446655440002';

  it('sends Inngest event for email notifications', async () => {
    const result = await sendCertificateNotifications(EVENT_ID, {
      certificateIds: [CERT_ID_1, CERT_ID_2],
      channel: 'email',
    });

    expect(result.queued).toBe(true);
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'bulk/certificates.notify',
      data: {
        eventId: EVENT_ID,
        certificateIds: [CERT_ID_1, CERT_ID_2],
        channel: 'email',
      },
    });
  });

  it('sends Inngest event for both channels', async () => {
    await sendCertificateNotifications(EVENT_ID, {
      certificateIds: [CERT_ID_1],
      channel: 'both',
    });

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: 'both' }),
      }),
    );
  });
});
