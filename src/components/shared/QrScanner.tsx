'use client';

import { useCallback, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
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

  const handleScan = useCallback(
    async (detectedCodes: { rawValue: string }[]) => {
      if (disabled || processing || detectedCodes.length === 0) return;

      const payload = detectedCodes[0].rawValue;
      if (!payload || payload === lastScannedPayload) return;

      setProcessing(true);
      setLastScannedPayload(payload);

      try {
        const { processQrScan } = await import('@/lib/actions/checkin');
        const result = await processQrScan(eventId, {
          eventId,
          qrPayload: payload,
          sessionId: sessionId ?? null,
          deviceId,
        });
        onScan(result);
      } catch {
        onScan({ type: 'invalid', message: 'Failed to process scan. Please try again.' });
      } finally {
        // Debounce: prevent rapid re-scans of the same code
        setTimeout(() => {
          setProcessing(false);
          setLastScannedPayload(null);
        }, 2000);
      }
    },
    [eventId, sessionId, deviceId, onScan, disabled, processing, lastScannedPayload],
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
    </div>
  );
}
