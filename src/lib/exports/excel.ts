/**
 * Excel Export Engine — GEM India Conference Management
 *
 * 6 export types, each scoped by eventId:
 * 1. Attendee List
 * 2. Travel Roster
 * 3. Rooming List (grouped by hotel)
 * 4. Transport Plan
 * 5. Faculty Responsibilities
 * 6. Attendance Report
 */

import ExcelJS from 'exceljs';
import { db } from '@/lib/db';
import {
  eventRegistrations,
  people,
  travelRecords,
  accommodationRecords,
  transportBatches,
  vehicleAssignments,
  transportPassengerAssignments,
  sessions,
  sessionAssignments,
  attendanceRecords,
  halls,
} from '@/lib/db/schema';
import { withEventScope } from '@/lib/db/with-event-scope';
import { eq, and, ne } from 'drizzle-orm';

// ── Shared Helpers ─────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E79' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};

const HEADER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  vertical: 'middle',
  horizontal: 'center',
  wrapText: true,
};

function styleHeaders(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
  });
  headerRow.height = 28;
}

function autoWidth(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 4, 50);
  });
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ── Export Type Map ────────────────────────────────────────────

export type ExportType =
  | 'attendee-list'
  | 'travel-roster'
  | 'rooming-list'
  | 'transport-plan'
  | 'faculty-responsibilities'
  | 'attendance-report';

export const EXPORT_TYPES: Record<ExportType, { label: string; description: string }> = {
  'attendee-list': {
    label: 'Attendee List',
    description: 'All registrations with person details and status',
  },
  'travel-roster': {
    label: 'Travel Roster',
    description: 'All travel records with journey details',
  },
  'rooming-list': {
    label: 'Rooming List',
    description: 'Accommodation records grouped by hotel',
  },
  'transport-plan': {
    label: 'Transport Plan',
    description: 'Transport batches with vehicles and passenger assignments',
  },
  'faculty-responsibilities': {
    label: 'Faculty Responsibilities',
    description: 'Session assignments per faculty member',
  },
  'attendance-report': {
    label: 'Attendance Report',
    description: 'Check-in records with method and timestamp',
  },
};

// ── 1. Attendee List ───────────────────────────────────────────

async function exportAttendeeList(eventId: string): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      regNumber: eventRegistrations.registrationNumber,
      category: eventRegistrations.category,
      status: eventRegistrations.status,
      registeredAt: eventRegistrations.registeredAt,
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      designation: people.designation,
      specialty: people.specialty,
      organization: people.organization,
      city: people.city,
    })
    .from(eventRegistrations)
    .innerJoin(people, eq(eventRegistrations.personId, people.id))
    .where(withEventScope(eventRegistrations.eventId, eventId));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendee List');

  ws.columns = [
    { header: 'Reg #', key: 'regNumber' },
    { header: 'Full Name', key: 'fullName' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Category', key: 'category' },
    { header: 'Status', key: 'status' },
    { header: 'Designation', key: 'designation' },
    { header: 'Specialty', key: 'specialty' },
    { header: 'Organization', key: 'organization' },
    { header: 'City', key: 'city' },
    { header: 'Registered At', key: 'registeredAt' },
  ];

  for (const r of rows) {
    ws.addRow({
      ...r,
      registeredAt: formatDateTime(r.registeredAt),
    });
  }

  styleHeaders(ws);
  autoWidth(ws);

  return wb.xlsx.writeBuffer();
}

// ── 2. Travel Roster ───────────────────────────────────────────

