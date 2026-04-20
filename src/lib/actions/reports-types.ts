import type { ExportType } from '@/lib/exports/excel';

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
