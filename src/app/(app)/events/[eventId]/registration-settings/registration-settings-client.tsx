'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { updateRegistrationSettings } from '@/lib/actions/registration-settings';

type EventRow = {
  id: string;
  name: string;
  registrationSettings: unknown;
};

type RegSettings = {
  approvalRequired?: boolean;
  maxCapacity?: number | null;
  waitlistEnabled?: boolean;
  cutoffDate?: string | null;
  preferenceFields?: {
    dietaryNeeds?: boolean;
    travelPreferences?: boolean;
    accessibilityRequirements?: boolean;
  };
};

export function RegistrationSettingsClient({
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

  const rs = ((event.registrationSettings ?? {}) as RegSettings);
  const pf = rs.preferenceFields ?? {};

  const [approvalRequired, setApprovalRequired] = useState(rs.approvalRequired ?? false);
  const [maxCapacity, setMaxCapacity] = useState(rs.maxCapacity != null ? String(rs.maxCapacity) : '');
  const [waitlistEnabled, setWaitlistEnabled] = useState(rs.waitlistEnabled ?? false);
  const [cutoffDate, setCutoffDate] = useState(rs.cutoffDate ?? '');
  const [dietaryNeeds, setDietaryNeeds] = useState(pf.dietaryNeeds ?? true);
  const [travelPreferences, setTravelPreferences] = useState(pf.travelPreferences ?? true);
  const [accessibilityRequirements, setAccessibilityRequirements] = useState(
    pf.accessibilityRequirements ?? true,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canWrite) return;
    setError(null);
    setFieldErrors({});
    setSuccess(false);

    const capacityNum = maxCapacity.trim() !== '' ? parseInt(maxCapacity, 10) : null;

    const input = {
      approvalRequired,
      maxCapacity: capacityNum,
      waitlistEnabled,
      cutoffDate: cutoffDate.trim() !== '' ? cutoffDate : null,
      preferenceFields: {
        dietaryNeeds,
        travelPreferences,
        accessibilityRequirements,
      },
    };

    startTransition(async () => {
      const result = await updateRegistrationSettings(event.id, input);
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
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-lg)' }}>
        <Link href={`/events/${event.id}`} className="rounded-lg p-1.5 hover:bg-border/50">
          <ArrowLeft className="h-5 w-5 text-text-primary" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text-primary">Registration Settings</h1>
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
        {/* Access Control */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Access Control
          </h2>
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={approvalRequired}
                onChange={(e) => setApprovalRequired(e.target.checked)}
                disabled={!canWrite}
                className="mt-0.5 h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
              />
              <div>
                <span className="text-sm font-medium text-text-primary">Require approval</span>
                <p className="text-xs text-text-muted">
                  New registrations start as pending until manually approved.
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Capacity */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Capacity
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label
                className="mb-1 block text-sm font-medium text-text-primary"
                htmlFor="maxCapacity"
              >
                Maximum registrations
              </label>
              <input
                id="maxCapacity"
                type="number"
                min={1}
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                disabled={!canWrite}
                placeholder="Leave empty for no limit"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              {fieldErrors.maxCapacity && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.maxCapacity.join('. ')}</p>
              )}
            </div>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={waitlistEnabled}
                onChange={(e) => setWaitlistEnabled(e.target.checked)}
                disabled={!canWrite}
                className="mt-0.5 h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
              />
              <div>
                <span className="text-sm font-medium text-text-primary">Enable waitlist</span>
                <p className="text-xs text-text-muted">
                  Allow registrations beyond capacity to join a waitlist.
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Cutoff Date */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Registration Window
          </h2>
          <div>
            <label
              className="mb-1 block text-sm font-medium text-text-primary"
              htmlFor="cutoffDate"
            >
              Registration closes on
            </label>
            <input
              id="cutoffDate"
              type="date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-text-muted">
              Leave empty to keep registration open until manually closed.
            </p>
          </div>
        </section>

        {/* Preference Fields */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Preference Fields
          </h2>
          <p className="mb-3 text-xs text-text-muted">
            Choose which preference fields appear on the registration form.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-border/20">
              <input
                type="checkbox"
                checked={dietaryNeeds}
                onChange={(e) => setDietaryNeeds(e.target.checked)}
                disabled={!canWrite}
                className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
              />
              <span className="text-sm text-text-primary">Dietary needs</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-border/20">
              <input
                type="checkbox"
                checked={travelPreferences}
                onChange={(e) => setTravelPreferences(e.target.checked)}
                disabled={!canWrite}
                className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
              />
              <span className="text-sm text-text-primary">Travel preferences</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-border/20">
              <input
                type="checkbox"
                checked={accessibilityRequirements}
                onChange={(e) => setAccessibilityRequirements(e.target.checked)}
                disabled={!canWrite}
                className="h-4 w-4 rounded border-border accent-accent disabled:opacity-50"
              />
              <span className="text-sm text-text-primary">Accessibility requirements</span>
            </label>
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
