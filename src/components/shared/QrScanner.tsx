'use client';

import { useCallback, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { queueOfflineScan, generateScanId, getPendingCount } from '@/lib/attendance/offline-queue';
import type { ScanLookupResult } from '@/lib/attendance/qr-utils';

export type QrScannerProps = {
  eventId: string;
  sessionId?: string | null;
  deviceId?: string;
  onScan: (result: ScanLookupResult) => void;
  disabled?: boolean;
};

export function QrScanner({
  eventId,
  sessionId,
  deviceId,
  onScan,
  disabled = false,
}: QrScannerProps) {
  const [processing, setProcessing] = useState(false);
  const [lastScannedPayload, setLastScannedPayload] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const isOnline = useOnlineStatus();

  const handleScan = useCallback(
    async (detectedCodes: { rawValue: string }[]) => {
      if (disabled || processing || detectedCodes.length === 0) return;

      const payload = detectedCodes[0].rawValue;
      if (!payload || payload === lastScannedPayload) return;

      setProcessing(true);
      setLastScannedPayload(payload);

      try {
        if (isOnline) {
          // Online: call server directly
          const { processQrScan } = await import('@/lib/actions/checkin');
          const result = await processQrScan(eventId, {
            eventId,
            qrPayload: payload,
            sessionId: sessionId ?? null,
            deviceId,
          });
          onScan(result);
        } else {
          // Offline: queue to IndexedDB
          await queueOfflineScan({
            id: generateScanId(),
            qrPayload: payload,
            sessionId: sessionId ?? null,
            scannedAt: new Date().toISOString(),
            deviceId: deviceId ?? `browser-${navigator.userAgent.slice(0, 50)}`,
            synced: false,
          });
          const count = await getPendingCount();
          setPendingCount(count);
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
        // Debounce: prevent rapid re-scans of the same code
        setTimeout(() => {
          setProcessing(false);
          setLastScannedPayload(null);
        }, 2000);
      }
    },
    [eventId, sessionId, deviceId, onScan, disabled, processing, lastScannedPayload, isOnline],
  );

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
          Offline mode — scans will be queued and synced when connectivity returns
          {pendingCount > 0 && ` (${pendingCount} pending)`}
        </div>
      )}
    </div>
  );
}
