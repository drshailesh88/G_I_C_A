'use client';

import type { ScanLookupResult, ScanResultType } from '@/lib/attendance/qr-utils';

const FEEDBACK_CONFIG: Record<ScanResultType, {
  bgColor: string;
  textColor: string;
  icon: string;
  title: string;
}> = {
  success: {
    bgColor: 'bg-green-50 border-green-200',
    textColor: 'text-green-800',
    icon: '✓',
    title: 'Check-in Successful',
  },
  duplicate: {
    bgColor: 'bg-yellow-50 border-yellow-200',
    textColor: 'text-yellow-800',
    icon: '⚠',
    title: 'Already Checked In',
  },
  invalid: {
    bgColor: 'bg-red-50 border-red-200',
    textColor: 'text-red-800',
    icon: '✗',
    title: 'Invalid QR Code',
  },
  ineligible: {
    bgColor: 'bg-orange-50 border-orange-200',
    textColor: 'text-orange-800',
    icon: '⊘',
    title: 'Not Eligible',
  },
};

export type ScanFeedbackProps = {
  result: ScanLookupResult | null;
  onDismiss?: () => void;
};

export function ScanFeedback({ result, onDismiss }: ScanFeedbackProps) {
  if (!result) return null;

  const config = FEEDBACK_CONFIG[result.type];

  return (
    <div
      className={`rounded-lg border p-4 ${config.bgColor} animate-in fade-in slide-in-from-bottom-2 duration-200`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <span className={`text-2xl font-bold ${config.textColor}`} aria-hidden="true">
          {config.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold ${config.textColor}`}>{config.title}</h3>
          <p className={`text-sm mt-1 ${config.textColor} opacity-80`}>{result.message}</p>
          {(result.personName || result.registrationNumber || result.category) && (
            <div className="mt-2 space-y-0.5">
              {result.personName && (
                <p className={`text-sm font-medium ${config.textColor}`}>{result.personName}</p>
              )}
              {result.registrationNumber && (
                <p className={`text-xs ${config.textColor} opacity-60 font-mono`}>
                  {result.registrationNumber}
                </p>
              )}
              {result.category && (
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${config.bgColor} border ${config.textColor} mt-1`}>
                  {result.category}
                </span>
              )}
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-sm ${config.textColor} opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
