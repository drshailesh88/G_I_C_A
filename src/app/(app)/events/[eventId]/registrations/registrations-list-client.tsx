'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Filter, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/use-role';
import { ResponsiveList, type Column } from '@/components/responsive/responsive-list';
import { ResponsiveMetricGrid } from '@/components/responsive/responsive-metric-grid';

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

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', config.bg, config.color)}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

// ── Column definitions (priority: high=mobile, medium=tablet, low=desktop) ──

function getColumns(
  canWrite: boolean,
): Column<Registration>[] {
  const cols: Column<Registration>[] = [
    {
      key: 'name',
      header: 'Name',
      priority: 'high',
      render: (reg) => (
        <Link href={`/people/${reg.personId}`} className="font-medium text-text-primary hover:text-accent">
          {reg.personName}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      priority: 'high',
      render: (reg) => <StatusBadge status={reg.status} />,
    },
    {
      key: 'category',
      header: 'Category',
      priority: 'medium',
      render: (reg) => (
        <span className="text-text-secondary capitalize">{reg.category}</span>
      ),
    },
    {
      key: 'date',
      header: 'Registered',
      priority: 'medium',
      render: (reg) => (
        <span className="text-text-secondary">
          {new Date(reg.registeredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      priority: 'medium',
      render: (reg) => {
        const actions = getActions(reg.status);
        if (!canWrite || actions.length === 0) return <span className="text-text-muted">—</span>;
        return (
          <div className="flex gap-2">
            {actions.map((action) => (
              <form
                key={action.status}
                action={`/events/${reg.eventId}/registrations/${reg.id}/status`}
                method="post"
              >
                <input type="hidden" name="newStatus" value={action.status} />
                <button
                  type="submit"
                  className={cn(
                    'min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-medium',
                    action.variant === 'success' && 'bg-success/10 text-success hover:bg-success/20',
                    action.variant === 'error' && 'bg-error/10 text-error hover:bg-error/20',
                    action.variant === 'warning' && 'bg-warning/10 text-warning hover:bg-warning/20',
                  )}
                >
                  {action.label}
                </button>
              </form>
            ))}
          </div>
        );
      },
    },
  ];
  return cols;
}

function getActions(status: string): { label: string; status: string; variant: string }[] {
  if (status === 'pending') {
    return [
      { label: 'Approve', status: 'confirmed', variant: 'success' },
      { label: 'Decline', status: 'declined', variant: 'error' },
      { label: 'Waitlist', status: 'waitlisted', variant: 'warning' },
      { label: 'Cancel', status: 'cancelled', variant: 'error' },
    ];
  }
  if (status === 'waitlisted') {
    return [
      { label: 'Approve', status: 'confirmed', variant: 'success' },
      { label: 'Decline', status: 'declined', variant: 'error' },
      { label: 'Cancel', status: 'cancelled', variant: 'error' },
    ];
  }
  if (status === 'confirmed') {
    return [{ label: 'Cancel', status: 'cancelled', variant: 'error' }];
  }
  return [];
}

export function RegistrationsListClient({
  eventId,
  registrations,
  canWriteOverride,
}: {
  eventId: string;
  registrations: Registration[];
  canWriteOverride?: boolean;
}) {
  const { canWrite } = useRole();
  const effectiveCanWrite = canWriteOverride ?? canWrite;
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  const columns = getColumns(effectiveCanWrite);

  const emptyState = (
    <div className="flex flex-col items-center py-12 text-center">
      <Filter className="h-10 w-10 text-text-muted" />
      <p className="mt-3 font-medium text-text-primary">No registrations found</p>
      <p className="text-sm text-text-secondary">
        {searchQuery ? 'Try a different search' : 'No registrations yet'}
      </p>
    </div>
  );

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

      {/* Status summary — auto-reflow via ResponsiveMetricGrid */}
      <ResponsiveMetricGrid minCardWidth={120} gap="var(--space-xs)" className="mt-4">
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
      </ResponsiveMetricGrid>

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

      {/* List — responsive: cards on mobile/tablet, table on desktop */}
      <div className="mt-4 foldable-left-pane">
        <ResponsiveList
          data={filtered}
          columns={columns}
          renderCard={(reg) => (
            <RegistrationCard
              registration={reg}
              canWrite={effectiveCanWrite}
            />
          )}
          keyExtractor={(reg) => reg.id}
          emptyState={emptyState}
          isLoading={false}
        />
      </div>
    </div>
  );
}

// ── Registration Card (mobile/tablet view) ──

function RegistrationCard({
  registration: reg,
  canWrite,
}: {
  registration: Registration;
  canWrite: boolean;
}) {
  const regDate = new Date(reg.registeredAt);
  const actions = getActions(reg.status);

  return (
    <div className="min-h-[44px] rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/people/${reg.personId}`}
              className="truncate font-medium text-text-primary hover:text-primary"
            >
              {reg.personName}
            </Link>
            <StatusBadge status={reg.status} />
          </div>
          <p className="mt-0.5 text-xs text-text-muted">{reg.registrationNumber}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-text-muted">
            {reg.category && <span className="capitalize">{reg.category}</span>}
            {reg.personEmail && <span>{reg.personEmail}</span>}
            {reg.personOrganization && <span>{reg.personOrganization}</span>}
          </div>
          <p className="mt-1 text-[10px] text-text-muted">
            {regDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {canWrite && actions.length > 0 && (
        <div className="mt-3 flex gap-2">
          {actions.map((action) => (
            <form
              key={action.status}
              action={`/events/${reg.eventId}/registrations/${reg.id}/status`}
              method="post"
            >
              <input type="hidden" name="newStatus" value={action.status} />
              <button
                type="submit"
                className={cn(
                  'min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-medium',
                  action.variant === 'success' && 'bg-success/10 text-success hover:bg-success/20',
                  action.variant === 'error' && 'bg-error/10 text-error hover:bg-error/20',
                  action.variant === 'warning' && 'bg-warning/10 text-warning hover:bg-warning/20',
                )}
              >
                {action.label}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
