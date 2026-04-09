# Feature Census: People Module

**Generated:** 2026-04-09
**Entry points:** `src/app/(app)/people/page.tsx`, `src/app/(app)/people/[personId]/page.tsx`, `src/app/(app)/people/import/page.tsx`
**Files in scope:** 14
**Method:** 2-layer extraction (code + library docs). Layer 3 (runtime) skipped — app not running.

## Summary

| Metric | Count |
|--------|-------|
| Total features | 52 |
| From your code | 47 |
| From libraries (emergent) | 5 |

---

## Features by Category

### 1. Person CRUD Operations

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 1 | Create person with Zod validation | Server action `createPerson()` | `src/lib/actions/person.ts:44` | CONFIRMED |
| 2 | Update person (partial fields) | Server action `updatePerson()` | `src/lib/actions/person.ts:92` | CONFIRMED |
| 3 | Get person by ID | Server action `getPerson()` | `src/lib/actions/person.ts:134` | CONFIRMED |
| 4 | Soft delete (archive) person | Server action `archivePerson()` | `src/lib/actions/person.ts:221` | CONFIRMED |
| 5 | Restore archived person | Server action `restorePerson()` | `src/lib/actions/person.ts:244` | CONFIRMED |
| 6 | Anonymize person (irreversible) | Server action `anonymizePerson()` | `src/lib/actions/person.ts:267` | CONFIRMED |
| 7 | Upsert event-person junction | Server action `ensureEventPerson()` | `src/lib/actions/person.ts:299` | CONFIRMED |
| 8 | Get people linked to event | Server action `getEventPeople()` | `src/lib/actions/person.ts:378` | CONFIRMED |

### 2. Search & Filtering

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 9 | Full-text search (name, email, org, phone) | Search form submit | `src/lib/actions/person.ts:159-169` | CONFIRMED |
| 10 | Filter by organization | URL param `org` | `src/lib/actions/person.ts:172-175` | CONFIRMED |
| 11 | Filter by city | URL param `city` | `src/lib/actions/person.ts:176-179` | CONFIRMED |
| 12 | Filter by specialty | URL param `specialty` | `src/lib/actions/person.ts:180-183` | CONFIRMED |
| 13 | Filter by tag (JSONB containment) | URL param `tag` | `src/lib/actions/person.ts:184` | CONFIRMED |
| 14 | Saved view: All People | View tab button | `src/app/(app)/people/people-list-client.tsx:34` | CONFIRMED |
| 15 | Saved view: Faculty | View tab button (tags @> 'faculty') | `src/lib/actions/person.ts:187` | CONFIRMED |
| 16 | Saved view: Delegates | View tab button (tags @> 'delegate') | `src/lib/actions/person.ts:188` | CONFIRMED |
| 17 | Saved view: Sponsors | View tab button (tags @> 'sponsor') | `src/lib/actions/person.ts:189` | CONFIRMED |
| 18 | Saved view: VIPs | View tab button (tags @> 'VIP') | `src/lib/actions/person.ts:190` | CONFIRMED |
| 19 | Saved view: Recently Added | View tab button (order by createdAt desc) | `src/lib/actions/person.ts:193` | CONFIRMED |
| 20 | SQL LIKE wildcard escaping in search | Automatic on search input | `src/lib/actions/person.ts:161` | CONFIRMED |
| 21 | Exclude archived from search results | WHERE clause | `src/lib/actions/person.ts:156` | CONFIRMED |
| 22 | Exclude anonymized from search results | WHERE clause | `src/lib/actions/person.ts:156` | CONFIRMED |

