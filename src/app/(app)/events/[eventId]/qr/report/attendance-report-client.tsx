'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AttendanceReportData } from '@/lib/actions/attendance';

type Tab = 'overall' | 'by-day' | 'by-session';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'by-day', label: 'By Day' },
  { key: 'by-session', label: 'By Session' },
];

function isTab(value: string | undefined): value is Tab {
  return value === 'overall' || value === 'by-day' || value === 'by-session';
}

export function AttendanceReportClient({
  eventId,
  data,
  initialTab,
}: {
  eventId: string;
  data: AttendanceReportData;
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'overall');
  const [downloading, setDownloading] = useState(false);

  async function handleExport() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/exports/attendance-report`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
        'attendance-report.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/events/${eventId}/qr`}
              className="text-sm text-gray-500 hover:text-gray-700"
              data-testid="back-to-qr"
            >
              ← QR Check-In
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">Attendance Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check-in summary for this event
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={downloading}
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="export-btn"
        >
          {downloading ? 'Downloading...' : 'Export Excel'}
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 rounded-lg bg-muted p-1"
        role="tablist"
        aria-label="Report views"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overall' && <OverallTab data={data.overall} />}
      {activeTab === 'by-day' && <ByDayTab rows={data.byDay} />}
      {activeTab === 'by-session' && <BySessionTab rows={data.bySession} />}
    </div>
  );
}

function OverallTab({ data }: { data: AttendanceReportData['overall'] }) {
  return (
    <div className="space-y-4" data-testid="overall-tab">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-medium uppercase text-gray-500">Total Registered</p>
          <p className="mt-0.5 text-2xl font-bold text-blue-700" data-testid="total-registrations">
            {data.totalRegistrations}
          </p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-xs font-medium uppercase text-gray-500">Checked In</p>
          <p className="mt-0.5 text-2xl font-bold text-green-700" data-testid="total-checked-in">
            {data.totalCheckedIn}
          </p>
        </div>
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
          <p className="text-xs font-medium uppercase text-gray-500">Check-in Rate</p>
          <p className="mt-0.5 text-2xl font-bold text-purple-700" data-testid="check-in-rate">
            {data.checkInRate}%
          </p>
        </div>
      </div>

      {data.byMethod.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">By Method</h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Method</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.byMethod.map((row) => (
                  <tr key={row.method}>
                    <td className="px-4 py-2 capitalize text-gray-900">
                      {row.method.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.byCategory.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">By Category</h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Category</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.byCategory.map((row) => (
                  <tr key={row.category}>
                    <td className="px-4 py-2 capitalize text-gray-900">
                      {row.category.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.byMethod.length === 0 && data.byCategory.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No check-in data yet.</p>
      )}
    </div>
  );
}

function ByDayTab({ rows }: { rows: AttendanceReportData['byDay'] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400" data-testid="by-day-empty">
        No check-in data yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border" data-testid="by-day-tab">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Check-ins</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">% of Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {rows.map((row) => (
            <tr key={row.date}>
              <td className="px-4 py-3 text-gray-900">{formatISTDate(row.date)}</td>
              <td className="px-4 py-3 text-right font-mono text-gray-700">{row.count}</td>
              <td className="px-4 py-3 text-right text-gray-600">{row.percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BySessionTab({ rows }: { rows: AttendanceReportData['bySession'] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400" data-testid="by-session-empty">
        No session-level check-ins yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border" data-testid="by-session-tab">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Session</th>
            <th className="hidden px-4 py-3 text-left font-medium text-gray-500 sm:table-cell">
              Date &amp; Time
            </th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Check-ins</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {rows.map((row) => (
            <tr key={row.sessionId}>
              <td className="max-w-[180px] truncate px-4 py-3 text-gray-900" title={row.title}>
                {row.title}
              </td>
              <td className="hidden whitespace-nowrap px-4 py-3 text-gray-600 sm:table-cell">
                {row.sessionDate
                  ? new Date(row.sessionDate).toLocaleDateString('en-US', {
                      timeZone: 'Asia/Kolkata',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
                {row.startAtUtc && (
                  <>
                    {' '}
                    {new Date(row.startAtUtc as unknown as string).toLocaleTimeString('en-US', {
                      timeZone: 'Asia/Kolkata',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </>
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono text-gray-700">{row.count}</td>
              <td className="px-4 py-3 text-right text-gray-600">{row.percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatISTDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00+05:30').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
