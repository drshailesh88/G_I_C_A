'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useOnlineStatus } from './use-online-status';
import { getPendingScans, markScansAsSynced, clearSyncedScans } from '@/lib/attendance/offline-queue';
import { processBatchSync } from '@/lib/actions/batch-sync';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

type UseOfflineSyncOptions = {
  eventId: string;
  enabled?: boolean;
};

type UseOfflineSyncReturn = {
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncedCount: number;
  lastSyncError: string | null;
  syncNow: () => Promise<void>;
};

export function useOfflineSync({
  eventId,
  enabled = true,
}: UseOfflineSyncOptions): UseOfflineSyncReturn {
  const isOnline = useOnlineStatus();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const syncingRef = useRef(false);
  const mountedRef = useRef(true);

  // Track mounted state for safe async updates
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !isOnline) return;
    syncingRef.current = true;
    if (!mountedRef.current) return;
    setSyncStatus('syncing');
    setLastSyncError(null);
    setLastSyncedCount(0);

    try {
      const pending = await getPendingScans();
      if (!mountedRef.current) return;
      setPendingCount(pending.length);

      if (pending.length === 0) {
        setSyncStatus('idle');
        syncingRef.current = false;
        return;
      }

      const result = await processBatchSync(eventId, {
        eventId,
        records: pending.map((scan) => ({
          qrPayload: scan.qrPayload,
          sessionId: scan.sessionId,
          scannedAt: scan.scannedAt,
          deviceId: scan.deviceId,
        })),
      });

      // Mark all processed scans as synced (duplicates are also "synced")
      const syncedIds = pending
        .filter((_, i) => {
          const r = result.results[i];
          return r && (r.result.type === 'success' || r.result.type === 'duplicate');
        })
        .map((s) => s.id);

      await markScansAsSynced(syncedIds);
      await clearSyncedScans();

      if (!mountedRef.current) return;
      setLastSyncedCount(syncedIds.length);

      const remainingPending = await getPendingScans();
      if (!mountedRef.current) return;
      setPendingCount(remainingPending.length);

      setSyncStatus('synced');
    } catch (err) {
      if (!mountedRef.current) return;
      setLastSyncError(err instanceof Error ? err.message : 'Sync failed');
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
    }
  }, [eventId, isOnline]);

  // Auto-sync when connectivity returns
  useEffect(() => {
    if (!enabled || !isOnline) return;

    // Small delay to let the connection stabilize
    const timer = setTimeout(() => {
      syncNow();
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOnline, enabled, syncNow]);

  // Poll pending count periodically
  useEffect(() => {
    if (!enabled) return;

    const checkPending = async () => {
      try {
        const pending = await getPendingScans();
        if (mountedRef.current) setPendingCount(pending.length);
      } catch {
        // IndexedDB might not be available in SSR
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 5000);
    return () => clearInterval(interval);
  }, [enabled]);

  return { syncStatus, pendingCount, lastSyncedCount, lastSyncError, syncNow };
}
