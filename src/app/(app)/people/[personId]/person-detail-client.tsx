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
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
  archivedAt: Date | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};

export function PersonDetailClient({ person }: { person: Person }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAnonymizeConfirm, setShowAnonymizeConfirm] = useState(false);

  const isArchived = !!person.archivedAt;
  const tags = Array.isArray(person.tags) ? (person.tags as string[]) : [];

  function handleArchive() {
    startTransition(async () => {
      await archivePerson(person.id);
      router.refresh();
    });
  }

  function handleRestore() {
    startTransition(async () => {
      await restorePerson(person.id);
      router.refresh();
    });
  }

  function handleAnonymize() {
    startTransition(async () => {
      await anonymizePerson(person.id);
      router.push('/people');
    });
  }

  const initials = person.fullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="px-4 py-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/people"
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          People
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/people/${person.id}/edit`}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-background"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </div>
      </div>

      {/* Profile Header */}
      <div className="mt-6 flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-text-primary">
            {person.salutation ? `${person.salutation}. ` : ''}
            {person.fullName}
          </h1>
          {person.designation && (
            <p className="text-sm text-text-secondary">{person.designation}</p>
          )}
          {isArchived && (
            <span className="mt-1 inline-block rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
              Archived
            </span>
          )}
        </div>
      </div>

      {/* Contact Info */}
      <div className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Contact</h2>
        <div className="space-y-2">
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
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-text-primary">Tags</h2>
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

      {/* Change History placeholder — Bemi audit log integration deferred */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-text-primary">Change History</h2>
        <div className="mt-2 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Clock className="h-4 w-4" />
            <span>
              Created {new Date(person.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
          {person.updatedAt > person.createdAt && (
            <div className="mt-1 flex items-center gap-2 text-sm text-text-muted">
              <Clock className="h-4 w-4" />
              <span>
                Last updated {new Date(person.updatedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="mt-8 rounded-xl border border-error/20 bg-error/5 p-4">
        <h2 className="text-sm font-semibold text-error">Danger Zone</h2>
        <div className="mt-3 space-y-2">
          {isArchived ? (
            <button
              onClick={handleRestore}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Restore Person
            </button>
          ) : (
            <button
              onClick={handleArchive}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-warning/50 bg-surface px-4 py-2.5 text-sm font-medium text-warning hover:bg-warning/5 disabled:opacity-50"
            >
              <Archive className="h-4 w-4" />
              Archive Person
            </button>
          )}

          {!showAnonymizeConfirm ? (
            <button
              onClick={() => setShowAnonymizeConfirm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-error/50 bg-surface px-4 py-2.5 text-sm font-medium text-error hover:bg-error/5"
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
        </div>
      </div>
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
    <div className="flex items-center gap-3 rounded-lg bg-surface p-3">
      <Icon className="h-4 w-4 shrink-0 text-text-muted" />
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="truncate text-sm text-text-primary">{value}</p>
      </div>
    </div>
  );
}
