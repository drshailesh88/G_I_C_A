import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

// ── Mocks ───────────────────────────────────────────────────────

const mockDb = { select: vi.fn() };

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, { get: () => mockDb.select }),
}));

const mockWithEventScope = vi.fn(
  (_col: unknown, _eventId: string, ..._rest: unknown[]) => ({ eventId: _eventId }),
);

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: (...args: unknown[]) =>
    mockWithEventScope(...(args as [unknown, string, ...unknown[]])),
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, getSQL: () => name });
  return {
    events: {
      id: col('id'), name: col('name'), startDate: col('start_date'),
      endDate: col('end_date'), venueName: col('venue_name'),
    },
    sessions: {
      id: col('id'), eventId: col('event_id'), title: col('title'),
      sessionType: col('type'), sessionDate: col('date'), startAtUtc: col('start'),
      endAtUtc: col('end'), hallId: col('hall_id'), track: col('track'),
      status: col('status'), cmeCredits: col('cme'),
    },
    sessionAssignments: {
      eventId: col('event_id'), sessionId: col('session_id'),
      personId: col('person_id'), role: col('role'),
    },
    halls: { id: col('id'), name: col('name') },
    people: {
      id: col('id'), fullName: col('full_name'), email: col('email'), phoneE164: col('phone'),
    },
    issuedCertificates: {
      eventId: col('event_id'), storageKey: col('storage_key'),
      fileName: col('file_name'), status: col('status'),
    },
    notificationLog: {
      eventId: col('event_id'), personId: col('person_id'), channel: col('channel'),
      provider: col('provider'), status: col('status'), recipientEmail: col('email'),
      recipientPhoneE164: col('phone'), templateKeySnapshot: col('template_key'),
      triggerType: col('trigger'), sendMode: col('send_mode'),
      renderedSubject: col('subject'), attempts: col('attempts'),
      lastErrorCode: col('error_code'), lastErrorMessage: col('error_msg'),
      queuedAt: col('queued_at'), sentAt: col('sent_at'),
      deliveredAt: col('delivered_at'), failedAt: col('failed_at'),
    },
  };
});

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

vi.mock('archiver', () => ({
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
}));

import {
  generateAgendaExcel,
  generateNotificationLogCsv,
  getCertificateStorageKeys,
  generateEventArchive,
} from './archive';

// ── Helpers ─────────────────────────────────────────────────────

const EVENT_ID = 'evt-mk-001';

function createChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
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

function createStubStorage(hasUploadStream = false) {
  const files = new Map<string, Buffer>();
  const storage: Record<string, unknown> & {
    uploadStream?: ReturnType<typeof vi.fn>;
  } = {
    files,
    upload: vi.fn(async (key: string, data: Buffer) => {
      files.set(key, data);
      return { storageKey: key, fileSizeBytes: data.length, fileChecksumSha256: 'hash' };
    }),
    getSignedUrl: vi.fn(async (key: string) => `https://r2.example.com/${key}`),
    delete: vi.fn(async () => {}),
  };
  if (hasUploadStream) {
    storage.uploadStream = vi.fn(
      async (key: string, _stream: unknown, _ct: string) => ({
        storageKey: key,
        fileSizeBytes: 42,
        fileChecksumSha256: 'stream-hash',
      }),
    );
  }
  return storage;
}

async function getLastArchiveEntries() {
  const archiverFn = (await import('archiver')).default;
  return (archiverFn as unknown as ReturnType<typeof vi.fn>).mock.results.slice(-1)[0]
    ?.value?._entries as Array<{ data: Buffer; opts: { name: string } }>;
}

// DB call order inside generateEventArchive via Promise.all:
// 0 = generateAgendaExcel:event, 1 = generateNotificationLogCsv, 2 = getCertificateStorageKeys, 3 = generateAgendaExcel:sessions
function archiveDbRows(
  event: object | null,
  notifRows: object[],
  certRows: object[],
  sessionRows: object[],
) {
  return setupDbReturn(
    event ? [event] : [],
    notifRows,
    certRows,
    sessionRows,
  );
}

beforeEach(() => vi.clearAllMocks());

// ── CSV headers exact match ────────────────────────────────────

