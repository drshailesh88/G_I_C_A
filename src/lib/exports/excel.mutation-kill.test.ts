import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

// ── Mock Setup (mirrors excel.test.ts) ─────────────────────────

const mockDb = {
  select: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, {
    get: () => mockDb.select,
  }),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn((_col: unknown, _eventId: string, ..._rest: unknown[]) => ({ eventId: _eventId })),
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
    halls: { id: col('id'), name: col('name') },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  ne: vi.fn(),
}));

import { generateExport } from './excel';

// ── Helpers ────────────────────────────────────────────────────

function createChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
  };
}

function setupDbReturn(...rowSets: unknown[][]) {
  let callIdx = 0;
  mockDb.select.mockImplementation(() => {
    const rows = rowSets[callIdx] ?? [];
    callIdx++;
    return createChain(rows);
  });
}

async function parseWorkbook(buffer: unknown): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ExcelJS.Buffer);
  return wb;
}

function getHeaders(ws: ExcelJS.Worksheet): string[] {
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell) => headers.push(String(cell.value)));
  return headers;
}

// Read row 2 cell values by column index (1-based), skipping index 0
function getRowValues(ws: ExcelJS.Worksheet, rowNum = 2): (unknown)[] {
  const vals: unknown[] = [];
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= ws.columnCount; c++) {
    vals.push(row.getCell(c).value ?? null);
  }
  return vals;
}

const EVENT = 'evt-harden-001';

// ── Tests ──────────────────────────────────────────────────────

