'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { updateEvent } from '@/lib/actions/event';
import { MODULE_KEYS } from '@/lib/validations/event';

type EventRow = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueMapUrl: string | null;
  moduleToggles: unknown;
};

const MODULE_LABELS: Record<string, string> = {
  scientific_program: 'Scientific Program',
  registration: 'Registration',
  travel_accommodation: 'Travel & Accommodation',
  certificates: 'Certificates',
  qr_checkin: 'QR Check-in',
  transport_planning: 'Transport Planning',
  communications: 'Communications',
};

function toDateInput(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function EventSettingsClient({
  event,
  canWrite,
}: {
  event: EventRow;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState(false);

  const toggles = (event.moduleToggles || {}) as Record<string, boolean>;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canWrite) return;
    setError(null);
    setFieldErrors({});
    setSuccess(false);

    const formData = new FormData(e.currentTarget);

    // Build moduleToggles from checkboxes
    const moduleTogglesObj: Record<string, boolean> = {};
    for (const key of MODULE_KEYS) {
      moduleTogglesObj[key] = formData.get(`toggle_${key}`) === 'on';
    }
    formData.set('moduleToggles', JSON.stringify(moduleTogglesObj));

    startTransition(async () => {
      const result = await updateEvent(event.id, formData);
      if (result.ok) {
        setSuccess(true);
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors);
        if (result.formErrors.length > 0) {
          setError(result.formErrors.join('. '));
        } else {
          setError('Please fix the errors below.');
        }
      }
    });
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-lg)' }}>
        <Link href={`/events/${event.id}`} className="rounded-lg p-1.5 hover:bg-border/50">
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text-primary">Event Settings</h1>
          <p className="text-sm text-text-muted">{event.name}</p>
        </div>
      </div>

      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Settings saved.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Basic Info */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Basic Info
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="name">
                Event Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={event.name}
                disabled={!canWrite}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.name.join('. ')}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={event.description ?? ''}
                disabled={!canWrite}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              {fieldErrors.description && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.description.join('. ')}</p>
              )}
            </div>
          </div>
        </section>

        {/* Dates */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Dates
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="startDate">
                Start Date
              </label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                required
                defaultValue={toDateInput(event.startDate)}
                disabled={!canWrite}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              {fieldErrors.startDate && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.startDate.join('. ')}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="endDate">
                End Date
              </label>
              <input
                id="endDate"
                name="endDate"
                type="date"
                required
                defaultValue={toDateInput(event.endDate)}
                disabled={!canWrite}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              {fieldErrors.endDate && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.endDate.join('. ')}</p>
              )}
            </div>
          </div>
          {/* Hidden timezone — preserve existing value */}
          <input type="hidden" name="timezone" value={event.timezone} />
        </section>

        {/* Venue */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Venue
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="venueName">
                Venue Name
              </label>
              <input
                id="venueName"
                name="venueName"
                type="text"
                required
                defaultValue={event.venueName ?? ''}
                disabled={!canWrite}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              {fieldErrors.venueName && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.venueName.join('. ')}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="venueAddress">
                Address
              </label>
              <input
                id="venueAddress"
                name="venueAddress"
                type="text"
                defaultValue={event.venueAddress ?? ''}
                disabled={!canWrite}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="venueCity">
                City
              </label>
              <input
                id="venueCity"
                name="venueCity"
                type="text"
                defaultValue={event.venueCity ?? ''}
                disabled={!canWrite}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="venueMapUrl">
                Map URL
              </label>
              <input
                id="venueMapUrl"
                name="venueMapUrl"
                type="url"
                defaultValue={event.venueMapUrl ?? ''}
                disabled={!canWrite}
                placeholder="https://maps.google.com/..."
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              {fieldErrors.venueMapUrl && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.venueMapUrl.join('. ')}</p>
              )}
            </div>
          </div>
        </section>

        {/* Module Toggles */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Modules
          </h2>
          <div className="flex flex-col gap-2">
            {MODULE_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-border/20"
              >
                <input
                  type="checkbox"
                  name={`toggle_${key}`}
                  defaultChecked={toggles[key] !== false}
                  disabled={!canWrite}
                  className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
                />
                <span className="text-sm text-text-primary">{MODULE_LABELS[key] ?? key}</span>
              </label>
            ))}
          </div>
        </section>

        <button
          type="submit"
          disabled={!canWrite || isPending}
          className="flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
