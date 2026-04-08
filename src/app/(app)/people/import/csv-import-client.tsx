'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseCsvString,
  autoMapColumns,
  parseRows,
  type ColumnMapping,
  type ParsedPerson,
} from '@/lib/import/csv-import';
import { importPeopleBatch } from '@/lib/actions/person';

type Step = 'upload' | 'mapping' | 'preview' | 'importing';

const KNOWN_FIELDS: Record<string, string> = {
  fullName: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  salutation: 'Salutation',
  designation: 'Designation',
  specialty: 'Specialty',
  organization: 'Organization',
  city: 'City',
  tags: 'Tags',
};

export function CsvImportClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [parsed, setParsed] = useState<ParsedPerson[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setParseErrors(['File exceeds 20MB limit']);
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvContent = event.target?.result as string;
      const result = parseCsvString(csvContent);

      if (result.errors.length > 0) {
        setParseErrors(result.errors);
        return;
      }

      if (result.rows.length === 0) {
        setParseErrors(['CSV file is empty or has no data rows']);
        return;
      }

      setHeaders(result.headers);
      setRows(result.rows);
      setParseErrors([]);

      const autoMappings = autoMapColumns(result.headers);
      setMappings(autoMappings);
      setStep('mapping');
    };
    reader.readAsText(file);
  }, []);

  function handleMappingChange(csvColumn: string, mappedTo: string) {
    setMappings((prev) =>
      prev.map((m) =>
        m.csvColumn === csvColumn
          ? { ...m, mappedTo: mappedTo === '' ? null : (mappedTo as ColumnMapping['mappedTo']), confidence: mappedTo ? 1 : 0 }
          : m,
      ),
    );
  }

  function handlePreview() {
    const result = parseRows(rows, mappings);
    setParsed(result);
    setStep('preview');
  }

  async function handleImport() {
    const validRows = parsed.filter((p) => p.errors.length === 0);
    setStep('importing');
    setImportError('');
    setIsImporting(true);

    try {
      const result = await importPeopleBatch(
        validRows.map((p) => ({
          rowNumber: p.rowNumber,
          fullName: p.fullName,
          email: p.email,
          phone: p.phone,
          salutation: p.salutation,
          designation: p.designation,
          specialty: p.specialty,
          organization: p.organization,
          city: p.city,
          tags: p.tags,
        })),
      );

      const params = new URLSearchParams({
        total: String(validRows.length),
        imported: String(result.imported),
        duplicates: String(result.duplicates),
        errors: String(result.errors),
      });
      router.push(`/people/import/success?${params.toString()}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed. Please try again.');
      setStep('preview');
    } finally {
      setIsImporting(false);
    }
  }

  const hasFullNameMapping = mappings.some((m) => m.mappedTo === 'fullName');
  const hasContactMapping = mappings.some((m) => m.mappedTo === 'email' || m.mappedTo === 'phone');
  const validRows = parsed.filter((p) => p.errors.length === 0);
  const errorRows = parsed.filter((p) => p.errors.length > 0);

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/people"
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Import People</h1>
          <p className="text-sm text-text-secondary">Upload a CSV file to bulk import</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="mt-6 flex items-center gap-2">
        {['Upload', 'Map Columns', 'Preview', 'Import'].map((label, i) => {
          const stepIndex = ['upload', 'mapping', 'preview', 'importing'].indexOf(step);
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className={cn('h-px w-4', isDone ? 'bg-success' : 'bg-border')} />}
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                  isActive && 'bg-primary text-white',
                  isDone && 'bg-success text-white',
                  !isActive && !isDone && 'bg-border text-text-muted',
                )}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('text-xs', isActive ? 'font-medium text-text-primary' : 'text-text-muted')}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Global import error */}
      {importError && (
        <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
          <p className="flex items-center gap-2 text-sm text-error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {importError}
          </p>
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="mt-6">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface p-10 transition-colors hover:border-accent">
            <FileSpreadsheet className="h-12 w-12 text-text-muted" />
            <p className="mt-3 font-medium text-text-primary">
              {fileName || 'Choose a CSV file'}
            </p>
            <p className="mt-1 text-sm text-text-secondary">Max 20MB</p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {parseErrors.length > 0 && (
            <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3">
              {parseErrors.map((err, i) => (
                <p key={i} className="flex items-center gap-2 text-sm text-error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Column Mapping */}
      {step === 'mapping' && (
        <div className="mt-6">
          <p className="text-sm text-text-secondary">
            Found {headers.length} columns and {rows.length} rows. Map each CSV column to a person field.
          </p>

          <div className="mt-4 space-y-3">
            {mappings.map((m) => (
              <div key={m.csvColumn} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{m.csvColumn}</p>
                  {m.confidence > 0 && m.confidence < 1 && (
                    <p className="text-xs text-text-muted">
                      {Math.round(m.confidence * 100)}% confidence
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
                <select
                  value={m.mappedTo || ''}
                  onChange={(e) => handleMappingChange(m.csvColumn, e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                >
                  <option value="">Skip</option>
                  {Object.entries(KNOWN_FIELDS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {(!hasFullNameMapping || !hasContactMapping) && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="flex items-center gap-2 text-sm text-warning">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {!hasFullNameMapping && 'Full Name mapping is required. '}
                {!hasContactMapping && 'At least Email or Phone mapping is required.'}
              </p>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep('upload')}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background"
            >
              Back
            </button>
            <button
              onClick={handlePreview}
              disabled={!hasFullNameMapping || !hasContactMapping}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              Preview Import
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="mt-6">
          <div className="flex gap-3">
            <div className="flex-1 rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-2xl font-bold text-success">{validRows.length}</p>
              <p className="text-xs text-text-secondary">Valid rows</p>
            </div>
            <div className="flex-1 rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-2xl font-bold text-error">{errorRows.length}</p>
              <p className="text-xs text-text-secondary">Errors</p>
            </div>
            <div className="flex-1 rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-2xl font-bold text-text-primary">{parsed.length}</p>
              <p className="text-xs text-text-secondary">Total rows</p>
            </div>
          </div>

          {errorRows.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-error">Rows with errors</h3>
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-error/20 bg-error/5 p-3">
                {errorRows.slice(0, 10).map((row) => (
                  <p key={row.rowNumber} className="text-xs text-error">
                    Row {row.rowNumber}: {row.errors.join(', ')}
                  </p>
                ))}
                {errorRows.length > 10 && (
                  <p className="mt-1 text-xs text-error">...and {errorRows.length - 10} more</p>
                )}
              </div>
            </div>
          )}

          {/* Preview first 5 valid rows */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-text-primary">Preview (first 5)</h3>
            <div className="mt-2 space-y-2">
              {validRows.slice(0, 5).map((person) => (
                <div key={person.rowNumber} className="rounded-lg border border-border bg-surface p-3">
                  <p className="text-sm font-medium text-text-primary">
                    {person.salutation ? `${person.salutation}. ` : ''}
                    {person.fullName}
                  </p>
                  <p className="text-xs text-text-muted">
                    {[person.email, person.phone, person.organization, person.city]
                      .filter(Boolean)
                      .join(' | ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep('mapping')}
              disabled={isImporting}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={validRows.length === 0 || isImporting}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              Import {validRows.length} People
            </button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="mt-6 flex flex-col items-center py-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 font-medium text-text-primary">Importing people...</p>
          <p className="mt-1 text-sm text-text-secondary">
            Processing {validRows.length} records on the server
          </p>
        </div>
      )}
    </div>
  );
}
