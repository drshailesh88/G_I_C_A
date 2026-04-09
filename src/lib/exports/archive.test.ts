import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';

// ── Mock Setup ─────────────────────────────────────────────────

const mockDb = {
  select: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, {
    get: () => mockDb.select,
  }),
}));

const mockWithEventScope = vi.fn((_col: unknown, eventId: string, ..._rest: unknown[]) => {
  return { eventId };
});

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: (...args: unknown[]) => mockWithEventScope(...(args as [unknown, string, ...unknown[]])),
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, getSQL: () => name });
  return {
    events: { id: col('id'), name: col('name'), startDate: col('start_date'), endDate: col('end_date'), venueName: col('venue_name') },
    sessions: { id: col('id'), eventId: col('event_id'), title: col('title'), sessionType: col('type'), sessionDate: col('date'), startAtUtc: col('start'), endAtUtc: col('end'), hallId: col('hall_id'), track: col('track'), status: col('status'), cmeCredits: col('cme') },
    sessionAssignments: { eventId: col('event_id'), sessionId: col('session_id'), personId: col('person_id'), role: col('role') },
    halls: { id: col('id'), name: col('name') },
    people: { id: col('id'), fullName: col('full_name'), email: col('email'), phoneE164: col('phone') },
    issuedCertificates: { eventId: col('event_id'), storageKey: col('storage_key'), fileName: col('file_name'), status: col('status') },
    notificationLog: { eventId: col('event_id'), personId: col('person_id'), channel: col('channel'), provider: col('provider'), status: col('status'), recipientEmail: col('email'), recipientPhoneE164: col('phone'), templateKeySnapshot: col('template_key'), triggerType: col('trigger'), sendMode: col('send_mode'), renderedSubject: col('subject'), attempts: col('attempts'), lastErrorCode: col('error_code'), lastErrorMessage: col('error_msg'), queuedAt: col('queued_at'), sentAt: col('sent_at'), deliveredAt: col('delivered_at'), failedAt: col('failed_at') },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

// Mock archiver — must actually pipe data to the passThrough for stream to end
vi.mock('archiver', () => {
  return {
    default: vi.fn(() => {
      const entries: Array<{ data: Buffer | string; opts: { name: string } }> = [];
      let pipedTarget: import('stream').PassThrough | null = null;
      const archive = {
        pipe: vi.fn((target: import('stream').PassThrough) => {
          pipedTarget = target;
          return target;
        }),
        append: vi.fn((data: Buffer | string, opts: { name: string }) => {
          entries.push({ data, opts });
        }),
        finalize: vi.fn(async () => {
          // Write a small buffer and end the piped stream
          if (pipedTarget) {
            pipedTarget.write(Buffer.from('PK-mock-zip'));
            pipedTarget.end();
          }
        }),
        on: vi.fn(),
        _entries: entries,
      };
      return archive;
    }),
  };
});

import {
  generateAgendaExcel,
  generateNotificationLogCsv,
  getCertificateStorageKeys,
  generateEventArchive,
  buildArchiveStorageKey,
} from './archive';

// ── Helpers ────────────────────────────────────────────────────

const EVENT_ID = 'event-aaa-aaa';

function createChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  // where returns a thenable that also has .limit()
  const whereResult = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  chain.where = vi.fn().mockReturnValue(whereResult);
  chain.limit = vi.fn().mockResolvedValue(rows);
  return chain;
}

function setupDbReturn(...rowSets: unknown[][]) {
  let callIdx = 0;
  mockDb.select.mockImplementation(() => {
    const chain = createChain(rowSets[callIdx] ?? []);
    callIdx++;
    return chain;
  });
}