### 3. Pagination

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 23 | Server-side pagination (limit/offset) | URL param `page` | `src/lib/actions/person.ts:154-155` | CONFIRMED |
| 24 | Previous page button (disabled at page 1) | Click | `src/app/(app)/people/people-list-client.tsx:171` | CONFIRMED |
| 25 | Next page button (disabled at last page) | Click | `src/app/(app)/people/people-list-client.tsx:182` | CONFIRMED |
| 26 | Page X of Y display | Automatic | `src/app/(app)/people/people-list-client.tsx:178` | CONFIRMED |
| 27 | Total people count display | Automatic | `src/app/(app)/people/people-list-client.tsx:89` | CONFIRMED |
| 28 | Reset page on filter change | URL param management | `src/app/(app)/people/people-list-client.tsx:71` | CONFIRMED |

### 4. People List UI

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 29 | Person card with avatar (initials) | Render | `src/app/(app)/people/people-list-client.tsx:197-209` | CONFIRMED |
| 30 | Display salutation prefix | Conditional render | `src/app/(app)/people/people-list-client.tsx:215` | CONFIRMED |
| 31 | Display email with icon | Conditional render | `src/app/(app)/people/people-list-client.tsx:224-228` | CONFIRMED |
| 32 | Display phone with icon | Conditional render | `src/app/(app)/people/people-list-client.tsx:229-233` | CONFIRMED |
| 33 | Display organization with icon | Conditional render | `src/app/(app)/people/people-list-client.tsx:234-238` | CONFIRMED |
| 34 | Display city with icon | Conditional render | `src/app/(app)/people/people-list-client.tsx:239-243` | CONFIRMED |
| 35 | Display tags as pills | Conditional render | `src/app/(app)/people/people-list-client.tsx:251-261` | CONFIRMED |
| 36 | Empty state (no results) | Zero results | `src/app/(app)/people/people-list-client.tsx:148-158` | CONFIRMED |
| 37 | Loading overlay (transition opacity) | During navigation | `src/app/(app)/people/people-list-client.tsx:145` | CONFIRMED |
| 38 | Navigate to person detail | Card click (Link) | `src/app/(app)/people/people-list-client.tsx:202` | CONFIRMED |

### 5. Person Detail Page

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 39 | Back navigation to people list | Link click | `src/app/(app)/people/[personId]/person-detail-client.tsx:109` | CONFIRMED |
| 40 | Edit person button (link) | Click | `src/app/(app)/people/[personId]/person-detail-client.tsx:117` | CONFIRMED |
| 41 | Profile header with large avatar | Render | `src/app/(app)/people/[personId]/person-detail-client.tsx:137` | CONFIRMED |
| 42 | Archived badge display | Conditional render | `src/app/(app)/people/[personId]/person-detail-client.tsx:148` | CONFIRMED |
| 43 | Contact info rows (email, phone, org, city, specialty) | Conditional render | `src/app/(app)/people/[personId]/person-detail-client.tsx:157-176` | CONFIRMED |
| 44 | Change history (created/updated dates) | Render | `src/app/(app)/people/[personId]/person-detail-client.tsx:196-222` | CONFIRMED |
| 45 | Archive person with confirmation dialog | 2-step button | `src/app/(app)/people/[personId]/person-detail-client.tsx:238-266` | CONFIRMED |
| 46 | Restore person button | Click | `src/app/(app)/people/[personId]/person-detail-client.tsx:230-236` | CONFIRMED |
| 47 | Anonymize person with confirmation (Super Admin only) | 2-step button | `src/app/(app)/people/[personId]/person-detail-client.tsx:270-301` | CONFIRMED |
| 48 | Error banner display | On action failure | `src/app/(app)/people/[personId]/person-detail-client.tsx:129-133` | CONFIRMED |
| 49 | 404 handling for invalid person ID | Server-side | `src/app/(app)/people/[personId]/page.tsx:20-27` | CONFIRMED |

