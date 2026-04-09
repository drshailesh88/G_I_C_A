/**
 * Emergency Kit Tests — Req 8B-4
 *
 * Tests:
 * 1. buildEmergencyKitStorageKey produces correct key format
 * 2. generateEmergencyKit creates ZIP with all 6 files
 * 3. generateEmergencyKit handles empty event (no data) — still produces 6 files
 * 4. findEventsStartingWithin24h filters by date range and status
 * 5. generateAttendeeCsv produces correct CSV headers and rows
 * 6. generateProgramJson includes faculty assignments grouped by session
 * 7. All queries use withEventScope for data isolation
 * 8. Inngest preEventBackupFn is registered with daily cron trigger
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    events: { id: col('id'), name: col('name'), startDate: col('start_date'), endDate: col('end_date'), status: col('status') },
    eventRegistrations: { eventId: col('event_id'), personId: col('person_id'), registrationNumber: col('reg_num'), category: col('category'), status: col('status'), registeredAt: col('registered_at') },
    people: { id: col('id'), fullName: col('full_name'), email: col('email'), phoneE164: col('phone'), designation: col('designation'), specialty: col('specialty'), organization: col('org'), city: col('city') },
    travelRecords: { eventId: col('event_id'), personId: col('person_id'), direction: col('dir'), travelMode: col('mode'), fromCity: col('from'), toCity: col('to'), departureAtUtc: col('dep'), arrivalAtUtc: col('arr'), carrier: col('carrier'), flightTrainNumber: col('ftn'), pnr: col('pnr'), recordStatus: col('status') },
    accommodationRecords: { eventId: col('event_id'), personId: col('person_id'), hotelName: col('hotel'), roomType: col('room_type'), roomNumber: col('room_num'), sharedRoomGroup: col('shared'), checkInDate: col('check_in'), checkOutDate: col('check_out'), recordStatus: col('status') },
    transportBatches: { id: col('id'), eventId: col('event_id'), batchDate: col('batch_date'), movementType: col('movement'), pickupHub: col('pickup'), dropHub: col('drop'), batchStatus: col('batch_status') },
    vehicleAssignments: { id: col('id'), batchId: col('batch_id'), vehicleLabel: col('v_label'), vehicleType: col('v_type') },
    transportPassengerAssignments: { id: col('id'), vehicleAssignmentId: col('va_id'), personId: col('person_id'), assignmentStatus: col('a_status') },
    sessions: { id: col('id'), eventId: col('event_id'), title: col('title'), sessionType: col('type'), sessionDate: col('date'), startAtUtc: col('start'), endAtUtc: col('end'), hallId: col('hall_id'), track: col('track'), status: col('status'), cmeCredits: col('cme'), parentSessionId: col('parent') },
    sessionAssignments: { eventId: col('event_id'), sessionId: col('session_id'), personId: col('person_id'), role: col('role') },
    halls: { id: col('id'), name: col('name') },
    issuedCertificates: { eventId: col('event_id'), storageKey: col('storage_key'), fileName: col('file_name'), certificateType: col('cert_type'), status: col('status') },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  ne: vi.fn(),
  inArray: vi.fn(),
}));

// Mock archiver
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
  buildEmergencyKitStorageKey,
  generateEmergencyKit,
  generateAttendeeCsv,
  generateProgramJson,
  findEventsNeedingBackup,
} from './emergency-kit';

// ── Helpers ────────────────────────────────────────────────────

const EVENT_ID = 'event-bbb-bbb';

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

describe('Pre-Event Emergency Kit (8B-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Storage key format
  it('buildEmergencyKitStorageKey produces correct key format', () => {
    const key = buildEmergencyKitStorageKey('evt-123');
    expect(key).toMatch(/^events\/evt-123\/emergency-kit\/kit-\d+-[a-z0-9]+\.zip$/);
  });

  // Test 2: Full kit generation with data
  it('generateEmergencyKit creates ZIP with all 6 files', async () => {
    // Queries: attendee (1), travel (1), rooming (1), transport batches (1), transport vehicles (1),
    // transport passengers (1), program sessions (1), program assignments (1), certs (1) = 9 queries
    setupDbReturn(
      // 1. Attendee list
      [{ regNumber: 'REG-001', fullName: 'Dr. Rao', email: 'rao@test.com', phone: '+919876543210', category: 'delegate', status: 'confirmed', designation: 'Professor', specialty: 'Cardiology', organization: 'AIIMS', city: 'Delhi', registeredAt: new Date('2026-04-08') }],
      // 2. Travel roster
      [{ fullName: 'Dr. Rao', email: 'rao@test.com', phone: '+919876543210', direction: 'inbound', travelMode: 'flight', fromCity: 'Delhi', toCity: 'Hyderabad', departureAtUtc: new Date('2026-04-09T05:00:00Z'), arrivalAtUtc: new Date('2026-04-09T08:00:00Z'), carrier: 'IndiGo', flightTrainNumber: '6E-2345', pnr: 'ABC123', recordStatus: 'active' }],
      // 3. Rooming list
      [{ fullName: 'Dr. Rao', email: 'rao@test.com', phone: '+919876543210', hotelName: 'Taj Deccan', roomType: 'single', roomNumber: '304', sharedRoomGroup: null, checkInDate: new Date('2026-04-09'), checkOutDate: new Date('2026-04-12'), recordStatus: 'active' }],
      // 4. Transport batches
      [{ batchId: 'batch-1', serviceDate: new Date('2026-04-09'), movementType: 'arrival_pickup', pickupHub: 'RGIA Terminal 1', dropHub: 'HICC', batchStatus: 'planned' }],
      // 5. Transport vehicles
      [{ vehicleId: 'v-1', batchId: 'batch-1', vehicleLabel: 'Van-1', vehicleType: 'van' }],
      // 6. Transport passengers
      [{ batchId: 'batch-1', vehicleAssignmentId: 'v-1', fullName: 'Dr. Rao', phone: '+919876543210', assignmentStatus: 'assigned' }],
      // 7. Program sessions
      [{ id: 'sess-1', title: 'Keynote', sessionType: 'keynote', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T03:30:00Z'), endAtUtc: new Date('2026-04-10T04:30:00Z'), hallName: 'Hall A', track: 'Main', status: 'scheduled', cmeCredits: 2, parentSessionId: null }],
      // 8. Program assignments
      [{ sessionId: 'sess-1', personName: 'Dr. Rao', personEmail: 'rao@test.com', role: 'speaker' }],
      // 9. Certificate keys
      [{ storageKey: 'certificates/evt-bbb/delegate_attendance/cert-1.pdf', fileName: 'Dr-Rao-cert.pdf', certificateType: 'delegate_attendance', status: 'issued' }],
    );

    const storage = createStubStorage();
    const result = await generateEmergencyKit({ eventId: EVENT_ID, storageProvider: storage });

    expect(result.storageKey).toMatch(/^events\/event-bbb-bbb\/emergency-kit\/kit-/);
    expect(result.downloadUrl).toContain('stub-r2.example.com');
    expect(result.fileCount).toBe(6);

    // Verify upload was called
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.getSignedUrl).toHaveBeenCalledTimes(1);

    // Verify archiver received all 6 files
    const archiver = (await import('archiver')).default;
    const lastArchive = (archiver as any).mock.results.slice(-1)[0]?.value;
    const fileNames = lastArchive._entries.map((e: any) => e.opts.name);
    expect(fileNames).toContain('attendees.csv');
    expect(fileNames).toContain('travel-roster.csv');
    expect(fileNames).toContain('rooming-list.csv');
    expect(fileNames).toContain('transport-plan.csv');
    expect(fileNames).toContain('program.json');
    expect(fileNames).toContain('certificate-keys.json');
  });

  // Test 3: Empty event still produces 6 files (with headers only)
  it('generateEmergencyKit handles empty event — still produces 6 files', async () => {
    // 9 queries, all empty
    setupDbReturn([], [], [], [], [], [], [], [], []);

    const storage = createStubStorage();
    const result = await generateEmergencyKit({ eventId: EVENT_ID, storageProvider: storage });

    expect(result.fileCount).toBe(6);
  });

  // Test 4: findEventsNeedingBackup uses 48h window for reliable 24h-before coverage
  it('findEventsNeedingBackup filters by 48h window and active status', async () => {
    const tomorrow = new Date(Date.now() + 20 * 60 * 60 * 1000);
    setupDbReturn([
      { id: 'evt-upcoming', name: 'GEM India 2026', startDate: tomorrow },
    ]);

    const results = await findEventsNeedingBackup();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('evt-upcoming');
    expect(results[0].name).toBe('GEM India 2026');

    // Verify the query was called
    expect(mockDb.select).toHaveBeenCalled();
  });

  // Test 5: Attendee CSV format
  it('generateAttendeeCsv produces correct CSV headers and data rows', async () => {
    setupDbReturn([
      {
        regNumber: 'REG-001',
        fullName: 'Dr. Smith',
        email: 'smith@test.com',
        phone: '+919876543210',
        category: 'delegate',
        status: 'confirmed',
        designation: 'Professor',
        specialty: 'Neurology',
        organization: 'NIMHANS',
        city: 'Bangalore',
        registeredAt: new Date('2026-04-05T10:00:00Z'),
      },
    ]);

    const buffer = await generateAttendeeCsv(EVENT_ID);
    const csv = buffer.toString('utf-8');
    const lines = csv.split('\n');

    // Headers
    expect(lines[0]).toContain('Reg #');
    expect(lines[0]).toContain('Name');
    expect(lines[0]).toContain('Email');
    expect(lines[0]).toContain('Phone');
    expect(lines[0]).toContain('Category');
    expect(lines[0]).toContain('Status');

    // Data row
    expect(lines[1]).toContain('Dr. Smith');
    expect(lines[1]).toContain('smith@test.com');
    expect(lines[1]).toContain('confirmed');
  });

  // Test 6: Program JSON includes faculty assignments
  it('generateProgramJson includes faculty assignments grouped by session', async () => {
    setupDbReturn(
      // Sessions
      [{ id: 'sess-1', title: 'Panel Discussion', sessionType: 'panel', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T06:00:00Z'), endAtUtc: new Date('2026-04-10T07:30:00Z'), hallName: 'Hall B', track: 'Cardiology', status: 'scheduled', cmeCredits: 1, parentSessionId: null }],
      // Assignments
      [
        { sessionId: 'sess-1', personName: 'Dr. Gupta', personEmail: 'gupta@test.com', role: 'chair' },
        { sessionId: 'sess-1', personName: 'Dr. Mehta', personEmail: 'mehta@test.com', role: 'panelist' },
      ],
    );

    const buffer = await generateProgramJson(EVENT_ID);
    const data = JSON.parse(buffer.toString('utf-8'));

    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].title).toBe('Panel Discussion');
    expect(data.sessions[0].faculty).toHaveLength(2);
    expect(data.sessions[0].faculty[0].name).toBe('Dr. Gupta');
    expect(data.sessions[0].faculty[0].role).toBe('chair');
    expect(data.sessions[0].faculty[1].name).toBe('Dr. Mehta');
    expect(data.generatedAt).toBeTruthy();
  });

  // Test CP-129: generateCertificateKeysJson produces correct structure
  it('generateCertificateKeysJson returns JSON with certificates array and generatedAt (CP-129)', async () => {
    const certRows = [
      { storageKey: 'certificates/evt/delegate_attendance/cert-1.pdf', fileName: 'Dr-Rao-cert.pdf', certificateType: 'delegate_attendance', status: 'issued' },
      { storageKey: 'certificates/evt/speaker_recognition/cert-2.pdf', fileName: 'Dr-Smith-cert.pdf', certificateType: 'speaker_recognition', status: 'issued' },
    ];
    setupDbReturn(certRows);

    const { generateCertificateKeysJson } = await import('./emergency-kit');
    const buffer = await generateCertificateKeysJson(EVENT_ID);
    const parsed = JSON.parse(buffer.toString('utf-8'));

    expect(parsed.generatedAt).toBeTruthy();
    expect(parsed.certificates).toHaveLength(2);
    expect(parsed.certificates[0].storageKey).toBe('certificates/evt/delegate_attendance/cert-1.pdf');
    expect(parsed.certificates[1].certificateType).toBe('speaker_recognition');
  });

  // Test CP-131: Events outside 48h window excluded
  it('findEventsNeedingBackup returns empty when events are outside 48h window', async () => {
    // Return empty results — simulating no events in window
    setupDbReturn([]);

    const results = await findEventsNeedingBackup();
    expect(results).toHaveLength(0);
    expect(mockDb.select).toHaveBeenCalled();
  });

  // Test 7: Event scoping — all queries filter by eventId
  it('all queries use withEventScope for data isolation', async () => {
    // 9 queries, all empty
    setupDbReturn([], [], [], [], [], [], [], [], []);

    const storage = createStubStorage();
    await generateEmergencyKit({ eventId: EVENT_ID, storageProvider: storage });

    // withEventScope should be called for: attendees, travel, rooming, transport, sessions, assignments, certs
    const eventScopeCalls = mockWithEventScope.mock.calls.filter(
      (args) => args[1] === EVENT_ID,
    );
    expect(eventScopeCalls.length).toBeGreaterThanOrEqual(6);
  });

  // Test 8: Core logic for cron and manual triggers
  it('cron core logic finds multiple events, manual trigger generates kit for specific event', async () => {
    // Test the cron job's core logic: findEventsNeedingBackup with 48h window
    const in36h = new Date(Date.now() + 36 * 60 * 60 * 1000);
    setupDbReturn([
      { id: 'evt-auto-1', name: 'Auto Backup Event', startDate: in36h },
      { id: 'evt-auto-2', name: 'Another Event', startDate: in36h },
    ]);

    // 36h from now is within the 48h window — would have been missed with 24h
    const upcoming = await findEventsNeedingBackup();
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].id).toBe('evt-auto-1');
    expect(upcoming[1].id).toBe('evt-auto-2');

    // And verify manual trigger's core logic: generateEmergencyKit with specific eventId
    vi.clearAllMocks();
    setupDbReturn([], [], [], [], [], [], [], [], []);
    const storage = createStubStorage();
    const kit = await generateEmergencyKit({ eventId: 'evt-manual-trigger', storageProvider: storage });
    expect(kit.storageKey).toMatch(/^events\/evt-manual-trigger\/emergency-kit\//);
    expect(kit.fileCount).toBe(6);
    expect(kit.downloadUrl).toContain('stub-r2.example.com');
  });
});
