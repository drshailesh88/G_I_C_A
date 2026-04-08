import { describe, expect, it } from 'vitest';
import {
  autoMapColumns,
  parseCsvString,
  parseRows,
  findDuplicates,
} from './csv-import';

describe('autoMapColumns', () => {
  it('maps exact column names', () => {
    const mappings = autoMapColumns(['Name', 'Email', 'Mobile', 'City']);
    expect(mappings.find((m) => m.csvColumn === 'Name')?.mappedTo).toBe('fullName');
    expect(mappings.find((m) => m.csvColumn === 'Email')?.mappedTo).toBe('email');
    expect(mappings.find((m) => m.csvColumn === 'Mobile')?.mappedTo).toBe('phone');
    expect(mappings.find((m) => m.csvColumn === 'City')?.mappedTo).toBe('city');
  });

  it('maps fuzzy column names', () => {
    const mappings = autoMapColumns(['Full Name', 'E-Mail', 'Phone Number', 'Organisation']);
    expect(mappings.find((m) => m.csvColumn === 'Full Name')?.mappedTo).toBe('fullName');
    expect(mappings.find((m) => m.csvColumn === 'E-Mail')?.mappedTo).toBe('email');
    expect(mappings.find((m) => m.csvColumn === 'Phone Number')?.mappedTo).toBe('phone');
    expect(mappings.find((m) => m.csvColumn === 'Organisation')?.mappedTo).toBe('organization');
  });

  it('returns null for unmappable columns', () => {
    const mappings = autoMapColumns(['Random Column', 'XYZ123']);
    expect(mappings[0].mappedTo).toBeNull();
    expect(mappings[1].mappedTo).toBeNull();
  });

  it('includes confidence scores', () => {
    const mappings = autoMapColumns(['email']);
    const emailMapping = mappings.find((m) => m.csvColumn === 'email');
    expect(emailMapping?.confidence).toBe(1); // exact match
  });
});

describe('parseCsvString', () => {
  it('parses valid CSV', () => {
    const csv = `Name,Email,City
Dr. Rajesh Kumar,rajesh@example.com,Delhi
Dr. Priya Sharma,priya@example.com,Mumbai`;

    const result = parseCsvString(csv);
    expect(result.headers).toEqual(['Name', 'Email', 'City']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].Name).toBe('Dr. Rajesh Kumar');
    expect(result.errors).toHaveLength(0);
  });

  it('skips empty lines', () => {
    const csv = `Name,Email
Test,test@example.com

Another,another@example.com`;

    const result = parseCsvString(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('trims header whitespace', () => {
    const csv = ` Name , Email
Test,test@example.com`;

    const result = parseCsvString(csv);
    expect(result.headers).toEqual(['Name', 'Email']);
  });
});

describe('parseRows', () => {
  const mappings = [
    { csvColumn: 'Name', mappedTo: 'fullName' as const, confidence: 1 },
    { csvColumn: 'Email', mappedTo: 'email' as const, confidence: 1 },
    { csvColumn: 'Mobile', mappedTo: 'phone' as const, confidence: 1 },
    { csvColumn: 'City', mappedTo: 'city' as const, confidence: 1 },
  ];

  it('parses rows with valid data', () => {
    const rows = [
      { Name: 'Dr. Rajesh Kumar', Email: 'rajesh@example.com', Mobile: '+919876543210', City: 'Delhi' },
    ];

    const parsed = parseRows(rows, mappings);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].fullName).toBe('Dr. Rajesh Kumar');
    expect(parsed[0].email).toBe('rajesh@example.com');
    expect(parsed[0].phoneE164).toBe('+919876543210');
    expect(parsed[0].errors).toHaveLength(0);
  });

  it('flags rows with missing full name', () => {
    const rows = [{ Name: '', Email: 'test@example.com', Mobile: '', City: '' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].errors).toContain('Missing full name');
  });

  it('flags rows with neither email nor phone', () => {
    const rows = [{ Name: 'Test Person', Email: '', Mobile: '', City: '' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].errors).toContain('At least one of email or phone is required');
  });

  it('flags invalid phone numbers', () => {
    const rows = [{ Name: 'Test', Email: '', Mobile: '123', City: '' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].errors.some((e) => e.includes('Invalid phone number'))).toBe(true);
  });

  it('normalizes valid phone to E.164', () => {
    const rows = [{ Name: 'Test', Email: '', Mobile: '9876543210', City: '' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].phoneE164).toBe('+919876543210');
  });

  it('uses 1-based row numbers starting from 2 (header = row 1)', () => {
    const rows = [
      { Name: 'First', Email: 'first@example.com', Mobile: '', City: '' },
      { Name: 'Second', Email: 'second@example.com', Mobile: '', City: '' },
    ];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].rowNumber).toBe(2);
    expect(parsed[1].rowNumber).toBe(3);
  });
});

describe('findDuplicates', () => {
  const existingPeople = [
    { id: 'p1', fullName: 'Dr. Rajesh Kumar', email: 'rajesh@example.com', phoneE164: '+919876543210' },
    { id: 'p2', fullName: 'Dr. Priya Sharma', email: 'priya@example.com', phoneE164: '+919876543211' },
  ];

  it('detects email duplicates', () => {
    const parsed = [
      { rowNumber: 2, fullName: 'R. Kumar', email: 'rajesh@example.com', errors: [] as string[] },
    ];

    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('email');
    expect(matches[0].existingPerson.id).toBe('p1');
  });

  it('detects phone duplicates', () => {
    const parsed = [
      { rowNumber: 2, fullName: 'Someone', phoneE164: '+919876543210', errors: [] as string[] },
    ];

    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('phone');
  });

  it('detects fuzzy name duplicates', () => {
    const parsed = [
      { rowNumber: 2, fullName: 'Dr Rajesh Kumar', errors: [] as string[] },
    ];

    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('fuzzy_name');
  });

  it('skips rows with errors', () => {
    const parsed = [
      { rowNumber: 2, fullName: '', email: 'rajesh@example.com', errors: ['Missing full name'] },
    ];

    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(0);
  });

  it('prioritizes email match over fuzzy name', () => {
    const parsed = [
      { rowNumber: 2, fullName: 'Dr. Rajesh Kumar', email: 'rajesh@example.com', errors: [] as string[] },
    ];

    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('email'); // email match wins
  });
});
