'use server';

import ExcelJS from 'exceljs';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import {
  events,
  eventRegistrations,
  people,
  travelRecords,
  accommodationRecords,
  transportBatches,
  transportPassengerAssignments,
  vehicleAssignments,
  sessions,
  sessionAssignments,
  attendanceRecords,
  halls,
  notificationLog,
} from '@/lib/db/schema';
import { eq, ne, desc } from 'drizzle-orm';
import { ROLES } from '@/lib/auth/roles';
import { eventIdSchema } from '@/lib/validations/event';
import { generateExport, type ExportType } from '@/lib/exports/excel';

export type GlobalExportType =
  | ExportType
  | 'notification-log';

type ExportMeta = Readonly<{ label: string; description: string; icon: string }>;

export const GLOBAL_EXPORT_TYPES: Record<GlobalExportType, ExportMeta> = {
  'attendee-list': {
    label: 'Attendee List',
    description: 'All registrations with person details and status',
    icon: '👥',
  },
  'travel-roster': {
    label: 'Travel Roster',
    description: 'All travel records with journey details',
    icon: '✈️',
  },
  'rooming-list': {
    label: 'Rooming List',
    description: 'Accommodation records grouped by hotel',
    icon: '🏨',
  },
  'transport-plan': {
    label: 'Transport Plan',
    description: 'Transport batches with vehicles and passenger assignments',
    icon: '🚐',
  },
  'faculty-responsibilities': {
    label: 'Faculty Responsibilities',
    description: 'Session assignments per faculty member',
    icon: '🎓',
  },
  'attendance-report': {
    label: 'Attendance Report',
    description: 'Check-in records with method and timestamp',
    icon: '📋',
  },
  'notification-log': {
    label: 'Notification Log',
    description: 'All notification delivery attempts with status',
    icon: '📨',
  },
};

export type EventSummary = {
  id: string;
  name: string;
  startDate: Date | null;
  status: string | null;
};

export type GetEventsResult =
  | { ok: true; events: EventSummary[] }
  | { ok: false; error: string };

export type GenerateGlobalExportResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

// ── RBAC Guard ───────────────────────────────────────────────────

async function assertSuperAdmin(): Promise<void> {
  const session = await auth();
  const isSuperAdmin = session.has?.({ role: ROLES.SUPER_ADMIN }) ?? false;
  if (!isSuperAdmin) {
    throw new Error('Forbidden: cross-event reporting requires Super Admin');
  }
}

// ── Shared Excel Helpers ─────────────────────────────────────────

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

function styleHeaders(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
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

// ── Combined (all-events) Export Queries ────────────────────────

async function exportAllAttendees(): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      eventName: events.name,
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
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .orderBy(events.name);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendee List (All Events)');

  ws.columns = [
    { header: 'Event', key: 'eventName' },
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
    ws.addRow({ ...r, registeredAt: formatDateTime(r.registeredAt) });
  }

  styleHeaders(ws);
  autoWidth(ws);
  return wb.xlsx.writeBuffer();
}

