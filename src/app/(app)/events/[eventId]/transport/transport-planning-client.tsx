'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Bus, Users, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useResponsiveNav } from '@/hooks/use-responsive-nav';
import type { SuggestedBatch } from '@/lib/actions/transport';
import { SuggestionsPanel } from './suggestions-panel';

type TransportBatch = {
  id: string;
  eventId: string;
  movementType: string;
  batchSource: string;
  serviceDate: Date;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  sourceCity: string;
  pickupHub: string;
  pickupHubType: string;
  dropHub: string;
  dropHubType: string;
  batchStatus: string;
  notes: string | null;
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  planned: { label: 'Planned', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  ready: { label: 'Ready', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
};

const MOVEMENT_LABELS: Record<string, string> = {
  arrival: 'Arrival',
  departure: 'Departure',
};

export function buildTransportBatchPayload(form: FormData): Record<string, string> {
  const data: Record<string, string> = {};
  form.forEach((value, key) => {
    data[key] = value as string;
  });

  const serviceDate = (form.get('_date') as string | null) ?? '';
  if (serviceDate) {
    data.serviceDate = new Date(`${serviceDate}T00:00:00`).toISOString();
  }
  if (data.timeWindowStart && serviceDate) {
    data.timeWindowStart = new Date(`${serviceDate}T${data.timeWindowStart}`).toISOString();
  }
  if (data.timeWindowEnd && serviceDate) {
    data.timeWindowEnd = new Date(`${serviceDate}T${data.timeWindowEnd}`).toISOString();
  }
  delete data._date;

  return data;
}

export function TransportPlanningClient({
  eventId,
  batches,
  suggestions,
}: {
  eventId: string;
  batches: TransportBatch[];
  suggestions: SuggestedBatch[];
}) {
  const router = useRouter();
  const { isMobile } = useResponsiveNav();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Group batches by date -> time slot -> hub
  const grouped = groupBatches(batches);

  async function handleCreateBatch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const data = buildTransportBatchPayload(form);

    try {
      const { createTransportBatch } = await import('@/lib/actions/transport');
      await createTransportBatch(eventId, data);
      setShowCreateForm(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create batch');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/events/${eventId}`} className="rounded-lg p-1.5 hover:bg-border/50">
            <ArrowLeft className="h-5 w-5 text-text-primary" />
          </Link>
          <h1 className="text-xl font-bold text-text-primary">Transport</h1>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
        >
          <Plus className="h-4 w-4" />
          New Batch
        </button>
      </div>

      {/* Quick Create Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateBatch} className="mt-4 rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">New Transport Batch</h3>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-primary">Movement Type *</label>
                <select name="movementType" required className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent">
                  <option value="">Select...</option>
                  <option value="arrival">Arrival</option>
                  <option value="departure">Departure</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-primary">Date *</label>
                <input name="_date" type="date" required className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-primary">Window Start *</label>
                <input name="timeWindowStart" type="time" required className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-primary">Window End *</label>
                <input name="timeWindowEnd" type="time" required className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-primary">City *</label>
              <input name="sourceCity" type="text" required placeholder="Mumbai" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-primary">Pickup Hub *</label>
                <input name="pickupHub" type="text" required placeholder="CSIA T2" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-primary">Drop Hub *</label>
                <input name="dropHub" type="text" required placeholder="Taj Hotel" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
              </div>
            </div>
            <input type="hidden" name="pickupHubType" value="other" />
            <input type="hidden" name="dropHubType" value="other" />
            <input type="hidden" name="batchSource" value="manual" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Batch'}
              </button>
              <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-border/30">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <SuggestionsPanel eventId={eventId} suggestions={suggestions} />

      {/* Batch List — card view (mobile/tablet) or table view (desktop) */}
      {grouped.length > 0 ? (
        isMobile ? (
          <div data-testid="transport-cards" className="mt-6 space-y-6">
            {grouped.map((dateGroup) => (
              <section key={dateGroup.date}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {dateGroup.date}
                </h2>
                <div className="space-y-3">
                  {dateGroup.batches.map((batch) => {
                    const style = STATUS_STYLES[batch.batchStatus] || STATUS_STYLES.planned;
                    return (
                      <Link
                        key={batch.id}
                        href={`/events/${eventId}/transport/assign/${batch.id}`}
                        className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Bus className="h-4 w-4 text-text-muted" />
                            <span className="text-sm font-medium text-text-primary">
                              {batch.pickupHub} → {batch.dropHub}
                            </span>
                            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', style.color)}>
                              {style.label}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-text-muted">
                            <span>{MOVEMENT_LABELS[batch.movementType] || batch.movementType}</span>
                            <span>
                              {format(new Date(batch.timeWindowStart), 'HH:mm')} – {format(new Date(batch.timeWindowEnd), 'HH:mm')}
                            </span>
                            <span>{batch.sourceCity}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-text-muted" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div data-testid="transport-table" className="mt-6 space-y-6">
            {grouped.map((dateGroup) => (
              <section key={dateGroup.date}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {dateGroup.date}
                </h2>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface text-left text-xs font-medium text-text-muted">
                        <th className="px-4 py-3">Route</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">City</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3"><span className="sr-only">Action</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateGroup.batches.map((batch) => {
                        const style = STATUS_STYLES[batch.batchStatus] || STATUS_STYLES.planned;
                        return (
                          <tr key={batch.id} className="border-b border-border last:border-b-0 hover:bg-surface/50">
                            <td className="px-4 py-3">
                              <Link
                                href={`/events/${eventId}/transport/assign/${batch.id}`}
                                className="flex items-center gap-2 font-medium text-text-primary hover:text-accent"
                              >
                                <Bus className="h-4 w-4 text-text-muted" />
                                {batch.pickupHub} → {batch.dropHub}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
                              {MOVEMENT_LABELS[batch.movementType] || batch.movementType}
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
                              {format(new Date(batch.timeWindowStart), 'HH:mm')} – {format(new Date(batch.timeWindowEnd), 'HH:mm')}
                            </td>
                            <td className="px-4 py-3 text-text-secondary">{batch.sourceCity}</td>
                            <td className="px-4 py-3">
                              <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', style.color)}>
                                {style.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/events/${eventId}/transport/assign/${batch.id}`}
                                className="text-text-muted hover:text-accent"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-light">
            <Bus className="h-8 w-8 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">No transport batches</p>
            <p className="text-sm text-text-secondary">Create batches to organize passenger transport</p>
          </div>
        </div>
      )}
    </div>
  );
}

function groupBatches(batches: TransportBatch[]) {
  const dateMap = new Map<string, TransportBatch[]>();

  for (const batch of batches) {
    const dateKey = format(new Date(batch.serviceDate), 'EEEE, MMM d, yyyy');
    const existing = dateMap.get(dateKey) || [];
    existing.push(batch);
    dateMap.set(dateKey, existing);
  }

  return Array.from(dateMap.entries()).map(([date, batches]) => ({
    date,
    batches: batches.sort(
      (a, b) => new Date(a.timeWindowStart).getTime() - new Date(b.timeWindowStart).getTime(),
    ),
  }));
}
