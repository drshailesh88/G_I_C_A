'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { QrScanner } from '@/components/shared/QrScanner';
import { ScanFeedback } from '@/components/shared/ScanFeedback';
import { CheckInSearch } from '@/components/shared/CheckInSearch';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import type { ScanLookupResult } from '@/lib/attendance/qr-utils';
import type { AttendanceRecord, AttendanceStats } from '@/lib/actions/attendance';

type Props = {
  eventId: string;
  initialStats: AttendanceStats;
  initialRecords: AttendanceRecord[];
  totalRegistrations: number;
};

export function QrCheckInClient({
  eventId,
  initialStats,
  initialRecords,
  totalRegistrations,
}: Props) {
  const router = useRouter();
  const [lastResult, setLastResult] = useState<ScanLookupResult | null>(null);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const isOnline = useOnlineStatus();
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss ScanFeedback after 3 seconds
  useEffect(() => {
    if (lastResult) {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setLastResult(null);
      }, 3000);
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [lastResult]);

  const handleScan = useCallback((result: ScanLookupResult) => {
    setLastResult(result);
    if (result.type === 'success') {
      router.refresh();
    }
  }, [router]);

  const handleCheckInResult = useCallback((result: ScanLookupResult) => {
    setLastResult(result);
    if (result.type === 'success') {
      router.refresh();
    }
  }, [router]);

  const remaining = totalRegistrations - initialStats.totalCheckedIn;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">QR Check-In</h1>
      </div>

      {/* Three-panel layout: stacked on mobile (375px), side-by-side on desktop */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1fr_auto]">
          {/* Panel 1: Scanner feed / Manual search */}
          <div className="min-w-0">
            {showManualSearch ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">Manual Check-In</h2>
                <CheckInSearch
                  eventId={eventId}
                  onCheckInResult={handleCheckInResult}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">Scanner</h2>
                <QrScanner
                  eventId={eventId}
                  onScan={handleScan}
                />
              </div>
            )}
          </div>

          {/* Panel 2: Result panel (ScanFeedback overlay) */}
          <div className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Last Scan Result</h2>
            {lastResult ? (
              <ScanFeedback
                result={lastResult}
                onDismiss={() => setLastResult(null)}
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
                Waiting for scan...
              </div>
            )}

            {/* Attendance Log (recent) */}
            <div className="mt-4">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Recent Check-ins</h2>
              <AttendanceLog records={initialRecords.slice(-10).reverse()} />
            </div>
          </div>

          {/* Panel 3: Stats panel */}
          <div className="min-w-0 xl:w-56">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Statistics</h2>
            <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
              <StatCard
                label="Total"
                value={totalRegistrations}
                color="blue"
              />
              <StatCard
                label="Checked In"
                value={initialStats.totalCheckedIn}
                color="green"
              />
              <StatCard
                label="Remaining"
                value={remaining < 0 ? 0 : remaining}
                color="amber"
              />
            </div>

            {/* Method breakdown */}
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>QR Scans</span>
                <span className="font-medium text-gray-700">{initialStats.byMethod['qr_scan'] ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Manual</span>
                <span className="font-medium text-gray-700">{initialStats.byMethod['manual_search'] ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar: Manual Check-in toggle + offline badge */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-4 py-3 safe-area-pb" data-testid="bottom-bar">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button
            onClick={() => setShowManualSearch((prev) => !prev)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              showManualSearch
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            data-testid="manual-checkin-toggle"
            aria-pressed={showManualSearch}
          >
            {showManualSearch ? 'Switch to QR Scanner' : 'Manual Check-in'}
          </button>

          <div className="flex items-center gap-3">
            {/* Offline badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isOnline
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
              data-testid="connectivity-badge"
              role="status"
              aria-live="polite"
            >
              <span
                className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}
              />
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'amber';
}) {
  const styles = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    amber: 'border-amber-200 bg-amber-50',
  };
  const textStyles = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    amber: 'text-amber-700',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${styles[color]}`}>
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${textStyles[color]}`}>{value}</p>
    </div>
  );
}

function AttendanceLog({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-gray-400">
        No check-ins yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Name</th>
            <th className="hidden px-3 py-1.5 text-left font-medium text-gray-500 uppercase sm:table-cell">Reg #</th>
            <th className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Method</th>
            <th className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {records.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-1.5 text-gray-900 truncate max-w-[120px]">{r.fullName}</td>
              <td className="hidden px-3 py-1.5 font-mono text-gray-600 sm:table-cell">{r.registrationNumber ?? '-'}</td>
              <td className="px-3 py-1.5">
                <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  r.checkInMethod === 'qr_scan'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {r.checkInMethod === 'qr_scan' ? 'QR' : 'Manual'}
                </span>
              </td>
              <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                {new Date(r.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
