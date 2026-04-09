'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { QrScanner } from '@/components/shared/QrScanner';
import { ScanFeedback } from '@/components/shared/ScanFeedback';
import { CheckInSearch } from '@/components/shared/CheckInSearch';
import type { ScanLookupResult } from '@/lib/attendance/qr-utils';
import type { AttendanceRecord, AttendanceStats } from '@/lib/actions/attendance';

type Props = {
  eventId: string;
  initialStats: AttendanceStats;
  initialRecords: AttendanceRecord[];
};

export function QrCheckInClient({ eventId, initialStats, initialRecords }: Props) {
  const router = useRouter();
  const [lastResult, setLastResult] = useState<ScanLookupResult | null>(null);
  const [mode, setMode] = useState<'scan' | 'search' | 'records'>('scan');

  const handleScan = useCallback((result: ScanLookupResult) => {
    setLastResult(result);
    // Refresh stats after successful check-in
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QR Check-In</h1>
        <p className="mt-1 text-sm text-gray-500">
          Scan QR codes or search registrations for manual check-in.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Checked In" value={initialStats.totalCheckedIn} />
        <StatCard
          label="QR Scans"
          value={initialStats.byMethod['qr_scan'] ?? 0}
        />
        <StatCard
          label="Manual"
          value={initialStats.byMethod['manual_search'] ?? 0}
        />
        <StatCard
          label="Sessions"
          value={Object.keys(initialStats.bySession).length}
        />
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'scan', label: 'QR Scanner' },
          { key: 'search', label: 'Manual Search' },
          { key: 'records', label: 'Attendance Log' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              mode === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scan Feedback */}
      {lastResult && (
        <ScanFeedback
          result={lastResult}
          onDismiss={() => setLastResult(null)}
        />
      )}

      {/* QR Scanner Mode */}
      {mode === 'scan' && (
        <div className="flex justify-center">
          <QrScanner
            eventId={eventId}
            onScan={handleScan}
          />
        </div>
      )}

      {/* Manual Search Mode */}
      {mode === 'search' && (
        <CheckInSearch
          eventId={eventId}
          onCheckInResult={handleCheckInResult}
        />
      )}

      {/* Attendance Records Mode */}
      {mode === 'records' && (
        <AttendanceLog records={initialRecords} />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function AttendanceLog({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        No attendance records yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reg #</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {records.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 text-sm text-gray-900">{r.fullName}</td>
              <td className="px-4 py-2 text-sm font-mono text-gray-600">{r.registrationNumber ?? '-'}</td>
              <td className="px-4 py-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.checkInMethod === 'qr_scan'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {r.checkInMethod.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-gray-500">
                {new Date(r.checkInAt).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
