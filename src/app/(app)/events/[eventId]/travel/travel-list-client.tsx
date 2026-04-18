'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Plane, Train, Car, Bus, AlertTriangle, MoreVertical, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { cancelTravelRecord } from '@/lib/actions/travel';
import { ResponsiveList, type Column } from '@/components/responsive/responsive-list';
import { ResendNotificationDialog } from './resend-notification-dialog';

type TravelRecord = {
  id: string;
  eventId: string;
  personId: string;
  direction: string;
  travelMode: string;
  fromCity: string;
  toCity: string;
  departureAtUtc: Date | null;
  arrivalAtUtc: Date | null;
  pnrOrBookingRef: string | null;
  recordStatus: string;
  personName: string;
  personEmail: string | null;
  personPhone: string | null;
  carrierName: string | null;
  serviceNumber: string | null;
  registrationId: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  terminalOrGate: string | null;
  cancelledAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  flagCount: number;
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-800 border-green-300' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  changed: { label: 'Changed', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
};

const DIRECTION_LABELS: Record<string, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
  intercity: 'Intercity',
  other: 'Other',
};

const MODE_ICONS: Record<string, typeof Plane> = {
  flight: Plane,
  train: Train,
  car: Car,
  bus: Bus,
};

function formatDates(record: TravelRecord) {
  const parts: string[] = [];
  if (record.departureAtUtc) {
    parts.push(`Dep: ${format(new Date(record.departureAtUtc), 'MMM d, HH:mm')}`);
  }
  if (record.arrivalAtUtc) {
    parts.push(`Arr: ${format(new Date(record.arrivalAtUtc), 'MMM d, HH:mm')}`);
  }
  return parts.join(' · ');
}

function RowActionsMenu({ onResend }: { onResend: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative" data-testid="row-actions-menu">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded p-1.5 hover:bg-border/50"
        aria-label="More actions"
        data-testid="row-actions-trigger"
      >
        <MoreVertical className="h-4 w-4 text-text-muted" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-10 w-52 rounded-lg border border-border bg-white py-1 shadow-lg"
          data-testid="row-actions-dropdown"
        >
          <button
            type="button"
            onClick={() => { setOpen(false); onResend(); }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-text-primary hover:bg-border/30"
            data-testid="resend-menu-item"
          >
            <Send className="h-4 w-4 text-text-muted" />
            Resend Notification
          </button>
        </div>
      )}
    </div>
  );
}

