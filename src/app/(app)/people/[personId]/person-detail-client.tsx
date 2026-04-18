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
  Clock,
  GitMerge,
} from 'lucide-react';
import { useRole } from '@/hooks/use-role';
import { archivePerson, restorePerson, anonymizePerson } from '@/lib/actions/person';

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

export function PersonDetailClient({ person }: { person: Person }) {
  const router = useRouter();
  const { isLoaded, isSuperAdmin, isReadOnly } = useRole();
  const canWrite = isLoaded && !isReadOnly;
  const [isPending, startTransition] = useTransition();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showAnonymizeConfirm, setShowAnonymizeConfirm] = useState(false);
  const [error, setError] = useState('');

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

  const createdDate = new Date(person.createdAt);
  const updatedDate = new Date(person.updatedAt);

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
        <h2 style={{ fontSize: 'var(--font-size-sm)' }} className="font-semibold text-text-primary">Change History</h2>
        <div className="mt-2 rounded-xl border border-border bg-surface" style={{ padding: 'var(--space-sm)' }}>
          <div className="flex items-center gap-2 text-text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
            <Clock className="h-4 w-4" />
            <span>
              Created {createdDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
          {updatedDate.getTime() > createdDate.getTime() && (
            <div className="mt-1 flex items-center gap-2 text-text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
              <Clock className="h-4 w-4" />
              <span>
                Last updated {updatedDate.toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
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
