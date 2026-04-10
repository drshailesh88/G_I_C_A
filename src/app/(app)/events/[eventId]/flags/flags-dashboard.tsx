'use client';

import { useEffect, useState, useTransition } from 'react';
import { ArrowLeft, Shield, Globe, Calendar } from 'lucide-react';
import Link from 'next/link';
import {
  getGlobalFlags,
  getEventFlags,
  toggleGlobalFlag,
  toggleEventFlag,
} from '@/lib/actions/flags';

type GlobalFlags = {
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  certificate_generation_enabled: boolean;
  maintenance_mode: boolean;
};

type EventFlags = {
  registration_open: boolean;
};

const GLOBAL_FLAG_INFO: Record<keyof GlobalFlags, { label: string; description: string }> = {
  whatsapp_enabled: {
    label: 'WhatsApp Notifications',
    description: 'When disabled, WhatsApp messages are silently skipped (not failed)',
  },
  email_enabled: {
    label: 'Email Notifications',
    description: 'When disabled, email sends are silently skipped (not failed)',
  },
  certificate_generation_enabled: {
    label: 'Certificate Generation',
    description: 'When disabled, bulk certificate generation is blocked',
  },
  maintenance_mode: {
    label: 'Maintenance Mode',
    description: 'When enabled, shows a maintenance page to all users',
  },
};

const EVENT_FLAG_INFO: Record<keyof EventFlags, { label: string; description: string }> = {
  registration_open: {
    label: 'Registration Open',
    description: 'When disabled, public registration is blocked for this event',
  },
};

export function FlagsDashboard({ eventId }: { eventId: string }) {
  const [globalFlags, setGlobalFlags] = useState<GlobalFlags | null>(null);
  const [eventFlags, setEventFlags] = useState<EventFlags | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [g, e] = await Promise.all([getGlobalFlags(), getEventFlags(eventId)]);
        setGlobalFlags(g);
        setEventFlags(e);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load flags');
      }
    }
    load();
  }, [eventId]);

  function handleGlobalToggle(flag: keyof GlobalFlags) {
    if (!globalFlags) return;
    const newValue = !globalFlags[flag];
    startTransition(async () => {
      try {
        await toggleGlobalFlag(flag, newValue);
        setGlobalFlags((prev) => prev ? { ...prev, [flag]: newValue } : prev);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle flag');
      }
    });
  }

  function handleEventToggle(flag: keyof EventFlags) {
    if (!eventFlags) return;
    const newValue = !eventFlags[flag];
    startTransition(async () => {
      try {
        await toggleEventFlag(eventId, flag, newValue);
        setEventFlags((prev) => prev ? { ...prev, [flag]: newValue } : prev);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle flag');
      }
    });
  }

  if (error && !globalFlags) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/events/${eventId}`} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 hover:bg-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-text-primary">Feature Flags</h1>
          <p className="text-xs text-text-muted">Control system-wide and per-event features</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Global Flags */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Global Flags
          </h2>
        </div>
        <div className="space-y-3">
          {globalFlags &&
            (Object.keys(GLOBAL_FLAG_INFO) as (keyof GlobalFlags)[]).map((flag) => {
              const info = GLOBAL_FLAG_INFO[flag];
              const enabled = globalFlags[flag];
              return (
                <div
                  key={flag}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">{info.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{info.description}</p>
                  </div>
                  <button
                    onClick={() => handleGlobalToggle(flag)}
                    disabled={isPending}
                    className={`relative ml-4 inline-flex min-h-[44px] w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
                      enabled ? 'bg-primary' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={enabled}
                    aria-label={info.label}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {/* Event Flags */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Event Flags
          </h2>
        </div>
        <div className="space-y-3">
          {eventFlags &&
            (Object.keys(EVENT_FLAG_INFO) as (keyof EventFlags)[]).map((flag) => {
              const info = EVENT_FLAG_INFO[flag];
              const enabled = eventFlags[flag];
              return (
                <div
                  key={flag}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">{info.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{info.description}</p>
                  </div>
                  <button
                    onClick={() => handleEventToggle(flag)}
                    disabled={isPending}
                    className={`relative ml-4 inline-flex min-h-[44px] w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
                      enabled ? 'bg-primary' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={enabled}
                    aria-label={info.label}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {/* Info note */}
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <Shield className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-800">Changes take effect immediately</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Flag changes are stored in Redis and read on every request. No deployment needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