async function exportTravelRoster(eventId: string): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      direction: travelRecords.direction,
      travelMode: travelRecords.travelMode,
      fromCity: travelRecords.fromCity,
      toCity: travelRecords.toCity,
      departureAtUtc: travelRecords.departureAtUtc,
      arrivalAtUtc: travelRecords.arrivalAtUtc,
      carrierName: travelRecords.carrierName,
      serviceNumber: travelRecords.serviceNumber,
      pnr: travelRecords.pnrOrBookingRef,
      recordStatus: travelRecords.recordStatus,
    })
    .from(travelRecords)
    .innerJoin(people, eq(travelRecords.personId, people.id))
    .where(
      withEventScope(travelRecords.eventId, eventId, ne(travelRecords.recordStatus, 'cancelled')),
    );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Travel Roster');

  ws.columns = [
    { header: 'Name', key: 'fullName' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Direction', key: 'direction' },
    { header: 'Mode', key: 'travelMode' },
    { header: 'From', key: 'fromCity' },
    { header: 'To', key: 'toCity' },
    { header: 'Departure', key: 'departureAtUtc' },
    { header: 'Arrival', key: 'arrivalAtUtc' },
    { header: 'Carrier', key: 'carrierName' },
    { header: 'Flight/Train #', key: 'serviceNumber' },
    { header: 'PNR', key: 'pnr' },
    { header: 'Status', key: 'recordStatus' },
  ];

  for (const r of rows) {
    ws.addRow({
      ...r,
      departureAtUtc: formatDateTime(r.departureAtUtc),
      arrivalAtUtc: formatDateTime(r.arrivalAtUtc),
    });
  }

  styleHeaders(ws);
  autoWidth(ws);

  return wb.xlsx.writeBuffer();
}

// ── 3. Rooming List (grouped by hotel) ─────────────────────────

async function exportRoomingList(eventId: string): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      hotelName: accommodationRecords.hotelName,
      roomType: accommodationRecords.roomType,
      roomNumber: accommodationRecords.roomNumber,
      sharedRoomGroup: accommodationRecords.sharedRoomGroup,
      checkInDate: accommodationRecords.checkInDate,
      checkOutDate: accommodationRecords.checkOutDate,
      specialRequests: accommodationRecords.specialRequests,
      recordStatus: accommodationRecords.recordStatus,
    })
    .from(accommodationRecords)
    .innerJoin(people, eq(accommodationRecords.personId, people.id))
    .where(
      withEventScope(
        accommodationRecords.eventId,
        eventId,
        ne(accommodationRecords.recordStatus, 'cancelled'),
      ),
    );

  // Sort by hotel name for grouping
  rows.sort((a, b) => (a.hotelName || '').localeCompare(b.hotelName || ''));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rooming List');

  ws.columns = [
    { header: 'Hotel', key: 'hotelName' },
    { header: 'Name', key: 'fullName' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Room Type', key: 'roomType' },
    { header: 'Room #', key: 'roomNumber' },
    { header: 'Shared Group', key: 'sharedRoomGroup' },
    { header: 'Check-In', key: 'checkInDate' },
    { header: 'Check-Out', key: 'checkOutDate' },
    { header: 'Special Requests', key: 'specialRequests' },
    { header: 'Status', key: 'recordStatus' },
  ];

  for (const r of rows) {
    ws.addRow({
      ...r,
      checkInDate: formatDate(r.checkInDate),
      checkOutDate: formatDate(r.checkOutDate),
    });
  }

  styleHeaders(ws);
  autoWidth(ws);

  return wb.xlsx.writeBuffer();
}

// ── 4. Transport Plan ──────────────────────────────────────────