describe('Excel mutation-kill suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── HEADER_FILL / HEADER_FONT / HEADER_ALIGNMENT ────────────

  it('header cells have correct fill, font, and alignment (kills L36-51 constant mutants)', async () => {
    setupDbReturn([{
      regNumber: 'R-001', category: 'delegate', status: 'confirmed',
      registeredAt: new Date('2026-04-10T09:00:00Z'),
      fullName: 'Alice', email: 'a@test.com', phone: '+91999',
      designation: 'Dr', specialty: 'Cardio', organization: 'AIIMS', city: 'Delhi',
    }]);
    const buffer = await generateExport(EVENT, 'attendee-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendee List')!;

    const cell = ws.getRow(1).getCell(1);

    const fill = cell.fill as ExcelJS.FillPattern;
    expect(fill.type).toBe('pattern');
    expect(fill.pattern).toBe('solid');
    expect(fill.fgColor?.argb).toBe('FF1F4E79');

    expect(cell.font?.bold).toBe(true);
    expect(cell.font?.color?.argb).toBe('FFFFFFFF');
    expect(cell.font?.size).toBe(11);

    expect(cell.alignment?.vertical).toBe('middle');
    expect(cell.alignment?.horizontal).toBe('center');
    expect(cell.alignment?.wrapText).toBe(true);
  });

  // ── formatDate / formatDateTime ──────────────────────────────

  it('formatDateTime: formats date as "YYYY-MM-DD HH:MM:SS" with space separator (kills L82 StringLiteral mutants)', async () => {
    setupDbReturn([{
      regNumber: 'R-001', category: 'delegate', status: 'confirmed',
      registeredAt: new Date('2026-04-10T09:15:30.123Z'),
      fullName: 'Alice', email: 'a@test.com', phone: '+91999',
      designation: 'Dr', specialty: 'Cardio', organization: 'AIIMS', city: 'Delhi',
    }]);
    const buffer = await generateExport(EVENT, 'attendee-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendee List')!;
    // Column 11 is registeredAt (formatDateTime)
    expect(ws.getRow(2).getCell(11).value).toBe('2026-04-10 09:15:30');
  });

  it('formatDateTime: null date returns empty string (kills L81 ConditionalExpression/BooleanLiteral mutants)', async () => {
    setupDbReturn([{
      regNumber: 'R-001', category: 'delegate', status: 'confirmed',
      registeredAt: null,
      fullName: 'Alice', email: 'a@test.com', phone: '+91999',
      designation: 'Dr', specialty: 'Cardio', organization: 'AIIMS', city: 'Delhi',
    }]);
    const buffer = await generateExport(EVENT, 'attendee-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendee List')!;
    expect(ws.getRow(2).getCell(11).value).toBe('');
  });

  it('formatDate: formats date to YYYY-MM-DD only (kills L77 MethodExpression + slice mutants)', async () => {
    setupDbReturn([{
      fullName: 'Alice', email: 'a@test.com', phone: '+91999',
      hotelName: 'Grand', roomType: 'Deluxe', roomNumber: '101',
      sharedRoomGroup: null, checkInDate: new Date('2026-04-09T00:00:00Z'),
      checkOutDate: new Date('2026-04-12T00:00:00Z'),
      specialRequests: null, recordStatus: 'confirmed',
    }]);
    const buffer = await generateExport(EVENT, 'rooming-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Rooming List')!;
    // Column 8 = checkInDate, Column 9 = checkOutDate
    expect(ws.getRow(2).getCell(8).value).toBe('2026-04-09');
    expect(ws.getRow(2).getCell(9).value).toBe('2026-04-12');
  });

  it('formatDate: null date returns empty string (kills L76 ConditionalExpression/BooleanLiteral mutants)', async () => {
    setupDbReturn([{
      fullName: 'Alice', email: 'a@test.com', phone: '+91999',
      hotelName: 'Grand', roomType: 'Deluxe', roomNumber: '101',
      sharedRoomGroup: null, checkInDate: null, checkOutDate: null,
      specialRequests: null, recordStatus: 'confirmed',
    }]);
    const buffer = await generateExport(EVENT, 'rooming-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Rooming List')!;
    expect(ws.getRow(2).getCell(8).value).toBe('');
    expect(ws.getRow(2).getCell(9).value).toBe('');
  });

  // ── Attendee List: exact headers + cell values ───────────────

  it('attendee-list: exact column headers (kills L110-120 header StringLiteral + ObjectLiteral mutants)', async () => {
    setupDbReturn([]);
    const buffer = await generateExport(EVENT, 'attendee-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendee List')!;
    expect(getHeaders(ws)).toEqual([
      'Reg #', 'Full Name', 'Email', 'Phone', 'Category', 'Status',
      'Designation', 'Specialty', 'Organization', 'City', 'Registered At',
    ]);
  });

  it('attendee-list: cell values map to correct columns (kills L110-120 key StringLiteral mutants)', async () => {
    setupDbReturn([{
      regNumber: 'GEM-001',
      fullName: 'Alice Smith',
      email: 'alice@example.com',
      phone: '+919876543210',
      category: 'delegate',
      status: 'confirmed',
      designation: 'Surgeon',
      specialty: 'Cardiology',
      organization: 'AIIMS',
      city: 'Delhi',
      registeredAt: new Date('2026-04-01T10:00:00Z'),
    }]);
    const buffer = await generateExport(EVENT, 'attendee-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendee List')!;
    const vals = getRowValues(ws);
    expect(vals[0]).toBe('GEM-001');       // col 1: regNumber
    expect(vals[1]).toBe('Alice Smith');   // col 2: fullName
    expect(vals[2]).toBe('alice@example.com'); // col 3: email
    expect(vals[3]).toBe('+919876543210'); // col 4: phone
    expect(vals[4]).toBe('delegate');      // col 5: category
    expect(vals[5]).toBe('confirmed');     // col 6: status
    expect(vals[6]).toBe('Surgeon');       // col 7: designation
    expect(vals[7]).toBe('Cardiology');    // col 8: specialty
    expect(vals[8]).toBe('AIIMS');         // col 9: organization
    expect(vals[9]).toBe('Delhi');         // col 10: city
    expect(vals[10]).toBe('2026-04-01 10:00:00'); // col 11: registeredAt
  });

  // ── Travel Roster: exact headers + cell values ───────────────

  it('travel-roster: exact column headers (kills L165-177 header StringLiteral + ObjectLiteral mutants)', async () => {
    setupDbReturn([]);
    const buffer = await generateExport(EVENT, 'travel-roster');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Travel Roster')!;
    expect(getHeaders(ws)).toEqual([
      'Name', 'Email', 'Phone', 'Direction', 'Mode', 'From', 'To',
      'Departure', 'Arrival', 'Carrier', 'Flight/Train #', 'PNR', 'Status',
    ]);
  });

  it('travel-roster: cell values map to correct columns (kills L165-177 key StringLiteral mutants)', async () => {
    setupDbReturn([{
      fullName: 'Dr. Alice',
      email: 'alice@test.com',
      phone: '+911234567890',
      direction: 'inbound',
      travelMode: 'flight',
      fromCity: 'Delhi',
      toCity: 'Mumbai',
      departureAtUtc: new Date('2026-04-10T06:00:00Z'),
      arrivalAtUtc: new Date('2026-04-10T08:30:00Z'),
      carrierName: 'IndiGo',
      serviceNumber: '6E-123',
      pnr: 'PNR456',
      recordStatus: 'confirmed',
    }]);
    const buffer = await generateExport(EVENT, 'travel-roster');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Travel Roster')!;
    const vals = getRowValues(ws);
    expect(vals[0]).toBe('Dr. Alice');          // col 1: fullName
    expect(vals[1]).toBe('alice@test.com');     // col 2: email
    expect(vals[2]).toBe('+911234567890');      // col 3: phone
    expect(vals[3]).toBe('inbound');            // col 4: direction
    expect(vals[4]).toBe('flight');             // col 5: travelMode
    expect(vals[5]).toBe('Delhi');              // col 6: fromCity
    expect(vals[6]).toBe('Mumbai');             // col 7: toCity
    expect(vals[7]).toBe('2026-04-10 06:00:00'); // col 8: departureAtUtc
    expect(vals[8]).toBe('2026-04-10 08:30:00'); // col 9: arrivalAtUtc
    expect(vals[9]).toBe('IndiGo');             // col 10: carrierName
    expect(vals[10]).toBe('6E-123');            // col 11: serviceNumber
    expect(vals[11]).toBe('PNR456');            // col 12: pnr
    expect(vals[12]).toBe('confirmed');         // col 13: recordStatus
  });

  // ── Rooming List: exact headers + cell values + sort ────────

  it('rooming-list: exact column headers (kills L228-238 header StringLiteral + ObjectLiteral mutants)', async () => {
    setupDbReturn([]);
    const buffer = await generateExport(EVENT, 'rooming-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Rooming List')!;
    expect(getHeaders(ws)).toEqual([
      'Hotel', 'Name', 'Email', 'Phone', 'Room Type', 'Room #',
      'Shared Group', 'Check-In', 'Check-Out', 'Special Requests', 'Status',
    ]);
  });

  it('rooming-list: cell values map to correct columns (kills L228-238 key StringLiteral mutants)', async () => {
    setupDbReturn([{
      fullName: 'Bob Jones',
      email: 'bob@test.com',
      phone: '+912222222222',
      hotelName: 'Leela',
      roomType: 'Deluxe',
      roomNumber: '301',
      sharedRoomGroup: 'G1',
      checkInDate: new Date('2026-04-09T00:00:00Z'),
      checkOutDate: new Date('2026-04-12T00:00:00Z'),
      specialRequests: 'Veg only',
      recordStatus: 'confirmed',
    }]);
    const buffer = await generateExport(EVENT, 'rooming-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Rooming List')!;
    const vals = getRowValues(ws);
    expect(vals[0]).toBe('Leela');         // col 1: hotelName
    expect(vals[1]).toBe('Bob Jones');     // col 2: fullName
    expect(vals[2]).toBe('bob@test.com');  // col 3: email
    expect(vals[3]).toBe('+912222222222'); // col 4: phone
    expect(vals[4]).toBe('Deluxe');        // col 5: roomType
    expect(vals[5]).toBe('301');           // col 6: roomNumber
    expect(vals[6]).toBe('G1');            // col 7: sharedRoomGroup
    expect(vals[7]).toBe('2026-04-09');    // col 8: checkInDate
    expect(vals[8]).toBe('2026-04-12');    // col 9: checkOutDate
    expect(vals[9]).toBe('Veg only');      // col 10: specialRequests
    expect(vals[10]).toBe('confirmed');    // col 11: recordStatus
  });

  it('rooming-list: sorts rows by hotel name ascending (kills L222 sort mutants)', async () => {
    // Provide rows in reverse alphabetical order; expect Zeta after Alpha
    setupDbReturn([
      {
        fullName: 'Bob', email: 'b@t.com', phone: '+91', hotelName: 'Zeta Hotel',
        roomType: 'Std', roomNumber: '1', sharedRoomGroup: null,
        checkInDate: new Date('2026-04-09'), checkOutDate: new Date('2026-04-10'),
        specialRequests: null, recordStatus: 'confirmed',
      },
      {
        fullName: 'Alice', email: 'a@t.com', phone: '+91', hotelName: 'Alpha Hotel',
        roomType: 'Std', roomNumber: '2', sharedRoomGroup: null,
        checkInDate: new Date('2026-04-09'), checkOutDate: new Date('2026-04-10'),
        specialRequests: null, recordStatus: 'confirmed',
      },
    ]);
    const buffer = await generateExport(EVENT, 'rooming-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Rooming List')!;
    // After sort: Alpha first, Zeta second
    expect(ws.getRow(2).getCell(1).value).toBe('Alpha Hotel');
    expect(ws.getRow(3).getCell(1).value).toBe('Zeta Hotel');
  });

  it('rooming-list: null hotelName treated as empty string in sort (covers L222 NoCoverage ?? fallbacks)', async () => {
    setupDbReturn([
      {
        fullName: 'Bob', email: 'b@t.com', phone: '+91', hotelName: 'Marriott',
        roomType: 'Std', roomNumber: '1', sharedRoomGroup: null,
        checkInDate: null, checkOutDate: null, specialRequests: null, recordStatus: 'confirmed',
      },
      {
        fullName: 'Alice', email: 'a@t.com', phone: '+91', hotelName: null,
        roomType: 'Std', roomNumber: '2', sharedRoomGroup: null,
        checkInDate: null, checkOutDate: null, specialRequests: null, recordStatus: 'confirmed',
      },
    ]);
    const buffer = await generateExport(EVENT, 'rooming-list');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Rooming List')!;
    // null hotel (→ '') sorts before 'Marriott'
    expect(ws.getRow(2).getCell(1).value).toBe(null);
    expect(ws.getRow(3).getCell(1).value).toBe('Marriott');
  });

  // ── Transport Plan: exact headers + cell values + counts ────

  it('transport-plan: Batches sheet exact column headers (kills L312-321 header StringLiteral + ObjectLiteral mutants)', async () => {
    setupDbReturn([], [], []);
    const buffer = await generateExport(EVENT, 'transport-plan');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Batches')!;
    expect(getHeaders(ws)).toEqual([
      'Movement', 'Date', 'Window Start', 'Window End', 'City',
      'Pickup Hub', 'Drop Hub', 'Status', 'Vehicles', 'Passengers',
    ]);
  });

  it('transport-plan: Passengers sheet exact column headers (kills L342-346 header StringLiteral + ObjectLiteral mutants)', async () => {
    setupDbReturn([], [], []);
    const buffer = await generateExport(EVENT, 'transport-plan');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Passengers')!;
    expect(getHeaders(ws)).toEqual([
      'Batch Pickup', 'Vehicle', 'Passenger', 'Phone', 'Status',
    ]);
  });

  it('transport-plan: Batches cell values map to correct columns (kills L312-321 key StringLiteral mutants)', async () => {
    const batchId = 'batch-001';
    setupDbReturn(
      [{
        batchId,
        movementType: 'arrival',
        serviceDate: new Date('2026-04-10T00:00:00Z'),
        timeWindowStart: new Date('2026-04-10T06:00:00Z'),
        timeWindowEnd: new Date('2026-04-10T09:00:00Z'),
        sourceCity: 'Mumbai',
        pickupHub: 'BOM T2',
        dropHub: 'Hotel Leela',
        batchStatus: 'planned',
      }],
      [{ vehicleId: 'v1', batchId, vehicleLabel: 'Van-1', vehicleType: 'van', plateNumber: 'MH01', driverName: 'Raj', capacity: 12 }],
      [{ batchId, vehicleAssignmentId: 'v1', fullName: 'Alice', phone: '+91', assignmentStatus: 'assigned' }],
    );
    const buffer = await generateExport(EVENT, 'transport-plan');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Batches')!;
    const vals = getRowValues(ws);
    expect(vals[0]).toBe('arrival');             // col 1: movementType
    expect(vals[1]).toBe('2026-04-10');          // col 2: serviceDate
    expect(vals[2]).toBe('2026-04-10 06:00:00'); // col 3: timeWindowStart
    expect(vals[3]).toBe('2026-04-10 09:00:00'); // col 4: timeWindowEnd
    expect(vals[4]).toBe('Mumbai');              // col 5: sourceCity
    expect(vals[5]).toBe('BOM T2');              // col 6: pickupHub
    expect(vals[6]).toBe('Hotel Leela');         // col 7: dropHub
    expect(vals[7]).toBe('planned');             // col 8: batchStatus
    expect(vals[8]).toBe(1);                     // col 9: vehicleCount
    expect(vals[9]).toBe(1);                     // col 10: passengerCount
  });

  it('transport-plan: vehicleCount and passengerCount per batch are correct (kills L325/326 filter mutants)', async () => {
    const batch1 = 'batch-A';
    const batch2 = 'batch-B';
    setupDbReturn(
      [
        { batchId: batch1, movementType: 'arrival', serviceDate: null, timeWindowStart: null, timeWindowEnd: null, sourceCity: 'Del', pickupHub: 'Hub1', dropHub: 'Drop1', batchStatus: 'planned' },
        { batchId: batch2, movementType: 'departure', serviceDate: null, timeWindowStart: null, timeWindowEnd: null, sourceCity: 'Mum', pickupHub: 'Hub2', dropHub: 'Drop2', batchStatus: 'planned' },
      ],
      [
        { vehicleId: 'v1', batchId: batch1, vehicleLabel: 'Van1', vehicleType: 'van', plateNumber: 'P1', driverName: 'D1', capacity: 10 },
        { vehicleId: 'v2', batchId: batch1, vehicleLabel: 'Van2', vehicleType: 'van', plateNumber: 'P2', driverName: 'D2', capacity: 10 },
        { vehicleId: 'v3', batchId: batch2, vehicleLabel: 'Bus1', vehicleType: 'bus', plateNumber: 'P3', driverName: 'D3', capacity: 30 },
      ],
      [
        { batchId: batch1, vehicleAssignmentId: 'v1', fullName: 'P1', phone: '+91', assignmentStatus: 'assigned' },
        { batchId: batch2, vehicleAssignmentId: 'v3', fullName: 'P2', phone: '+91', assignmentStatus: 'assigned' },
        { batchId: batch2, vehicleAssignmentId: 'v3', fullName: 'P3', phone: '+91', assignmentStatus: 'assigned' },
      ],
    );
    const buffer = await generateExport(EVENT, 'transport-plan');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Batches')!;
    // batch-A: 2 vehicles, 1 passenger
    expect(ws.getRow(2).getCell(9).value).toBe(2);  // vehicleCount for batch-A
    expect(ws.getRow(2).getCell(10).value).toBe(1); // passengerCount for batch-A
    // batch-B: 1 vehicle, 2 passengers
    expect(ws.getRow(3).getCell(9).value).toBe(1);  // vehicleCount for batch-B
    expect(ws.getRow(3).getCell(10).value).toBe(2); // passengerCount for batch-B
  });

  it('transport-plan: passenger row uses pickupHub from batchMap (kills L349 ArrayDeclaration + L356 LogicalOperator/OptionalChaining)', async () => {
    const batchId = 'batch-001';
    const vehicleId = 'v-001';
    setupDbReturn(
      [{ batchId, movementType: 'arrival', serviceDate: null, timeWindowStart: null, timeWindowEnd: null, sourceCity: 'Del', pickupHub: 'Airport T1', dropHub: 'Hotel', batchStatus: 'planned' }],
      [{ vehicleId, batchId, vehicleLabel: 'Van-X', vehicleType: 'van', plateNumber: 'P', driverName: 'D', capacity: 10 }],
      [{ batchId, vehicleAssignmentId: vehicleId, fullName: 'Passenger', phone: '+919876', assignmentStatus: 'assigned' }],
    );
    const buffer = await generateExport(EVENT, 'transport-plan');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Passengers')!;
    // col 1 = pickupHub (from batchMap), should be 'Airport T1'
    expect(ws.getRow(2).getCell(1).value).toBe('Airport T1');
    // col 2 = vehicleLabel
    expect(ws.getRow(2).getCell(2).value).toBe('Van-X');
    // col 4 = phone (non-null, kills L359 ??→&& mutant)
    expect(ws.getRow(2).getCell(4).value).toBe('+919876');
  });

  it('transport-plan: null vehicleAssignmentId yields Unassigned (kills L357 ??→&& NoCoverage)', async () => {
    const batchId = 'batch-001';
    setupDbReturn(
      [{ batchId, movementType: 'arrival', serviceDate: null, timeWindowStart: null, timeWindowEnd: null, sourceCity: 'Del', pickupHub: 'Hub', dropHub: 'Drop', batchStatus: 'planned' }],
      [],
      [{ batchId, vehicleAssignmentId: null, fullName: 'Unassigned Pax', phone: null, assignmentStatus: 'pending' }],
    );
    const buffer = await generateExport(EVENT, 'transport-plan');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Passengers')!;
    // vehicle is null → vehicleLabel = 'Unassigned'
    expect(ws.getRow(2).getCell(2).value).toBe('Unassigned');
    // phone is null → ''
    expect(ws.getRow(2).getCell(4).value).toBe('');
  });

  it('transport-plan: vehicleMap lookup uses vehicleAssignmentId (kills L350 ArrayDeclaration mutant)', async () => {
    const batchId = 'batch-001';
    const vehicleId = 'v-unique-99';
    setupDbReturn(
      [{ batchId, movementType: 'arrival', serviceDate: null, timeWindowStart: null, timeWindowEnd: null, sourceCity: 'Del', pickupHub: 'Hub', dropHub: 'Drop', batchStatus: 'planned' }],
      [
        { vehicleId: 'v-other', batchId, vehicleLabel: 'Other Van', vehicleType: 'van', plateNumber: 'P1', driverName: 'D1', capacity: 10 },
        { vehicleId, batchId, vehicleLabel: 'Correct Van', vehicleType: 'van', plateNumber: 'P2', driverName: 'D2', capacity: 10 },
      ],
      [{ batchId, vehicleAssignmentId: vehicleId, fullName: 'Alice', phone: null, assignmentStatus: 'assigned' }],
    );
    const buffer = await generateExport(EVENT, 'transport-plan');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Passengers')!;
    // passenger is assigned to v-unique-99 → vehicleLabel must be 'Correct Van'
    expect(ws.getRow(2).getCell(2).value).toBe('Correct Van');
  });

  it('transport-plan: Passengers cell values map correctly (kills L342-346 key StringLiteral mutants)', async () => {
    const batchId = 'b1';
    const vehicleId = 'v1';
    setupDbReturn(
      [{ batchId, movementType: 'arr', serviceDate: null, timeWindowStart: null, timeWindowEnd: null, sourceCity: 'X', pickupHub: 'PHub', dropHub: 'DHub', batchStatus: 'planned' }],
      [{ vehicleId, batchId, vehicleLabel: 'VanAlpha', vehicleType: 'van', plateNumber: 'P', driverName: 'D', capacity: 8 }],
      [{ batchId, vehicleAssignmentId: vehicleId, fullName: 'Jane Doe', phone: '+911111111111', assignmentStatus: 'confirmed' }],
    );
    const buffer = await generateExport(EVENT, 'transport-plan');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Passengers')!;
    const vals = getRowValues(ws);
    expect(vals[0]).toBe('PHub');              // col 1: pickupHub (from batchMap)
    expect(vals[1]).toBe('VanAlpha');          // col 2: vehicleLabel (from vehicleMap)
    expect(vals[2]).toBe('Jane Doe');          // col 3: fullName
    expect(vals[3]).toBe('+911111111111');     // col 4: phone
    expect(vals[4]).toBe('confirmed');         // col 5: assignmentStatus
  });

  // ── Faculty Responsibilities: exact headers + cell values + sort ──

  it('faculty-responsibilities: exact column headers (kills L406-417 header StringLiteral + ObjectLiteral mutants)', async () => {
    setupDbReturn([]);
    const buffer = await generateExport(EVENT, 'faculty-responsibilities');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Faculty Responsibilities')!;
    expect(getHeaders(ws)).toEqual([
      'Faculty Name', 'Email', 'Phone', 'Designation', 'Session',
      'Session Type', 'Date', 'Start', 'End', 'Hall', 'Role', 'Presentation',
    ]);
  });

  it('faculty-responsibilities: cell values map to correct columns (kills L406-417 key StringLiteral mutants)', async () => {
    setupDbReturn([{
      fullName: 'Prof. Bob',
      email: 'bob@test.com',
      phone: '+911234567890',
      designation: 'Professor',
      sessionTitle: 'Keynote Session',
      sessionType: 'keynote',
      sessionDate: new Date('2026-04-10T00:00:00Z'),
      startAtUtc: new Date('2026-04-10T09:00:00Z'),
      endAtUtc: new Date('2026-04-10T10:00:00Z'),
      role: 'speaker',
      presentationTitle: 'Heart Repair',
      hallName: 'Hall A',
    }]);
    const buffer = await generateExport(EVENT, 'faculty-responsibilities');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Faculty Responsibilities')!;
    const vals = getRowValues(ws);
    expect(vals[0]).toBe('Prof. Bob');             // col 1: fullName
    expect(vals[1]).toBe('bob@test.com');          // col 2: email
    expect(vals[2]).toBe('+911234567890');         // col 3: phone
    expect(vals[3]).toBe('Professor');             // col 4: designation
    expect(vals[4]).toBe('Keynote Session');       // col 5: sessionTitle
    expect(vals[5]).toBe('keynote');               // col 6: sessionType
    expect(vals[6]).toBe('2026-04-10');            // col 7: sessionDate
    expect(vals[7]).toBe('2026-04-10 09:00:00');  // col 8: startAtUtc
    expect(vals[8]).toBe('2026-04-10 10:00:00');  // col 9: endAtUtc
    expect(vals[9]).toBe('Hall A');               // col 10: hallName
    expect(vals[10]).toBe('speaker');             // col 11: role
    expect(vals[11]).toBe('Heart Repair');        // col 12: presentationTitle
  });

  it('faculty-responsibilities: sorts by name ascending (kills L394-396 sort MethodExpression + ConditionalExpression mutants)', async () => {
    // Provide in reverse order; expect Zara after Alice
    setupDbReturn([
      {
        fullName: 'Zara Smith', email: 'z@t.com', phone: '+91',
        designation: 'Dr', sessionTitle: 'S1', sessionType: 'talk',
        sessionDate: new Date('2026-04-10'), startAtUtc: new Date('2026-04-10T10:00:00Z'),
        endAtUtc: new Date('2026-04-10T11:00:00Z'), role: 'speaker',
        presentationTitle: null, hallName: null,
      },
      {
        fullName: 'Alice Jones', email: 'a@t.com', phone: '+91',
        designation: 'Prof', sessionTitle: 'S2', sessionType: 'keynote',
        sessionDate: new Date('2026-04-11'), startAtUtc: new Date('2026-04-11T09:00:00Z'),
        endAtUtc: new Date('2026-04-11T10:00:00Z'), role: 'moderator',
        presentationTitle: null, hallName: null,
      },
    ]);
    const buffer = await generateExport(EVENT, 'faculty-responsibilities');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Faculty Responsibilities')!;
    // After sort: Alice first, Zara second
    expect(ws.getRow(2).getCell(1).value).toBe('Alice Jones');
    expect(ws.getRow(3).getCell(1).value).toBe('Zara Smith');
  });

  it('faculty-responsibilities: same name sorted by sessionDate ascending (kills L396-399 date comparison mutants)', async () => {
    setupDbReturn([
      {
        fullName: 'Dr. Same', email: 's@t.com', phone: '+91',
        designation: 'Dr', sessionTitle: 'Later Session', sessionType: 'talk',
        sessionDate: new Date('2026-04-12T00:00:00Z'),
        startAtUtc: new Date('2026-04-12T10:00:00Z'),
        endAtUtc: new Date('2026-04-12T11:00:00Z'),
        role: 'speaker', presentationTitle: null, hallName: null,
      },
      {
        fullName: 'Dr. Same', email: 's@t.com', phone: '+91',
        designation: 'Dr', sessionTitle: 'Earlier Session', sessionType: 'talk',
        sessionDate: new Date('2026-04-10T00:00:00Z'),
        startAtUtc: new Date('2026-04-10T09:00:00Z'),
        endAtUtc: new Date('2026-04-10T10:00:00Z'),
        role: 'speaker', presentationTitle: null, hallName: null,
      },
    ]);
    const buffer = await generateExport(EVENT, 'faculty-responsibilities');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Faculty Responsibilities')!;
    // Earlier session should come first
    expect(ws.getRow(2).getCell(5).value).toBe('Earlier Session');
    expect(ws.getRow(3).getCell(5).value).toBe('Later Session');
  });

  it('faculty-responsibilities: null sessionDate treated as 0 in sort (kills L397-398 OptionalChaining + LogicalOperator NoCoverage)', async () => {
    setupDbReturn([
      {
        fullName: 'Dr. Same', email: 's@t.com', phone: '+91',
        designation: 'Dr', sessionTitle: 'Has Date', sessionType: 'talk',
        sessionDate: new Date('2026-04-10T00:00:00Z'),
        startAtUtc: null, endAtUtc: null,
        role: 'speaker', presentationTitle: null, hallName: null,
      },
      {
        fullName: 'Dr. Same', email: 's@t.com', phone: '+91',
        designation: 'Dr', sessionTitle: 'No Date', sessionType: 'talk',
        sessionDate: null,
        startAtUtc: null, endAtUtc: null,
        role: 'speaker', presentationTitle: null, hallName: null,
      },
    ]);
    const buffer = await generateExport(EVENT, 'faculty-responsibilities');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Faculty Responsibilities')!;
    // null sessionDate → 0, so it sorts before the dated session
    expect(ws.getRow(2).getCell(5).value).toBe('No Date');
    expect(ws.getRow(3).getCell(5).value).toBe('Has Date');
  });

  // ── Attendance Report: exact headers + cell values + ?? fallback ──

  it('attendance-report: exact column headers (kills L462-469 header StringLiteral + ObjectLiteral mutants)', async () => {
    setupDbReturn([]);
    const buffer = await generateExport(EVENT, 'attendance-report');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendance Report')!;
    expect(getHeaders(ws)).toEqual([
      'Name', 'Email', 'Phone', 'Reg #', 'Category',
      'Session', 'Check-In Method', 'Check-In Time',
    ]);
  });

  it('attendance-report: cell values map to correct columns (kills L462-469 key StringLiteral mutants)', async () => {
    setupDbReturn([{
      fullName: 'Charlie Brown',
      email: 'charlie@test.com',
      phone: '+913333333333',
      regNumber: 'GEM-003',
      category: 'faculty',
      checkInMethod: 'qr_scan',
      checkInAt: new Date('2026-04-10T09:30:00Z'),
      sessionTitle: 'Morning Keynote',
    }]);
    const buffer = await generateExport(EVENT, 'attendance-report');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendance Report')!;
    const vals = getRowValues(ws);
    expect(vals[0]).toBe('Charlie Brown');         // col 1: fullName
    expect(vals[1]).toBe('charlie@test.com');      // col 2: email
    expect(vals[2]).toBe('+913333333333');         // col 3: phone
    expect(vals[3]).toBe('GEM-003');               // col 4: regNumber
    expect(vals[4]).toBe('faculty');               // col 5: category
    expect(vals[5]).toBe('Morning Keynote');       // col 6: sessionTitle (non-null → preserved)
    expect(vals[6]).toBe('qr_scan');               // col 7: checkInMethod
    expect(vals[7]).toBe('2026-04-10 09:30:00');  // col 8: checkInAt
  });

  it('attendance-report: null sessionTitle becomes "Event-level" (kills L475 ConditionalExpression/StringLiteral mutants)', async () => {
    setupDbReturn([{
      fullName: 'Alice', email: 'a@t.com', phone: '+91',
      regNumber: 'GEM-001', category: 'delegate',
      checkInMethod: 'manual', checkInAt: new Date('2026-04-10T09:00:00Z'),
      sessionTitle: null,
    }]);
    const buffer = await generateExport(EVENT, 'attendance-report');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendance Report')!;
    // null sessionTitle → 'Event-level'
    expect(ws.getRow(2).getCell(6).value).toBe('Event-level');
  });

  it('attendance-report: non-null sessionTitle is preserved (kills L475 ??→&& LogicalOperator mutant)', async () => {
    setupDbReturn([{
      fullName: 'Bob', email: 'b@t.com', phone: '+91',
      regNumber: 'GEM-002', category: 'faculty',
      checkInMethod: 'qr_scan', checkInAt: new Date('2026-04-10T09:00:00Z'),
      sessionTitle: 'Specific Session Name',
    }]);
    const buffer = await generateExport(EVENT, 'attendance-report');
    const wb = await parseWorkbook(buffer);
    const ws = wb.getWorksheet('Attendance Report')!;
    // non-null → must NOT become 'Event-level', must be 'Specific Session Name'
    expect(ws.getRow(2).getCell(6).value).toBe('Specific Session Name');
  });
});
