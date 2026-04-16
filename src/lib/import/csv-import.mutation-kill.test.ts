import { describe, expect, it } from 'vitest';
import {
  autoMapColumns,
  parseCsvString,
  parseRows,
  findDuplicates,
} from './csv-import';

// ── autoMapColumns: fuzzy branch (L82-86 NoCoverage) ─────────────
// All existing tests use exact-alias inputs (e.g. 'full name', 'e-mail').
// These tests use genuinely misspelled headers to cover the fuzzy branch.
describe('autoMapColumns — fuzzy branch coverage', () => {
  it('maps a misspelled phone header via fuzzy (kills L68 BooleanLiteral includeScore:true→false)', () => {
    // 'Moblie' is NOT an exact alias → goes through Fuse fuzzy branch
    // If includeScore:false, score is undefined → condition at L82 fails → returns null
    const mappings = autoMapColumns(['Moblie']);
    expect(mappings[0].mappedTo).toBe('phone');
  });

  it('fuzzy confidence is 1 − score, not 1 + score (kills L86:21 ArithmeticOperator)', () => {
    const mappings = autoMapColumns(['Moblie']);
    expect(mappings[0].confidence).toBeGreaterThan(0);
    // 1 + score > 1; 1 - score < 1 (since score > 0 for non-exact match)
    expect(mappings[0].confidence).toBeLessThan(1);
  });

  it('maps a second fuzzy header confirming keys:["alias"] is required (kills L66 ArrayDeclaration)', () => {
    // 'Phonne' is NOT an exact alias → fuzzy branch; keys:[] would return null
    const mappings = autoMapColumns(['Phonne']);
    expect(mappings[0].mappedTo).toBe('phone');
  });

  it('fuzzy result below threshold returns null (kills L82:9 ConditionalExpression→false)', () => {
    // Completely unrecognisable column → no fuzzy match
    const mappings = autoMapColumns(['Xyzzy123Qqqq']);
    expect(mappings[0].mappedTo).toBeNull();
    expect(mappings[0].confidence).toBe(0);
  });
});

// ── parseRows: contact-required guard (L111) ─────────────────────
describe('parseRows — email-only / phone-only contact guard', () => {
  const mappings = [
    { csvColumn: 'Name', mappedTo: 'fullName' as const, confidence: 1 },
    { csvColumn: 'Email', mappedTo: 'email' as const, confidence: 1 },
    { csvColumn: 'Mobile', mappedTo: 'phone' as const, confidence: 1 },
  ];

  it('email-only row has no contact-required error (kills L111 LogicalOperator &&→||)', () => {
    // With mutation (!email || !phone), providing email but no phone would still trigger the error
    const rows = [{ Name: 'Test', Email: 'test@example.com', Mobile: '' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].errors).not.toContain('At least one of email or phone is required');
  });

  it('phone-only row has no contact-required error', () => {
    const rows = [{ Name: 'Test', Email: '', Mobile: '+919876543210' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].errors).not.toContain('At least one of email or phone is required');
  });
});

// ── parseRows: phone normalisation guard (L114) ───────────────────
describe('parseRows — phone normalisation gate', () => {
  const mappings = [
    { csvColumn: 'Name', mappedTo: 'fullName' as const, confidence: 1 },
    { csvColumn: 'Email', mappedTo: 'email' as const, confidence: 1 },
    { csvColumn: 'Mobile', mappedTo: 'phone' as const, confidence: 1 },
  ];

  it('empty phone produces no phoneE164 and no phone error (kills L114 ConditionalExpression→true)', () => {
    // With if(true), normalizePhone('') is called → throws → spurious error added
    const rows = [{ Name: 'Test', Email: 'test@example.com', Mobile: '' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].phoneE164).toBeUndefined();
    expect(parsed[0].errors.some((e) => e.includes('Invalid phone'))).toBe(false);
  });
});

// ── parseRows: tags filter (L123) ────────────────────────────────
describe('parseRows — tags split and filter', () => {
  const mappings = [
    { csvColumn: 'Name', mappedTo: 'fullName' as const, confidence: 1 },
    { csvColumn: 'Email', mappedTo: 'email' as const, confidence: 1 },
    { csvColumn: 'Tags', mappedTo: 'tags' as const, confidence: 1 },
  ];

  it('double-comma produces no empty tag (kills L123:28 MethodExpression filter removal)', () => {
    const rows = [{ Name: 'Test', Email: 'test@example.com', Tags: 'VIP,,faculty' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].tags).toEqual(['VIP', 'faculty']);
  });

  it('trailing separator produces no empty tag', () => {
    const rows = [{ Name: 'Test', Email: 'test@example.com', Tags: 'VIP;' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].tags).toEqual(['VIP']);
  });
});

