'use client';

import { useState, useCallback, useTransition } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import {
  ArrowLeft,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseCsvString } from '@/lib/import/csv-import';
import { importTravelBatch, type TravelImportRow, type TravelImportRowResult } from '@/lib/actions/travel';

// ── Travel column mapping ─────────────────────────────────────

const TRAVEL_KNOWN_COLUMNS = [
  { key: 'personEmail', aliases: ['email', 'person email', 'participant email', 'delegate email', 'faculty email'] },
  { key: 'personPhone', aliases: ['phone', 'mobile', 'person phone', 'contact', 'cell'] },
  { key: 'direction', aliases: ['direction', 'travel direction', 'journey type', 'type'] },
  { key: 'travelMode', aliases: ['mode', 'travel mode', 'transport', 'transport mode', 'by'] },
  { key: 'fromCity', aliases: ['from city', 'from', 'origin', 'departure city', 'source city'] },
  { key: 'toCity', aliases: ['to city', 'to', 'destination', 'arrival city', 'destination city'] },
  { key: 'fromLocation', aliases: ['from location', 'departure location', 'terminal from', 'airport from'] },
  { key: 'toLocation', aliases: ['to location', 'arrival location', 'terminal to', 'airport to'] },
  { key: 'departureAtUtc', aliases: ['departure', 'departure at', 'departure utc', 'departure time', 'departs at'] },
  { key: 'arrivalAtUtc', aliases: ['arrival', 'arrival at', 'arrival utc', 'arrival time', 'arrives at'] },
  { key: 'carrierName', aliases: ['carrier', 'airline', 'railway', 'carrier name', 'operated by'] },
  { key: 'serviceNumber', aliases: ['flight', 'flight no', 'train no', 'service number', 'flight number', 'train number'] },
  { key: 'pnrOrBookingRef', aliases: ['pnr', 'booking ref', 'booking reference', 'confirmation', 'booking id', 'pnr number'] },
  { key: 'terminalOrGate', aliases: ['terminal', 'gate', 'terminal gate', 'platform', 'dock'] },
] as const;

type TravelColumnKey = typeof TRAVEL_KNOWN_COLUMNS[number]['key'];

interface TravelColumnMapping {
  csvColumn: string;
  mappedTo: TravelColumnKey | null;
  confidence: number;
}

const TRAVEL_FIELD_LABELS: Record<TravelColumnKey, string> = {
  personEmail: 'Person Email',
  personPhone: 'Person Phone',
  direction: 'Direction',
  travelMode: 'Travel Mode',
  fromCity: 'From City',
  toCity: 'To City',
  fromLocation: 'From Location',
  toLocation: 'To Location',
  departureAtUtc: 'Departure (UTC ISO)',
  arrivalAtUtc: 'Arrival (UTC ISO)',
  carrierName: 'Carrier Name',
  serviceNumber: 'Service / Flight No.',
  pnrOrBookingRef: 'PNR / Booking Ref',
  terminalOrGate: 'Terminal / Gate',
};

function autoMapTravelColumns(csvHeaders: string[]): TravelColumnMapping[] {
  const allAliases = TRAVEL_KNOWN_COLUMNS.flatMap((col) =>
    col.aliases.map((alias) => ({ alias, key: col.key })),
  );

  const fuse = new Fuse(allAliases, {
    keys: ['alias'],
    threshold: 0.4,
    includeScore: true,
  });

  return csvHeaders.map((header) => {
    const normalized = header.toLowerCase().trim();

    const exact = allAliases.find((a) => a.alias === normalized);
    if (exact) {
      return { csvColumn: header, mappedTo: exact.key as TravelColumnKey, confidence: 1 };
    }

    const results = fuse.search(normalized);
    if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.4) {
      return {
        csvColumn: header,
        mappedTo: results[0].item.key as TravelColumnKey,
        confidence: 1 - results[0].score,
      };
    }

    return { csvColumn: header, mappedTo: null, confidence: 0 };
  });
}

// ── Row parsing ───────────────────────────────────────────────

const VALID_DIRECTIONS = new Set(['inbound', 'outbound', 'intercity', 'other']);
const VALID_MODES = new Set(['flight', 'train', 'car', 'bus', 'self_arranged', 'other']);
const SPREADSHEET_FORMULA = /^[\t\r ]*[=+\-@]/;

