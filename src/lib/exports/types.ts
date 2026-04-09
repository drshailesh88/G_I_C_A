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
