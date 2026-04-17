import Papa from 'papaparse';
import Fuse from 'fuse.js';
import { normalizePhone } from '@/lib/validations/person';

const MAX_CSV_IMPORT_ROWS = 500;
const MAX_CSV_IMPORT_BYTES = 20 * 1024 * 1024;
const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SPREADSHEET_FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

// ── Column mapping ─────────────────────────────────────────────
// Standard fields we expect to find in a CSV.
const KNOWN_COLUMNS = [
  { key: 'fullName', aliases: ['full_name', 'name', 'full name', 'participant name', 'delegate name', 'faculty name'] },
  { key: 'email', aliases: ['email', 'e-mail', 'email address', 'email_address'] },
  { key: 'phone', aliases: ['phone', 'mobile', 'phone_e164', 'phone number', 'mobile number', 'contact', 'cell'] },
  { key: 'salutation', aliases: ['salutation', 'title', 'prefix'] },
  { key: 'designation', aliases: ['designation', 'position', 'job title', 'role'] },
  { key: 'specialty', aliases: ['specialty', 'speciality', 'specialization', 'department', 'dept'] },
  { key: 'organization', aliases: ['organization', 'organisation', 'institution', 'hospital', 'company', 'affiliation'] },
  { key: 'city', aliases: ['city', 'town', 'location'] },
  { key: 'tags', aliases: ['tags', 'category', 'type', 'categories'] },
] as const;

type MappedKey = (typeof KNOWN_COLUMNS)[number]['key'];

export interface ColumnMapping {
  csvColumn: string;
  mappedTo: MappedKey | null;
  confidence: number; // 0-1
}

export interface ParsedPerson {
  rowNumber: number;
  fullName: string;
  email?: string;
  phone?: string;
  phoneE164?: string;
  salutation?: string;
  designation?: string;
  specialty?: string;
  organization?: string;
  city?: string;
  tags?: string[];
  errors: string[];
}

export interface DuplicateMatch {
  rowNumber: number;
  parsedPerson: ParsedPerson;
  existingPerson: { id: string; fullName: string; email: string | null; phoneE164: string | null };
  matchType: 'email' | 'phone' | 'fuzzy_name';
  score: number;
}

export interface CsvImportResult {
  columnMappings: ColumnMapping[];
  parsed: ParsedPerson[];
  duplicates: DuplicateMatch[];
  errors: string[];
  totalRows: number;
  validRows: number;
}

function isDangerousObjectKey(value: string): boolean {
  return DANGEROUS_OBJECT_KEYS.has(value.trim().toLowerCase());
}

function getMappedCellValue(row: Record<string, string>, columnName: string | undefined): string {
  if (!columnName || isDangerousObjectKey(columnName) || !Object.hasOwn(row, columnName)) {
    return '';
  }

  const value = row[columnName];
  return typeof value === 'string' ? value : '';
}

function addSpreadsheetFormulaError(
  errors: string[],
  label: string,
  value: string,
) {
  if (value && SPREADSHEET_FORMULA_PREFIX.test(value)) {
    errors.push(`Unsafe spreadsheet formula in ${label}`);
  }
}

// ── Auto-map columns ───────────────────────────────────────────
export function autoMapColumns(csvHeaders: string[]): ColumnMapping[] {
  const allAliases = KNOWN_COLUMNS.flatMap((col) =>
    col.aliases.map((alias) => ({ alias, key: col.key })),
  );

  const fuse = new Fuse(allAliases, {
    keys: ['alias'],
    threshold: 0.4,
    includeScore: true,
  });

  return csvHeaders.map((header) => {
    const normalized = header.toLowerCase().trim();

    // Exact match first
    const exact = allAliases.find((a) => a.alias === normalized);
    if (exact) {
      return { csvColumn: header, mappedTo: exact.key as MappedKey, confidence: 1 };
    }

    // Fuzzy match
    const results = fuse.search(normalized);
    if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.4) {
      return {
        csvColumn: header,
        mappedTo: results[0].item.key as MappedKey,
        confidence: 1 - results[0].score,
      };
    }

    return { csvColumn: header, mappedTo: null, confidence: 0 };
  });
}