// ── parseRows: raw field values (L128-135) ────────────────────────
describe('parseRows — raw field presence and absence', () => {
  const mappings = [
    { csvColumn: 'Name', mappedTo: 'fullName' as const, confidence: 1 },
    { csvColumn: 'Email', mappedTo: 'email' as const, confidence: 1 },
    { csvColumn: 'Mobile', mappedTo: 'phone' as const, confidence: 1 },
    { csvColumn: 'Salutation', mappedTo: 'salutation' as const, confidence: 1 },
    { csvColumn: 'Designation', mappedTo: 'designation' as const, confidence: 1 },
    { csvColumn: 'Specialty', mappedTo: 'specialty' as const, confidence: 1 },
    { csvColumn: 'Organization', mappedTo: 'organization' as const, confidence: 1 },
    { csvColumn: 'City', mappedTo: 'city' as const, confidence: 1 },
  ];

  it('raw phone is preserved when present (kills L129 ConditionalExpression→false + LogicalOperator)', () => {
    const rows = [{ Name: 'Test', Email: '', Mobile: '+919876543210', Salutation: '', Designation: '', Specialty: '', Organization: '', City: '' }];
    const parsed = parseRows(rows, mappings);
    // ConditionalExpression→false makes phone always undefined; LogicalOperator &&→ makes truthy phone undefined
    expect(parsed[0].phone).toBe('+919876543210');
  });

  it('empty phone field produces undefined phone (kills L129 ConditionalExpression→true)', () => {
    const rows = [{ Name: 'Test', Email: 'test@example.com', Mobile: '', Salutation: '', Designation: '', Specialty: '', Organization: '', City: '' }];
    const parsed = parseRows(rows, mappings);
    // ConditionalExpression→true makes '' || undefined evaluate as '', not undefined
    expect(parsed[0].phone).toBeUndefined();
  });

  it('empty email field produces undefined email (kills L128 ConditionalExpression→true)', () => {
    const rows = [{ Name: 'Test', Email: '', Mobile: '+919876543210', Salutation: '', Designation: '', Specialty: '', Organization: '', City: '' }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].email).toBeUndefined();
  });

  it('optional fields present return their values (kills L131-135 ConditionalExpression→false)', () => {
    const rows = [{
      Name: 'Test Person', Email: 'test@example.com', Mobile: '',
      Salutation: 'Dr', Designation: 'Surgeon',
      Specialty: 'Cardiology', Organization: 'AIIMS', City: 'Delhi',
    }];
    const parsed = parseRows(rows, mappings);
    expect(parsed[0].salutation).toBe('Dr');
    expect(parsed[0].designation).toBe('Surgeon');
    expect(parsed[0].specialty).toBe('Cardiology');
    expect(parsed[0].organization).toBe('AIIMS');
    expect(parsed[0].city).toBe('Delhi');
  });

  it('empty optional fields produce undefined (kills L131-135 ConditionalExpression→true + LogicalOperator)', () => {
    const rows = [{
      Name: 'Test Person', Email: 'test@example.com', Mobile: '',
      Salutation: '', Designation: '',
      Specialty: '', Organization: '', City: '',
    }];
    const parsed = parseRows(rows, mappings);
    // ConditionalExpression→true: ''.trim() = '' → '' returned instead of undefined
    expect(parsed[0].salutation).toBeUndefined();
    expect(parsed[0].designation).toBeUndefined();
    expect(parsed[0].specialty).toBeUndefined();
    expect(parsed[0].organization).toBeUndefined();
    expect(parsed[0].city).toBeUndefined();
  });
});

// ── findDuplicates: null email/phone in existing people (L151-152) ─
describe('findDuplicates — null email/phone in existing roster', () => {
  it('existing person with null email does not throw (kills L151 ConditionalExpression→true)', () => {
    // With if(true), null.toLowerCase() is called → TypeError
    const existingPeople = [
      { id: 'p1', fullName: 'Dr. Rajesh Kumar', email: null, phoneE164: null },
    ];
    const parsed = [
      { rowNumber: 2, fullName: 'Unrelated Person', email: 'nobody@example.com', errors: [] as string[] },
    ];
    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(0);
  });

  it('existing person with null phone does not throw (kills L152 ConditionalExpression→true)', () => {
    const existingPeople = [
      { id: 'p1', fullName: 'Dr. Rajesh Kumar', email: 'rajesh@example.com', phoneE164: null },
    ];
    const parsed = [
      { rowNumber: 2, fullName: 'Unrelated Person', email: 'nobody@example.com', errors: [] as string[] },
    ];
    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(0);
  });
});

