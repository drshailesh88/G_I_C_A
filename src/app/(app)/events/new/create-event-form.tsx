'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createEvent } from '@/lib/actions/event';
import { MODULE_KEYS } from '@/lib/validations/event';

const MODULE_LABELS: Record<string, string> = {
  scientific_program: 'Scientific Program',
  registration: 'Registration',
  travel_accommodation: 'Travel & Accommodation',
  certificates: 'Certificates',
  qr_checkin: 'QR Check-in',
  transport_planning: 'Transport Planning',
  communications: 'Communications',
};

export function CreateEventForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [modules, setModules] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_KEYS.map((k) => [k, true])),
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setFieldErrors({});

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('moduleToggles', JSON.stringify(modules));

    try {
      const result = await createEvent(formData);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        if (result.formErrors.length > 0) {
          setError(result.formErrors.join('. '));
        }
        setLoading(false);
        return;
      }
      router.push(`/events/${result.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create event';
      setError(message);
      setLoading(false);
    }
  }

  function toggleModule(key: string) {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/events" className="rounded-lg p-1.5 hover:bg-border/50">
            <ArrowLeft className="h-5 w-5 text-text-primary" />
          </Link>
          <h1 className="text-xl font-bold text-text-primary">Create Event</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        {/* Event Name */}
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-text-primary">
            Event Name <span className="text-error">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="GEM India Summit 2026"
            className={`w-full rounded-lg border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent ${fieldErrors.name ? 'border-error' : 'border-border'}`}
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-error">{fieldErrors.name[0]}</p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="startDate" className="mb-1 block text-sm font-medium text-text-primary">
              Start Date <span className="text-error">*</span>
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              className={`w-full rounded-lg border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent ${fieldErrors.startDate ? 'border-error' : 'border-border'}`}
            />
            {fieldErrors.startDate && (
              <p className="mt-1 text-xs text-error">{fieldErrors.startDate[0]}</p>
            )}
          </div>
          <div>
            <label htmlFor="endDate" className="mb-1 block text-sm font-medium text-text-primary">
              End Date <span className="text-error">*</span>
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              className={`w-full rounded-lg border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent ${fieldErrors.endDate ? 'border-error' : 'border-border'}`}
            />
            {fieldErrors.endDate && (
              <p className="mt-1 text-xs text-error">{fieldErrors.endDate[0]}</p>
            )}
          </div>
        </div>

        {/* Venue */}
        <div>
          <label htmlFor="venueName" className="mb-1 block text-sm font-medium text-text-primary">
            Venue <span className="text-error">*</span>
          </label>
          <input
            id="venueName"
            name="venueName"
            type="text"
            required
            placeholder="Pragati Maidan, New Delhi"
            className={`w-full rounded-lg border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent ${fieldErrors.venueName ? 'border-error' : 'border-border'}`}
          />
          {fieldErrors.venueName && (
            <p className="mt-1 text-xs text-error">{fieldErrors.venueName[0]}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-text-primary">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Enter event description..."
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Module Toggles */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Modules (ON/OFF)</h2>
          <div className="flex flex-col gap-3">
            {MODULE_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                <span className="text-sm text-text-primary">{MODULE_LABELS[key] || key}</span>
                <button
                  type="button"
                  onClick={() => toggleModule(key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                    modules[key] ? 'bg-accent' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      modules[key] ? 'translate-x-5.5' : 'translate-x-0.5'
                    } mt-0.5`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href="/events"
            className="flex-1 rounded-lg border border-border px-4 py-3 text-center text-sm font-medium text-text-secondary hover:bg-border/30"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