### 6. CSV Import Pipeline

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 50 | CSV file upload (drag area, 20MB max) | File input | `src/app/(app)/people/import/csv-import-client.tsx:50-84` | CONFIRMED |
| 51 | CSV parsing with PapaParse | Automatic after upload | `src/lib/import/csv-import.ts:214-230` | CONFIRMED |
| 52 | Auto-map CSV columns (exact + fuzzy via Fuse.js) | Automatic after parse | `src/lib/import/csv-import.ts:60-92` | CONFIRMED |
| 53 | Manual column mapping override | Select dropdown | `src/app/(app)/people/import/csv-import-client.tsx:86-94` | CONFIRMED |
| 54 | Mapping validation (fullName + email/phone required) | Render check | `src/app/(app)/people/import/csv-import-client.tsx:139-140` | CONFIRMED |
| 55 | Row parsing with phone E.164 normalization | parseRows() | `src/lib/import/csv-import.ts:95-140` | CONFIRMED |
| 56 | Tags parsing from delimited string (comma/semicolon/pipe) | parseRows() | `src/lib/import/csv-import.ts:122-123` | CONFIRMED |
| 57 | Preview valid/error row counts | Render | `src/app/(app)/people/import/csv-import-client.tsx:291-304` | CONFIRMED |
| 58 | Error rows display (first 10) | Render | `src/app/(app)/people/import/csv-import-client.tsx:306-319` | CONFIRMED |
| 59 | Preview first 5 valid rows | Render | `src/app/(app)/people/import/csv-import-client.tsx:322-339` | CONFIRMED |
| 60 | Batch import server action | importPeopleBatch() | `src/lib/actions/person.ts:320-375` | CONFIRMED |
| 61 | Per-row import result tracking | ImportRowResult type | `src/lib/actions/person.ts:313-318` | CONFIRMED |
| 62 | Import progress spinner | Step = 'importing' | `src/app/(app)/people/import/csv-import-client.tsx:362-370` | CONFIRMED |
| 63 | Import success page with stats | Success route | `src/app/(app)/people/import/success/import-success-client.tsx:6-78` | CONFIRMED |
| 64 | "Import Another File" action | Link | `src/app/(app)/people/import/success/import-success-client.tsx:71-76` | CONFIRMED |
| 65 | Step indicator (Upload → Map → Preview → Import) | Render | `src/app/(app)/people/import/csv-import-client.tsx:161-185` | CONFIRMED |

### 7. Duplicate Detection

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 66 | Server-side dedup by email on create | createPerson() | `src/lib/actions/person.ts:57-68` | CONFIRMED |
| 67 | Server-side dedup by phone (E.164) on create | createPerson() | `src/lib/actions/person.ts:57-68` | CONFIRMED |
| 68 | Client-side duplicate detection (email match) | findDuplicates() | `src/lib/import/csv-import.ts:168-179` | CONFIRMED |
| 69 | Client-side duplicate detection (phone match) | findDuplicates() | `src/lib/import/csv-import.ts:182-192` | CONFIRMED |
| 70 | Client-side fuzzy name matching (Fuse.js, threshold 0.3) | findDuplicates() | `src/lib/import/csv-import.ts:197-206` | CONFIRMED |

### 8. Validation

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 71 | fullName required, max 200 chars | Zod schema | `src/lib/validations/person.ts:27` | CONFIRMED |
| 72 | Email format validation (max 254) | Zod schema | `src/lib/validations/person.ts:28` | CONFIRMED |
| 73 | Phone max 20 chars | Zod schema | `src/lib/validations/person.ts:29` | CONFIRMED |
| 74 | At least email or phone required | Zod refinement | `src/lib/validations/person.ts:35-38` | CONFIRMED |
| 75 | Tags max 20 items, each max 50 chars | Zod schema | `src/lib/validations/person.ts:34` | CONFIRMED |
| 76 | Phone E.164 normalization (default India +91) | normalizePhone() | `src/lib/validations/person.ts:5-15` | CONFIRMED |
| 77 | personId UUID validation | Zod schema | `src/lib/validations/person.ts:57` | CONFIRMED |
| 78 | Search params validation (view, page, limit bounds) | personSearchSchema | `src/lib/validations/person.ts:60-69` | CONFIRMED |
| 79 | Salutation enum validation | Zod schema | `src/lib/validations/person.ts:18` | CONFIRMED |