async function exportTransportPlan(eventId: string): Promise<ExcelJS.Buffer> {
  // Fetch batches
  const batchRows = await db
    .select({
      batchId: transportBatches.id,
      movementType: transportBatches.movementType,
      serviceDate: transportBatches.serviceDate,
      timeWindowStart: transportBatches.timeWindowStart,
      timeWindowEnd: transportBatches.timeWindowEnd,
      sourceCity: transportBatches.sourceCity,
      pickupHub: transportBatches.pickupHub,
      dropHub: transportBatches.dropHub,
      batchStatus: transportBatches.batchStatus,
    })
    .from(transportBatches)
    .where(
      withEventScope(
        transportBatches.eventId,
        eventId,
        ne(transportBatches.batchStatus, 'cancelled'),
      ),
    );

  // Fetch vehicles
  const vehicleRows = await db
    .select({
      vehicleId: vehicleAssignments.id,
      batchId: vehicleAssignments.batchId,
      vehicleLabel: vehicleAssignments.vehicleLabel,
      vehicleType: vehicleAssignments.vehicleType,
      plateNumber: vehicleAssignments.plateNumber,
      driverName: vehicleAssignments.driverName,
      capacity: vehicleAssignments.capacity,
    })
    .from(vehicleAssignments)
    .where(withEventScope(vehicleAssignments.eventId, eventId));

  // Fetch passengers
  const passengerRows = await db
    .select({
      batchId: transportPassengerAssignments.batchId,
      vehicleAssignmentId: transportPassengerAssignments.vehicleAssignmentId,
      fullName: people.fullName,
      phone: people.phoneE164,
      assignmentStatus: transportPassengerAssignments.assignmentStatus,
    })
    .from(transportPassengerAssignments)
    .innerJoin(people, eq(transportPassengerAssignments.personId, people.id))
    .where(withEventScope(transportPassengerAssignments.eventId, eventId));

  const wb = new ExcelJS.Workbook();

  // Sheet 1: Batches overview
  const wsBatches = wb.addWorksheet('Batches');
  wsBatches.columns = [
    { header: 'Movement', key: 'movementType' },
    { header: 'Date', key: 'serviceDate' },
    { header: 'Window Start', key: 'timeWindowStart' },
    { header: 'Window End', key: 'timeWindowEnd' },
    { header: 'City', key: 'sourceCity' },
    { header: 'Pickup Hub', key: 'pickupHub' },
    { header: 'Drop Hub', key: 'dropHub' },
    { header: 'Status', key: 'batchStatus' },
    { header: 'Vehicles', key: 'vehicleCount' },
    { header: 'Passengers', key: 'passengerCount' },
  ];

  for (const b of batchRows) {
    const vCount = vehicleRows.filter((v) => v.batchId === b.batchId).length;
    const pCount = passengerRows.filter((p) => p.batchId === b.batchId).length;
    wsBatches.addRow({
      ...b,
      serviceDate: formatDate(b.serviceDate),
      timeWindowStart: formatDateTime(b.timeWindowStart),
      timeWindowEnd: formatDateTime(b.timeWindowEnd),
      vehicleCount: vCount,
      passengerCount: pCount,
    });
  }
  styleHeaders(wsBatches);
  autoWidth(wsBatches);

  // Sheet 2: Passenger assignments
  const wsPassengers = wb.addWorksheet('Passengers');
  wsPassengers.columns = [
    { header: 'Batch Pickup', key: 'pickupHub' },
    { header: 'Vehicle', key: 'vehicleLabel' },
    { header: 'Passenger', key: 'fullName' },
    { header: 'Phone', key: 'phone' },
    { header: 'Status', key: 'assignmentStatus' },
  ];

  const batchMap = new Map(batchRows.map((b) => [b.batchId, b]));
  const vehicleMap = new Map(vehicleRows.map((v) => [v.vehicleId, v]));

  for (const p of passengerRows) {
    const batch = batchMap.get(p.batchId);
    const vehicle = p.vehicleAssignmentId ? vehicleMap.get(p.vehicleAssignmentId) : null;
    wsPassengers.addRow({
      pickupHub: batch?.pickupHub ?? '',
      vehicleLabel: vehicle?.vehicleLabel ?? 'Unassigned',
      fullName: p.fullName,
      phone: p.phone ?? '',
      assignmentStatus: p.assignmentStatus,
    });
  }
  styleHeaders(wsPassengers);
  autoWidth(wsPassengers);

  return wb.xlsx.writeBuffer();
}

// ── 5. Faculty Responsibilities ────────────────────────────────

