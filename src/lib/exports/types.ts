/**
 * Export type definitions — shared between server (excel.ts) and client (reports-client.tsx).
 * This file must NOT import any server-only modules (db, exceljs, etc.).
 */

export type ExportType =
  | 'attendee-list'
  | 'travel-roster'
  | 'rooming-list'
  | 'transport-plan'
  | 'faculty-responsibilities'
  | 'attendance-report';

type ExportMeta = Readonly<{ label: string; description: string }>;

export const EXPORT_TYPES: Readonly<Record<ExportType, ExportMeta>> = Object.freeze(
  Object.assign(Object.create(null) as Record<ExportType, ExportMeta>, {
    'attendee-list': Object.freeze({
      label: 'Attendee List',
      description: 'All registrations with person details and status',
    }),
    'travel-roster': Object.freeze({
      label: 'Travel Roster',
      description: 'All travel records with journey details',
    }),
    'rooming-list': Object.freeze({
      label: 'Rooming List',
      description: 'Accommodation records grouped by hotel',
    }),
    'transport-plan': Object.freeze({
      label: 'Transport Plan',
      description: 'Transport batches with vehicles and passenger assignments',
    }),
    'faculty-responsibilities': Object.freeze({
      label: 'Faculty Responsibilities',
      description: 'Session assignments per faculty member',
    }),
    'attendance-report': Object.freeze({
      label: 'Attendance Report',
      description: 'Check-in records with method and timestamp',
    }),
  }),
);