interface ParsedTravelRow extends TravelImportRow {
  errors: string[];
}

function getCellValue(row: Record<string, string>, colName: string | undefined): string {
  if (!colName || !Object.hasOwn(row, colName)) return '';
  const v = row[colName];
  return typeof v === 'string' ? v.trim() : '';
}

function parseTravelRows(
  rows: Record<string, string>[],
  mappings: TravelColumnMapping[],
): ParsedTravelRow[] {
  const keyMap = new Map<TravelColumnKey, string>();
  for (const m of mappings) {
    if (m.mappedTo) keyMap.set(m.mappedTo, m.csvColumn);
  }

  return rows.map((row, index) => {
    const errors: string[] = [];

    const personEmail = getCellValue(row, keyMap.get('personEmail'));
    const personPhone = getCellValue(row, keyMap.get('personPhone'));
    const direction = getCellValue(row, keyMap.get('direction'));
    const travelMode = getCellValue(row, keyMap.get('travelMode'));
    const fromCity = getCellValue(row, keyMap.get('fromCity'));
    const toCity = getCellValue(row, keyMap.get('toCity'));
    const fromLocation = getCellValue(row, keyMap.get('fromLocation'));
    const toLocation = getCellValue(row, keyMap.get('toLocation'));
    const departureAtUtc = getCellValue(row, keyMap.get('departureAtUtc'));
    const arrivalAtUtc = getCellValue(row, keyMap.get('arrivalAtUtc'));
    const carrierName = getCellValue(row, keyMap.get('carrierName'));
    const serviceNumber = getCellValue(row, keyMap.get('serviceNumber'));
    const pnrOrBookingRef = getCellValue(row, keyMap.get('pnrOrBookingRef'));
    const terminalOrGate = getCellValue(row, keyMap.get('terminalOrGate'));

    if (!personEmail && !personPhone) errors.push('At least one of Email or Phone is required for person lookup');
    if (!fromCity) errors.push('From City is required');
    if (!toCity) errors.push('To City is required');
    if (!direction) errors.push('Direction is required');
    else if (!VALID_DIRECTIONS.has(direction)) errors.push(`Invalid direction "${direction}" (must be: inbound, outbound, intercity, other)`);
    if (!travelMode) errors.push('Travel Mode is required');
    else if (!VALID_MODES.has(travelMode)) errors.push(`Invalid travel mode "${travelMode}" (must be: flight, train, car, bus, self_arranged, other)`);

    for (const [label, val] of [['Person Email', personEmail], ['From City', fromCity], ['To City', toCity]] as [string, string][]) {
      if (val && SPREADSHEET_FORMULA.test(val)) errors.push(`Unsafe formula detected in ${label}`);
    }

    return {
      rowNumber: index + 2,
      personEmail: personEmail || undefined,
      personPhone: personPhone || undefined,
      direction,
      travelMode,
      fromCity,
      toCity,
      fromLocation: fromLocation || undefined,
      toLocation: toLocation || undefined,
      departureAtUtc: departureAtUtc || undefined,
      arrivalAtUtc: arrivalAtUtc || undefined,
      carrierName: carrierName || undefined,
      serviceNumber: serviceNumber || undefined,
      pnrOrBookingRef: pnrOrBookingRef || undefined,
      terminalOrGate: terminalOrGate || undefined,
      errors,
    };
  });
}

// ── Import result summary ─────────────────────────────────────

interface ImportSummary {
  imported: number;
  skipped: number;
  errors: number;
  results: TravelImportRowResult[];
}

// ── Steps ─────────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

