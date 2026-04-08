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
  const value = compact
    ? buildCompactQrPayload(qrCodeToken, eventId)
    : buildQrPayloadUrl(baseUrl, qrCodeToken, eventId);

  return (
    <div className="flex flex-col items-center gap-2">
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        includeMargin
      />
      {label && (
        <span className="text-sm text-muted-foreground font-mono">{label}</span>
      )}
    </div>
  );
}