function buildColumns({
  onCancel,
  cancellingId,
  onResend,
}: {
  onCancel: (id: string) => void;
  cancellingId: string | null;
  onResend: (record: TravelRecord) => void;
}): Column<TravelRecord>[] {
  return [
    {
      key: 'name',
      header: 'Name',
      priority: 'high',
      render: (r) => {
        const ModeIcon = MODE_ICONS[r.travelMode] || Plane;
        return (
          <div className="flex items-center gap-2">
            <ModeIcon className="h-4 w-4 text-text-muted" />
            <span className="font-medium text-text-primary">{r.personName}</span>
          </div>
        );
      },
    },
    {
      key: 'route',
      header: 'Route',
      priority: 'high',
      render: (r) => (
        <span className="text-sm text-text-secondary">
          {r.fromCity} → {r.toCity}
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      priority: 'medium',
      render: (r) => (
        <span className="text-sm text-text-muted">{formatDates(r)}</span>
      ),
    },
    {
      key: 'flight',
      header: 'Flight / PNR',
      priority: 'medium',
      render: (r) => (
        <span className="text-sm text-text-muted">
          {[r.serviceNumber, r.pnrOrBookingRef].filter(Boolean).join(' / ') || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      priority: 'medium',
      render: (r) => {
        const style = STATUS_STYLES[r.recordStatus] || STATUS_STYLES.draft;
        return (
          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', style.color)}>
            {style.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      priority: 'medium',
      render: (r) =>
        r.recordStatus === 'cancelled' ? (
          <span className="text-text-muted">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCancel(r.id);
              }}
              disabled={cancellingId === r.id}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              {cancellingId === r.id ? 'Cancelling...' : 'Cancel'}
            </button>
            <RowActionsMenu onResend={() => onResend(r)} />
          </div>
        ),
    },
    {
      key: 'flags',
      header: 'Flags',
      priority: 'low',
      render: (r) =>
        r.flagCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            <AlertTriangle className="h-3 w-3" />
            {r.flagCount}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
  ];
}

function TravelCard({
  record,
  eventId,
  onCancel,
  cancelling,
  onResend,
}: {
  record: TravelRecord;
  eventId: string;
  onCancel: (id: string) => void;
  cancelling: boolean;
  onResend: (record: TravelRecord) => void;
}) {
  const style = STATUS_STYLES[record.recordStatus] || STATUS_STYLES.draft;
  const ModeIcon = MODE_ICONS[record.travelMode] || Plane;
  const isCancelled = record.recordStatus === 'cancelled';

  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4', isCancelled && 'opacity-60')}>
      <Link href={`/events/${eventId}/travel/${record.id}`} className="block">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <ModeIcon className="h-4 w-4 text-text-muted" />
            <span className="font-medium text-text-primary">{record.personName}</span>
          </div>
          <div className="flex items-center gap-2">
            {record.flagCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                <AlertTriangle className="h-3 w-3" />
                {record.flagCount}
              </span>
            )}
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', style.color)}>
              {style.label}
            </span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-text-secondary">
          <span>{record.fromCity}</span>
          <span className="text-text-muted">→</span>
          <span>{record.toCity}</span>
          <span className="ml-2 text-xs text-text-muted">
            {DIRECTION_LABELS[record.direction] || record.direction}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-4 text-xs text-text-muted">
          {record.departureAtUtc && (
            <span>Dep: {format(new Date(record.departureAtUtc), 'MMM d, HH:mm')}</span>
          )}
          {record.arrivalAtUtc && (
            <span>Arr: {format(new Date(record.arrivalAtUtc), 'MMM d, HH:mm')}</span>
          )}
          {record.pnrOrBookingRef && <span>PNR: {record.pnrOrBookingRef}</span>}
        </div>
      </Link>
      {!isCancelled && (
        <div className="mt-3 flex items-center justify-end gap-3">
          <button
            onClick={() => onCancel(record.id)}
            disabled={cancelling}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Cancel'}
          </button>
          <RowActionsMenu onResend={() => onResend(record)} />
        </div>
      )}
    </div>
  );
}

export function TravelListClient({
  eventId,
  records,
}: {
  eventId: string;
  records: TravelRecord[];
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [resendRecord, setResendRecord] = useState<TravelRecord | null>(null);
  const columns = buildColumns({ onCancel: handleCancel, cancellingId: cancelling, onResend: setResendRecord });

  const active = records.filter((r) => r.recordStatus !== 'cancelled');
  const cancelled = records.filter((r) => r.recordStatus === 'cancelled');

  async function handleCancel(recordId: string) {
    if (!confirm('Cancel this travel record? This cannot be undone.')) return;
    setCancelling(recordId);
    try {
      await cancelTravelRecord(eventId, { travelRecordId: recordId });
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setCancelling(null);
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
          <h1 className="text-xl font-bold text-text-primary">Travel</h1>
        </div>
        <Link
          href={`/events/${eventId}/travel/new`}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
        >
          <Plus className="h-4 w-4" />
          Add
        </Link>
      </div>

      {/* Active Records */}
      {active.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Active ({active.length})
          </h2>
          <ResponsiveList
            data={active}
            columns={columns}
            keyExtractor={(r) => r.id}
            renderCard={(record) => (
              <TravelCard
                record={record}
                eventId={eventId}
                onCancel={handleCancel}
                cancelling={cancelling === record.id}
                onResend={setResendRecord}
              />
            )}
            onRowClick={(record) => router.push(`/events/${eventId}/travel/${record.id}`)}
          />
        </section>
      )}

      {/* Cancelled Records */}
      {cancelled.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Cancelled ({cancelled.length})
          </h2>
          <ResponsiveList
            data={cancelled}
            columns={columns}
            keyExtractor={(r) => r.id}
            renderCard={(record) => (
              <TravelCard
                record={record}
                eventId={eventId}
                onCancel={handleCancel}
                cancelling={false}
                onResend={setResendRecord}
              />
            )}
          />
        </section>
      )}

      {/* Resend notification dialog */}
      {resendRecord && (
        <ResendNotificationDialog
          open={true}
          onClose={() => setResendRecord(null)}
          eventId={eventId}
          recordId={resendRecord.id}
          personName={resendRecord.personName}
          personEmail={resendRecord.personEmail}
          personPhone={resendRecord.personPhone}
          notificationType="travel"
        />
      )}

      {records.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-light">
            <Plane className="h-8 w-8 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">No travel records</p>
            <p className="text-sm text-text-secondary">Add travel details for event participants</p>
          </div>
          <Link
            href={`/events/${eventId}/travel/new`}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-light"
          >
            Add Travel Record
          </Link>
        </div>
      )}
    </div>
  );
}
