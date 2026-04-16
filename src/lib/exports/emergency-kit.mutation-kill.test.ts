/**
 * Mutation-kill tests for src/lib/exports/emergency-kit.ts
 * Targets: escapeCsv, formatDateTime, toCsvBuffer, all CSV headers,
 * nullable-field LogicalOperators, transport denormalization,
 * program sort, archiver options, 48h arithmetic, status array.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup ────────────────────────────────────────────────────

const mockDb = { select: vi.fn() };

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, { get: () => mockDb.select }),
}));

const mockWithEventScope = vi.fn((_col: unknown, eventId: string, ..._rest: unknown[]) => ({
  eventId,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: (...args: unknown[]) =>
    mockWithEventScope(...(args as [unknown, string, ...unknown[]])),
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, getSQL: () => name });
  return {
    events: {
      id: col('id'), name: col('name'), startDate: col('start_date'),
      endDate: col('end_date'), status: col('status'),
    },
    eventRegistrations: {
      eventId: col('event_id'), personId: col('person_id'),
      registrationNumber: col('reg_num'), category: col('category'),
      status: col('status'), registeredAt: col('registered_at'),
    },
    people: {
      id: col('id'), fullName: col('full_name'), email: col('email'),
      phoneE164: col('phone'), designation: col('designation'),
      specialty: col('specialty'), organization: col('org'), city: col('city'),
    },
    travelRecords: {
      eventId: col('event_id'), personId: col('person_id'),
      direction: col('dir'), travelMode: col('mode'),
      fromCity: col('from'), toCity: col('to'),
      departureAtUtc: col('dep'), arrivalAtUtc: col('arr'),
      carrierName: col('carrier'), serviceNumber: col('ftn'),
      pnrOrBookingRef: col('pnr'), recordStatus: col('status'),
    },
    accommodationRecords: {
      eventId: col('event_id'), personId: col('person_id'),
      hotelName: col('hotel'), roomType: col('room_type'),
      roomNumber: col('room_num'), sharedRoomGroup: col('shared'),
      checkInDate: col('check_in'), checkOutDate: col('check_out'),
      recordStatus: col('status'),
    },
    transportBatches: {
      id: col('id'), eventId: col('event_id'), serviceDate: col('service_date'),
      movementType: col('movement'), pickupHub: col('pickup'),
      dropHub: col('drop'), batchStatus: col('batch_status'),
    },
    vehicleAssignments: {
      id: col('id'), batchId: col('batch_id'), eventId: col('event_id'),
      vehicleLabel: col('v_label'), vehicleType: col('v_type'),
    },
    transportPassengerAssignments: {
      id: col('id'), batchId: col('batch_id'), vehicleAssignmentId: col('va_id'),
      personId: col('person_id'), eventId: col('event_id'),
      assignmentStatus: col('a_status'),
    },
    sessions: {
      id: col('id'), eventId: col('event_id'), title: col('title'),
      sessionType: col('type'), sessionDate: col('date'),
      startAtUtc: col('start'), endAtUtc: col('end'),
      hallId: col('hall_id'), track: col('track'), status: col('status'),
      cmeCredits: col('cme'), parentSessionId: col('parent'),
    },
    sessionAssignments: {
      eventId: col('event_id'), sessionId: col('session_id'),
      personId: col('person_id'), role: col('role'),
    },
    halls: { id: col('id'), name: col('name') },
    issuedCertificates: {
      eventId: col('event_id'), storageKey: col('storage_key'),
      fileName: col('file_name'), certificateType: col('cert_type'),
      status: col('status'),
    },
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
          pipedTarget.write(Buffer.from('PK-mock-zip-data-12345'));
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
  buildEmergencyKitStorageKey,
  buildCronBackupStorageKey,
  generateAttendeeCsv,
  generateTravelCsv,
  generateRoomingCsv,
  generateTransportCsv,
  generateProgramJson,
  generateCertificateKeysJson,
  generateEmergencyKit,
  findEventsNeedingBackup,
} from './emergency-kit';

// ── Helpers ───────────────────────────────────────────────────────

const EID = 'evt-mk-001';

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

function setupDb(...rowSets: unknown[][]) {
  let idx = 0;
  mockDb.select.mockImplementation(() => createChain(rowSets[idx++] ?? []));
}

function stubStorageNoStream() {
  return {
    upload: vi.fn(async (key: string, data: Buffer) => ({
      storageKey: key,
      fileSizeBytes: data.length,
      fileChecksumSha256: 'abc',
    })),
    getSignedUrl: vi.fn(async (key: string) => `https://stub/${key}?sig=1`),
    delete: vi.fn(),
  };
}

function stubStorageWithStream() {
  return {
    upload: vi.fn(),
    uploadStream: vi.fn(async (key: string) => ({
      storageKey: key,
      fileSizeBytes: 2048,
      fileChecksumSha256: 'def',
    })),
    getSignedUrl: vi.fn(async (key: string) => `https://stub/${key}?sig=1`),
    delete: vi.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('emergency-kit mutation-kill', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── buildCronBackupStorageKey (L63-64 NoCoverage) ──────────────

  describe('buildCronBackupStorageKey', () => {
    it('returns deterministic key with fixed filename', () => {
      expect(buildCronBackupStorageKey('evt-abc')).toBe(
        'events/evt-abc/emergency-kit/pre-event-backup.zip',
      );
    });

    it('different eventIds produce different keys', () => {
      expect(buildCronBackupStorageKey('evt-1')).not.toBe(buildCronBackupStorageKey('evt-2'));
    });
  });

  // ── escapeCsv internals via generateAttendeeCsv ────────────────

  describe('escapeCsv (via generateAttendeeCsv)', () => {
    function row(overrides: Record<string, unknown>) {
      return {
        regNumber: 'R1', fullName: 'Dr. A', email: 'a@t.com', phone: null,
        category: null, status: 'ok', designation: null, specialty: null,
        organization: null, city: null, registeredAt: null,
        ...overrides,
      };
    }

    it('null value → empty string (L70 ConditionalExpression)', async () => {
      setupDb([row({ regNumber: null, email: null })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).not.toContain('null');
      const parts = csv.split('\n')[1].split(',');
      expect(parts[0]).toBe('');  // regNumber null → ''
      expect(parts[2]).toBe('');  // email null → ''
    });

    it('= prefix gets tab-prepended (L72 formula injection)', async () => {
      setupDb([row({ regNumber: '=SUM(1,2)' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('\t=SUM(1,2)');
    });

    it('+ prefix gets tab-prepended', async () => {
      setupDb([row({ regNumber: '+300' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('\t+300');
    });

    it('- prefix gets tab-prepended', async () => {
      setupDb([row({ regNumber: '-DROP TABLE' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('\t-DROP TABLE');
    });

    it('@ prefix gets tab-prepended', async () => {
      setupDb([row({ regNumber: '@A1' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('\t@A1');
    });

    it('non-formula non-special value needs no tab (L72:50 BlockStatement)', async () => {
      setupDb([row({ regNumber: 'REG-001' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      // REG-001 starts with 'R' — no tab prefix
      expect(csv).toContain('REG-001');
      const dataLine = csv.split('\n')[1];
      expect(dataLine.startsWith('\t')).toBe(false);
    });

    it('empty string → no tab prefix (L72:7 EqualityOperator str.length >= 0)', async () => {
      setupDb([row({ regNumber: '' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      // first field should be empty (no tab)
      const parts = csv.split('\n')[1].split(',');
      expect(parts[0]).toBe('');
    });

    it('comma in value → double-quoted (L75 LogicalOperator)', async () => {
      setupDb([row({ fullName: 'Smith, John' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('"Smith, John"');
    });

    it('double-quote in value → escaped by doubling (L76 StringLiteral)', async () => {
      setupDb([row({ fullName: 'O"Brien' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('"O""Brien"');
    });

    it('newline in value → double-quoted (L75 includes newline branch)', async () => {
      setupDb([row({ fullName: 'Dr.\nRao' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('"Dr.\nRao"');
    });

    it('tab in value → double-quoted (L75 includes tab branch)', async () => {
      setupDb([row({ fullName: 'Dr.\tRao' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('"Dr.\tRao"');
    });

    it('plain value without specials → not quoted (L75 ConditionalExpression→true kill)', async () => {
      setupDb([row({ fullName: 'Dr Rao' })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      // Should appear without quotes
      expect(csv).toContain('Dr Rao');
      expect(csv).not.toContain('"Dr Rao"');
    });

    it('null passed directly without ?? guard → empty string not "null" (L70:13 ConditionalExpression, L70:29 NoCoverage)', async () => {
      // r.fullName has no ?? '' guard — null reaches escapeCsv directly
      setupDb([row({ fullName: null })]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[1]).toBe('');  // fullName null → '' not 'null' or 'Stryker was here!'
    });
  });

  // ── formatDateTime (L81-83) ────────────────────────────────────

  describe('formatDateTime (via generateAttendeeCsv)', () => {
    it('null date → empty last column (L82 ConditionalExpression + BooleanLiteral)', async () => {
      setupDb([{
        regNumber: 'R1', fullName: 'Dr. X', email: 'x@t.com', phone: null,
        category: null, status: 'ok', designation: null, specialty: null,
        organization: null, city: null, registeredAt: null,
      }]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[parts.length - 1]).toBe('');
    });

    it('non-null date → "YYYY-MM-DD HH:MM:SS" with space not T (L83 StringLiteral + MethodExpression)', async () => {
      setupDb([{
        regNumber: 'R1', fullName: 'Dr. X', email: 'x@t.com', phone: null,
        category: null, status: 'ok', designation: null, specialty: null,
        organization: null, city: null, registeredAt: new Date('2026-04-09T10:30:45Z'),
      }]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('2026-04-09 10:30:45');
      expect(csv).not.toContain('2026-04-09T10:30:45');
    });

    it('date slice stops at 19 chars — no milliseconds or Z', async () => {
      setupDb([{
        regNumber: 'R1', fullName: 'Dr. X', email: 'x@t.com', phone: null,
        category: null, status: 'ok', designation: null, specialty: null,
        organization: null, city: null, registeredAt: new Date('2026-04-09T10:30:45.123Z'),
      }]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('2026-04-09 10:30:45');
      expect(csv).not.toContain('.123');
      expect(csv).not.toContain('.000Z');
    });
  });

  // ── Attendee CSV exact headers (L116) ─────────────────────────

  describe('generateAttendeeCsv', () => {
    it('exact header line — kills all L116 StringLiteral + toCsvBuffer separators', async () => {
      setupDb([]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv.split('\n')[0]).toBe(
        'Reg #,Name,Email,Phone,Category,Status,Designation,Specialty,Organization,City,Registered At',
      );
    });

    it('null → empty string for nullable fields (L118-L120 LogicalOperator ??→&&)', async () => {
      setupDb([{
        regNumber: null, fullName: 'Dr. N', email: null, phone: null,
        category: null, status: 'confirmed', designation: null, specialty: null,
        organization: null, city: null, registeredAt: null,
      }]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[0]).toBe('');  // regNumber
      expect(parts[2]).toBe('');  // email
      expect(parts[3]).toBe('');  // phone
      expect(parts[4]).toBe('');  // category (kills L119:21 StringLiteral ?? fallback)
      expect(parts[6]).toBe('');  // designation
      expect(parts[7]).toBe('');  // specialty
      expect(parts[8]).toBe('');  // organization
      expect(parts[9]).toBe('');  // city
    });

    it('non-null values preserved for nullable fields', async () => {
      setupDb([{
        regNumber: 'REG-999', fullName: 'Dr. Full', email: 'f@t.com',
        phone: '+919000000000', category: 'faculty', status: 'confirmed',
        designation: 'Prof', specialty: 'Surgery', organization: 'PGI',
        city: 'Chandigarh', registeredAt: null,
      }]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      expect(csv).toContain('REG-999');
      expect(csv).toContain('f@t.com');
      expect(csv).toContain('+919000000000');
      expect(csv).toContain('faculty');
      expect(csv).toContain('Prof');
      expect(csv).toContain('Surgery');
      expect(csv).toContain('PGI');
      expect(csv).toContain('Chandigarh');
    });

    it('rows separated by newline, fields by comma (L88/L89/L91 toCsvBuffer)', async () => {
      setupDb([{
        regNumber: 'R1', fullName: 'Dr. A', email: 'a@t.com', phone: '+91999',
        category: 'delegate', status: 'confirmed', designation: 'Prof',
        specialty: 'Cardio', organization: 'AIIMS', city: 'Delhi',
        registeredAt: new Date('2026-01-01T00:00:00Z'),
      }]);
      const csv = (await generateAttendeeCsv(EID)).toString();
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain(',');
      expect(lines[1]).toContain(',');
    });
  });

  // ── Travel CSV exact headers (L149) ───────────────────────────

  describe('generateTravelCsv', () => {
    it('exact header line — kills all L149 StringLiteral mutants', async () => {
      setupDb([]);
      const csv = (await generateTravelCsv(EID)).toString();
      expect(csv.split('\n')[0]).toBe(
        'Name,Email,Phone,Direction,Mode,From,To,Departure,Arrival,Carrier,Flight/Train #,PNR,Status',
      );
    });

    it('null → empty string for nullable fields (L151-L153 LogicalOperator ??→&&)', async () => {
      setupDb([{
        fullName: 'Dr. T', email: null, phone: null,
        direction: 'inbound', travelMode: 'flight',
        fromCity: 'Delhi', toCity: 'Mumbai',
        departureAtUtc: null, arrivalAtUtc: null,
        carrier: null, flightTrainNumber: null, pnr: null,
        recordStatus: 'active',
      }]);
      const csv = (await generateTravelCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[1]).toBe('');  // email
      expect(parts[2]).toBe('');  // phone
      expect(parts[9]).toBe('');  // carrier
      expect(parts[10]).toBe(''); // flightTrainNumber
      expect(parts[11]).toBe(''); // pnr
    });

    it('non-null values preserved for nullable fields', async () => {
      setupDb([{
        fullName: 'Dr. T', email: 'travel@t.com', phone: '+91800',
        direction: 'outbound', travelMode: 'train',
        fromCity: 'Hyd', toCity: 'Chennai',
        departureAtUtc: new Date('2026-04-12T08:00:00Z'),
        arrivalAtUtc: new Date('2026-04-12T14:00:00Z'),
        carrier: 'Rajdhani', flightTrainNumber: '12627', pnr: 'PNR-XYZ',
        recordStatus: 'active',
      }]);
      const csv = (await generateTravelCsv(EID)).toString();
      expect(csv).toContain('travel@t.com');
      expect(csv).toContain('+91800');
      expect(csv).toContain('Rajdhani');
      expect(csv).toContain('12627');
      expect(csv).toContain('PNR-XYZ');
    });
  });

  // ── Rooming CSV exact headers (L179) ──────────────────────────

  describe('generateRoomingCsv', () => {
    it('exact header line — kills all L179 StringLiteral mutants', async () => {
      setupDb([]);
      const csv = (await generateRoomingCsv(EID)).toString();
      expect(csv.split('\n')[0]).toBe(
        'Hotel,Name,Email,Phone,Room Type,Room #,Shared Group,Check-In,Check-Out,Status',
      );
    });

    it('null → empty string for nullable fields (L181-L182 LogicalOperator ??→&&)', async () => {
      setupDb([{
        hotelName: 'Taj', fullName: 'Dr. R', email: null, phone: null,
        roomType: null, roomNumber: null, sharedRoomGroup: null,
        checkInDate: null, checkOutDate: null, recordStatus: 'active',
      }]);
      const csv = (await generateRoomingCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[2]).toBe('');  // email
      expect(parts[3]).toBe('');  // phone
      expect(parts[4]).toBe('');  // roomType
      expect(parts[5]).toBe('');  // roomNumber
      expect(parts[6]).toBe('');  // sharedRoomGroup
    });

    it('non-null values preserved for nullable fields', async () => {
      setupDb([{
        hotelName: 'Hyatt', fullName: 'Dr. R', email: 'room@t.com',
        phone: '+91700', roomType: 'deluxe', roomNumber: '501',
        sharedRoomGroup: 'G1', checkInDate: new Date('2026-04-10T00:00:00Z'),
        checkOutDate: new Date('2026-04-13T00:00:00Z'), recordStatus: 'active',
      }]);
      const csv = (await generateRoomingCsv(EID)).toString();
      expect(csv).toContain('room@t.com');
      expect(csv).toContain('+91700');
      expect(csv).toContain('deluxe');
      expect(csv).toContain('501');
      expect(csv).toContain('G1');
    });

    it('check-in and check-out dates formatted with space separator (L182:66 StringLiteral)', async () => {
      setupDb([{
        hotelName: 'H', fullName: 'D', email: null, phone: null,
        roomType: null, roomNumber: null, sharedRoomGroup: null,
        checkInDate: new Date('2026-04-10T00:00:00Z'),
        checkOutDate: new Date('2026-04-12T00:00:00Z'),
        recordStatus: 'active',
      }]);
      const csv = (await generateRoomingCsv(EID)).toString();
      expect(csv).toContain('2026-04-10 00:00:00');
      expect(csv).toContain('2026-04-12 00:00:00');
    });
  });

  // ── Transport CSV — denormalization (L234-264) ─────────────────

  describe('generateTransportCsv', () => {
    it('exact header line — kills all L273 StringLiteral mutants', async () => {
      setupDb([], [], []);
      const csv = (await generateTransportCsv(EID)).toString();
      expect(csv.split('\n')[0]).toBe(
        'Date,Movement,Pickup Hub,Drop Hub,Batch Status,Vehicle,Type,Passenger,Phone,Passenger Status',
      );
    });

    it('batch with no vehicles → row with empty vehicle+passenger columns (L237 ConditionalExpression)', async () => {
      setupDb(
        [{ batchId: 'b1', serviceDate: new Date('2026-04-09T00:00:00Z'), movementType: 'arrival_pickup', pickupHub: 'Airport', dropHub: 'HICC', batchStatus: 'planned' }],
        [],
        [],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      const parts = lines[1].split(',');
      expect(parts[2]).toBe('Airport');  // pickupHub non-null → actual value (kills L241:9 ??→&&)
      expect(parts[3]).toBe('HICC');     // dropHub non-null → actual value (kills L241:32 ??→&&)
      expect(parts[4]).toBe('planned');
      expect(parts[5]).toBe('');  // vehicle label empty
      expect(parts[6]).toBe('');  // vehicle type empty
      expect(parts[7]).toBe('');  // passenger name empty
      expect(parts[8]).toBe('');  // phone empty (kills L242:21 StringLiteral)
      expect(parts[9]).toBe('');  // assignment status empty (kills L242:25 StringLiteral)
    });

    it('null pickupHub/dropHub on batch-only row → empty string (L241 LogicalOperator)', async () => {
      setupDb(
        [{ batchId: 'b1', serviceDate: null, movementType: 'departure', pickupHub: null, dropHub: null, batchStatus: 'planned' }],
        [],
        [],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[2]).toBe('');  // pickupHub
      expect(parts[3]).toBe('');  // dropHub
    });

    it('vehicle with no passengers → row with empty passenger columns (L250 NoCoverage)', async () => {
      setupDb(
        [{ batchId: 'b1', serviceDate: new Date('2026-04-09T00:00:00Z'), movementType: 'arrival_pickup', pickupHub: 'Airport', dropHub: 'HICC', batchStatus: 'planned' }],
        [{ vehicleId: 'v1', batchId: 'b1', vehicleLabel: 'Van-1', vehicleType: 'van' }],
        [],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      const parts = lines[1].split(',');
      expect(parts[2]).toBe('Airport');  // pickupHub non-null → actual value (kills L254:13 ??→&&)
      expect(parts[3]).toBe('HICC');     // dropHub non-null → actual value (kills L254:36 ??→&&)
      expect(parts[5]).toBe('Van-1');
      expect(parts[6]).toBe('van');
      expect(parts[7]).toBe('');
      expect(parts[8]).toBe('');
      expect(parts[9]).toBe('');
    });

    it('null vehicleLabel/vehicleType on vehicle-only row → empty string (L255 LogicalOperator)', async () => {
      setupDb(
        [{ batchId: 'b1', serviceDate: null, movementType: 'arrival_pickup', pickupHub: null, dropHub: null, batchStatus: 'planned' }],
        [{ vehicleId: 'v1', batchId: 'b1', vehicleLabel: null, vehicleType: null }],
        [],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[2]).toBe('');  // pickupHub null → '' (kills L254:32 StringLiteral)
      expect(parts[3]).toBe('');  // dropHub null → '' (kills L254:53 StringLiteral)
      expect(parts[5]).toBe('');  // vehicleLabel
      expect(parts[6]).toBe('');  // vehicleType
    });

    it('passenger rows per vehicle: all fields populated (L259/L260 NoCoverage)', async () => {
      setupDb(
        [{ batchId: 'b1', serviceDate: new Date('2026-04-09T00:00:00Z'), movementType: 'arrival_pickup', pickupHub: 'Airport', dropHub: 'Hotel', batchStatus: 'planned' }],
        [{ vehicleId: 'v1', batchId: 'b1', vehicleLabel: 'Bus-1', vehicleType: 'bus' }],
        [
          { batchId: 'b1', vehicleAssignmentId: 'v1', fullName: 'Dr. Alpha', phone: '+91111', assignmentStatus: 'assigned' },
          { batchId: 'b1', vehicleAssignmentId: 'v1', fullName: 'Dr. Beta', phone: null, assignmentStatus: 'standby' },
        ],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3);  // header + 2 passenger rows
      const partsRow1 = lines[1].split(',');
      expect(partsRow1[2]).toBe('Airport');  // pickupHub non-null (kills L262:15 ??→&&)
      expect(partsRow1[3]).toBe('Hotel');    // dropHub non-null (kills L262:38 ??→&&)
      expect(partsRow1[6]).toBe('bus');      // vehicleType non-null (kills L263:43 ??→&&)
      expect(lines[1]).toContain('Dr. Alpha');
      expect(lines[1]).toContain('+91111');
      expect(lines[1]).toContain('assigned');
      expect(lines[2]).toContain('Dr. Beta');
      expect(lines[2]).toContain('standby');
    });

    it('null vehicleLabel/vehicleType in passenger branch → empty string (L263:39/66 NoCoverage)', async () => {
      setupDb(
        [{ batchId: 'b1', serviceDate: null, movementType: 'arrival_pickup', pickupHub: null, dropHub: null, batchStatus: 'planned' }],
        [{ vehicleId: 'v1', batchId: 'b1', vehicleLabel: null, vehicleType: null }],
        [{ batchId: 'b1', vehicleAssignmentId: 'v1', fullName: 'Dr. P', phone: '+91999', assignmentStatus: 'assigned' }],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[5]).toBe('');  // vehicleLabel null → '' (kills L263:39)
      expect(parts[6]).toBe('');  // vehicleType null → '' (kills L263:66)
    });

    it('null passenger phone → empty string (L264 LogicalOperator ??→&&)', async () => {
      setupDb(
        [{ batchId: 'b1', serviceDate: null, movementType: 'arrival_pickup', pickupHub: null, dropHub: null, batchStatus: 'planned' }],
        [{ vehicleId: 'v1', batchId: 'b1', vehicleLabel: 'Van', vehicleType: 'van' }],
        [{ batchId: 'b1', vehicleAssignmentId: 'v1', fullName: 'Dr. Z', phone: null, assignmentStatus: 'assigned' }],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[8]).toBe('');  // phone null → ''
    });

    it('vehicle filter: each vehicle matched to its own batch (L235 filter)', async () => {
      setupDb(
        [
          { batchId: 'b1', serviceDate: new Date('2026-04-09T00:00:00Z'), movementType: 'arrival_pickup', pickupHub: 'Airport', dropHub: 'Hotel', batchStatus: 'planned' },
          { batchId: 'b2', serviceDate: new Date('2026-04-10T00:00:00Z'), movementType: 'departure', pickupHub: 'Hotel', dropHub: 'Airport', batchStatus: 'planned' },
        ],
        [
          { vehicleId: 'v1', batchId: 'b1', vehicleLabel: 'Van-A', vehicleType: 'van' },
          { vehicleId: 'v2', batchId: 'b2', vehicleLabel: 'Bus-B', vehicleType: 'bus' },
        ],
        [
          { batchId: 'b1', vehicleAssignmentId: 'v1', fullName: 'Dr. Passenger', phone: '+91888', assignmentStatus: 'assigned' },
        ],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain('Dr. Passenger');
      expect(lines[1]).toContain('Van-A');
      // b2/v2 row has no passengers, so passenger columns empty
      expect(lines[2]).toContain('Bus-B');
      expect(lines[2]).not.toContain('Dr. Passenger');
    });

    it('null pickupHub/dropHub on vehicle-with-passenger row → empty string (L262 LogicalOperator)', async () => {
      setupDb(
        [{ batchId: 'b1', serviceDate: null, movementType: 'arrival_pickup', pickupHub: null, dropHub: null, batchStatus: 'planned' }],
        [{ vehicleId: 'v1', batchId: 'b1', vehicleLabel: 'Van', vehicleType: 'van' }],
        [{ batchId: 'b1', vehicleAssignmentId: 'v1', fullName: 'Dr. P', phone: '+91999', assignmentStatus: 'assigned' }],
      );
      const csv = (await generateTransportCsv(EID)).toString();
      const parts = csv.split('\n')[1].split(',');
      expect(parts[2]).toBe('');  // pickupHub
      expect(parts[3]).toBe('');  // dropHub
    });
  });

  // ── generateProgramJson sort (L334-339 NoCoverage) ────────────

  describe('generateProgramJson sort', () => {
    it('sessions sorted by date ascending (L337 EqualityOperator)', async () => {
      setupDb(
        [
          { id: 'sess-b', title: 'B', sessionType: 'talk', sessionDate: new Date('2026-04-12'), startAtUtc: new Date('2026-04-12T06:00:00Z'), endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
          { id: 'sess-a', title: 'A', sessionType: 'talk', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T06:00:00Z'), endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
        ],
        [],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      expect(data.sessions[0].id).toBe('sess-a');
      expect(data.sessions[1].id).toBe('sess-b');
    });

    it('same date: sorted by startUtc (L338/L339 LogicalOperator)', async () => {
      setupDb(
        [
          { id: 'sess-pm', title: 'PM', sessionType: 'talk', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T10:00:00Z'), endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
          { id: 'sess-am', title: 'AM', sessionType: 'talk', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T04:00:00Z'), endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
        ],
        [],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      expect(data.sessions[0].id).toBe('sess-am');
      expect(data.sessions[1].id).toBe('sess-pm');
    });

    it('null sessionDate sorts before dated sessions — empty string < date string', async () => {
      setupDb(
        [
          { id: 'dated', title: 'D', sessionType: 'talk', sessionDate: new Date('2026-04-10'), startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
          { id: 'undated', title: 'U', sessionType: 'talk', sessionDate: null, startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
        ],
        [],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      expect(data.sessions[0].id).toBe('undated');
    });

    it('null optional session fields produce null in JSON (L323-L329 LogicalOperator ??→&&)', async () => {
      setupDb(
        [{ id: 's1', title: 'T', sessionType: 'talk', sessionDate: null, startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null }],
        [],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      const s = data.sessions[0];
      expect(s.date).toBeNull();
      expect(s.startUtc).toBeNull();
      expect(s.endUtc).toBeNull();
      expect(s.hall).toBeNull();
      expect(s.track).toBeNull();
      expect(s.cmeCredits).toBeNull();
      expect(s.parentSessionId).toBeNull();
    });

    it('non-null optional fields preserved (kills ??→&& on L325-L329)', async () => {
      setupDb(
        [{ id: 's1', title: 'T', sessionType: 'talk', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T05:00:00Z'), endAtUtc: new Date('2026-04-10T06:00:00Z'), hallName: 'Hall A', track: 'Main', status: 'scheduled', cmeCredits: 2, parentSessionId: 'p-1' }],
        [{ sessionId: 's1', personName: 'Dr. X', personEmail: 'x@t.com', role: 'speaker' }],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      const s = data.sessions[0];
      expect(s.date).toBe('2026-04-10');
      expect(s.startUtc).toBeTruthy();
      expect(s.endUtc).toBeTruthy();
      expect(s.hall).toBe('Hall A');
      expect(s.track).toBe('Main');
      expect(s.cmeCredits).toBe(2);
      expect(s.parentSessionId).toBe('p-1');
    });

    it('date field sliced to 10 chars (L322 MethodExpression kills slice removal)', async () => {
      setupDb(
        [{ id: 's1', title: 'T', sessionType: 'talk', sessionDate: new Date('2026-04-10T00:00:00Z'), startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null }],
        [],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      expect(data.sessions[0].date).toBe('2026-04-10');
      expect(data.sessions[0].date).toHaveLength(10);
    });

    it('session with no assignments gets empty faculty array (L330 ArrayDeclaration)', async () => {
      setupDb(
        [{ id: 'orphan', title: 'No Faculty', sessionType: 'plenary', sessionDate: null, startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null }],
        [],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      expect(data.sessions[0].faculty).toEqual([]);
    });

    it('same-date: null startUtc sorts before non-null (L338:20 LogicalOperator, L338:34/L339:34 NoCoverage)', async () => {
      setupDb(
        [
          { id: 'sess-timed', title: 'T', sessionType: 'talk', sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T09:00:00Z'), endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
          { id: 'sess-notime', title: 'NT', sessionType: 'talk', sessionDate: new Date('2026-04-10'), startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
        ],
        [],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      // null startUtc → '' sorts before ISO timestamp string
      expect(data.sessions[0].id).toBe('sess-notime');
      expect(data.sessions[1].id).toBe('sess-timed');
    });

    it('program.sort called (L334 MethodExpression kill)', async () => {
      // Three sessions in wrong order — if sort is removed, order stays as-is
      setupDb(
        [
          { id: 'c', title: 'C', sessionType: 'talk', sessionDate: new Date('2026-04-12'), startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
          { id: 'a', title: 'A', sessionType: 'talk', sessionDate: new Date('2026-04-10'), startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
          { id: 'b', title: 'B', sessionType: 'talk', sessionDate: new Date('2026-04-11'), startAtUtc: null, endAtUtc: null, hallName: null, track: null, status: 'scheduled', cmeCredits: null, parentSessionId: null },
        ],
        [],
      );
      const data = JSON.parse((await generateProgramJson(EID)).toString());
      expect(data.sessions.map((s: { id: string }) => s.id)).toEqual(['a', 'b', 'c']);
    });
  });

  // ── generateCertificateKeysJson (L357, L359) ──────────────────

  describe('generateCertificateKeysJson', () => {
    it('JSON has generatedAt ISO string and certificates array', async () => {
      setupDb([{ storageKey: 'k1', fileName: 'f1.pdf', certificateType: 'delegate', status: 'issued' }]);
      const data = JSON.parse((await generateCertificateKeysJson(EID)).toString());
      expect(data.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Array.isArray(data.certificates)).toBe(true);
      expect(data.certificates[0].storageKey).toBe('k1');
    });
  });

  // ── generateEmergencyKit archiver options (L385, L387) ────────

  describe('generateEmergencyKit archiver options', () => {
    it('archiver called with "zip" format and level 6 (L385 StringLiteral + ObjectLiteral)', async () => {
      setupDb([], [], [], [], [], [], [], [], []);
      await generateEmergencyKit({ eventId: EID, storageProvider: stubStorageNoStream() });
      const archiverFn = (await import('archiver')).default as unknown as ReturnType<typeof vi.fn>;
      expect(archiverFn).toHaveBeenCalledWith('zip', { zlib: { level: 6 } });
    });

    it('archive.on first arg is "error" not empty string (L387 StringLiteral)', async () => {
      setupDb([], [], [], [], [], [], [], [], []);
      await generateEmergencyKit({ eventId: EID, storageProvider: stubStorageNoStream() });
      const archiverFn = (await import('archiver')).default as unknown as ReturnType<typeof vi.fn>;
      const lastArchive = (archiverFn as any).mock.results.slice(-1)[0]?.value;
      expect(lastArchive.on.mock.calls[0][0]).toBe('error');
    });

    it('upload called with "application/zip" MIME type (L427 StringLiteral)', async () => {
      setupDb([], [], [], [], [], [], [], [], []);
      const storage = stubStorageNoStream();
      await generateEmergencyKit({ eventId: EID, storageProvider: storage });
      expect(storage.upload).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Buffer),
        'application/zip',
      );
    });

    it('getSignedUrl called with 3600 expiry (L431 numeric)', async () => {
      setupDb([], [], [], [], [], [], [], [], []);
      const storage = stubStorageNoStream();
      await generateEmergencyKit({ eventId: EID, storageProvider: storage });
      expect(storage.getSignedUrl).toHaveBeenCalledWith(expect.any(String), 3600);
    });

    it('storageKeyOverride is used when provided (L409 ConditionalExpression)', async () => {
      setupDb([], [], [], [], [], [], [], [], []);
      const storage = stubStorageNoStream();
      const result = await generateEmergencyKit({
        eventId: EID,
        storageProvider: storage,
        storageKeyOverride: 'events/evt-mk-001/emergency-kit/pre-event-backup.zip',
      });
      expect(result.storageKey).toBe('events/evt-mk-001/emergency-kit/pre-event-backup.zip');
    });

    it('fallback path: sizeBytes reflects actual buffer length (L419 ArrowFunction kill)', async () => {
      setupDb([], [], [], [], [], [], [], [], []);
      const storage = stubStorageNoStream();
      const result = await generateEmergencyKit({ eventId: EID, storageProvider: storage });
      // Mock writes 'PK-mock-zip-data-12345' (21 bytes) — sizeBytes > 0
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it('uploadStream path used when storageProvider.uploadStream exists (L412 ConditionalExpression)', async () => {
      setupDb([], [], [], [], [], [], [], [], []);
      const storage = stubStorageWithStream();
      const result = await generateEmergencyKit({ eventId: EID, storageProvider: storage });
      expect(storage.uploadStream).toHaveBeenCalledOnce();
      expect(storage.upload).not.toHaveBeenCalled();
      expect(result.sizeBytes).toBe(2048);
    });

    it('uploadStream called with "application/zip" MIME (L413 StringLiteral)', async () => {
      setupDb([], [], [], [], [], [], [], [], []);
      const storage = stubStorageWithStream();
      await generateEmergencyKit({ eventId: EID, storageProvider: storage });
      expect(storage.uploadStream).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        'application/zip',
      );
    });
  });

  // ── findEventsNeedingBackup 48h arithmetic (L442, L455) ───────

  describe('findEventsNeedingBackup', () => {
    it('gte lower bound ≈ now, lte upper bound ≈ now+48h (kills L442 ArithmeticOperator)', async () => {
      setupDb([]);
      const { gte, lte } = await import('drizzle-orm');

      const before = Date.now();
      await findEventsNeedingBackup();
      const after = Date.now();

      const gteDate = (gte as ReturnType<typeof vi.fn>).mock.calls[0][1] as Date;
      const lteDate = (lte as ReturnType<typeof vi.fn>).mock.calls[0][1] as Date;

      // Lower bound must be within ~1s of "now"
      expect(gteDate.getTime()).toBeGreaterThanOrEqual(before - 100);
      expect(gteDate.getTime()).toBeLessThanOrEqual(after + 100);

      // Upper bound must be 47–49h from now
      expect(lteDate.getTime()).toBeGreaterThan(before + 47 * 3600 * 1000);
      expect(lteDate.getTime()).toBeLessThan(after + 49 * 3600 * 1000);
    });

    it('inArray called with ["draft","published"] — not empty, not misspelled (L455)', async () => {
      setupDb([]);
      const { inArray } = await import('drizzle-orm');

      await findEventsNeedingBackup();

      expect(inArray as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        expect.anything(),
        ['draft', 'published'],
      );
    });
  });
});
