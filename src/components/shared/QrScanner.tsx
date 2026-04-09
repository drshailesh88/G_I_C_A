'use client';

import { useCallback, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { useOfflineSync } from '@/lib/hooks/use-offline-sync';
import { queueOfflineScan, generateScanId, getPendingCount } from '@/lib/attendance/offline-queue';
import type { ScanLookupResult } from '@/lib/attendance/qr-utils';

type SyncState = {
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  pendingCount: number;
  lastSyncedCount: number;
  lastSyncError: string | null;
  syncNow: () => Promise<void>;
};

export type QrScannerProps = {
  eventId: string;
  sessionId?: string | null;
  deviceId?: string;
  onScan: (result: ScanLookupResult) => void;
  disabled?: boolean;
  /** When provided, uses external sync state instead of creating its own */
  externalSync?: SyncState;
};

export function QrScanner({
  eventId,
  sessionId,
  deviceId,
  onScan,
  disabled = false,
  externalSync,
}: QrScannerProps) {
  const [processing, setProcessing] = useState(false);
  const [lastScannedPayload, setLastScannedPayload] = useState<string | null>(null);
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const isOnline = useOnlineStatus();

  // Use external sync state if provided, otherwise manage internally
  const internalSync = useOfflineSync({
    eventId,
    enabled: !externalSync,
  });
  const { syncStatus, pendingCount, lastSyncedCount, lastSyncError, syncNow } = externalSync ?? internalSync;

  const handleScan = useCallback(
    async (detectedCodes: { rawValue: string }[]) => {
      if (disabled || processing || detectedCodes.length === 0) return;

      const payload = detectedCodes[0].rawValue;
      if (!payload || payload === lastScannedPayload) return;

      setProcessing(true);
      setLastScannedPayload(payload);

      try {
        if (isOnline) {
          const { processQrScan } = await import('@/lib/actions/checkin');
          const result = await processQrScan(eventId, {
            eventId,
            qrPayload: payload,
            sessionId: sessionId ?? null,
            deviceId,
          });
          onScan(result);
        } else {
          await queueOfflineScan({
            id: generateScanId(),
            qrPayload: payload,
            sessionId: sessionId ?? null,
            scannedAt: new Date().toISOString(),
            deviceId: deviceId ?? `browser-${navigator.userAgent.slice(0, 50)}`,
            synced: false,
          });
          const count = await getPendingCount();
          setOfflinePendingCount(count);
          onScan({
            type: 'success',
            message: `Queued offline (${count} pending). Will sync when back online.`,
          });
        }
      } catch {
        if (!isOnline) {
          onScan({ type: 'invalid', message: 'Failed to queue scan offline.' });
        } else {
          onScan({ type: 'invalid', message: 'Failed to process scan. Please try again.' });
        }
      } finally {
        setTimeout(() => {
          setProcessing(false);
          setLastScannedPayload(null);
        }, 2000);
      }
    },
    [eventId, sessionId, deviceId, onScan, disabled, processing, lastScannedPayload, isOnline],
  );

  const displayPendingCount = pendingCount || offlinePendingCount;

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <Scanner
        onScan={handleScan}
        formats={['qr_code']}
        paused={disabled || processing}
        components={{
          finder: true,
        }}
        styles={{
          container: { width: '100%', aspectRatio: '1' },
        }}
      />
      {processing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
          <span className="text-white text-sm font-medium">Processing...</span>
        </div>
      )}
      {!isOnline && (
        <div className="mt-2 rounded-md bg-yellow-50 px-3 py-2 text-center text-xs text-yellow-800">
          Offline mode — scans queued locally
          {displayPendingCount > 0 && ` (${displayPendingCount} pending)`}
        </div>
      )}
      {isOnline && syncStatus === 'syncing' && (
        <div className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-center text-xs text-blue-800">
          Syncing {displayPendingCount} offline scan{displayPendingCount !== 1 ? 's' : ''}...
        </div>
      )}
      {isOnline && syncStatus === 'synced' && (
        <div className="mt-2 rounded-md bg-green-50 px-3 py-2 text-center text-xs text-green-800">
          {lastSyncedCount > 0 ? `Synced ${lastSyncedCount} check-in${lastSyncedCount !== 1 ? 's' : ''}` : 'Offline scans synced successfully'}
        </div>
      )}
      {isOnline && syncStatus === 'error' && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-center text-xs text-red-800">
          Sync failed: {lastSyncError}
          <button
            onClick={syncNow}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
