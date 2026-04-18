'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  MapPin,
  Stethoscope,
  Archive,
  RotateCcw,
  ShieldAlert,
  Pencil,
  ChevronLeft,
  ChevronRight,
  GitMerge,
  Clock,
} from 'lucide-react';
import { useRole } from '@/hooks/use-role';
import { archivePerson, restorePerson, anonymizePerson, getPersonHistory, type PersonHistoryResult, type PersonHistoryRow } from '@/lib/actions/person';

type Person = {
  id: string;
  salutation: string | null;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  designation: string | null;
  specialty: string | null;
  organization: string | null;
  city: string | null;
  tags: unknown;
  archivedAt: Date | string | null;
  anonymizedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: string;
};

const EMPTY_HISTORY: PersonHistoryResult = { rows: [], total: 0, page: 1, totalPages: 0 };

export function PersonDetailClient({
  person,
  initialHistory = EMPTY_HISTORY,
}: {
  person: Person;
  initialHistory?: PersonHistoryResult;
}) {
  const router = useRouter();
  const { isLoaded, isSuperAdmin, isReadOnly } = useRole();
  const canWrite = isLoaded && !isReadOnly;
  const [isPending, startTransition] = useTransition();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showAnonymizeConfirm, setShowAnonymizeConfirm] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<PersonHistoryResult>(initialHistory);
  const [historyLoading, setHistoryLoading] = useState(false);

  function loadHistoryPage(page: number) {
    setHistoryLoading(true);
    startTransition(async () => {
      try {
        const result = await getPersonHistory(person.id, page);
        setHistory(result);
      } catch {
        // history load failure is non-fatal; keep current view
      } finally {
        setHistoryLoading(false);
      }
    });
  }

  const isArchived = !!person.archivedAt;
  const tags = Array.isArray(person.tags)
    ? (person.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  function handleArchive() {
    setError('');
    startTransition(async () => {
      try {
        await archivePerson(person.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to archive person');
      }
      setShowArchiveConfirm(false);
    });
  }

  function handleRestore() {
    setError('');
    startTransition(async () => {
      try {
        await restorePerson(person.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore person');
      }
    });
  }

  function handleAnonymize() {
    setError('');
    startTransition(async () => {
      try {
        await anonymizePerson(person.id);
        router.push('/people');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to anonymize person');
        setShowAnonymizeConfirm(false);
      }
    });
  }

  const initials = person.fullName && person.fullName !== '[ANONYMIZED]'
    ? person.fullName
        .split(' ')
        .map((n) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '??';

  return (
    <div style={{ padding: 'var(--space-md) var(--space-sm)' }}>
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/people"
          className="flex items-center gap-1 text-text-secondary hover:text-text-primary"
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          People
        </Link>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Link
              href={`/people/merge?a=${person.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-medium text-text-primary hover:bg-background"
              style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
            >
              <GitMerge className="h-3.5 w-3.5" />
              Merge
            </Link>
            <Link
              href={`/people/${person.id}/edit`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-medium text-text-primary hover:bg-background"
              style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
          <p style={{ fontSize: 'var(--font-size-sm)' }} className="text-error">{error}</p>
        </div>
      )}

      {/* Profile Header */}
      <div className="mt-6 flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 style={{ fontSize: 'var(--font-size-xl)' }} className="font-bold text-text-primary">
            {person.salutation ? `${person.salutation}. ` : ''}
            {person.fullName}
          </h1>
          {person.designation && (
            <p style={{ fontSize: 'var(--font-size-sm)' }} className="text-text-secondary">{person.designation}</p>
          )}
          {isArchived && (
            <span className="mt-1 inline-block rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
              Archived
            </span>
          )}
        </div>
      </div>

      {/* Contact Info — 2-col grid on desktop */}
      <div style={{ marginTop: 'var(--space-lg)' }}>
        <h2 style={{ fontSize: 'var(--font-size-sm)' }} className="font-semibold text-text-primary">Contact</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: 'var(--space-xs)',
            marginTop: 'var(--space-xs)',
          }}
        >
          {person.email && (
            <InfoRow icon={Mail} label="Email" value={person.email} />
          )}
          {person.phoneE164 && (
            <InfoRow icon={Phone} label="Phone" value={person.phoneE164} />
          )}
          {person.organization && (
            <InfoRow icon={Building2} label="Organization" value={person.organization} />
          )}
          {person.city && (
            <InfoRow icon={MapPin} label="City" value={person.city} />
          )}
          {person.specialty && (
            <InfoRow icon={Stethoscope} label="Specialty" value={person.specialty} />
          )}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <h2 style={{ fontSize: 'var(--font-size-sm)' }} className="font-semibold text-text-primary">Tags</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-accent-light px-2.5 py-1 text-xs font-medium text-accent"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Change History */}
      <div style={{ marginTop: 'var(--space-lg)' }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: 'var(--font-size-sm)' }} className="font-semibold text-text-primary">
            Change History
          </h2>
          {history.total > 0 && (
            <span style={{ fontSize: 'var(--font-size-xs)' }} className="text-text-muted">
              {history.total} {history.total === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>
        <div className="mt-2 rounded-xl border border-border bg-surface" style={{ padding: 'var(--space-sm)' }}>
          {historyLoading && (
            <p style={{ fontSize: 'var(--font-size-sm)' }} className="text-text-muted text-center py-2">
              Loading…
            </p>
          )}
          {!historyLoading && history.rows.length === 0 && (
            <p style={{ fontSize: 'var(--font-size-sm)' }} className="text-text-muted text-center py-2">
              No history available.
            </p>
          )}
          {!historyLoading && history.rows.length > 0 && (
            <ul className="divide-y divide-border">
              {history.rows.map((row) => (
                <HistoryRow key={row.id} row={row} />
              ))}
            </ul>
          )}
          {history.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <button
                onClick={() => loadHistoryPage(history.page - 1)}
                disabled={history.page <= 1 || historyLoading}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-medium text-text-secondary hover:bg-background disabled:opacity-40"
                style={{ fontSize: 'var(--font-size-xs)', minHeight: 'var(--touch-min)' }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span style={{ fontSize: 'var(--font-size-xs)' }} className="text-text-muted">
                Page {history.page} of {history.totalPages}
              </span>
              <button
                onClick={() => loadHistoryPage(history.page + 1)}
                disabled={history.page >= history.totalPages || historyLoading}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-medium text-text-secondary hover:bg-background disabled:opacity-40"
                style={{ fontSize: 'var(--font-size-xs)', minHeight: 'var(--touch-min)' }}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone — only for users with write access */}
      {canWrite && (
        <div className="mt-8 rounded-xl border border-error/20 bg-error/5" style={{ padding: 'var(--space-sm)' }}>
          <h2 style={{ fontSize: 'var(--font-size-sm)' }} className="font-semibold text-error">Danger Zone</h2>
          <div className="mt-3 space-y-2">
            {isArchived ? (
              <button
                onClick={handleRestore}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 font-medium text-text-primary hover:bg-background disabled:opacity-50"
                style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
              >
                <RotateCcw className="h-4 w-4" />
                Restore Person
              </button>
            ) : !showArchiveConfirm ? (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-warning/50 bg-surface px-4 py-2.5 font-medium text-warning hover:bg-warning/5"
                style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
              >
                <Archive className="h-4 w-4" />
                Archive Person
              </button>
            ) : (
              <div className="rounded-lg border border-warning bg-warning/5 p-3">
                <p className="text-xs font-medium text-warning">
                  This will remove the person from all list views.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleArchive}
                    disabled={isPending}
                    className="flex-1 rounded-lg bg-warning px-3 py-2 text-sm font-medium text-white hover:bg-warning/90 disabled:opacity-50"
                  >
                    Confirm Archive
                  </button>
                  <button
                    onClick={() => setShowArchiveConfirm(false)}
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-background"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Anonymize — Super Admin only */}
            {isSuperAdmin && (
              <>
                {!showAnonymizeConfirm ? (
                  <button
                    onClick={() => setShowAnonymizeConfirm(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-error/50 bg-surface px-4 py-2.5 font-medium text-error hover:bg-error/5"
                    style={{ fontSize: 'var(--font-size-sm)', minHeight: 'var(--touch-min)' }}
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Anonymize Person
                  </button>
                ) : (
                  <div className="rounded-lg border border-error bg-error/5 p-3">
                    <p className="text-xs font-medium text-error">
                      This action is irreversible. All personal data will be permanently removed.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={handleAnonymize}
                        disabled={isPending}
                        className="flex-1 rounded-lg bg-error px-3 py-2 text-sm font-medium text-white hover:bg-error/90 disabled:opacity-50"
                      >
                        Confirm Anonymize
                      </button>
                      <button
                        onClick={() => setShowAnonymizeConfirm(false)}
                        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-background"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface" style={{ padding: 'var(--space-xs)' }}>
      <Icon className="h-4 w-4 shrink-0 text-text-muted" />
      <div className="min-w-0">
        <p style={{ fontSize: 'var(--font-size-xs)' }} className="text-text-muted">{label}</p>
        <p className="truncate text-text-primary" style={{ fontSize: 'var(--font-size-sm)' }}>{value}</p>
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Archived',
  read: 'Viewed',
  restore: 'Restored',
  anonymize: 'Anonymized',
  merge: 'Merged',
};

function HistoryRow({ row }: { row: PersonHistoryRow }) {
  const ts = new Date(row.timestamp).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const metaAction = typeof row.meta?.action === 'string' ? row.meta.action : null;
  const actionLabel = ACTION_LABEL[metaAction ?? row.action] ?? row.action;

  const changedFields = Array.isArray(row.meta?.changedFields)
    ? (row.meta.changedFields as string[])
    : [];

  const actorShort = row.actorUserId.length > 12
    ? `${row.actorUserId.slice(0, 12)}…`
    : row.actorUserId;

  return (
    <li className="py-2.5" style={{ fontSize: 'var(--font-size-sm)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Clock className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span className="font-medium text-text-primary">{actionLabel}</span>
          <span className="text-text-muted">by</span>
          <span
            className="rounded bg-background px-1 font-mono text-text-secondary"
            style={{ fontSize: 'var(--font-size-xs)' }}
            title={row.actorUserId}
          >
            {actorShort}
          </span>
        </div>
        <span style={{ fontSize: 'var(--font-size-xs)' }} className="shrink-0 text-text-muted">
          {ts}
        </span>
      </div>
      {changedFields.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {changedFields.map((f) => (
            <span
              key={f}
              className="rounded bg-background px-1.5 py-0.5 text-text-secondary"
              style={{ fontSize: 'var(--font-size-xs)' }}
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