async function exportAllTravelRoster(): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      eventName: events.name,
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
    .innerJoin(events, eq(travelRecords.eventId, events.id))
    .where(ne(travelRecords.recordStatus, 'cancelled'))
    .orderBy(events.name);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Travel Roster (All Events)');

  ws.columns = [
    { header: 'Event', key: 'eventName' },
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

async function exportAllRoomingList(): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      eventName: events.name,
      fullName: people.fullName,
      email: people.email,
      phone: people.phoneE164,
      hotelName: accommodationRecords.hotelName,
      roomType: accommodationRecords.roomType,
      roomNumber: accommodationRecords.roomNumber,
      checkInDate: accommodationRecords.checkInDate,
      checkOutDate: accommodationRecords.checkOutDate,
      specialRequests: accommodationRecords.specialRequests,
      recordStatus: accommodationRecords.recordStatus,
    })
    .from(accommodationRecords)
    .innerJoin(people, eq(accommodationRecords.personId, people.id))
    .innerJoin(events, eq(accommodationRecords.eventId, events.id))
    .where(ne(accommodationRecords.recordStatus, 'cancelled'))
    .orderBy(events.name);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rooming List (All Events)');

  ws.columns = [
    { header: 'Event', key: 'eventName' },
    { header: 'Hotel', key: 'hotelName' },
    { header: 'Name', key: 'fullName' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Room Type', key: 'roomType' },
    { header: 'Room #', key: 'roomNumber' },
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

async function exportAllTransportPlan(): Promise<ExcelJS.Buffer> {
  const batchRows = await db
    .select({
      eventName: events.name,
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
    .innerJoin(events, eq(transportBatches.eventId, events.id))
    .where(ne(transportBatches.batchStatus, 'cancelled'))
    .orderBy(events.name);

  const passengerRows = await db
    .select({
      eventName: events.name,
      batchId: transportPassengerAssignments.batchId,
      vehicleAssignmentId: transportPassengerAssignments.vehicleAssignmentId,
      fullName: people.fullName,
      phone: people.phoneE164,
      assignmentStatus: transportPassengerAssignments.assignmentStatus,
    })
    .from(transportPassengerAssignments)
    .innerJoin(people, eq(transportPassengerAssignments.personId, people.id))
    .innerJoin(events, eq(transportPassengerAssignments.eventId, events.id))
    .orderBy(events.name);

  const vehicleRows = await db
    .select({
      vehicleId: vehicleAssignments.id,
      batchId: vehicleAssignments.batchId,
      vehicleLabel: vehicleAssignments.vehicleLabel,
    })
    .from(vehicleAssignments);

  const wb = new ExcelJS.Workbook();

  const wsBatches = wb.addWorksheet('Batches (All Events)');
  wsBatches.columns = [
    { header: 'Event', key: 'eventName' },
    { header: 'Movement', key: 'movementType' },
    { header: 'Date', key: 'serviceDate' },
    { header: 'Window Start', key: 'timeWindowStart' },
    { header: 'Window End', key: 'timeWindowEnd' },
    { header: 'City', key: 'sourceCity' },
    { header: 'Pickup Hub', key: 'pickupHub' },
    { header: 'Drop Hub', key: 'dropHub' },
    { header: 'Status', key: 'batchStatus' },
  ];

  for (const b of batchRows) {
    wsBatches.addRow({
      ...b,
      serviceDate: formatDate(b.serviceDate),
      timeWindowStart: formatDateTime(b.timeWindowStart),
      timeWindowEnd: formatDateTime(b.timeWindowEnd),
    });
  }
  styleHeaders(wsBatches);
  autoWidth(wsBatches);

  const vehicleMap = new Map(vehicleRows.map((v) => [v.vehicleId, v]));

  const wsPassengers = wb.addWorksheet('Passengers (All Events)');
  wsPassengers.columns = [
    { header: 'Event', key: 'eventName' },
    { header: 'Vehicle', key: 'vehicleLabel' },
    { header: 'Passenger', key: 'fullName' },
    { header: 'Phone', key: 'phone' },
    { header: 'Status', key: 'assignmentStatus' },
  ];

  for (const p of passengerRows) {
    const vehicle = p.vehicleAssignmentId ? vehicleMap.get(p.vehicleAssignmentId) : null;
    wsPassengers.addRow({
      eventName: p.eventName,
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

async function exportAllFacultyResponsibilities(): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      eventName: events.name,
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
    .innerJoin(events, eq(sessions.eventId, events.id))
    .leftJoin(halls, eq(sessions.hallId, halls.id))
    .orderBy(events.name, people.fullName);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Faculty (All Events)');

  ws.columns = [
    { header: 'Event', key: 'eventName' },
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

async function exportAllAttendanceReport(): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      eventName: events.name,
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
    .innerJoin(events, eq(attendanceRecords.eventId, events.id))
    .leftJoin(
      eventRegistrations,
      eq(attendanceRecords.registrationId, eventRegistrations.id),
    )
    .leftJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
    .orderBy(events.name);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendance (All Events)');

  ws.columns = [
    { header: 'Event', key: 'eventName' },
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

async function exportNotificationLog(eventId: string): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      recipientEmail: notificationLog.recipientEmail,
      recipientPhone: notificationLog.recipientPhoneE164,
      channel: notificationLog.channel,
      templateKey: notificationLog.templateKeySnapshot,
      triggerType: notificationLog.triggerType,
      sendMode: notificationLog.sendMode,
      status: notificationLog.status,
      queuedAt: notificationLog.queuedAt,
      sentAt: notificationLog.sentAt,
      lastErrorMessage: notificationLog.lastErrorMessage,
    })
    .from(notificationLog)
    .where(eq(notificationLog.eventId, eventId))
    .orderBy(desc(notificationLog.queuedAt));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Notification Log');

  ws.columns = [
    { header: 'Recipient Email', key: 'recipientEmail' },
    { header: 'Recipient Phone', key: 'recipientPhone' },
    { header: 'Channel', key: 'channel' },
    { header: 'Template Key', key: 'templateKey' },
    { header: 'Trigger Type', key: 'triggerType' },
    { header: 'Send Mode', key: 'sendMode' },
    { header: 'Status', key: 'status' },
    { header: 'Queued At', key: 'queuedAt' },
    { header: 'Sent At', key: 'sentAt' },
    { header: 'Error', key: 'lastErrorMessage' },
  ];

  for (const r of rows) {
    ws.addRow({
      ...r,
      queuedAt: formatDateTime(r.queuedAt),
      sentAt: formatDateTime(r.sentAt),
    });
  }

  styleHeaders(ws);
  autoWidth(ws);
  return wb.xlsx.writeBuffer();
}

async function exportAllNotificationLog(): Promise<ExcelJS.Buffer> {
  const rows = await db
    .select({
      eventName: events.name,
      recipientEmail: notificationLog.recipientEmail,
      recipientPhone: notificationLog.recipientPhoneE164,
      channel: notificationLog.channel,
      templateKey: notificationLog.templateKeySnapshot,
      triggerType: notificationLog.triggerType,
      sendMode: notificationLog.sendMode,
      status: notificationLog.status,
      queuedAt: notificationLog.queuedAt,
      sentAt: notificationLog.sentAt,
      lastErrorMessage: notificationLog.lastErrorMessage,
    })
    .from(notificationLog)
    .innerJoin(events, eq(notificationLog.eventId, events.id))
    .orderBy(events.name, desc(notificationLog.queuedAt));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Notification Log (All Events)');

  ws.columns = [
    { header: 'Event', key: 'eventName' },
    { header: 'Recipient Email', key: 'recipientEmail' },
    { header: 'Recipient Phone', key: 'recipientPhone' },
    { header: 'Channel', key: 'channel' },
    { header: 'Template Key', key: 'templateKey' },
    { header: 'Trigger Type', key: 'triggerType' },
    { header: 'Send Mode', key: 'sendMode' },
    { header: 'Status', key: 'status' },
    { header: 'Queued At', key: 'queuedAt' },
    { header: 'Sent At', key: 'sentAt' },
    { header: 'Error', key: 'lastErrorMessage' },
  ];

  for (const r of rows) {
    ws.addRow({
      ...r,
      queuedAt: formatDateTime(r.queuedAt),
      sentAt: formatDateTime(r.sentAt),
    });
  }

  styleHeaders(ws);
  autoWidth(ws);
  return wb.xlsx.writeBuffer();
}

// ── Public Server Actions ────────────────────────────────────────

export async function getEventsForGlobalReports(): Promise<GetEventsResult> {
  try {
    await assertSuperAdmin();

    const eventList = await db
      .select({
        id: events.id,
        name: events.name,
        startDate: events.startDate,
        status: events.status,
      })
      .from(events)
      .orderBy(desc(events.startDate));

    return { ok: true, events: eventList };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch events' };
  }
}

export async function generateGlobalExport(
  eventId: string,
  type: GlobalExportType,
): Promise<GenerateGlobalExportResult> {
  try {
    await assertSuperAdmin();

    let buffer: ExcelJS.Buffer;
    let filename: string;

    if (eventId === 'all') {
      filename = `${type}-all-events.xlsx`;
      switch (type) {
        case 'attendee-list':
          buffer = await exportAllAttendees();
          break;
        case 'travel-roster':
          buffer = await exportAllTravelRoster();
          break;
        case 'rooming-list':
          buffer = await exportAllRoomingList();
          break;
        case 'transport-plan':
          buffer = await exportAllTransportPlan();
          break;
        case 'faculty-responsibilities':
          buffer = await exportAllFacultyResponsibilities();
          break;
        case 'attendance-report':
          buffer = await exportAllAttendanceReport();
          break;
        case 'notification-log':
          buffer = await exportAllNotificationLog();
          break;
        default:
          return { ok: false, error: `Unknown export type: ${String(type)}` };
      }
    } else {
      const parsed = eventIdSchema.safeParse(eventId);
      if (!parsed.success) {
        return { ok: false, error: 'Invalid event ID' };
      }
      filename = `${type}-${parsed.data}.xlsx`;
      if (type === 'notification-log') {
        buffer = await exportNotificationLog(parsed.data);
      } else {
        buffer = await generateExport(parsed.data, type);
      }
    }

    const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64');
    return { ok: true, base64, filename };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Export failed' };
  }
}