// ── Parse CSV rows using column mappings ───────────────────────
export function parseRows(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
): ParsedPerson[] {
  const keyMap = new Map<MappedKey, string>();
  for (const m of mappings) {
    if (m.mappedTo && !isDangerousObjectKey(m.csvColumn)) keyMap.set(m.mappedTo, m.csvColumn);
  }

  return rows.map((row, index) => {
    const errors: string[] = [];
    const fullName = getMappedCellValue(row, keyMap.get('fullName')).trim();
    const email = getMappedCellValue(row, keyMap.get('email')).trim();
    const phone = getMappedCellValue(row, keyMap.get('phone')).trim();
    const salutation = getMappedCellValue(row, keyMap.get('salutation')).trim();
    const designation = getMappedCellValue(row, keyMap.get('designation')).trim();
    const specialty = getMappedCellValue(row, keyMap.get('specialty')).trim();
    const organization = getMappedCellValue(row, keyMap.get('organization')).trim();
    const city = getMappedCellValue(row, keyMap.get('city')).trim();
    const tagsRaw = getMappedCellValue(row, keyMap.get('tags')).trim();

    if (!fullName) errors.push('Missing full name');
    if (!email && !phone) errors.push('At least one of email or phone is required');
    addSpreadsheetFormulaError(errors, 'full name', fullName);
    addSpreadsheetFormulaError(errors, 'email', email);
    addSpreadsheetFormulaError(errors, 'salutation', salutation);
    addSpreadsheetFormulaError(errors, 'designation', designation);
    addSpreadsheetFormulaError(errors, 'specialty', specialty);
    addSpreadsheetFormulaError(errors, 'organization', organization);
    addSpreadsheetFormulaError(errors, 'city', city);
    addSpreadsheetFormulaError(errors, 'tags', tagsRaw);

    let phoneE164: string | undefined;
    if (phone) {
      try {
        phoneE164 = normalizePhone(phone);
      } catch {
        errors.push(`Invalid phone number: ${phone}`);
      }
    }

    const tags = tagsRaw ? tagsRaw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : undefined;

    return {
      rowNumber: index + 2, // 1-based, header is row 1
      fullName,
      email: email || undefined,
      phone: phone || undefined,
      phoneE164,
      salutation: salutation || undefined,
      designation: designation || undefined,
      specialty: specialty || undefined,
      organization: organization || undefined,
      city: city || undefined,
      tags,
      errors,
    };
  });
}

// ── Find duplicates against existing people ────────────────────
export function findDuplicates(
  parsed: ParsedPerson[],
  existingPeople: { id: string; fullName: string; email: string | null; phoneE164: string | null }[],
): DuplicateMatch[] {
  const emailMap = new Map<string, typeof existingPeople[number]>();
  const phoneMap = new Map<string, typeof existingPeople[number]>();

  for (const p of existingPeople) {
    if (p.email) emailMap.set(p.email.toLowerCase(), p);
    if (p.phoneE164) phoneMap.set(p.phoneE164, p);
  }

  // Fuzzy name matching with Fuse.js
  const fuse = new Fuse(existingPeople, {
    keys: ['fullName'],
    threshold: 0.3,
    includeScore: true,
  });

  const matches: DuplicateMatch[] = [];

  for (const person of parsed) {
    if (person.errors.length > 0) continue;

    // Check email match
    if (person.email) {
      const match = emailMap.get(person.email.toLowerCase());
      if (match) {
        matches.push({
          rowNumber: person.rowNumber,
          parsedPerson: person,
          existingPerson: match,
          matchType: 'email',
          score: 1,
        });
        continue;
      }
    }

    // Check phone match
    if (person.phoneE164) {
      const match = phoneMap.get(person.phoneE164);
      if (match) {
        matches.push({
          rowNumber: person.rowNumber,
          parsedPerson: person,
          existingPerson: match,
          matchType: 'phone',
          score: 1,
        });
        continue;
      }
    }

    // Fuzzy name match
    const nameResults = fuse.search(person.fullName);
    if (nameResults.length > 0 && nameResults[0].score !== undefined && nameResults[0].score < 0.3) {
      matches.push({
        rowNumber: person.rowNumber,
        parsedPerson: person,
        existingPerson: nameResults[0].item,
        matchType: 'fuzzy_name',
        score: 1 - nameResults[0].score,
      });
    }
  }

  return matches;
}

// ── Parse CSV string ───────────────────────────────────────────
export function parseCsvString(csvContent: string): {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
} {
  if (new TextEncoder().encode(csvContent).length > MAX_CSV_IMPORT_BYTES) {
    return {
      headers: [],
      rows: [],
      errors: ['CSV file exceeds 20MB limit'],
    };
  }

  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    preview: MAX_CSV_IMPORT_ROWS + 1,
  });

  const headers = result.meta.fields ?? [];
  const errors = result.errors.map((e) => `Row ${e.row}: ${e.message}`);
  const unsafeHeaders = headers.filter(isDangerousObjectKey);
  for (const header of unsafeHeaders) {
    errors.push(`Unsafe CSV column header: ${header}`);
  }
  if (result.data.length > MAX_CSV_IMPORT_ROWS) {
    errors.push(`CSV import exceeds ${MAX_CSV_IMPORT_ROWS} row limit`);
  }

  return {
    headers,
    rows: result.data,
    errors,
  };
}
