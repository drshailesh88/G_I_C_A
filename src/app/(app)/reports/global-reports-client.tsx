'use client';

import { useState, useTransition } from 'react';
import {
  GLOBAL_EXPORT_TYPES,
  generateGlobalExport,
  type GlobalExportType,
  type EventSummary,
} from '@/lib/actions/reports';

interface Props {
  events: EventSummary[];
}

const EXPORT_TYPES_ORDERED: GlobalExportType[] = [
  'attendee-list',
  'travel-roster',
  'rooming-list',
  'transport-plan',
  'faculty-responsibilities',
  'attendance-report',
  'notification-log',
];

function downloadBase64(base64: string, filename: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function GlobalReportsClient({ events }: Props) {
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [activeType, setActiveType] = useState<GlobalExportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDownload(type: GlobalExportType) {
    setError(null);
    setActiveType(type);
    startTransition(async () => {
      const result = await generateGlobalExport(selectedEventId, type);
      if (!result.ok) {
        setError(result.error);
      } else {
        downloadBase64(result.base64, result.filename);
      }
      setActiveType(null);
    });
  }

  const selectedEventName =
    selectedEventId === 'all'
      ? 'All Events'
      : (events.find((e) => e.id === selectedEventId)?.name ?? selectedEventId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Global Reports</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Cross-event reports — Super Admin only
        </p>
      </div>

      {/* Event Selector */}
      <div className="rounded-lg border bg-card p-4">
        <label
          htmlFor="event-selector"
          className="block text-sm font-medium mb-2"
        >
          Scope
        </label>
        <select
          id="event-selector"
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          disabled={isPending}
          className="w-full sm:w-80 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="all">All Events (combined)</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
              {ev.status ? ` — ${ev.status}` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-2">
          {selectedEventId === 'all'
            ? 'Export will include data from all events in one workbook'
            : `Export will include data from: ${selectedEventName}`}
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Report Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXPORT_TYPES_ORDERED.map((type) => {
          const meta = GLOBAL_EXPORT_TYPES[type];
          const isDownloading = isPending && activeType === type;

          return (
            <div key={type} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-2xl" role="img" aria-label={meta.label}>
                  {meta.icon}
                </span>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">{meta.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {meta.description}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDownload(type)}
                disabled={isPending}
                className="mt-4 w-full min-h-[44px] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading ? 'Downloading…' : 'Download Excel'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Per-event link */}
      <p className="text-xs text-muted-foreground">
        Looking for per-event exports with archive and emergency kit?{' '}
        {selectedEventId !== 'all' ? (
          <a
            href={`/events/${selectedEventId}/reports`}
            className="underline hover:text-foreground"
          >
            Open per-event reports for {selectedEventName}
          </a>
        ) : (
          'Select a specific event above, then click the link.'
        )}
      </p>
    </div>
  );
}
