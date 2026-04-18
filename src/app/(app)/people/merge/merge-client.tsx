'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftRight, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import { mergePeople, type MergePeopleResult } from '@/lib/actions/person';

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
  bio: string | null;
  photoStorageKey: string | null;
  tags: unknown;
};

type FieldChoice = 'left' | 'right' | 'both';

const MERGE_FIELDS: Array<{
  key: keyof Omit<Person, 'id' | 'photoStorageKey' | 'tags'>;
  label: string;
  supportsBoth: boolean;
}> = [
  { key: 'fullName', label: 'Full Name', supportsBoth: false },
  { key: 'salutation', label: 'Salutation', supportsBoth: false },
  { key: 'email', label: 'Email', supportsBoth: false },
  { key: 'phoneE164', label: 'Phone', supportsBoth: false },
  { key: 'designation', label: 'Designation', supportsBoth: true },
  { key: 'specialty', label: 'Specialty', supportsBoth: true },
  { key: 'organization', label: 'Organization', supportsBoth: true },
  { key: 'city', label: 'City', supportsBoth: true },
  { key: 'bio', label: 'Bio', supportsBoth: true },
];

function displayTags(tags: unknown): string {
  if (!Array.isArray(tags)) return '—';
  const strs = (tags as unknown[]).filter((t): t is string => typeof t === 'string');
  return strs.length > 0 ? strs.join(', ') : '—';
}

