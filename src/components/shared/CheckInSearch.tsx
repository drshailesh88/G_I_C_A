'use client';

import { useState, useTransition } from 'react';
import { searchRegistrationsForCheckIn, type CheckInSearchResult } from '@/lib/actions/checkin-search';
import { processManualCheckIn } from '@/lib/actions/checkin';
import type { ScanLookupResult } from '@/lib/attendance/qr-utils';

type CheckInSearchProps = {
  eventId: string;
  sessionId?: string | null;
  onCheckInResult?: (result: ScanLookupResult) => void;
};

export function CheckInSearch({ eventId, sessionId, onCheckInResult }: CheckInSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CheckInSearchResult[]>([]);
  const [searching, startSearch] = useTransition();
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSearch() {
    if (!query.trim()) return;
    setError(null);

    startSearch(async () => {
      try {
        const found = await searchRegistrationsForCheckIn(eventId, {
          eventId,
          query: query.trim(),
        }, sessionId);
        setResults(found);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      }
    });
  }

  async function handleCheckIn(registrationId: string) {
    setCheckingIn(registrationId);
    setError(null);

    try {
      const result = await processManualCheckIn(eventId, {
        eventId,
        registrationId,
        sessionId: sessionId ?? null,
      });

      onCheckInResult?.(result);

      if (result.type === 'success') {
        setResults((prev) =>
          prev.map((r) =>
            r.registrationId === registrationId
              ? { ...r, alreadyCheckedIn: true }
              : r,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed');
    } finally {
      setCheckingIn(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search by name, email, phone, or registration number..."
          className="min-h-[44px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Search registrations for check-in"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="min-h-[44px] rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200" role="list">
          {results.map((r) => (
            <li key={r.registrationId} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{r.fullName}</p>
                <p className="truncate text-xs text-gray-500">
                  {r.registrationNumber} &middot; {r.category} &middot; {r.status}
                </p>
                {r.email && <p className="truncate text-xs text-gray-400">{r.email}</p>}
              </div>
              <div className="shrink-0">
                {r.alreadyCheckedIn ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    Checked In
                  </span>
                ) : r.status !== 'confirmed' ? (
                  <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                    {r.status}
                  </span>
                ) : (
                  <button
                    onClick={() => handleCheckIn(r.registrationId)}
                    disabled={checkingIn === r.registrationId}
                    className="min-h-[44px] rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 disabled:opacity-50"
                  >
                    {checkingIn === r.registrationId ? 'Checking in...' : 'Check In'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!searching && results.length === 0 && query.trim() && (
        <p className="text-center text-sm text-gray-500">No registrations found.</p>
      )}
    </div>
  );
}
