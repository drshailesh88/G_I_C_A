import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

// ── Mock Setup ─────────────────────────────────────────────────

const mockDb = {
  select: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, {
    get: () => mockDb.select,
  }),
}));

// Capture withEventScope calls to verify eventId filtering
const mockWithEventScope = vi.fn((_col: unknown, eventId: string, ..._rest: unknown[]) => {
  return { eventId }; // Return marker so we can verify
});

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: (...args: unknown[]) => mockWithEventScope(...(args as [unknown, string, ...unknown[]])),
}));

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, getSQL: () => name });
  return {
    eventRegistrations: { eventId: col('event_id'), personId: col('person_id'), id: col('id'), registrationNumber: col('reg'), category: col('cat'), status: col('status'), registeredAt: col('registered_at') },
    people: { id: col('id'), fullName: col('full_name'), email: col('email'), phoneE164: col('phone'), designation: col('designation'), specialty: col('specialty'), organization: col('org'), city: col('city') },
    travelRecords: { eventId: col('event_id'), personId: col('person_id'), id: col('id'), direction: col('dir'), travelMode: col('mode'), fromCity: col('from'), toCity: col('to'), departureAtUtc: col('dep'), arrivalAtUtc: col('arr'), carrierName: col('carrier'), serviceNumber: col('svc'), pnrOrBookingRef: col('pnr'), recordStatus: col('status') },
    accommodationRecords: { eventId: col('event_id'), personId: col('person_id'), id: col('id'), hotelName: col('hotel'), roomType: col('room_type'), roomNumber: col('room_num'), sharedRoomGroup: col('shared'), checkInDate: col('ci'), checkOutDate: col('co'), specialRequests: col('special'), recordStatus: col('status') },
    transportBatches: { eventId: col('event_id'), id: col('id'), movementType: col('movement'), serviceDate: col('date'), timeWindowStart: col('start'), timeWindowEnd: col('end'), sourceCity: col('city'), pickupHub: col('pickup'), dropHub: col('drop'), batchStatus: col('status') },
    vehicleAssignments: { eventId: col('event_id'), id: col('id'), batchId: col('batch_id'), vehicleLabel: col('label'), vehicleType: col('type'), plateNumber: col('plate'), driverName: col('driver'), capacity: col('cap') },
    transportPassengerAssignments: { eventId: col('event_id'), batchId: col('batch_id'), vehicleAssignmentId: col('vehicle_id'), personId: col('person_id'), fullName: col('name'), assignmentStatus: col('status') },
    sessions: { id: col('id'), eventId: col('event_id'), title: col('title'), sessionType: col('type'), sessionDate: col('date'), startAtUtc: col('start'), endAtUtc: col('end'), hallId: col('hall_id') },
    sessionAssignments: { eventId: col('event_id'), sessionId: col('session_id'), personId: col('person_id'), role: col('role'), presentationTitle: col('pres_title') },
    attendanceRecords: { eventId: col('event_id'), personId: col('person_id'), registrationId: col('reg_id'), sessionId: col('session_id'), checkInMethod: col('method'), checkInAt: col('check_in_at') },
    halls: { id: col('id'), eventId: col('hall_event_id'), name: col('name') },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  ne: vi.fn(),
}));

import { generateExport, type ExportType } from './excel';

// ── Helpers ────────────────────────────────────────────────────

function createChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseWorkbook(buffer: any): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function getSheetRows(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return; // Skip header
    rows.push(row.values as string[]);
  });
  return rows;
}

function getHeaders(ws: ExcelJS.Worksheet): string[] {
  const row = ws.getRow(1);
  const headers: string[] = [];
  row.eachCell((cell) => {
    headers.push(String(cell.value));
  });
  return headers;
}

const EVENT_A = '11111111-1111-4111-8111-111111111111';
const EVENT_B = '22222222-2222-4222-8222-222222222222';

// ── Tests: 3 per export type ───────────────────────────────────