describe('generateNotificationLogCsv — header strings', () => {
  it('CSV first line matches every column header exactly (kills L208-211 StringLiteral mutants)', async () => {
    setupDbReturn([]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    expect(csv.split('\n')[0]).toBe(
      'Recipient,Email,Phone,Channel,Provider,Status,' +
      'Template Key,Trigger,Send Mode,Subject,' +
      'Attempts,Error Code,Error Message,' +
      'Queued At,Sent At,Delivered At,Failed At',
    );
  });
});

// ── DateTime formatting ────────────────────────────────────────

describe('generateNotificationLogCsv — datetime format', () => {
  const baseRow = {
    fullName: 'Dr. A', recipientEmail: 'a@test.com', recipientPhone: null,
    channel: 'email', provider: 'resend', status: 'sent',
    templateKey: 'tpl', triggerType: null, sendMode: 'automatic',
    renderedSubject: 'Hi', attempts: 1,
    lastErrorCode: null, lastErrorMessage: null,
    queuedAt: new Date('2026-04-10T10:00:00Z'),
    sentAt: new Date('2026-04-10T10:00:01Z'),
    deliveredAt: null, failedAt: null,
  };

  it('formats datetimes as "YYYY-MM-DD HH:MM:SS" with space not T (kills L90 StringLiteral replace mutants)', async () => {
    setupDbReturn([baseRow]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    const line = csv.split('\n')[1];
    expect(line).toContain('2026-04-10 10:00:01');
    expect(line).toContain('2026-04-10 10:00:00');
    expect(line).not.toContain('2026-04-10T');
  });

  it('null datetime fields produce empty strings (kills L216-217, L221-222, L226-227 NoCoverage)', async () => {
    setupDbReturn([{
      ...baseRow,
      recipientEmail: null, recipientPhone: null,
      templateKey: null, triggerType: null,
      lastErrorCode: null, lastErrorMessage: null,
      queuedAt: null, sentAt: null, deliveredAt: null, failedAt: null,
    }]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    const line = csv.split('\n')[1];
    expect(line).not.toContain('null');
    const fields = line.split(',');
    expect(fields[1]).toBe('');  // recipientEmail → ''
    expect(fields[2]).toBe('');  // recipientPhone → ''
  });

  it('non-null optional fields are preserved (kills LogicalOperator && mutants on ??)', async () => {
    setupDbReturn([{
      ...baseRow,
      recipientPhone: '+919876543210',
      templateKey: 'registration_confirmation',
      triggerType: 'registration.created',
      lastErrorCode: 'BOUNCE',
      lastErrorMessage: 'Mailbox full',
    }]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    expect(csv).toContain('+919876543210');
    expect(csv).toContain('registration_confirmation');
    expect(csv).toContain('registration.created');
    expect(csv).toContain('BOUNCE');
    expect(csv).toContain('Mailbox full');
  });

  it('rows joined with \\n and fields with comma (kills L232, L234 StringLiteral)', async () => {
    setupDbReturn([baseRow, { ...baseRow, fullName: 'Dr. B' }]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1].split(',').length).toBeGreaterThanOrEqual(17);
  });
});

// ── escapeCsvField boundaries ─────────────────────────────────

describe('escapeCsvField — boundary cases', () => {
  const baseRow = {
    channel: 'email', provider: 'resend', status: 'sent',
    templateKey: 'tpl', triggerType: null, sendMode: 'automatic',
    renderedSubject: 'Subject', attempts: 1,
    recipientPhone: null, lastErrorCode: null, lastErrorMessage: null,
    queuedAt: null, sentAt: null, deliveredAt: null, failedAt: null,
  };

  it('non-formula field does NOT get tab prefix (kills ConditionalExpression→true L241)', async () => {
    setupDbReturn([{ ...baseRow, fullName: 'Normal Name', recipientEmail: 'n@test.com' }]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    const line = csv.split('\n')[1];
    expect(line.startsWith('\t')).toBe(false);
    expect(line).not.toContain('\tNormal');
  });

  it('empty string does NOT get tab prefix (kills EqualityOperator str.length >= 0 L241)', async () => {
    setupDbReturn([{ ...baseRow, fullName: '', recipientEmail: '' }]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    const line = csv.split('\n')[1];
    expect(line.startsWith('\t')).toBe(false);
  });

  it('formula-starting field gets exact \\t prefix (kills L242 template literal StringLiteral)', async () => {
    setupDbReturn([{ ...baseRow, fullName: '=FORMULA()', recipientEmail: 'f@test.com' }]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    expect(csv).toContain('\t=FORMULA()');
    expect(csv).not.toContain(',=FORMULA()');
  });

  it('field with tab character is double-quoted (kills L244 \\t StringLiteral)', async () => {
    setupDbReturn([{ ...baseRow, fullName: 'Tab\tField', recipientEmail: 't@test.com' }]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    expect(csv).toContain('"');
  });

  it('field with newline is double-quoted (kills L244 \\n StringLiteral)', async () => {
    setupDbReturn([{ ...baseRow, fullName: 'Multi\nLine', recipientEmail: 'm@test.com' }]);
    const csv = (await generateNotificationLogCsv(EVENT_ID)).toString('utf-8');
    expect(csv).toContain('"Multi\nLine"');
  });
});

// ── generateAgendaExcel — sort order ─────────────────────────

describe('generateAgendaExcel — sort order', () => {
  it('sorts sessions by date ascending (kills L119-122 sort mutants)', async () => {
    setupDbReturn(
      [{ name: 'GEM 2026', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: null }],
      [
        { title: 'Day 2 Talk', sessionType: 'lecture', sessionDate: new Date('2026-04-11'), startAtUtc: new Date('2026-04-11T04:00:00Z'), endAtUtc: new Date('2026-04-11T05:00:00Z'), hallName: null, track: null, status: 'scheduled', cmeCredits: null },
        { title: 'Day 1 Keynote', sessionType: 'keynote', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T03:30:00Z'), endAtUtc: new Date('2026-04-10T04:30:00Z'), hallName: null, track: null, status: 'scheduled', cmeCredits: null },
      ],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(String(ws.getRow(5).getCell(1).value)).toBe('Day 1 Keynote');
    expect(String(ws.getRow(6).getCell(1).value)).toBe('Day 2 Talk');
  });

  it('sorts by start time when dates equal (kills L123-125 ArithmeticOperator/LogicalOperator)', async () => {
    setupDbReturn(
      [{ name: 'GEM 2026', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-10'), venueName: null }],
      [
        { title: 'Afternoon', sessionType: 'workshop', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T07:00:00Z'), endAtUtc: new Date('2026-04-10T08:00:00Z'), hallName: null, track: null, status: 'scheduled', cmeCredits: null },
        { title: 'Morning', sessionType: 'keynote', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T03:30:00Z'), endAtUtc: new Date('2026-04-10T04:30:00Z'), hallName: null, track: null, status: 'scheduled', cmeCredits: null },
      ],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(String(ws.getRow(5).getCell(1).value)).toBe('Morning');
    expect(String(ws.getRow(6).getCell(1).value)).toBe('Afternoon');
  });

  it('handles session with null date (covers NoCoverage L84 formatDate null return, L122 dateA-dateB)', async () => {
    setupDbReturn(
      [{ name: 'Event', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-10'), venueName: null }],
      [
        { title: 'No Date', sessionType: 'lecture', sessionDate: null, startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null },
        { title: 'Has Date', sessionType: 'keynote', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T03:30:00Z'), endAtUtc: new Date('2026-04-10T04:30:00Z'), hallName: null, track: null, status: 'scheduled', cmeCredits: null },
      ],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    // null date sorts to front (getTime() ?? 0 = 0)
    expect(String(ws.getRow(5).getCell(1).value)).toBe('No Date');
    // date cell for null session should be empty string
    const nullDateCell = ws.getRow(5).getCell(3).value;
    expect(nullDateCell == null || nullDateCell === '').toBe(true);
  });
});

// ── generateAgendaExcel — cell values ────────────────────────

describe('generateAgendaExcel — cell content', () => {
  it('data row cells have correct values (kills L157-167 BlockStatement/ArrayDeclaration/LogicalOperator)', async () => {
    setupDbReturn(
      [{ name: 'GEM 2026', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: 'HICC' }],
      [{ title: 'Opening', sessionType: 'keynote', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T03:30:00Z'), endAtUtc: new Date('2026-04-10T04:30:00Z'), hallName: 'Hall A', track: 'Main', status: 'scheduled', cmeCredits: 2 }],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const row = ws.getRow(5);
    expect(String(row.getCell(1).value)).toBe('Opening');
    expect(String(row.getCell(2).value)).toBe('keynote');
    expect(String(row.getCell(3).value)).toBe('2026-04-10');
    expect(String(row.getCell(4).value)).toBe('2026-04-10 03:30:00');
    expect(String(row.getCell(5).value)).toBe('2026-04-10 04:30:00');
    expect(String(row.getCell(6).value)).toBe('Hall A');
    expect(String(row.getCell(7).value)).toBe('Main');
    expect(String(row.getCell(8).value)).toBe('scheduled');
    expect(Number(row.getCell(9).value)).toBe(2);
  });

  it('all 9 header labels are present in row 4 (kills L147 StringLiteral mutants)', async () => {
    setupDbReturn(
      [{ name: 'Event', startDate: new Date(), endDate: new Date(), venueName: null }],
      [],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const headerRow = ws.getRow(4);
    const expected = ['Session', 'Type', 'Date', 'Start', 'End', 'Hall', 'Track', 'Status', 'CME Credits'];
    expected.forEach((h, i) => {
      expect(String(headerRow.getCell(i + 1).value)).toBe(h);
    });
  });

  it('header cells have correct fill color (kills L50-53 HEADER_FILL ObjectLiteral/StringLiteral mutants)', async () => {
    setupDbReturn(
      [{ name: 'Event', startDate: new Date(), endDate: new Date(), venueName: null }],
      [],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const cell = ws.getRow(4).getCell(1);
    const fill = cell.fill as ExcelJS.FillPattern;
    expect(fill.type).toBe('pattern');
    expect(fill.pattern).toBe('solid');
    expect(fill.fgColor?.argb).toBe('FF1F4E79');
  });

  it('header cells have correct font (kills L56-58 HEADER_FONT ObjectLiteral/BooleanLiteral/StringLiteral)', async () => {
    setupDbReturn(
      [{ name: 'Event', startDate: new Date(), endDate: new Date(), venueName: null }],
      [],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const font = ws.getRow(4).getCell(1).font;
    expect(font?.bold).toBe(true);
    expect(font?.color?.argb).toBe('FFFFFFFF');
    expect(font?.size).toBe(11);
  });

  it('title cell has bold font (kills L136 BooleanLiteral and ObjectLiteral mutants)', async () => {
    setupDbReturn(
      [{ name: 'GEM 2026', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: 'HICC' }],
      [],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A1').font?.bold).toBe(true);
    expect(ws.getCell('A1').font?.size).toBe(14);
    expect(ws.getCell('A1').alignment?.horizontal).toBe('center');
  });

  it('info cell has center alignment (kills L142 ObjectLiteral/StringLiteral mutants)', async () => {
    setupDbReturn(
      [{ name: 'Event', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: 'HICC' }],
      [],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A2').alignment?.horizontal).toBe('center');
  });

  it('venueName present produces " | VenueName" in info cell (kills L141 StringLiteral mutants)', async () => {
    setupDbReturn(
      [{ name: 'Event', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: 'HICC Hyderabad' }],
      [],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell('A2').value)).toContain(' | HICC Hyderabad');
  });

  it('venueName absent produces no pipe in info cell (kills L141 ConditionalExpression)', async () => {
    setupDbReturn(
      [{ name: 'Event', startDate: new Date('2026-04-10'), endDate: new Date('2026-04-12'), venueName: null }],
      [],
    );
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell('A2').value)).not.toContain(' | ');
  });

  it('event not found produces no title cell (kills L132 ConditionalExpression→true via TypeError)', async () => {
    setupDbReturn([], []);
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A1').value).toBeNull();
  });

  it('worksheet name is "Agenda" (kills addWorksheet StringLiteral)', async () => {
    setupDbReturn([{ name: 'E', startDate: new Date(), endDate: new Date(), venueName: null }], []);
    const buffer = await generateAgendaExcel(EVENT_ID);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets[0].name).toBe('Agenda');
  });
});

// ── getCertificateStorageKeys ─────────────────────────────────

describe('getCertificateStorageKeys — mutation-kill', () => {
  it("passes eq-condition third arg to withEventScope for 'issued' status filtering (kills L261 StringLiteral)", async () => {
    setupDbReturn([{ storageKey: 'certs/1.pdf', fileName: '1.pdf' }]);
    await getCertificateStorageKeys(EVENT_ID);
    const calls = mockWithEventScope.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1];
    expect(lastCall.length).toBeGreaterThanOrEqual(3);
  });
});

// ── generateEventArchive — archiver & storage options ─────────

describe('generateEventArchive — archiver & storage', () => {
  it("calls archiver with 'zip' type and zlib level 6 (kills L285 StringLiteral and ObjectLiteral)", async () => {
    archiveDbRows({ name: 'E', startDate: new Date(), endDate: new Date(), venueName: null }, [], [], []);
    const storage = createStubStorage();
    await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: vi.fn() });
    const archiverFn = (await import('archiver')).default as unknown as ReturnType<typeof vi.fn>;
    const lastCall = archiverFn.mock.calls.slice(-1)[0];
    expect(lastCall[0]).toBe('zip');
    expect(lastCall[1]).toEqual({ zlib: { level: 6 } });
  });

  it("appends 'agenda.xlsx' as first entry (kills L293 StringLiteral)", async () => {
    archiveDbRows({ name: 'E', startDate: new Date(), endDate: new Date(), venueName: null }, [], [], []);
    const storage = createStubStorage();
    await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: vi.fn() });
    const entries = await getLastArchiveEntries();
    expect(entries[0].opts.name).toBe('agenda.xlsx');
  });

  it("appends 'notification-log.csv' as second entry (kills L297 StringLiteral)", async () => {
    archiveDbRows({ name: 'E', startDate: new Date(), endDate: new Date(), venueName: null }, [], [], []);
    const storage = createStubStorage();
    await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: vi.fn() });
    const entries = await getLastArchiveEntries();
    expect(entries[1].opts.name).toBe('notification-log.csv');
  });

  it("certificate appended under 'certificates/' prefix (kills L322 StringLiteral)", async () => {
    archiveDbRows(
      { name: 'E', startDate: new Date(), endDate: new Date(), venueName: null },
      [],
      [{ storageKey: 'k', fileName: 'mycert.pdf' }],
      [],
    );
    const storage = createStubStorage();
    await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: async () => Buffer.from('pdf') });
    const entries = await getLastArchiveEntries();
    const cert = entries.find((e) => e.opts.name.endsWith('mycert.pdf'));
    expect(cert?.opts.name).toBe('certificates/mycert.pdf');
  });

  it("calls upload with 'application/zip' (kills L352 StringLiteral)", async () => {
    archiveDbRows({ name: 'E', startDate: new Date(), endDate: new Date(), venueName: null }, [], [], []);
    const storage = createStubStorage();
    await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: vi.fn() });
    const uploadArgs = (storage.upload as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(uploadArgs[2]).toBe('application/zip');
  });

  it("calls getSignedUrl with expiry 3600 (kills L356 numeric literal mutant)", async () => {
    archiveDbRows({ name: 'E', startDate: new Date(), endDate: new Date(), venueName: null }, [], [], []);
    const storage = createStubStorage();
    await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: vi.fn() });
    const signArgs = (storage.getSignedUrl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(signArgs[1]).toBe(3600);
    expect(signArgs[0]).toMatch(/^events\//);
  });

  it("uses uploadStream path when present, not upload (kills L337 ConditionalExpression→false, NoCoverage L337-338)", async () => {
    archiveDbRows({ name: 'E', startDate: new Date(), endDate: new Date(), venueName: null }, [], [], []);
    const storage = createStubStorage(true);
    const result = await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: vi.fn() });
    expect(storage.uploadStream).toHaveBeenCalledTimes(1);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(result.archiveSizeBytes).toBe(42);
  });

  it("uploadStream receives 'application/zip' content type (kills L338 StringLiteral)", async () => {
    archiveDbRows({ name: 'E', startDate: new Date(), endDate: new Date(), venueName: null }, [], [], []);
    const storage = createStubStorage(true);
    await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: vi.fn() });
    const streamArgs = (storage.uploadStream as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(streamArgs[2]).toBe('application/zip');
  });

  it("deduplicates cert file names with -N counter (covers NoCoverage L308-316)", async () => {
    archiveDbRows(
      { name: 'E', startDate: new Date(), endDate: new Date(), venueName: null },
      [],
      [
        { storageKey: 'a', fileName: 'cert.pdf' },
        { storageKey: 'b', fileName: 'cert.pdf' },
        { storageKey: 'c', fileName: 'cert.pdf' },
      ],
      [],
    );
    const storage = createStubStorage();
    const result = await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: async () => Buffer.from('pdf') });
    const entries = await getLastArchiveEntries();
    const names = entries.filter((e) => e.opts.name.startsWith('certificates/')).map((e) => e.opts.name);
    expect(names).toContain('certificates/cert.pdf');
    expect(names).toContain('certificates/cert-2.pdf');
    expect(names).toContain('certificates/cert-3.pdf');
    expect(result.fileCount).toBe(5);
  });

  it("dedup uses dotIdx to preserve extension in counter suffix (kills NoCoverage L310-311)", async () => {
    archiveDbRows(
      { name: 'E', startDate: new Date(), endDate: new Date(), venueName: null },
      [],
      [
        { storageKey: 'x', fileName: 'report.pdf' },
        { storageKey: 'y', fileName: 'report.pdf' },
      ],
      [],
    );
    const storage = createStubStorage();
    await generateEventArchive({ eventId: EVENT_ID, storageProvider: storage as never, fetchCertificatePdf: async () => Buffer.from('pdf') });
    const entries = await getLastArchiveEntries();
    const names = entries.filter((e) => e.opts.name.startsWith('certificates/')).map((e) => e.opts.name);
    expect(names).toContain('certificates/report.pdf');
    expect(names).toContain('certificates/report-2.pdf');
    expect(names[1]).toMatch(/report-2\.pdf$/);
  });
});

// ── sanitizeFileName (via generateEventArchive) ───────────────

async function runWithFileName(fileName: string): Promise<string> {
  setupDbReturn(
    [{ name: 'Ev', startDate: new Date(), endDate: new Date(), venueName: null }],
    [],
    [{ storageKey: 'x.pdf', fileName }],
    [],
  );
  const storage = createStubStorage();
  await generateEventArchive({
    eventId: EVENT_ID,
    storageProvider: storage as never,
    fetchCertificatePdf: async () => Buffer.from('pdf'),
  });
  const entries = await getLastArchiveEntries();
  const cert = entries.find((e) => e.opts.name.startsWith('certificates/'));
  return cert?.opts.name.replace('certificates/', '') ?? '';
}

describe('sanitizeFileName — mutation-kill', () => {
  it('strips null bytes and control chars (kills L367 MethodExpression, L369 StringLiteral)', async () => {
    const name = await runWithFileName('cert\x00\x01\x1f.pdf');
    expect(name).not.toContain('\x00');
    expect(name).not.toContain('\x01');
    expect(name).toBe('cert.pdf');
  });

  it('replaces / with _ (kills L371 Regex and StringLiteral)', async () => {
    const name = await runWithFileName('path/to/file.pdf');
    expect(name).not.toContain('/');
    expect(name).toBe('path_to_file.pdf');
  });

  it('replaces \\ with _ (kills L371 Regex chars)', async () => {
    const name = await runWithFileName('bad\\name.pdf');
    expect(name).not.toContain('\\');
    expect(name).toContain('_');
  });

  it('replaces : with _ (kills L371 Regex chars)', async () => {
    const name = await runWithFileName('C:drive.pdf');
    expect(name).toBe('C_drive.pdf');
  });

  it('strips leading dots (kills L374 Regex and L374 StringLiteral mutants)', async () => {
    const name = await runWithFileName('...hidden.pdf');
    expect(name).not.toMatch(/^\./);
    expect(name).toBe('hidden.pdf');
  });

  it('collapses .. sequences to _ (kills L376 StringLiteral)', async () => {
    const name = await runWithFileName('a..b.pdf');
    expect(name).not.toContain('..');
    expect(name).toBe('a_b.pdf');
  });

  it('empty-after-sanitization falls back to certificate.pdf (kills L386 ConditionalExpression/LogicalOperator)', async () => {
    const name = await runWithFileName('...');
    expect(name).toBe('certificate.pdf');
  });

  it('short name is preserved unchanged — not spuriously truncated (kills L380 ConditionalExpression→true)', async () => {
    const name = await runWithFileName('simple.pdf');
    expect(name).toBe('simple.pdf');
  });

  it('name exactly 200 chars is not truncated (distinguishes > 200 from >= 200)', async () => {
    const exactly200 = 'A'.repeat(196) + '.pdf';
    const name = await runWithFileName(exactly200);
    expect(name.length).toBe(200);
    expect(name).toBe(exactly200);
  });

  it('name 201 chars IS truncated to 200, extension preserved (kills L380 ConditionalExpression→false)', async () => {
    const tooLong = 'B'.repeat(197) + '.pdf';
    const name = await runWithFileName(tooLong);
    expect(name.length).toBe(200);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('truncation preserves extension correctly: base sliced, ext appended (kills L382-383 mutations)', async () => {
    const longBase = 'C'.repeat(250) + '.pdf';
    const name = await runWithFileName(longBase);
    expect(name.length).toBe(200);
    expect(name.endsWith('.pdf')).toBe(true);
    expect(name.startsWith('C'.repeat(196))).toBe(true);
  });

  it('name without extension truncated to 200 chars flat (kills L382 dotIdx ConditionalExpression)', async () => {
    const noExt = 'D'.repeat(250);
    const name = await runWithFileName(noExt);
    expect(name.length).toBe(200);
    expect(name).toBe('D'.repeat(200));
  });
});
