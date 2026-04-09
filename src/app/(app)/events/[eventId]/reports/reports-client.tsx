'use client';

import { useState } from 'react';
import { EXPORT_TYPES, type ExportType } from '@/lib/exports/excel';

const EXPORT_ICONS: Record<ExportType, string> = {
  'attendee-list': '👥',
  'travel-roster': '✈️',
  'rooming-list': '🏨',
  'transport-plan': '🚐',
  'faculty-responsibilities': '🎓',
  'attendance-report': '📋',
};

export function ReportsClient({ eventId }: { eventId: string }) {
  const [downloading, setDownloading] = useState<ExportType | null>(null);

  async function handleDownload(type: ExportType) {
    setDownloading(type);
    try {
      const res = await fetch(`/api/events/${eventId}/exports/${type}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(err.error || 'Download failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
        `${type}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports & Exports</h1>
        <p className="text-muted-foreground mt-1">
          Download event data as Excel spreadsheets
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.entries(EXPORT_TYPES) as [ExportType, { label: string; description: string }][]).map(
          ([type, meta]) => (
            <div
              key={type}
              className="rounded-lg border bg-card p-6 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl" role="img" aria-label={meta.label}>
                  {EXPORT_ICONS[type]}
                </span>
                <div className="flex-1">
                  <h3 className="font-semibold">{meta.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {meta.description}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDownload(type)}
                disabled={downloading !== null}
                className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading === type ? 'Downloading...' : 'Download Excel'}
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