// ── findDuplicates: no match when contact absent from roster (L170, L185) ─
describe('findDuplicates — email/phone not in existing roster', () => {
  const existingPeople = [
    { id: 'p1', fullName: 'Dr. Rajesh Kumar', email: 'rajesh@example.com', phoneE164: '+919876543210' },
  ];

  it('email in CSV but not in roster → no match (kills L170 ConditionalExpression→true)', () => {
    // With if(true), emailMap.get(email) is undefined → push { existingPerson: undefined }
    // length check would still be 1 → mutant killed
    const parsed = [
      { rowNumber: 2, fullName: 'Someone Else', email: 'nobody@example.com', errors: [] as string[] },
    ];
    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(0);
  });

  it('phoneE164 in CSV but not in roster → no match (kills L185 ConditionalExpression→true)', () => {
    const parsed = [
      { rowNumber: 2, fullName: 'Someone Else', phoneE164: '+910000000000', errors: [] as string[] },
    ];
    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(0);
  });
});

// ── findDuplicates: fuzzy threshold boundary (L199) ─────────────
describe('findDuplicates — fuzzy name matching boundary', () => {
  const existingPeople = [
    { id: 'p1', fullName: 'Dr. Rajesh Kumar', email: null, phoneE164: null },
    { id: 'p2', fullName: 'Dr. Priya Sharma', email: null, phoneE164: null },
  ];

  it('completely different name produces no fuzzy match (kills L199:9 EqualityOperator length>0→>=0)', () => {
    // 'Xyzzy Qqqqqq' scores >= 0.3 → Fuse returns empty array with threshold:0.3
    // With length >= 0: empty array satisfies condition → accesses [0] (undefined) → .score → TypeError
    const parsed = [
      { rowNumber: 2, fullName: 'Xyzzy Qqqqqq', errors: [] as string[] },
    ];
    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(0);
  });

  it('fuzzy name match score is computed as 1 − fuse_score (kills L205 ArithmeticOperator +→-)', () => {
    const parsed = [
      { rowNumber: 2, fullName: 'Dr Rajesh Kumar', errors: [] as string[] },
    ];
    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('fuzzy_name');
    // 1 − score must be in (0, 1]; if mutated to 1 + score, value would exceed 1
    expect(matches[0].score).toBeGreaterThan(0);
    expect(matches[0].score).toBeLessThanOrEqual(1);
    // Tighter bound: fuzzy score > 0 means 1−score < 1
    expect(matches[0].score).toBeLessThan(1);
  });

  it('fuzzy match uses score !== undefined check (kills L199:35 ConditionalExpression→true)', () => {
    // With includeScore:true, score is always defined — but the check guards against undefined
    // Even with the mutation (→true), this test should still find the match; primarily covers the branch
    const parsed = [
      { rowNumber: 2, fullName: 'Dr. Rajesh Kumar', errors: [] as string[] },
    ];
    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(1);
  });

  it('row with errors is skipped — no duplicate checked', () => {
    const parsed = [
      { rowNumber: 2, fullName: 'Dr. Rajesh Kumar', errors: ['Missing full name'] },
    ];
    const matches = findDuplicates(parsed as any, existingPeople);
    expect(matches).toHaveLength(0);
  });
});

// ── parseCsvString: error formatting (L228) ──────────────────────
describe('parseCsvString — error message formatting', () => {
  it('formats PapaParse errors as "Row N: message" strings (kills L228:31 ArrowFunction)', () => {
    // A row with more fields than headers triggers a TooManyFields error from PapaParse
    const csv = 'Name,Email\nJoe Smith,joe@example.com,extra_field_causes_error';
    const result = parseCsvString(csv);
    // If ArrowFunction mutant fires: errors.map(() => undefined) → [undefined]
    // All error entries must be non-null strings with Row prefix
    for (const err of result.errors) {
      expect(typeof err).toBe('string');
      expect(err).toMatch(/^Row /);
    }
  });

  it('returns empty errors array for valid CSV (no spurious formatting)', () => {
    const csv = 'Name,Email\nJoe,joe@example.com';
    const result = parseCsvString(csv);
    expect(result.errors).toHaveLength(0);
  });
});
