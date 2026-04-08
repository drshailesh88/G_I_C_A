'use client';

import { QRCodeSVG } from 'qrcode.react';
import { buildQrPayloadUrl, buildCompactQrPayload } from '@/lib/attendance/qr-utils';

export type RegistrationQrCodeProps = {
  /** The unique QR token from the registration record */
  qrCodeToken: string;
  /** The event ID this registration belongs to */
  eventId: string;
  /** Base URL of the app (e.g. https://gem-india.vercel.app) */
  baseUrl: string;
  /** Size in pixels (default 200) */
  size?: number;
  /** Use compact payload instead of full URL */
  compact?: boolean;
  /** Include text label below the QR code */
  label?: string;
};

export function RegistrationQrCode({
  qrCodeToken,
  eventId,
  baseUrl,
  size = 200,
  compact = false,
  label,
}: RegistrationQrCodeProps) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 200;
  const trimmedLabel = typeof label === 'string' ? label.trim() : '';

  let value: string;
  try {
    value = compact
      ? buildCompactQrPayload(qrCodeToken, eventId)
      : buildQrPayloadUrl(baseUrl, qrCodeToken, eventId);
  } catch {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm text-muted-foreground">QR code unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <QRCodeSVG
        value={value}
        size={safeSize}
        level="M"
        includeMargin
      />
      {trimmedLabel && (
        <span className="text-sm text-muted-foreground font-mono">{trimmedLabel}</span>
      )}
    </div>
  );
}
