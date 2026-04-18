'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Plus,
  Upload,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Building2,
  MapPin,
  GitMerge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/use-role';
import { ResponsiveList, type ColumnDef } from '@/components/responsive/responsive-list';
import { createPerson } from '@/lib/actions/person';

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
  tags: unknown; // jsonb returns unknown from Drizzle
  createdAt: Date;
};

const SAVED_VIEWS = [
  { key: 'all', label: 'All People' },
  { key: 'faculty', label: 'Faculty' },
  { key: 'delegates', label: 'Delegates' },
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'vips', label: 'VIPs' },
  { key: 'recent', label: 'Recently Added' },
] as const;

// ── Column definitions (priority: 1=mobile, 2=tablet, 3=desktop) ──

const COLUMNS: ColumnDef<Person>[] = [
  {
    key: 'name',
    header: 'Name',
    priority: 1,
    render: (p) => (
      <Link href={`/people/${p.id}`} className="font-medium text-text-primary hover:text-accent">
        {p.salutation ? `${p.salutation}. ` : ''}{p.fullName}
        {p.designation && (
          <span className="ml-2 text-xs text-text-secondary">{p.designation}</span>
        )}
      </Link>
    ),
  },
  {
    key: 'email',
    header: 'Email',
    priority: 2,
    render: (p) => (
      <span className="text-text-secondary">{p.email ?? '—'}</span>
    ),
  },
  {
    key: 'tags',
    header: 'Tags',
    priority: 2,
    render: (p) => {
      const tags = Array.isArray(p.tags)
        ? (p.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      if (tags.length === 0) return <span className="text-text-muted">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-medium text-accent"
            >
              {tag}
            </span>
          ))}
        </div>
      );
    },
  },
  {
    key: 'phone',
    header: 'Phone',
    priority: 3,
    render: (p) => (
      <span className="text-text-secondary">{p.phoneE164 ?? '—'}</span>
    ),
  },
  {
    key: 'organization',
    header: 'Organization',
    priority: 3,
    render: (p) => (
      <span className="text-text-secondary">{p.organization ?? '—'}</span>
    ),
  },
];

// ── Main component ──────────────────────────────────────────