describe('Excel Export Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Attendee List ─────────────────────────────────────────

  describe('attendee-list', () => {
    const sampleRows = [
      {
        regNumber: 'GEM-DEL-001',
        category: 'delegate',
        status: 'confirmed',
        registeredAt: new Date('2026-04-01T10:00:00Z'),
        fullName: 'Dr. Alice Smith',
        email: 'alice@example.com',
        phone: '+919876543210',
        designation: 'Surgeon',
        specialty: 'Cardiology',
        organization: 'AIIMS',
        city: 'Delhi',
      },
      {
        regNumber: 'GEM-FAC-002',
        category: 'faculty',
        status: 'confirmed',
        registeredAt: new Date('2026-04-02T10:00:00Z'),
        fullName: 'Prof. Bob Jones',
        email: 'bob@example.com',
        phone: '+919876543211',
        designation: 'Professor',
        specialty: 'Neurology',
        organization: 'CMC',
        city: 'Vellore',
      },
    ];

    it('returns correct number of rows', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'attendee-list');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Attendee List')!;
      expect(ws.rowCount).toBe(3); // 1 header + 2 data rows
    });

    it('has correct column headers', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'attendee-list');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Attendee List')!;
      const headers = getHeaders(ws);
      expect(headers).toContain('Reg #');
      expect(headers).toContain('Full Name');
      expect(headers).toContain('Email');
      expect(headers).toContain('Category');
      expect(headers).toContain('Status');
      expect(headers).toContain('Organization');
    });

    it('scopes query by eventId (no cross-event leak)', async () => {
      setupDbReturn([]);
      await generateExport(EVENT_A, 'attendee-list');
      expect(mockWithEventScope).toHaveBeenCalledWith(
        expect.anything(),
        EVENT_A,
      );
      // Must NOT have been called with EVENT_B
      for (const call of mockWithEventScope.mock.calls) {
        expect(call[1]).not.toBe(EVENT_B);
      }
    });
  });

  // ── 2. Travel Roster ─────────────────────────────────────────

  describe('travel-roster', () => {
    const sampleRows = [
      {
        fullName: 'Dr. Alice Smith',
        email: 'alice@example.com',
        phone: '+919876543210',
        direction: 'inbound',
        travelMode: 'flight',
        fromCity: 'Delhi',
        toCity: 'Mumbai',
        departureAtUtc: new Date('2026-04-10T06:00:00Z'),
        arrivalAtUtc: new Date('2026-04-10T08:30:00Z'),
        carrierName: 'IndiGo',
        serviceNumber: '6E-123',
        pnr: 'ABC123',
        recordStatus: 'confirmed',
      },
    ];

    it('returns correct number of rows', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'travel-roster');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Travel Roster')!;
      expect(ws.rowCount).toBe(2); // 1 header + 1 data
    });

    it('has correct column headers', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'travel-roster');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Travel Roster')!;
      const headers = getHeaders(ws);
      expect(headers).toContain('Name');
      expect(headers).toContain('Direction');
      expect(headers).toContain('Mode');
      expect(headers).toContain('From');
      expect(headers).toContain('To');
      expect(headers).toContain('PNR');
    });

    it('scopes query by eventId (no cross-event leak)', async () => {
      setupDbReturn([]);
      await generateExport(EVENT_B, 'travel-roster');
      expect(mockWithEventScope).toHaveBeenCalled();
      expect(mockWithEventScope.mock.calls[0][1]).toBe(EVENT_B);
    });
  });

  // ── 3. Rooming List ──────────────────────────────────────────

  describe('rooming-list', () => {
    const sampleRows = [
      {
        fullName: 'Dr. Alice Smith',
        email: 'alice@example.com',
        phone: '+919876543210',
        hotelName: 'Hotel Leela',
        roomType: 'Deluxe',
        roomNumber: '301',
        sharedRoomGroup: 'G1',
        checkInDate: new Date('2026-04-09'),
        checkOutDate: new Date('2026-04-12'),
        specialRequests: 'Vegetarian meals',
        recordStatus: 'confirmed',
      },
      {
        fullName: 'Prof. Bob Jones',
        email: 'bob@example.com',
        phone: '+919876543211',
        hotelName: 'Hotel Leela',
        roomType: 'Deluxe',
        roomNumber: '302',
        sharedRoomGroup: 'G1',
        checkInDate: new Date('2026-04-09'),
        checkOutDate: new Date('2026-04-12'),
        specialRequests: null,
        recordStatus: 'confirmed',
      },
    ];

    it('returns correct number of rows', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'rooming-list');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Rooming List')!;
      expect(ws.rowCount).toBe(3); // 1 header + 2 data
    });

    it('has correct column headers including hotel grouping', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'rooming-list');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Rooming List')!;
      const headers = getHeaders(ws);
      expect(headers).toContain('Hotel');
      expect(headers).toContain('Room Type');
      expect(headers).toContain('Room #');
      expect(headers).toContain('Shared Group');
      expect(headers).toContain('Check-In');
      expect(headers).toContain('Check-Out');
    });

    it('scopes query by eventId (no cross-event leak)', async () => {
      setupDbReturn([]);
      await generateExport(EVENT_A, 'rooming-list');
      expect(mockWithEventScope).toHaveBeenCalled();
      expect(mockWithEventScope.mock.calls[0][1]).toBe(EVENT_A);
    });
  });

  // ── 4. Transport Plan ────────────────────────────────────────

  describe('transport-plan', () => {
    const batchId = 'batch-001';
    const vehicleId = 'vehicle-001';

    const batchRows = [
      {
        batchId,
        movementType: 'arrival',
        serviceDate: new Date('2026-04-10'),
        timeWindowStart: new Date('2026-04-10T06:00:00Z'),
        timeWindowEnd: new Date('2026-04-10T09:00:00Z'),
        sourceCity: 'Mumbai',
        pickupHub: 'BOM T2',
        dropHub: 'Hotel Leela',
        batchStatus: 'planned',
      },
    ];

    const vehicleRows = [
      {
        vehicleId,
        batchId,
        vehicleLabel: 'Van-1',
        vehicleType: 'van',
        plateNumber: 'MH-01-AB-1234',
        driverName: 'Rajesh',
        capacity: 12,
      },
    ];

    const passengerRows = [
      {
        batchId,
        vehicleAssignmentId: vehicleId,
        fullName: 'Dr. Alice Smith',
        phone: '+919876543210',
        assignmentStatus: 'assigned',
      },
    ];

    it('returns correct number of rows across both sheets', async () => {
      setupDbReturn(batchRows, vehicleRows, passengerRows);
      const buffer = await generateExport(EVENT_A, 'transport-plan');
      const wb = await parseWorkbook(buffer);
      const batchSheet = wb.getWorksheet('Batches')!;
      const passengerSheet = wb.getWorksheet('Passengers')!;
      expect(batchSheet.rowCount).toBe(2); // 1 header + 1 batch
      expect(passengerSheet.rowCount).toBe(2); // 1 header + 1 passenger
    });

    it('has correct column headers on both sheets', async () => {
      setupDbReturn(batchRows, vehicleRows, passengerRows);
      const buffer = await generateExport(EVENT_A, 'transport-plan');
      const wb = await parseWorkbook(buffer);
      const batchHeaders = getHeaders(wb.getWorksheet('Batches')!);
      expect(batchHeaders).toContain('Movement');
      expect(batchHeaders).toContain('Pickup Hub');
      expect(batchHeaders).toContain('Vehicles');
      expect(batchHeaders).toContain('Passengers');

      const passHeaders = getHeaders(wb.getWorksheet('Passengers')!);
      expect(passHeaders).toContain('Vehicle');
      expect(passHeaders).toContain('Passenger');
    });

    it('scopes all 3 queries by eventId (no cross-event leak)', async () => {
      setupDbReturn([], [], []);
      await generateExport(EVENT_A, 'transport-plan');
      // Transport plan makes 3 db.select() calls — all must scope to EVENT_A
      expect(mockWithEventScope).toHaveBeenCalledTimes(3);
      for (const call of mockWithEventScope.mock.calls) {
        expect(call[1]).toBe(EVENT_A);
      }
    });
  });

  // ── 5. Faculty Responsibilities ──────────────────────────────

  describe('faculty-responsibilities', () => {
    const sampleRows = [
      {
        fullName: 'Prof. Bob Jones',
        email: 'bob@example.com',
        phone: '+919876543211',
        designation: 'Professor',
        sessionTitle: 'Keynote: Future of Cardiology',
        sessionType: 'keynote',
        sessionDate: new Date('2026-04-10'),
        startAtUtc: new Date('2026-04-10T09:00:00Z'),
        endAtUtc: new Date('2026-04-10T10:00:00Z'),
        role: 'speaker',
        presentationTitle: 'Heart Repair Techniques',
        hallName: 'Hall A',
      },
    ];

    it('returns correct number of rows', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'faculty-responsibilities');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Faculty Responsibilities')!;
      expect(ws.rowCount).toBe(2); // 1 header + 1 data
    });

    it('has correct column headers', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'faculty-responsibilities');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Faculty Responsibilities')!;
      const headers = getHeaders(ws);
      expect(headers).toContain('Faculty Name');
      expect(headers).toContain('Session');
      expect(headers).toContain('Role');
      expect(headers).toContain('Hall');
      expect(headers).toContain('Presentation');
    });

    it('scopes query by eventId (no cross-event leak)', async () => {
      setupDbReturn([]);
      await generateExport(EVENT_B, 'faculty-responsibilities');
      expect(mockWithEventScope).toHaveBeenCalledWith(
        expect.anything(),
        EVENT_B,
      );
    });

    it('event-scopes joined session and hall metadata to prevent cross-tenant leakage', async () => {
      setupDbReturn([
        {
          fullName: 'Prof. Bob Jones',
          email: 'bob@example.com',
          phone: '+919876543211',
          designation: 'Professor',
          sessionTitle: 'Scoped Session',
          sessionType: 'keynote',
          sessionDate: new Date('2026-04-10'),
          startAtUtc: new Date('2026-04-10T09:00:00Z'),
          endAtUtc: new Date('2026-04-10T10:00:00Z'),
          role: 'speaker',
          presentationTitle: 'Heart Repair Techniques',
          hallName: 'Hall A',
        },
      ]);

      await generateExport(EVENT_A, 'faculty-responsibilities');

      const eventScopedCalls = mockWithEventScope.mock.calls.filter(
        ([column, scopedEventId]) =>
          (column as { name?: string } | undefined)?.name === 'event_id'
          && scopedEventId === EVENT_A,
      );
      const hallJoinScoped = mockWithEventScope.mock.calls.some(
        ([column, scopedEventId]) =>
          (column as { name?: string } | undefined)?.name === 'hall_event_id'
          && scopedEventId === EVENT_A,
      );

      expect(eventScopedCalls).toHaveLength(2);
      expect(hallJoinScoped).toBe(true);
    });
  });

  // ── 6. Attendance Report ─────────────────────────────────────

  describe('attendance-report', () => {
    const sampleRows = [
      {
        fullName: 'Dr. Alice Smith',
        email: 'alice@example.com',
        phone: '+919876543210',
        regNumber: 'GEM-DEL-001',
        category: 'delegate',
        checkInMethod: 'qr_scan',
        checkInAt: new Date('2026-04-10T09:15:00Z'),
        sessionTitle: null,
      },
      {
        fullName: 'Prof. Bob Jones',
        email: 'bob@example.com',
        phone: '+919876543211',
        regNumber: 'GEM-FAC-002',
        category: 'faculty',
        checkInMethod: 'manual_search',
        checkInAt: new Date('2026-04-10T09:30:00Z'),
        sessionTitle: 'Keynote: Future of Cardiology',
      },
    ];

    it('returns correct number of rows', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'attendance-report');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Attendance Report')!;
      expect(ws.rowCount).toBe(3); // 1 header + 2 data
    });

    it('has correct column headers', async () => {
      setupDbReturn(sampleRows);
      const buffer = await generateExport(EVENT_A, 'attendance-report');
      const wb = await parseWorkbook(buffer);
      const ws = wb.getWorksheet('Attendance Report')!;
      const headers = getHeaders(ws);
      expect(headers).toContain('Name');
      expect(headers).toContain('Reg #');
      expect(headers).toContain('Session');
      expect(headers).toContain('Check-In Method');
      expect(headers).toContain('Check-In Time');
    });

    it('scopes query by eventId (no cross-event leak)', async () => {
      setupDbReturn([]);
      await generateExport(EVENT_A, 'attendance-report');
      expect(mockWithEventScope).toHaveBeenCalledWith(
        expect.anything(),
        EVENT_A,
      );
    });

    it('event-scopes joined registration and session metadata to prevent cross-tenant leakage', async () => {
      setupDbReturn([
        {
          fullName: 'Dr. Alice Smith',
          email: 'alice@example.com',
          phone: '+919876543210',
          regNumber: 'GEM-DEL-001',
          category: 'delegate',
          checkInMethod: 'qr_scan',
          checkInAt: new Date('2026-04-10T09:15:00Z'),
          sessionTitle: 'Scoped Session',
        },
      ]);

      await generateExport(EVENT_A, 'attendance-report');

      const eventScopedCalls = mockWithEventScope.mock.calls.filter(
        ([column, scopedEventId]) =>
          (column as { name?: string } | undefined)?.name === 'event_id'
          && scopedEventId === EVENT_A,
      );

      expect(eventScopedCalls).toHaveLength(3);
    });
  });

  // ── Invalid export type ──────────────────────────────────────

  describe('invalid type', () => {
    it('throws for unknown export type', async () => {
      await expect(
        generateExport(EVENT_A, 'invalid-type' as ExportType),
      ).rejects.toThrow('Unknown export type');
    });

    it('rejects a malformed eventId before database access', async () => {
      await expect(
        generateExport('not-a-uuid', 'attendee-list'),
      ).rejects.toThrow('Invalid event ID');
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });
});
