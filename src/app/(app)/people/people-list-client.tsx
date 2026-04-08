'use client';

import { useState, useTransition } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(currentQuery);

  function navigate(params: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Reset page when changing filters
    if (!params.page) next.delete('page');
    startTransition(() => {
      router.push(`/people?${next.toString()}`);
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ q: searchValue || undefined });
  }

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
        <div className="flex items-center gap-2">
          <Link
            href="/people/import"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-background"
          >
            <Upload className="h-4 w-4" />
            Import
          </Link>
          <button
            onClick={() => navigate({ modal: 'add' })}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-light"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
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

      {/* Loading overlay */}
      <div className={cn('mt-4 transition-opacity', isPending && 'opacity-50')}>
        {/* People List */}
        {people.length === 0 ? (
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
        ) : (
          <div className="space-y-2">
            {people.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              disabled={page <= 1}
              onClick={() => navigate({ page: String(page - 1) })}
              className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary hover:bg-background disabled:opacity-40"
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
              className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary hover:bg-background disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonCard({ person }: { person: Person }) {
  const initials = person.fullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Link
      href={`/people/${person.id}`}
      className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
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
        {Array.isArray(person.tags) && (person.tags as string[]).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {(person.tags as string[]).map((tag: string) => (
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
