'use client';

import Link from 'next/link';
import { CheckCircle2, AlertTriangle, XCircle, Users, ArrowRight } from 'lucide-react';

export function ImportSuccessClient({
  total,
  imported,
  duplicates,
  errors,
}: {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
}) {
  const allSuccess = errors === 0 && duplicates === 0;

  return (
    <div className="flex flex-col items-center px-4 py-12">
      {/* Icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>

      <h1 className="mt-6 text-2xl font-bold text-text-primary">Import Complete</h1>
      <p className="mt-2 text-sm text-text-secondary">
        {allSuccess
          ? `All ${total} people were imported successfully`
          : `Processed ${total} rows from your CSV`}
      </p>

      {/* Stats */}
      <div className="mt-8 w-full max-w-sm space-y-3">
        <StatRow
          icon={Users}
          iconColor="text-success"
          bgColor="bg-success/10"
          label="Imported"
          value={imported}
        />
        {duplicates > 0 && (
          <StatRow
            icon={AlertTriangle}
            iconColor="text-warning"
            bgColor="bg-warning/10"
            label="Duplicates (skipped)"
            value={duplicates}
          />
        )}
        {errors > 0 && (
          <StatRow
            icon={XCircle}
            iconColor="text-error"
            bgColor="bg-error/10"
            label="Errors"
            value={errors}
          />
        )}
      </div>

      {/* Actions */}
      <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
        <Link
          href="/people"
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-light"
        >
          View People
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/people/import"
          className="flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-text-secondary hover:bg-background"
        >
          Import Another File
        </Link>
      </div>
    </div>
  );
}

function StatRow({
  icon: Icon,
  iconColor,
  bgColor,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bgColor}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="flex-1">
        <p className="text-sm text-text-secondary">{label}</p>
      </div>
      <p className="text-xl font-bold text-text-primary">{value}</p>
    </div>
  );
}