export function TravelImportClient({ eventId }: { eventId: string }) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<TravelColumnMapping[]>([]);
  const [parsed, setParsed] = useState<ParsedTravelRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState('');
  const [isPending, startTransition] = useTransition();

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
      setRawRows(result.rows);
      setParseErrors([]);
      setMappings(autoMapTravelColumns(result.headers));
      setStep('mapping');
    };
    reader.readAsText(file);
  }, []);

  function handleMappingChange(csvColumn: string, mappedTo: string) {
    setMappings((prev) =>
      prev.map((m) =>
        m.csvColumn === csvColumn
          ? { ...m, mappedTo: mappedTo === '' ? null : (mappedTo as TravelColumnKey), confidence: mappedTo ? 1 : 0 }
          : m,
      ),
    );
  }

  function handlePreview() {
    setParsed(parseTravelRows(rawRows, mappings));
    setStep('preview');
  }

  function handleImport() {
    const validRows = parsed.filter((r) => r.errors.length === 0);
    setStep('importing');
    setImportError('');

    startTransition(async () => {
      try {
        const result = await importTravelBatch(
          eventId,
          validRows.map((r): TravelImportRow => ({
            rowNumber: r.rowNumber,
            personEmail: r.personEmail,
            personPhone: r.personPhone,
            direction: r.direction,
            travelMode: r.travelMode,
            fromCity: r.fromCity,
            toCity: r.toCity,
            fromLocation: r.fromLocation,
            toLocation: r.toLocation,
            departureAtUtc: r.departureAtUtc,
            arrivalAtUtc: r.arrivalAtUtc,
            carrierName: r.carrierName,
            serviceNumber: r.serviceNumber,
            pnrOrBookingRef: r.pnrOrBookingRef,
            terminalOrGate: r.terminalOrGate,
          })),
        );
        setSummary({ ...result });
        setStep('done');
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Import failed. Please try again.');
        setStep('preview');
      }
    });
  }

  const validRows = parsed.filter((r) => r.errors.length === 0);
  const errorRows = parsed.filter((r) => r.errors.length > 0);
  const hasPersonMapping = mappings.some((m) => m.mappedTo === 'personEmail' || m.mappedTo === 'personPhone');
  const hasFromCity = mappings.some((m) => m.mappedTo === 'fromCity');
  const hasToCity = mappings.some((m) => m.mappedTo === 'toCity');
  const hasDirection = mappings.some((m) => m.mappedTo === 'direction');
  const hasTravelMode = mappings.some((m) => m.mappedTo === 'travelMode');
  const requiredMapped = hasPersonMapping && hasFromCity && hasToCity && hasDirection && hasTravelMode;

  const STEPS: Step[] = ['upload', 'mapping', 'preview', 'importing', 'done'];
  const STEP_LABELS = ['Upload', 'Map Columns', 'Preview', 'Import', 'Done'];

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/events/${eventId}/travel`}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Import Travel Records</h1>
          <p className="text-sm text-text-secondary">Upload a CSV file to bulk import travel records</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const stepIndex = STEPS.indexOf(step);
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
            <p className="mt-1 text-sm text-text-secondary">Max 20MB · Up to 500 rows</p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {/* Column guide */}
          <div className="mt-4 rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Expected columns</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary sm:grid-cols-3">
              <span><span className="font-medium text-error">*</span> person_email or person_phone</span>
              <span><span className="font-medium text-error">*</span> direction</span>
              <span><span className="font-medium text-error">*</span> travel_mode</span>
              <span><span className="font-medium text-error">*</span> from_city</span>
              <span><span className="font-medium text-error">*</span> to_city</span>
              <span>from_location</span>
              <span>to_location</span>
              <span>departure_at (UTC ISO)</span>
              <span>arrival_at (UTC ISO)</span>
              <span>carrier_name</span>
              <span>service_number</span>
              <span>pnr_or_booking_ref</span>
              <span>terminal_or_gate</span>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Direction values: inbound · outbound · intercity · other
              <br />
              Mode values: flight · train · car · bus · self_arranged · other
            </p>
          </div>

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
            Found {headers.length} columns and {rawRows.length} rows. Map each CSV column to a travel field.
          </p>

          <div className="mt-4 space-y-3">
            {mappings.map((m) => (
              <div
                key={m.csvColumn}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{m.csvColumn}</p>
                  {m.confidence > 0 && m.confidence < 1 && (
                    <p className="text-xs text-text-muted">{Math.round(m.confidence * 100)}% confidence</p>
                  )}
                </div>
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-text-muted sm:block" />
                <select
                  value={m.mappedTo || ''}
                  onChange={(e) => handleMappingChange(m.csvColumn, e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary sm:w-52"
                >
                  <option value="">Skip</option>
                  {Object.entries(TRAVEL_FIELD_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!requiredMapped && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="flex items-center gap-2 text-sm text-warning">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Required fields not mapped:{' '}
                {[
                  !hasPersonMapping && 'Person Email or Phone',
                  !hasFromCity && 'From City',
                  !hasToCity && 'To City',
                  !hasDirection && 'Direction',
                  !hasTravelMode && 'Travel Mode',
                ].filter(Boolean).join(', ')}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => setStep('upload')}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background"
            >
              Back
            </button>
            <button
              onClick={handlePreview}
              disabled={!requiredMapped}
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
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-2xl font-bold text-success">{validRows.length}</p>
              <p className="text-xs text-text-secondary">Ready to import</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-2xl font-bold text-error">{errorRows.length}</p>
              <p className="text-xs text-text-secondary">Row errors</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3 text-center">
              <p className="text-2xl font-bold text-text-primary">{parsed.length}</p>
              <p className="text-xs text-text-secondary">Total rows</p>
            </div>
          </div>

          {errorRows.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-error">Rows with errors (will be skipped)</h3>
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-error/20 bg-error/5 p-3">
                {errorRows.slice(0, 10).map((row) => (
                  <p key={row.rowNumber} className="text-xs text-error">
                    Row {row.rowNumber}: {row.errors.join(' · ')}
                  </p>
                ))}
                {errorRows.length > 10 && (
                  <p className="mt-1 text-xs text-error">…and {errorRows.length - 10} more</p>
                )}
              </div>
            </div>
          )}

          {validRows.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-text-primary">Preview (first 5 valid rows)</h3>
              <div className="mt-2 space-y-2">
                {validRows.slice(0, 5).map((r) => (
                  <div key={r.rowNumber} className="rounded-lg border border-border bg-surface p-3">
                    <p className="text-sm font-medium text-text-primary">
                      {r.fromCity} → {r.toCity}
                      <span className="ml-2 text-xs font-normal text-text-muted capitalize">
                        {r.direction} · {r.travelMode}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {[r.personEmail, r.personPhone, r.pnrOrBookingRef].filter(Boolean).join(' | ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-text-muted">
            Note: Duplicate records (same PNR + person + event) and unmatched persons will be reported as skipped — the batch will not fail.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => setStep('mapping')}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={validRows.length === 0}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              Import {validRows.length} Records
            </button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="mt-6 flex flex-col items-center py-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 font-medium text-text-primary">Importing travel records…</p>
          <p className="mt-1 text-sm text-text-secondary">
            Processing {validRows.length} records, writing audit log and emitting cascade events
          </p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && summary && (
        <div className="mt-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <CheckCircle2 className="mx-auto h-6 w-6 text-success" />
              <p className="mt-1 text-2xl font-bold text-success">{summary.imported}</p>
              <p className="text-xs text-text-secondary">Imported</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <SkipForward className="mx-auto h-6 w-6 text-warning" />
              <p className="mt-1 text-2xl font-bold text-warning">{summary.skipped}</p>
              <p className="text-xs text-text-secondary">Skipped</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <AlertCircle className="mx-auto h-6 w-6 text-error" />
              <p className="mt-1 text-2xl font-bold text-error">{summary.errors}</p>
              <p className="text-xs text-text-secondary">Errors</p>
            </div>
          </div>

          {/* Skipped and error detail */}
          {summary.results.filter((r) => r.status !== 'imported').length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-text-primary">Skipped / Error Rows</h3>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface p-3">
                {summary.results
                  .filter((r) => r.status !== 'imported')
                  .map((r) => (
                    <p key={r.rowNumber} className={cn('text-xs', r.status === 'error' ? 'text-error' : 'text-warning')}>
                      Row {r.rowNumber}: {r.status === 'skipped' ? r.reason : r.error}
                    </p>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/events/${eventId}/travel`}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primary-light"
            >
              View Travel Records
            </Link>
            <button
              onClick={() => {
                setStep('upload');
                setFileName('');
                setHeaders([]);
                setRawRows([]);
                setMappings([]);
                setParsed([]);
                setSummary(null);
                setImportError('');
              }}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-background"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}

      {isPending && step !== 'importing' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/20">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}