### 9. Authorization & RBAC

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 80 | Auth check on every server action | `auth()` from Clerk | `src/lib/actions/person.ts:45-46` | CONFIRMED |
| 81 | Auth redirect on list page | Server component | `src/app/(app)/people/page.tsx:21-22` | CONFIRMED |
| 82 | Auth redirect on detail page | Server component | `src/app/(app)/people/[personId]/page.tsx:13-14` | CONFIRMED |
| 83 | Auth redirect on import page | Server component | `src/app/(app)/people/import/page.tsx:6-7` | CONFIRMED |
| 84 | canWrite gates Add/Import buttons | useRole() | `src/app/(app)/people/people-list-client.tsx:92` | CONFIRMED |
| 85 | canWrite gates Edit button | useRole() | `src/app/(app)/people/[personId]/person-detail-client.tsx:115` | CONFIRMED |
| 86 | canWrite gates Danger Zone | useRole() | `src/app/(app)/people/[personId]/person-detail-client.tsx:225` | CONFIRMED |
| 87 | isSuperAdmin gates Anonymize action | useRole() | `src/app/(app)/people/[personId]/person-detail-client.tsx:270` | CONFIRMED |

### 10. Database Design

| # | Feature | Trigger | Code Ref | Status |
|---|---------|---------|----------|--------|
| 88 | Dedup indexes on email and phone_e164 | Schema | `src/lib/db/schema/people.ts:49-50` | CONFIRMED |
| 89 | Active records partial index | Schema | `src/lib/db/schema/people.ts:59` | CONFIRMED |
| 90 | GIN index on tags JSONB | Schema | `src/lib/db/schema/people.ts:62` | CONFIRMED |
| 91 | Event-people unique constraint | Schema | `src/lib/db/schema/event-people.ts:30` | CONFIRMED |
| 92 | Relations to registrations, sessions, travel, certs | Schema | `src/lib/db/schema/people.ts:65-73` | CONFIRMED |

### 11. Library-Emergent Features

| # | Feature | Source Library | Description | Status |
|---|---------|---------------|-------------|--------|
| 93 | Fuzzy search for column mapping | Fuse.js | Threshold-based fuzzy matching for CSV headers | EMERGENT |
| 94 | Fuzzy search for duplicate names | Fuse.js | Name similarity scoring for dedup | EMERGENT |
| 95 | CSV parsing with error recovery | PapaParse | Handles malformed CSV, empty rows, whitespace | EMERGENT |
| 96 | International phone validation | libphonenumber-js | Validates against country-specific rules | EMERGENT |
| 97 | Phone number formatting (E.164) | libphonenumber-js | Canonical format for storage | EMERGENT |

---

## QA Test Targets

Total testable features: 97

### Already tested (48 tests passing):
- Validation schemas (createPersonSchema, normalizePhone, personSearchSchema) — 20 tests
- Server actions (createPerson, getPerson, archivePerson, restorePerson, anonymizePerson, ensureEventPerson) — 14 tests
- CSV import (autoMapColumns, parseCsvString, parseRows, findDuplicates) — 14 tests

### Gap areas needing tests:
- updatePerson server action — no tests
- searchPeople server action — no tests (only schema tested)
- importPeopleBatch server action — no tests
- getEventPeople server action — no tests
- RBAC enforcement at action level — no tests
- SQL LIKE wildcard escaping — no tests
- Pagination math (totalPages calculation) — no tests
- Edge cases: empty tags parsing, max field lengths, update with no fields
- Anonymize idempotency (already anonymized)
- Archive idempotency (already archived via restore)
- Phone normalization edge cases (international numbers, whitespace variations)
- updatePersonSchema validation — no tests