function PersonCard({ person, side }: { person: Person; side: 'left' | 'right' }) {
  return (
    <div className={`rounded-lg border p-4 ${side === 'left' ? 'border-primary/40 bg-primary/5' : 'border-warning/40 bg-warning/5'}`}>
      <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${side === 'left' ? 'text-primary' : 'text-warning'}`}>
        {side === 'left' ? 'Keep (Survivor)' : 'Drop (Merge into Survivor)'}
      </div>
      <p className="font-semibold text-text-primary">
        {person.salutation ? `${person.salutation}. ` : ''}{person.fullName}
      </p>
      {person.organization && (
        <p className="text-sm text-text-secondary">{person.organization}</p>
      )}
      <p className="mt-1 text-xs text-text-muted">{person.id}</p>
    </div>
  );
}

// ── State 1: No people selected ───────────────────────────────────

function NoPeopleState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Users className="h-12 w-12 text-text-muted" />
      <h2 className="mt-4 text-lg font-semibold text-text-primary">Merge Duplicate People</h2>
      <p className="mt-2 max-w-sm text-sm text-text-secondary">
        Navigate to a person&apos;s profile and use the &ldquo;Merge with another person&rdquo; option,
        or pass <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">?a=personId</code> in the URL.
      </p>
      <Link
        href="/people"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
      >
        Browse People List
      </Link>
    </div>
  );
}

// ── State 2: Only Person A selected ──────────────────────────────

function PickSecondPersonState({ personA }: { personA: Person }) {
  const router = useRouter();
  const [bId, setBId] = useState('');
  const [error, setError] = useState('');

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = bId.trim();
    if (!UUID_RE.test(trimmed)) {
      setError('Please enter a valid person ID (UUID format).');
      return;
    }
    if (trimmed === personA.id) {
      setError('Cannot merge a person with themselves.');
      return;
    }
    setError('');
    router.push(`/people/merge?a=${personA.id}&b=${trimmed}`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary">Step 1: Survivor confirmed</h2>
        <PersonCard person={personA} side="left" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Step 2: Select the duplicate to drop</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Find the duplicate in the{' '}
          <Link href="/people" className="underline text-accent">People list</Link>
          , copy their ID from the URL, and paste it here.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={bId}
            onChange={(e) => setBId(e.target.value)}
            placeholder="Paste duplicate person ID…"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
          >
            Next
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

// ── State 3: Side-by-side comparison ─────────────────────────────

function ComparisonState({ personA, personB }: { personA: Person; personB: Person }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<MergePeopleResult | null>(null);
  const [submitError, setSubmitError] = useState('');

  function getChoice(field: string): FieldChoice {
    return choices[field] ?? 'left';
  }

  function setChoice(field: string, choice: FieldChoice) {
    setChoices((prev) => ({ ...prev, [field]: choice }));
  }

  function handleMerge() {
    startTransition(async () => {
      setSubmitError('');
      try {
        const res = await mergePeople({
          keepId: personA.id,
          dropId: personB.id,
          fieldChoices: choices,
        });
        setResult(res);
        if (res.ok) {
          router.refresh();
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Merge failed. Please try again.');
      }
    });
  }

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="h-12 w-12 text-success" />
        <h2 className="mt-4 text-lg font-semibold text-text-primary">Merge complete</h2>
        <p className="mt-2 text-sm text-text-secondary">
          The duplicate record was merged and archived.
        </p>
        <Link
          href={`/people/${result.survivorId}`}
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
        >
          View Survivor Record
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PersonCard person={personA} side="left" />
        <PersonCard person={personB} side="right" />
      </div>

      {/* Warning */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This action is <strong>irreversible</strong>. The duplicate record will be archived and all
          linked records re-pointed to the survivor. The audit log will record this merge.
        </span>
      </div>

      {/* Field comparison table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              <th className="px-4 py-2 text-left font-medium text-text-secondary w-28">Field</th>
              <th className="px-4 py-2 text-left font-medium text-primary">Keep (A)</th>
              <th className="px-4 py-2 text-center font-medium text-text-secondary w-52">Choice</th>
              <th className="px-4 py-2 text-left font-medium text-warning">Drop (B)</th>
            </tr>
          </thead>
          <tbody>
            {MERGE_FIELDS.map(({ key, label, supportsBoth }) => {
              const leftVal = personA[key] as string | null;
              const rightVal = personB[key] as string | null;
              const choice = getChoice(key);

              return (
                <tr key={key} className="border-b border-border last:border-0 hover:bg-background/50">
                  <td className="px-4 py-3 font-medium text-text-secondary whitespace-nowrap">{label}</td>
                  <td className={`px-4 py-3 ${choice === 'left' ? 'font-medium text-text-primary' : 'text-text-muted'}`}>
                    {leftVal ?? <span className="italic text-text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {(['left', 'right', ...(supportsBoth ? ['both'] : [])] as FieldChoice[]).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setChoice(key, opt)}
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                            choice === opt
                              ? opt === 'left'
                                ? 'bg-primary text-white'
                                : opt === 'right'
                                  ? 'bg-warning text-white'
                                  : 'bg-accent text-white'
                              : 'bg-background text-text-secondary hover:bg-border'
                          }`}
                        >
                          {opt === 'left' ? '← Keep' : opt === 'right' ? 'Keep →' : 'Both'}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className={`px-4 py-3 ${choice === 'right' ? 'font-medium text-text-primary' : 'text-text-muted'}`}>
                    {rightVal ?? <span className="italic text-text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
            {/* Tags row — always merged */}
            <tr className="border-b border-border last:border-0 hover:bg-background/50">
              <td className="px-4 py-3 font-medium text-text-secondary">Tags</td>
              <td className="px-4 py-3 text-text-muted">{displayTags(personA.tags)}</td>
              <td className="px-4 py-3 text-center text-xs text-text-muted italic">Always merged</td>
              <td className="px-4 py-3 text-text-muted">{displayTags(personB.tags)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <Link
          href={`/people/merge?a=${personA.id}`}
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          ← Change duplicate
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/people"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-background"
          >
            Cancel
          </Link>
          <button
            onClick={handleMerge}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            <ArrowLeftRight className="h-4 w-4" />
            {isPending ? 'Merging…' : 'Confirm Merge'}
          </button>
        </div>
      </div>

      {submitError && (
        <p className="mt-3 text-sm text-destructive">{submitError}</p>
      )}
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────

export function MergeClient({
  personA,
  personB,
}: {
  personA: Person | null;
  personB: Person | null;
}) {
  return (
    <div className="px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Merge Duplicate People</h1>
        <p className="text-sm text-text-secondary">
          Review both records side by side and choose which fields to keep.
        </p>
      </div>

      {!personA ? (
        <NoPeopleState />
      ) : !personB ? (
        <PickSecondPersonState personA={personA} />
      ) : (
        <ComparisonState personA={personA} personB={personB} />
      )}
    </div>
  );
}
