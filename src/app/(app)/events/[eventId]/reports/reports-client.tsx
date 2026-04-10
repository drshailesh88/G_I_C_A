'use client';

import { useState } from 'react';
import { EXPORT_TYPES, type ExportType } from '@/lib/exports/types';
import { useRole } from '@/hooks/use-role';
import { ResponsiveMetricGrid } from '@/components/responsive/responsive-metric-grid';

const EXPORT_ICONS: Record<ExportType, string> = {
  'attendee-list': '👥',
  'travel-roster': '✈️',
  'rooming-list': '🏨',
  'transport-plan': '🚐',
  'faculty-responsibilities': '🎓',
  'attendance-report': '📋',
};

export function ReportsClient({ eventId }: { eventId: string }) {
  const { isReadOnly } = useRole();
  const [downloading, setDownloading] = useState<ExportType | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [generatingKit, setGeneratingKit] = useState(false);

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

  async function handleArchiveDownload() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/exports/archive`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Archive generation failed' }));
        throw new Error(err.error || 'Archive generation failed');
      }

      const data = await res.json();
      // Open signed URL in new tab for download
      window.open(data.archiveUrl, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Archive generation failed');
    } finally {
      setArchiving(false);
    }
  }

  async function handleEmergencyKit() {
    setGeneratingKit(true);
    try {
      const res = await fetch(`/api/events/${eventId}/exports/emergency-kit`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Emergency kit generation failed' }));
        throw new Error(err.error || 'Emergency kit generation failed');
      }

      const data = await res.json();
      window.open(data.downloadUrl, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Emergency kit generation failed');
    } finally {
      setGeneratingKit(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Reports & Exports</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Download event data as Excel spreadsheets
        </p>
      </div>

      <ResponsiveMetricGrid minCardWidth={240}>
        {(Object.entries(EXPORT_TYPES) as [ExportType, { label: string; description: string }][]).map(
          ([type, meta]) => (
            <div
              key={type}
              className="rounded-lg border bg-card p-4 sm:p-6 shadow-sm"
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
                disabled={downloading !== null || archiving}
                className="mt-4 w-full min-h-[44px] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading === type ? 'Downloading...' : 'Download Excel'}
              </button>
            </div>
          ),
        )}

        <div className="rounded-lg border bg-card p-4 sm:p-6 shadow-sm border-dashed">
          <div className="flex items-start gap-3">
            <span className="text-2xl" role="img" aria-label="Event Archive">
              📦
            </span>
            <div className="flex-1">
              <h3 className="font-semibold">Event Archive</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Complete ZIP with agenda, certificates, and notification log
              </p>
            </div>
          </div>
          <button
            onClick={handleArchiveDownload}
            disabled={downloading !== null || archiving || generatingKit}
            className="mt-4 w-full min-h-[44px] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {archiving ? 'Generating Archive...' : 'Download Archive ZIP'}
          </button>
        </div>

        <div className="rounded-lg border bg-card p-4 sm:p-6 shadow-sm border-dashed border-amber-300 dark:border-amber-700">
          <div className="flex items-start gap-3">
            <span className="text-2xl" role="img" aria-label="Emergency Kit">
              🚨
            </span>
            <div className="flex-1">
              <h3 className="font-semibold">Emergency Kit</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Pre-event backup: attendees, travel, rooming, transport, program, certificate keys
              </p>
            </div>
          </div>
          <button
            onClick={handleEmergencyKit}
            disabled={isReadOnly || downloading !== null || archiving || generatingKit}
            className="mt-4 w-full min-h-[44px] rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isReadOnly ? 'Write access required to generate emergency kit' : undefined}
          >
            {generatingKit ? 'Generating Kit...' : 'Download Emergency Kit'}
          </button>
        </div>
      </ResponsiveMetricGrid>
    </div>
  );
}
