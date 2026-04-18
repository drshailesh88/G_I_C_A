/**
 * Tests for PKT-C-003 preview revised emails.
 * Expectations derived from specs and domain rules, never from implementation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Constants ────────────────────────────────────────────────────

const EVENT_UUID = '00000000-0000-0000-0000-000000000001';
const VERSION_UUID = '00000000-0000-0000-0000-000000000002';
const PERSON_UUID_A = '00000000-0000-0000-0000-000000000003';
const PERSON_UUID_B = '00000000-0000-0000-0000-000000000004';
const MISSING_UUID = '00000000-0000-0000-0000-000000000099';

// ── DB mock ──────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  programVersions: {
    id: 'id',
    eventId: 'event_id',
    versionNo: 'version_no',
    notificationStatus: 'notification_status',
    notificationTriggeredAt: 'notification_triggered_at',
  },
  events: { id: 'id', name: 'name' },
  people: { id: 'id', fullName: 'full_name', salutation: 'salutation', email: 'email' },
  sessions: {},
  sessionAssignments: {},
  halls: {},
  sessionRoleRequirements: {},
  facultyInvites: {},
  eventPeople: {},
  eventRegistrations: {},
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: (_col: unknown, _id: unknown, cond: unknown) => cond,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: vi.fn().mockResolvedValue({
    userId: 'user-clerk-xyz',
    eventId: EVENT_UUID,
    role: 'org:event_coordinator',
  }),
}));

vi.mock('@/lib/auth/roles', () => ({
  ROLES: {
    SUPER_ADMIN: 'org:super_admin',
    EVENT_COORDINATOR: 'org:event_coordinator',
    OPS: 'org:ops',
    READ_ONLY: 'org:read_only',
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn((_col, val) => ({ type: 'eq', val })),
    and: vi.fn((...args) => ({ type: 'and', args })),
    inArray: vi.fn((_col, vals) => ({ type: 'inArray', vals })),
    desc: vi.fn((col) => col),
    asc: vi.fn((col) => col),
    or: vi.fn((...args) => ({ type: 'or', args })),
    ne: vi.fn(),
    lt: vi.fn(),
    gt: vi.fn(),
    isNull: vi.fn(),
    sql: vi.fn(),
  };
});

vi.mock('@/lib/notifications/template-utils', () => ({
  interpolate: vi.fn((tpl: string, vars: Record<string, unknown>) =>
    tpl.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m, k: string) => String(vars[k] ?? '')),
  ),
}));

vi.mock('@/lib/notifications/send', () => ({
  sendNotification: vi.fn().mockResolvedValue({ notificationLogId: 'log-01', status: 'sent', provider: 'resend' }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/validations/program', () => ({
  publishProgramVersionSchema: { parse: vi.fn((v) => v) },
  SESSION_TRANSITIONS: {},
  FACULTY_INVITE_TRANSITIONS: {},
}));

vi.mock('@/lib/validations/registration', () => ({
  generateRegistrationNumber: vi.fn(() => 'REG-001'),
  generateQrToken: vi.fn(() => 'qr-token'),
}));

// ── Fixtures ─────────────────────────────────────────────────────

const VERSION = {
  id: VERSION_UUID,
  eventId: EVENT_UUID,
  versionNo: 3,
  affectedPersonIdsJson: [PERSON_UUID_A, PERSON_UUID_B],
  changesSummaryJson: { added_sessions: ['s1', 's2'], removed_sessions: ['s3'] },
  changesDescription: 'Updated schedule',
  publishReason: null,
  notificationStatus: 'not_required',
  snapshotJson: {},
  baseVersionId: null,
  publishedBy: 'user-clerk-xyz',
  publishedAt: new Date('2026-04-18T10:00:00Z'),
  createdAt: new Date('2026-04-18T10:00:00Z'),
  notificationTriggeredAt: null,
};

const EVENT = { name: 'GEM India 2026' };

const PERSON_A = {
  id: PERSON_UUID_A,
  fullName: 'Priya Sharma',
  salutation: 'Dr',
  email: 'priya@example.com',
};

const PERSON_B = {
  id: PERSON_UUID_B,
  fullName: 'Arjun Menon',
  salutation: null,
  email: null,
};

// Helper: build a DB mock that returns values in sequence (one per .select().from().where().limit() call)
function makeSequentialSelectMock(returnValues: unknown[][]) {
  let idx = 0;
  return mockSelect.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: () => {
          const val = returnValues[idx++] ?? [];
          return Promise.resolve(val);
        },
        // .where().then() is used for inArray queries (no .limit() at the end)
        then: (fn: (v: unknown[]) => void) => {
          const val = returnValues[idx++] ?? [];
          return Promise.resolve(val).then(fn);
        },
      }),
    }),
  }));
}

// ── getVersionPreviewData ────────────────────────────────────────

describe('getVersionPreviewData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns version, eventName, and affected faculty', async () => {
    const { getVersionPreviewData } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A, PERSON_B]]);

    const result = await getVersionPreviewData(EVENT_UUID, VERSION_UUID);
    expect(result.version.id).toBe(VERSION_UUID);
    expect(result.eventName).toBe('GEM India 2026');
    expect(result.affectedFaculty).toHaveLength(2);
  });

  it('throws when version is not found', async () => {
    const { getVersionPreviewData } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[]]);

    await expect(getVersionPreviewData(EVENT_UUID, MISSING_UUID)).rejects.toThrow(
      'Program version not found',
    );
  });

  it('returns empty affectedFaculty when affectedPersonIdsJson is empty', async () => {
    const { getVersionPreviewData } = await import('@/lib/actions/program');

    const versionNoFaculty = { ...VERSION, affectedPersonIdsJson: [] };
    makeSequentialSelectMock([[versionNoFaculty], [EVENT]]);

    const result = await getVersionPreviewData(EVENT_UUID, VERSION_UUID);
    expect(result.affectedFaculty).toEqual([]);
  });

  it('includes email in returned faculty members', async () => {
    const { getVersionPreviewData } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A]]);

    const result = await getVersionPreviewData(EVENT_UUID, VERSION_UUID);
    expect(result.affectedFaculty[0].email).toBe('priya@example.com');
  });
});

// ── getVersionEmailParts ─────────────────────────────────────────

describe('getVersionEmailParts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns rendered subject containing event name', async () => {
    const { getVersionEmailParts } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A]]);

    const result = await getVersionEmailParts(EVENT_UUID, VERSION_UUID, PERSON_UUID_A);
    expect(result.subject).toContain('GEM India 2026');
  });

  it('bodyBefore contains greeting with salutation and full name', async () => {
    const { getVersionEmailParts } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A]]);

    const result = await getVersionEmailParts(EVENT_UUID, VERSION_UUID, PERSON_UUID_A);
    expect(result.bodyBefore).toContain('Dr');
    expect(result.bodyBefore).toContain('Priya Sharma');
  });

  it('bodyAfter contains organizing committee sign-off', async () => {
    const { getVersionEmailParts } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A]]);

    const result = await getVersionEmailParts(EVENT_UUID, VERSION_UUID, PERSON_UUID_A);
    expect(result.bodyAfter).toContain('Organizing Committee');
  });

  it('returns correct recipientEmail for person with email', async () => {
    const { getVersionEmailParts } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A]]);

    const result = await getVersionEmailParts(EVENT_UUID, VERSION_UUID, PERSON_UUID_A);
    expect(result.recipientEmail).toBe('priya@example.com');
  });

  it('handles null salutation gracefully — name still appears in body', async () => {
    const { getVersionEmailParts } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_B]]);

    const result = await getVersionEmailParts(EVENT_UUID, VERSION_UUID, PERSON_UUID_B);
    expect(result.bodyBefore).toContain('Arjun Menon');
    expect(result.recipientEmail).toBeNull();
  });

  it('throws when person is not found', async () => {
    const { getVersionEmailParts } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], []]);

    await expect(
      getVersionEmailParts(EVENT_UUID, VERSION_UUID, MISSING_UUID),
    ).rejects.toThrow('Person not found');
  });

  it('returns changesSummaryJson from the version unchanged', async () => {
    const { getVersionEmailParts } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A]]);

    const result = await getVersionEmailParts(EVENT_UUID, VERSION_UUID, PERSON_UUID_A);
    expect(result.changesSummaryJson).toEqual(VERSION.changesSummaryJson);
  });
});

// ── sendVersionEmails ────────────────────────────────────────────

describe('sendVersionEmails', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns {sent:0, failed:0} when no affected persons', async () => {
    const { sendVersionEmails } = await import('@/lib/actions/program');

    const versionEmpty = { ...VERSION, affectedPersonIdsJson: [] };
    makeSequentialSelectMock([[versionEmpty], [EVENT]]);

    const result = await sendVersionEmails(EVENT_UUID, VERSION_UUID);
    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it('skips persons without email address and returns sent:0', async () => {
    const { sendVersionEmails } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_B]]);
    mockUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve([]) }) });

    const { sendNotification } = await import('@/lib/notifications/send');

    const result = await sendVersionEmails(EVENT_UUID, VERSION_UUID);
    expect(vi.mocked(sendNotification)).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('calls sendNotification with program_update templateKey for persons with email', async () => {
    const { sendVersionEmails } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A]]);
    mockUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve([]) }) });

    const { sendNotification } = await import('@/lib/notifications/send');
    vi.mocked(sendNotification).mockResolvedValue({
      notificationLogId: 'log-01',
      status: 'sent',
      provider: 'resend',
    });

    await sendVersionEmails(EVENT_UUID, VERSION_UUID);

    expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'program_update',
        triggerType: 'program.version_published',
        channel: 'email',
      }),
    );
  });

  it('updates notificationStatus to "sent" when all succeed', async () => {
    const { sendVersionEmails } = await import('@/lib/actions/program');

    makeSequentialSelectMock([[VERSION], [EVENT], [PERSON_A]]);

    const mockSetFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    mockUpdate.mockReturnValue({ set: mockSetFn });

    const { sendNotification } = await import('@/lib/notifications/send');
    vi.mocked(sendNotification).mockResolvedValue({
      notificationLogId: 'log-01',
      status: 'sent',
      provider: 'resend',
    });

    await sendVersionEmails(EVENT_UUID, VERSION_UUID);

    expect(mockSetFn).toHaveBeenCalledWith(
      expect.objectContaining({ notificationStatus: 'sent' }),
    );
  });
});

// ── Modal component — static structure ───────────────────────────

describe('PreviewEmailsModal — static structure', () => {
  it('renders nothing when isOpen=false', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PreviewEmailsModal } = await import('./preview-emails-modal');

    const html = renderToStaticMarkup(
      createElement(PreviewEmailsModal, {
        eventId: EVENT_UUID,
        versionId: VERSION_UUID,
        versionNo: 3,
        isOpen: false,
        onClose: () => {},
      }),
    );
    expect(html).toBe('');
  });

  it('renders modal container when isOpen=true', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PreviewEmailsModal } = await import('./preview-emails-modal');

    const html = renderToStaticMarkup(
      createElement(PreviewEmailsModal, {
        eventId: EVENT_UUID,
        versionId: VERSION_UUID,
        versionNo: 3,
        isOpen: true,
        onClose: () => {},
      }),
    );
    expect(html).toContain('data-testid="preview-emails-modal"');
  });

  it('renders "Email Preview" title', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PreviewEmailsModal } = await import('./preview-emails-modal');

    const html = renderToStaticMarkup(
      createElement(PreviewEmailsModal, {
        eventId: EVENT_UUID,
        versionId: VERSION_UUID,
        versionNo: 3,
        isOpen: true,
        onClose: () => {},
      }),
    );
    expect(html).toContain('Email Preview');
    expect(html).toContain('data-testid="modal-title"');
  });

  it('renders Send All button with correct test id', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PreviewEmailsModal } = await import('./preview-emails-modal');

    const html = renderToStaticMarkup(
      createElement(PreviewEmailsModal, {
        eventId: EVENT_UUID,
        versionId: VERSION_UUID,
        versionNo: 3,
        isOpen: true,
        onClose: () => {},
      }),
    );
    expect(html).toContain('data-testid="send-all-btn"');
    expect(html).toContain('Send All');
  });

  it('renders both close buttons (header X and footer Close)', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PreviewEmailsModal } = await import('./preview-emails-modal');

    const html = renderToStaticMarkup(
      createElement(PreviewEmailsModal, {
        eventId: EVENT_UUID,
        versionId: VERSION_UUID,
        versionNo: 3,
        isOpen: true,
        onClose: () => {},
      }),
    );
    expect(html).toContain('data-testid="modal-close-btn"');
    expect(html).toContain('data-testid="close-btn"');
  });

  it('footer shows "0 faculty will receive this email" in initial (loading) state', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PreviewEmailsModal } = await import('./preview-emails-modal');

    const html = renderToStaticMarkup(
      createElement(PreviewEmailsModal, {
        eventId: EVENT_UUID,
        versionId: VERSION_UUID,
        versionNo: 3,
        isOpen: true,
        onClose: () => {},
      }),
    );
    expect(html).toContain('data-testid="faculty-count-footer"');
    expect(html).toContain('0 faculty will receive this email');
  });
});