export function PeopleListClient({
  people,
  total,
  page,
  totalPages,
  currentView,
  currentQuery,
}: {
  people: Person[];
  total: number;
  page: number;
  totalPages: number;
  currentView: string;
  currentQuery: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isReadOnly } = useRole();
  const canWrite = isLoaded && !isReadOnly;
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(currentQuery);
  const [isCreating, setIsCreating] = useState(false);
  const [addError, setAddError] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(searchParams.get('modal') === 'add');
  const showAddModal = isAddModalOpen || searchParams.get('modal') === 'add';

  useEffect(() => {
    setIsAddModalOpen(searchParams.get('modal') === 'add');
  }, [searchParams]);

  function navigate(params: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!params.page) next.delete('page');
    startTransition(() => {
      router.push(`/people?${next.toString()}`);
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ q: searchValue || undefined });
  }

  function closeAddModal() {
    setIsAddModalOpen(false);
    navigate({ modal: undefined });
    setAddError('');
  }

  function openAddModal() {
    setIsAddModalOpen(true);
    navigate({ modal: 'add' });
  }

  async function handleCreatePerson(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsCreating(true);
    setAddError('');

    const form = new FormData(e.currentTarget);
    const fullName = String(form.get('fullName') || '').trim();
    const tags = String(form.get('tags') || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      const result = await createPerson({
        fullName,
        email: String(form.get('email') || '').trim(),
        phone: String(form.get('phone') || '').trim(),
        designation: String(form.get('designation') || '').trim(),
        specialty: String(form.get('specialty') || '').trim(),
        organization: String(form.get('organization') || '').trim(),
        city: String(form.get('city') || '').trim(),
        tags,
      });

      if (result.duplicate) {
        setAddError(result.message);
        return;
      }

      const next = new URLSearchParams(searchParams.toString());
      next.delete('modal');
      next.set('q', fullName);
      next.delete('page');
      router.push(`/people?${next.toString()}`);
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create person');
    } finally {
      setIsCreating(false);
    }
  }

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-light">
        <Search className="h-8 w-8 text-accent" />
      </div>
      <p className="mt-4 font-medium text-text-primary">No people found</p>
      <p className="mt-1 text-sm text-text-secondary">
        {currentQuery
          ? 'Try adjusting your search or filters'
          : 'Add your first person or import from CSV'}
      </p>
    </div>
  );

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">People</h1>
          <p className="text-sm text-text-secondary">
            {total} {total === 1 ? 'person' : 'people'}
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Link
              href="/people/merge"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-background"
            >
              <GitMerge className="h-4 w-4" />
              Merge
            </Link>
            <Link
              href="/people/import"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-background"
            >
              <Upload className="h-4 w-4" />
              Import
            </Link>
            <button
              onClick={openAddModal}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-light"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search name, email, organization, phone..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </form>

      {/* Saved Views */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {SAVED_VIEWS.map((view) => (
          <button
            key={view.key}
            onClick={() => navigate({ view: view.key === 'all' ? undefined : view.key })}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              (currentView === view.key || (!currentView && view.key === 'all'))
                ? 'bg-primary text-white'
                : 'bg-surface text-text-secondary border border-border hover:border-accent',
            )}
          >
            {view.label}
          </button>
        ))}
      </div>

      {/* People list — responsive: cards on mobile/tablet, table on desktop */}
      <div className={cn('mt-4 transition-opacity foldable-left-pane', isPending && 'opacity-50')}>
        <ResponsiveList
          data={people}
          columns={COLUMNS}
          renderCard={(person) => <PersonCard person={person} />}
          emptyState={emptyState}
          isLoading={false}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              disabled={page <= 1}
              onClick={() => navigate({ page: String(page - 1) })}
              className="flex min-h-[44px] items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary hover:bg-background disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-sm text-text-secondary">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => navigate({ page: String(page + 1) })}
              className="flex min-h-[44px] items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary hover:bg-background disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {showAddModal && canWrite && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-lg border border-border bg-background p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Add Person</h2>
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-lg px-2 py-1 text-sm text-text-secondary hover:bg-surface"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreatePerson} className="mt-4 space-y-3">
              <div>
                <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-text-primary">
                  Full Name <span className="text-error">*</span>
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  required
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-primary">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="mb-1 block text-sm font-medium text-text-primary">
                    Phone
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="designation" className="mb-1 block text-sm font-medium text-text-primary">
                    Designation
                  </label>
                  <input
                    id="designation"
                    name="designation"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label htmlFor="specialty" className="mb-1 block text-sm font-medium text-text-primary">
                    Specialty
                  </label>
                  <input
                    id="specialty"
                    name="specialty"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="organization" className="mb-1 block text-sm font-medium text-text-primary">
                    Organization
                  </label>
                  <input
                    id="organization"
                    name="organization"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label htmlFor="city" className="mb-1 block text-sm font-medium text-text-primary">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="tags" className="mb-1 block text-sm font-medium text-text-primary">
                  Tags
                </label>
                <input
                  id="tags"
                  name="tags"
                  placeholder="faculty, VIP"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>

              {addError && (
                <div className="rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-sm text-error">
                  {addError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={isCreating}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create Person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Person Card (mobile/tablet view) ────────────────────────

function PersonCard({ person }: { person: Person }) {
  const initials = person.fullName && person.fullName !== '[ANONYMIZED]'
    ? person.fullName.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '??';

  const tags = Array.isArray(person.tags)
    ? (person.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  return (
    <Link
      href={`/people/${person.id}`}
      className="flex min-h-[44px] items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
    >
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {initials}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-text-primary">
            {person.salutation ? `${person.salutation}. ` : ''}
            {person.fullName}
          </p>
        </div>
        {person.designation && (
          <p className="truncate text-xs text-text-secondary">{person.designation}</p>
        )}

        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {person.email && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Mail className="h-3 w-3" />
              <span className="truncate">{person.email}</span>
            </span>
          )}
          {person.phoneE164 && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Phone className="h-3 w-3" />
              {person.phoneE164}
            </span>
          )}
          {person.organization && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{person.organization}</span>
            </span>
          )}
          {person.city && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <MapPin className="h-3 w-3" />
              {person.city}
            </span>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-medium text-accent"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