async function exportFacultyResponsibilities(eventId: string): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      designation: people.designation,
      sessionTitle: sessions.title,
      sessionType: sessions.sessionType,
      sessionDate: sessions.sessionDate,
      startAtUtc: sessions.startAtUtc,
      endAtUtc: sessions.endAtUtc,
      role: sessionAssignments.role,
      presentationTitle: sessionAssignments.presentationTitle,
      hallName: halls.name,
    })
    .from(sessionAssignments)
    .innerJoin(people, eq(sessionAssignments.personId, people.id))
    .innerJoin(sessions, eq(sessionAssignments.sessionId, sessions.id))
    .leftJoin(halls, eq(sessions.hallId, halls.id))
    .where(withEventScope(sessionAssignments.eventId, eventId));

  // Sort by person name, then session date
  rows.sort((a, b) => {
    const nameCompare = a.fullName.localeCompare(b.fullName);
    if (nameCompare !== 0) return nameCompare;
    const dateA = a.sessionDate?.getTime() ?? 0;
    const dateB = b.sessionDate?.getTime() ?? 0;
    return dateA - dateB;
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Faculty Responsibilities');

  ws.columns = [
    { header: 'Faculty Name', key: 'fullName' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Designation', key: 'designation' },
    { header: 'Session', key: 'sessionTitle' },
    { header: 'Session Type', key: 'sessionType' },
    { header: 'Date', key: 'sessionDate' },
    { header: 'Start', key: 'startAtUtc' },
    { header: 'End', key: 'endAtUtc' },
    { header: 'Hall', key: 'hallName' },
    { header: 'Role', key: 'role' },
    { header: 'Presentation', key: 'presentationTitle' },
  ];

  for (const r of rows) {
    ws.addRow({
      ...r,
      sessionDate: formatDate(r.sessionDate),
      startAtUtc: formatDateTime(r.startAtUtc),
      endAtUtc: formatDateTime(r.endAtUtc),
    });
  }

  styleHeaders(ws);
  autoWidth(ws);

  return wb.xlsx.writeBuffer();
}

// ── 6. Attendance Report ───────────────────────────────────────

async function exportAttendanceReport(eventId: string): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      regNumber: eventRegistrations.registrationNumber,
      category: eventRegistrations.category,
      checkInMethod: attendanceRecords.checkInMethod,
      checkInAt: attendanceRecords.checkInAt,
      sessionTitle: sessions.title,
    })
    .from(attendanceRecords)
    .innerJoin(people, eq(attendanceRecords.personId, people.id))
    .leftJoin(
      eventRegistrations,
      eq(attendanceRecords.registrationId, eventRegistrations.id),
    )
    .leftJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
    .where(withEventScope(attendanceRecords.eventId, eventId));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendance Report');

  ws.columns = [
    { header: 'Name', key: 'fullName' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Reg #', key: 'regNumber' },
    { header: 'Category', key: 'category' },
    { header: 'Session', key: 'sessionTitle' },
    { header: 'Check-In Method', key: 'checkInMethod' },
    { header: 'Check-In Time', key: 'checkInAt' },
  ];

  for (const r of rows) {
    ws.addRow({
      ...r,
      sessionTitle: r.sessionTitle ?? 'Event-level',
      checkInAt: formatDateTime(r.checkInAt),
    });
  }

  styleHeaders(ws);
  autoWidth(ws);

  return wb.xlsx.writeBuffer();
}

// ── Main Export Dispatcher ─────────────────────────────────────

export async function generateExport(
  eventId: string,
  type: ExportType,
): Promise<ExcelJS.Buffer> {
  switch (type) {
    case 'attendee-list':
      return exportAttendeeList(eventId);
    case 'travel-roster':
      return exportTravelRoster(eventId);
    case 'rooming-list':
      return exportRoomingList(eventId);
    case 'transport-plan':
      return exportTransportPlan(eventId);
    case 'faculty-responsibilities':
      return exportFacultyResponsibilities(eventId);
    case 'attendance-report':
      return exportAttendanceReport(eventId);
    default:
      throw new Error(`Unknown export type: ${type}`);
  }
}
