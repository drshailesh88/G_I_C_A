'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Hotel, AlertTriangle, CheckCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { cancelAccommodationRecord } from '@/lib/actions/accommodation';
import { reviewFlag, resolveFlag } from '@/lib/actions/red-flag-actions';

type AccommodationRecord = {
  id: string;
  eventId: string;
  personId: string;
  hotelName: string;
  hotelCity: string | null;
  roomType: string | null;
  roomNumber: string | null;
  sharedRoomGroup: string | null;
  checkInDate: Date;
  checkOutDate: Date;
  recordStatus: string;
  personName: string;
  personEmail: string | null;
  personPhone: string | null;
};

type RedFlag = {
  id: string;
  flagType: string;
  flagDetail: string;
  flagStatus: string;
  targetEntityId: string;
  createdAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-800 border-green-300' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  changed: { label: 'Changed', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
};

const FLAG_STATUS_STYLES: Record<string, { color: string; bgColor: string }> = {
  unreviewed: { color: 'text-red-700', bgColor: 'bg-red-100 border-red-300' },
  reviewed: { color: 'text-amber-700', bgColor: 'bg-amber-100 border-amber-300' },
};

export function AccommodationListClient({
  eventId,
  records,
  flags,
  flaggedIds,
}: {
  eventId: string;
  records: AccommodationRecord[];
  flags: RedFlag[];
  flaggedIds: string[];
}) {
  const router = useRouter();
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reviewingFlag, setReviewingFlag] = useState<string | null>(null);

  // Build a lookup: recordId -> flags for that record
  const flagsByRecord = new Map<string, RedFlag[]>();
  for (const flag of flags) {
    const existing = flagsByRecord.get(flag.targetEntityId) || [];
    existing.push(flag);
    flagsByRecord.set(flag.targetEntityId, existing);
  }

  const displayRecords = showFlaggedOnly
    ? records.filter((r) => flaggedIds.includes(r.id))
    : records;

  const active = displayRecords.filter((r) => r.recordStatus !== 'cancelled');
  const cancelled = displayRecords.filter((r) => r.recordStatus === 'cancelled');

  async function handleCancel(recordId: string) {
    if (!confirm('Cancel this accommodation record? This cannot be undone.')) return;
    setCancelling(recordId);
    try {
      await cancelAccommodationRecord(eventId, { accommodationRecordId: recordId });
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setCancelling(null);
    }
  }

  async function handleReviewFlag(flagId: string) {
    setReviewingFlag(flagId);
    try {
      await reviewFlag(eventId, flagId);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to review flag');
    } finally {
      setReviewingFlag(null);
    }
  }

  async function handleResolveFlag(flagId: string) {
    setReviewingFlag(flagId);
    try {
      await resolveFlag(eventId, flagId);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to resolve flag');
    } finally {
      setReviewingFlag(null);
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
          <h1 className="text-xl font-bold text-text-primary">Accommodation</h1>
        </div>
        <Link
          href={`/events/${eventId}/accommodation/new`}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
        >
          <Plus className="h-4 w-4" />
          Add
        </Link>
      </div>

      {/* Flagged Only Toggle */}
      {flaggedIds.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
              showFlaggedOnly
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-border text-text-secondary hover:bg-border/30',
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Show flagged only ({flaggedIds.length})
          </button>
        </div>
      )}

      {/* Active Records */}
      {active.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Active ({active.length})
          </h2>
          <div className="flex flex-col gap-3">
            {active.map((record) => (
              <AccommodationCard
                key={record.id}
                record={record}
                eventId={eventId}
                flags={flagsByRecord.get(record.id) || []}
                onCancel={handleCancel}
                onReviewFlag={handleReviewFlag}
                onResolveFlag={handleResolveFlag}
                cancelling={cancelling === record.id}
                reviewingFlag={reviewingFlag}
              />
            ))}
          </div>
        </section>
      )}

      {/* Cancelled Records */}
      {cancelled.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Cancelled ({cancelled.length})
          </h2>
          <div className="flex flex-col gap-3">
            {cancelled.map((record) => (
              <AccommodationCard
                key={record.id}
                record={record}
                eventId={eventId}
                flags={[]}
                onCancel={handleCancel}
                onReviewFlag={handleReviewFlag}
                onResolveFlag={handleResolveFlag}
                cancelling={false}
                reviewingFlag={null}
              />
            ))}
          </div>
        </section>
      )}

      {records.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-light">
            <Hotel className="h-8 w-8 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">No accommodation records</p>
            <p className="text-sm text-text-secondary">Add accommodation details for event participants</p>
          </div>
          <Link
            href={`/events/${eventId}/accommodation/new`}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-light"
          >
            Add Accommodation
          </Link>
        </div>
      )}
    </div>
  );
}

function AccommodationCard({
  record,
  eventId,
  flags,
  onCancel,
  onReviewFlag,
  onResolveFlag,
  cancelling,
  reviewingFlag,
}: {
  record: AccommodationRecord;
  eventId: string;
  flags: RedFlag[];
  onCancel: (id: string) => void;
  onReviewFlag: (id: string) => void;
  onResolveFlag: (id: string) => void;
  cancelling: boolean;
  reviewingFlag: string | null;
}) {
  const style = STATUS_STYLES[record.recordStatus] || STATUS_STYLES.draft;
  const isCancelled = record.recordStatus === 'cancelled';

  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4', isCancelled && 'opacity-60')}>
      <Link href={`/events/${eventId}/accommodation/${record.id}`} className="block">
        <div className="flex items-start justify-between">
          <span className="font-medium text-text-primary">{record.personName}</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', style.color)}>
            {style.label}
          </span>
        </div>
        <div className="mt-2 text-sm text-text-secondary">
          <span className="font-medium">{record.hotelName}</span>
          {record.hotelCity && <span className="text-text-muted"> · {record.hotelCity}</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-4 text-xs text-text-muted">
          <span>
            {format(new Date(record.checkInDate), 'MMM d')} – {format(new Date(record.checkOutDate), 'MMM d')}
          </span>
          {record.roomType && <span>{record.roomType}</span>}
          {record.roomNumber && <span>Room {record.roomNumber}</span>}
          {record.sharedRoomGroup && <span>Group: {record.sharedRoomGroup}</span>}
        </div>
      </Link>

      {/* Red Flags */}
      {flags.length > 0 && (
        <div className="mt-3 space-y-2">
          {flags.map((flag) => {
            const flagStyle = FLAG_STATUS_STYLES[flag.flagStatus] || FLAG_STATUS_STYLES.unreviewed;
            return (
              <div
                key={flag.id}
                className={cn('rounded-lg border p-2.5', flagStyle.bgColor)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', flagStyle.color)} />
                    <div>
                      <p className={cn('text-xs font-medium', flagStyle.color)}>{flag.flagDetail}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  {flag.flagStatus === 'unreviewed' && (
                    <button
                      onClick={() => onReviewFlag(flag.id)}
                      disabled={reviewingFlag === flag.id}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                    >
                      <Eye className="h-3 w-3" />
                      Mark Reviewed
                    </button>
                  )}
                  {(flag.flagStatus === 'unreviewed' || flag.flagStatus === 'reviewed') && (
                    <button
                      onClick={() => onResolveFlag(flag.id)}
                      disabled={reviewingFlag === flag.id}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
                    >
                      <CheckCircle className="h-3 w-3" />
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isCancelled && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => onCancel(record.id)}
            disabled={cancelling}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Cancel'}
          </button>
        </div>
      )}
    </div>
  );
}