function createStubStorage() {
  const files = new Map<string, Buffer>();
  return {
    files,
    upload: vi.fn(async (key: string, data: Buffer) => {
      files.set(key, data);
      return { storageKey: key, fileSizeBytes: data.length, fileChecksumSha256: 'test-hash' };
    }),
    getSignedUrl: vi.fn(async (key: string) => `https://stub-r2.example.com/${key}?signed=true`),
    delete: vi.fn(async () => {}),
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe('Per-Event PDF Archive (6C-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildArchiveStorageKey', () => {
    it('produces correct key format', () => {
      const key = buildArchiveStorageKey('evt-123');
      expect(key).toMatch(/^events\/evt-123\/archives\/archive-\d+\.zip$/);
    });
  });

  describe('generateAgendaExcel', () => {
    it('produces Excel buffer with session rows', async () => {
      setupDbReturn(
        // Event info query
        [{ name: 'GEM India 2026', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: 'HICC Hyderabad' }],
        // Sessions query
        [
          { title: 'Keynote Address', sessionType: 'keynote', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T03:30:00Z'), endAtUtc: new Date('2026-04-10T04:30:00Z'), hallName: 'Hall A', track: 'Main', status: 'scheduled', cmeCredits: 2 },
          { title: 'Lunch Break', sessionType: 'lunch', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T07:00:00Z'), endAtUtc: new Date('2026-04-10T08:00:00Z'), hallName: null, track: null, status: 'scheduled', cmeCredits: null },
        ],
      );

      const buffer = await generateAgendaExcel(EVENT_ID);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Parse and verify contents
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      expect(ws.name).toBe('Agenda');

      // Title row should contain event name
      const titleCell = ws.getCell('A1');
      expect(String(titleCell.value)).toContain('GEM India 2026');
    });

    it('handles empty event with no sessions (produces agenda with just headers)', async () => {
      setupDbReturn(
        [{ name: 'Empty Event', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-02'), venueName: null }],
        [], // No sessions
      );

      const buffer = await generateAgendaExcel(EVENT_ID);
      expect(buffer).toBeInstanceOf(Buffer);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      // Should still have the header row (row 4)
      const headerRow = ws.getRow(4);
      expect(String(headerRow.getCell(1).value)).toBe('Session');
    });
  });

  describe('generateNotificationLogCsv', () => {
    it('produces CSV with correct headers and rows', async () => {
      setupDbReturn([
        {
          fullName: 'Dr. Rao',
          recipientEmail: 'rao@test.com',
          recipientPhone: '+919876543210',
          channel: 'email',
          provider: 'resend',
          status: 'delivered',
          templateKey: 'registration_confirmation',
          triggerType: 'registration.created',
          sendMode: 'automatic',
          renderedSubject: 'Welcome to GEM',
          attempts: 1,
          lastErrorCode: null,
          lastErrorMessage: null,
          queuedAt: new Date('2026-04-10T10:00:00Z'),
          sentAt: new Date('2026-04-10T10:00:01Z'),
          deliveredAt: new Date('2026-04-10T10:00:05Z'),
          failedAt: null,
        },
      ]);

      const buffer = await generateNotificationLogCsv(EVENT_ID);
      const csv = buffer.toString('utf-8');
      const lines = csv.split('\n');

      expect(lines[0]).toContain('Recipient');
      expect(lines[0]).toContain('Channel');
      expect(lines[0]).toContain('Status');
      expect(lines[1]).toContain('Dr. Rao');
      expect(lines[1]).toContain('email');
      expect(lines[1]).toContain('delivered');
    });

    it('escapes CSV fields with commas and quotes', async () => {
      setupDbReturn([
        {
          fullName: 'Dr. Smith, Jr.',
          recipientEmail: 'smith@test.com',
          recipientPhone: null,
          channel: 'email',
          provider: 'resend',
          status: 'sent',
          templateKey: 'faculty_invitation',
          triggerType: null,
          sendMode: 'manual',
          renderedSubject: 'Subject with "quotes"',
          attempts: 1,
          lastErrorCode: null,
          lastErrorMessage: null,
          queuedAt: new Date('2026-04-10T10:00:00Z'),
          sentAt: new Date('2026-04-10T10:00:01Z'),
          deliveredAt: null,
          failedAt: null,
        },
      ]);

      const buffer = await generateNotificationLogCsv(EVENT_ID);
      const csv = buffer.toString('utf-8');
      // Comma in name should be escaped
      expect(csv).toContain('"Dr. Smith, Jr."');
      // Quotes in subject should be doubled
      expect(csv).toContain('"Subject with ""quotes"""');
    });
  });

  describe('getCertificateStorageKeys', () => {
    it('returns only issued certificates for the event', async () => {
      setupDbReturn([
        { storageKey: 'certificates/evt-aaa/delegate_attendance/cert-1.pdf', fileName: 'John-cert.pdf' },
        { storageKey: 'certificates/evt-aaa/delegate_attendance/cert-2.pdf', fileName: 'Jane-cert.pdf' },
      ]);

      const keys = await getCertificateStorageKeys(EVENT_ID);
      expect(keys).toHaveLength(2);
      expect(keys[0].storageKey).toContain('cert-1');

      // Verify eventId was used in the query
      expect(mockWithEventScope).toHaveBeenCalled();
      const callArgs = mockWithEventScope.mock.calls.find(
        (args) => args[1] === EVENT_ID,
      );
      expect(callArgs).toBeDefined();
    });
  });

  describe('generateEventArchive', () => {
    it('creates ZIP with agenda, notification CSV, and certificate PDFs', async () => {
      // Promise.all interleaves: (0) agenda event, (1) notif log, (2) cert keys, (3) agenda sessions
      setupDbReturn(
        [{ name: 'GEM 2026', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: 'HICC' }],
        [{ fullName: 'Dr. Test', recipientEmail: 'test@test.com', recipientPhone: null, channel: 'email', provider: 'resend', status: 'sent', templateKey: 'registration_confirmation', triggerType: 'registration.created', sendMode: 'automatic', renderedSubject: 'Welcome', attempts: 1, lastErrorCode: null, lastErrorMessage: null, queuedAt: new Date(), sentAt: new Date(), deliveredAt: null, failedAt: null }],
        [{ storageKey: 'certificates/evt-aaa/delegate/cert-1.pdf', fileName: 'John-Doe-certificate.pdf' }],
        [{ title: 'Opening', sessionType: 'keynote', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T03:30:00Z'), endAtUtc: new Date('2026-04-10T04:30:00Z'), hallName: 'Hall A', track: null, status: 'scheduled', cmeCredits: null }],
      );

      const storage = createStubStorage();
      const fetchPdf = vi.fn(async () => Buffer.from('fake-pdf-content'));

      const result = await generateEventArchive({
        eventId: EVENT_ID,
        storageProvider: storage,
        fetchCertificatePdf: fetchPdf,
      });

      expect(result.archiveStorageKey).toMatch(/^events\/event-aaa-aaa\/archives\/archive-\d+\.zip$/);
      expect(result.archiveUrl).toContain('stub-r2.example.com');
      expect(result.fileCount).toBe(3); // agenda + csv + 1 cert PDF

      // Verify storage.upload was called (fallback path since no uploadStream)
      expect(storage.upload).toHaveBeenCalledTimes(1);
      expect(storage.getSignedUrl).toHaveBeenCalledTimes(1);

      // Verify fetchPdf was called for the certificate
      expect(fetchPdf).toHaveBeenCalledWith('certificates/evt-aaa/delegate/cert-1.pdf');
    });

    it('creates ZIP with just agenda when event has no certs and no notifications', async () => {
      // Promise.all interleaves: (0) agenda event, (1) notif log, (2) cert keys, (3) agenda sessions
      setupDbReturn(
        [{ name: 'Empty Event', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-02'), venueName: null }],
        [], // No notifications
        [], // No certificates
        [], // No sessions
      );

      const storage = createStubStorage();
      const fetchPdf = vi.fn();

      const result = await generateEventArchive({
        eventId: EVENT_ID,
        storageProvider: storage,
        fetchCertificatePdf: fetchPdf,
      });

      // agenda.xlsx + notification-log.csv, no certs
      expect(result.fileCount).toBe(2);
      expect(fetchPdf).not.toHaveBeenCalled();
    });

    it('skips certificates that fail to fetch without failing the archive', async () => {
      // Promise.all interleaves: (0) agenda event, (1) notif log, (2) cert keys, (3) agenda sessions
      setupDbReturn(
        [{ name: 'GEM 2026', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: null }],
        [], // No notifications
        [
          { storageKey: 'certs/good.pdf', fileName: 'good.pdf' },
          { storageKey: 'certs/bad.pdf', fileName: 'bad.pdf' },
        ],
        [], // No sessions
      );

      const storage = createStubStorage();
      const fetchPdf = vi.fn(async (key: string) => {
        if (key === 'certs/bad.pdf') throw new Error('R2 error');
        return Buffer.from('pdf-content');
      });

      const result = await generateEventArchive({
        eventId: EVENT_ID,
        storageProvider: storage,
        fetchCertificatePdf: fetchPdf,
      });

      // agenda + csv + 1 good cert (bad one skipped)
      expect(result.fileCount).toBe(3);
    });
  });

  describe('event scoping', () => {
    it('all queries use withEventScope for data isolation', async () => {
      // Promise.all interleaves: (0) agenda event, (1) notif log, (2) cert keys, (3) agenda sessions
      setupDbReturn(
        [{ name: 'Event', startDate: new Date(), endDate: new Date(), venueName: null }],
        [], // No notifications
        [], // No certificates
        [], // No sessions
      );

      const storage = createStubStorage();
      await generateEventArchive({
        eventId: EVENT_ID,
        storageProvider: storage,
        fetchCertificatePdf: vi.fn(),
      });

      // Should be called for: sessions, notificationLog, issuedCertificates
      const eventScopeCalls = mockWithEventScope.mock.calls.filter(
        (args) => args[1] === EVENT_ID,
      );
      expect(eventScopeCalls.length).toBeGreaterThanOrEqual(3);
    });
  });
});
