'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, Filter, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/use-role';
import { updateRegistrationStatus } from '@/lib/actions/registration';

type Registration = {
  id: string;
  eventId: string;
  personId: string;
  registrationNumber: string;
  category: string;
  age: number | null;
  status: string;
  qrCodeToken: string;
  registeredAt: Date | string;
  cancelledAt: Date | string | null;
  personName: string;
  personEmail: string | null;
  personPhone: string | null;
  personOrganization: string | null;
};

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  confirmed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  pending: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
  waitlisted: { icon: AlertTriangle, color: 'text-accent', bg: 'bg-accent-light' },
  declined: { icon: XCircle, color: 'text-error', bg: 'bg-error/10' },
  cancelled: { icon: XCircle, color: 'text-text-muted', bg: 'bg-border' },
};

const STATUS_FILTERS = ['all', 'pending', 'confirmed', 'waitlisted', 'declined', 'cancelled'] as const;

export function RegistrationsListClient({
  eventId,
  registrations,
}: {
  eventId: string;
  registrations: Registration[];
}) {
  const router = useRouter();
  const { canWrite } = useRole();
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const filtered = registrations.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.personName.toLowerCase().includes(q) ||
        r.registrationNumber.toLowerCase().includes(q) ||
        r.personEmail?.toLowerCase().includes(q) ||
        r.personPhone?.includes(q)
      );
    }
    return true;
  });

  const statusCounts = registrations.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  async function handleStatusChange(registrationId: string, newStatus: string) {
    setError('');
    startTransition(async () => {
      try {
        await updateRegistrationStatus({ registrationId, newStatus });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update status');
      }
    });
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/events/${eventId}`}
          className="text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Registrations</h1>
          <p className="text-sm text-text-secondary">{registrations.length} total</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* Status summary */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(['confirmed', 'pending', 'waitlisted'] as const).map((s) => {
          const config = STATUS_CONFIG[s];
          const Icon = config.icon;
          return (
            <div key={s} className={cn('rounded-lg p-3 text-center', config.bg)}>
              <Icon className={cn('mx-auto h-4 w-4', config.color)} />
              <p className="mt-1 text-lg font-bold text-text-primary">{statusCounts[s] || 0}</p>
              <p className="text-[10px] capitalize text-text-muted">{s}</p>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search name, reg number, email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Status filters */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors',
              statusFilter === s
                ? 'bg-primary text-white'
                : 'border border-border bg-surface text-text-secondary hover:border-accent',
            )}
          >
            {s} {s !== 'all' && statusCounts[s] ? `(${statusCounts[s]})` : ''}
          </button>
        ))}
      </div>

      {/* List */}
      <div className={cn('mt-4 space-y-2 transition-opacity', isPending && 'opacity-50')}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Filter className="h-10 w-10 text-text-muted" />
            <p className="mt-3 font-medium text-text-primary">No registrations found</p>
            <p className="text-sm text-text-secondary">
              {searchQuery ? 'Try a different search' : 'No registrations yet'}
            </p>
          </div>
        ) : (
          filtered.map((reg) => (
            <RegistrationCard
              key={reg.id}
              registration={reg}
              canWrite={canWrite}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </div>
  );
}

function RegistrationCard({
  registration: reg,
  canWrite,
  onStatusChange,
}: {
  registration: Registration;
  canWrite: boolean;
  onStatusChange: (id: string, status: string) => void;
}) {
  const config = STATUS_CONFIG[reg.status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  const regDate = new Date(reg.registeredAt);

  // Determine available actions based on current status
  const actions: { label: string; status: string; variant: string }[] = [];
  if (reg.status === 'pending') {
    actions.push({ label: 'Approve', status: 'confirmed', variant: 'success' });
    actions.push({ label: 'Decline', status: 'declined', variant: 'error' });
    actions.push({ label: 'Waitlist', status: 'waitlisted', variant: 'warning' });
    actions.push({ label: 'Cancel', status: 'cancelled', variant: 'error' });
  } else if (reg.status === 'waitlisted') {
    actions.push({ label: 'Approve', status: 'confirmed', variant: 'success' });
    actions.push({ label: 'Decline', status: 'declined', variant: 'error' });
    actions.push({ label: 'Cancel', status: 'cancelled', variant: 'error' });
  } else if (reg.status === 'confirmed') {
    actions.push({ label: 'Cancel', status: 'cancelled', variant: 'error' });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/people/${reg.personId}`}
              className="truncate font-medium text-text-primary hover:text-primary"
            >
              {reg.personName}
            </Link>
            <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', config.bg, config.color)}>
              <Icon className="h-3 w-3" />
              {reg.status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">{reg.registrationNumber}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-muted">
            {reg.personEmail && <span>{reg.personEmail}</span>}
            {reg.personOrganization && <span>{reg.personOrganization}</span>}
          </div>
          <p className="mt-1 text-[10px] text-text-muted">
            {regDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      {canWrite && actions.length > 0 && (
        <div className="mt-3 flex gap-2">
          {actions.map((action) => (
            <button
              key={action.status}
              onClick={() => onStatusChange(reg.id, action.status)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium',
                action.variant === 'success' && 'bg-success/10 text-success hover:bg-success/20',
                action.variant === 'error' && 'bg-error/10 text-error hover:bg-error/20',
                action.variant === 'warning' && 'bg-warning/10 text-warning hover:bg-warning/20',
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
