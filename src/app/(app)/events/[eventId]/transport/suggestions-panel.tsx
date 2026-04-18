'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { RefreshCw, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { SuggestedBatch } from '@/lib/actions/transport';
import { cn } from '@/lib/utils';

type SuggestionsPanelProps = {
  eventId: string;
  suggestions: SuggestedBatch[];
};

const MOVEMENT_STYLES: Record<string, string> = {
  arrival: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  departure: 'bg-sky-100 text-sky-800 border-sky-200',
};

const MOVEMENT_LABELS: Record<string, string> = {
  arrival: 'Arrival',
  departure: 'Departure',
};

export function SuggestionsPanel({ eventId, suggestions }: SuggestionsPanelProps) {
  const router = useRouter();
  const [refreshError, setRefreshError] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [mergeOpenId, setMergeOpenId] = useState<string | null>(null);
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [splitOpenId, setSplitOpenId] = useState<string | null>(null);
  const [splitSelections, setSplitSelections] = useState<Record<string, string[]>>({});

  if (suggestions.length === 0) {
    return null;
  }

  const isBusy = pendingAction !== null;
  const suggestionOptions = suggestions.map((suggestion) => ({
    id: suggestion.id,
    route: `${suggestion.pickupHub} → ${suggestion.dropHub}`,
  }));

  async function runPendingAction(
    key: string,
    batchId: string | null,
    action: () => Promise<void>,
  ) {
    setPendingAction(key);
    setRefreshError('');
    if (batchId) {
      setActionErrors((current) => ({ ...current, [batchId]: '' }));
    }

    try {
      await action();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      if (batchId) {
        setActionErrors((current) => ({ ...current, [batchId]: message }));
      } else {
        setRefreshError(message);
      }
    } finally {
      setPendingAction(null);
    }
  }

  function toggleSplitSelection(batchId: string, passengerId: string) {
    setSplitSelections((current) => {
      const existing = current[batchId] ?? [];
      const next = existing.includes(passengerId)
        ? existing.filter((id) => id !== passengerId)
        : [...existing, passengerId];
      return { ...current, [batchId]: next };
    });
  }

  return (
    <div
      data-testid="suggestions-panel"
      className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Suggested Batches</h2>
          <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {suggestions.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            runPendingAction('refresh', null, async () => {
              const { refreshTransportSuggestions } = await import('@/lib/actions/transport');
              await refreshTransportSuggestions(eventId);
            })
          }
          disabled={isBusy}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn('h-4 w-4', pendingAction === 'refresh' && 'animate-spin')} />
          {pendingAction === 'refresh' ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {refreshError ? (
        <p className="mt-3 text-sm text-red-600">{refreshError}</p>
      ) : null}

      <div className="mt-4 grid gap-4">
        {suggestions.map((suggestion) => {
          const selectedPassengers = splitSelections[suggestion.id] ?? [];
          const canMerge = suggestions.length >= 2;
          const canSplit = suggestion.passengers.length >= 2;
          const mergeTarget = mergeTargets[suggestion.id] ?? '';
          const movementLabel = MOVEMENT_LABELS[suggestion.movementType] ?? suggestion.movementType;

          return (
            <article
              key={suggestion.id}
              data-testid="suggestion-card"
              className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-text-primary">
                      {suggestion.pickupHub} → {suggestion.dropHub}
                    </h3>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium',
                        MOVEMENT_STYLES[suggestion.movementType] ?? 'bg-slate-100 text-slate-800 border-slate-200',
                      )}
                    >
                      {movementLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
                    <span>{format(new Date(suggestion.serviceDate), 'dd MMM yyyy')}</span>
                    <span>
                      {format(new Date(suggestion.timeWindowStart), 'HH:mm')} - {format(new Date(suggestion.timeWindowEnd), 'HH:mm')}
                    </span>
                    <span>{suggestion.sourceCity}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {suggestion.passengers.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestion.passengers.map((passenger) => {
                      const active = selectedPassengers.includes(passenger.id);
                      return (
                        <button
                          key={passenger.id}
                          type="button"
                          onClick={() => {
                            if (!splitOpenId || splitOpenId !== suggestion.id || isBusy) return;
                            toggleSplitSelection(suggestion.id, passenger.id);
                          }}
                          disabled={isBusy}
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs font-medium',
                            splitOpenId === suggestion.id && active
                              ? 'border-amber-500 bg-amber-100 text-amber-900'
                              : 'border-border bg-surface text-text-secondary',
                          )}
                        >
                          {passenger.personName ?? passenger.personId}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2 lg:min-w-[260px]">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        runPendingAction(`accept:${suggestion.id}`, suggestion.id, async () => {
                          const { acceptSuggestion } = await import('@/lib/actions/transport');
                          await acceptSuggestion(eventId, suggestion.id);
                        })
                      }
                      disabled={isBusy}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === `accept:${suggestion.id}` ? 'Accepting...' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runPendingAction(`discard:${suggestion.id}`, suggestion.id, async () => {
                          const { discardSuggestion } = await import('@/lib/actions/transport');
                          await discardSuggestion(eventId, suggestion.id);
                        })
                      }
                      disabled={isBusy}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      {pendingAction === `discard:${suggestion.id}` ? 'Discarding...' : 'Discard'}
                    </button>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setMergeOpenId((current) => (current === suggestion.id ? null : suggestion.id))
                        }
                        disabled={isBusy || !canMerge}
                        className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Merge
                      </button>
                      {mergeOpenId === suggestion.id ? (
                        <>
                          <select
                            value={mergeTarget}
                            onChange={(event) =>
                              setMergeTargets((current) => ({
                                ...current,
                                [suggestion.id]: event.target.value,
                              }))
                            }
                            disabled={isBusy}
                            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                          >
                            <option value="">Select target</option>
                            {suggestionOptions
                              .filter((option) => option.id !== suggestion.id)
                              .map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.route}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              runPendingAction(`merge:${suggestion.id}`, suggestion.id, async () => {
                                const { mergeSuggestions } = await import('@/lib/actions/transport');
                                await mergeSuggestions(eventId, mergeTarget, suggestion.id);
                              })
                            }
                            disabled={isBusy || mergeTarget.length === 0}
                            className="rounded-lg bg-text-primary px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {pendingAction === `merge:${suggestion.id}` ? 'Merging...' : 'Confirm Merge'}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSplitOpenId((current) => (current === suggestion.id ? null : suggestion.id))
                        }
                        disabled={isBusy || !canSplit}
                        className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Split
                      </button>
                      {splitOpenId === suggestion.id ? (
                        <button
                          type="button"
                          onClick={() =>
                            runPendingAction(`split:${suggestion.id}`, suggestion.id, async () => {
                              const { splitSuggestion } = await import('@/lib/actions/transport');
                              await splitSuggestion(eventId, suggestion.id, selectedPassengers);
                            })
                          }
                          disabled={isBusy || selectedPassengers.length === 0}
                          className="rounded-lg bg-text-primary px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingAction === `split:${suggestion.id}` ? 'Splitting...' : 'Confirm Split'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {actionErrors[suggestion.id] ? (
                <p className="mt-3 text-sm text-red-600">{actionErrors[suggestion.id]}</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
