# people — Spec 003: CSV Import Utilities (Gap Tests)

STATUS: PASS
TESTED: 15/15
PASS: 15
FAIL: 0
BLOCKED: 0
MODULE: people
TEST_TYPE: unit (vitest)
FILE: src/lib/import/csv-import.test.ts

---

### autoMapColumns Edge Cases
- [ ] **maps "Participant Name" to fullName** — verify alias match `[CONFIRMED]`
- [ ] **maps "Delegate Name" to fullName** — verify alias match `[CONFIRMED]`
- [ ] **maps "Hospital" to organization** — verify alias match `[CONFIRMED]`
- [ ] **maps "Department" to specialty** — verify alias match `[CONFIRMED]`
- [ ] **maps "Category" to tags** — verify alias match `[CONFIRMED]`
- [ ] **case-insensitive header matching** — "EMAIL" maps to email `[CONFIRMED]`
- [ ] **handles duplicate mapping targets** — two columns both map to email, both get mapped (caller resolves) `[CONFIRMED]`

### parseRows Edge Cases
- [ ] **tags split by semicolon** — "VIP;faculty" parsed to ["VIP", "faculty"] `[CONFIRMED]`
- [ ] **tags split by pipe** — "VIP|faculty" parsed to ["VIP", "faculty"] `[CONFIRMED]`
- [ ] **tags trim whitespace** — "VIP , faculty" parsed to ["VIP", "faculty"] `[CONFIRMED]`
- [ ] **empty tags field yields undefined** — empty string produces no tags array `[CONFIRMED]`
- [ ] **skipped columns not included** — unmapped column data ignored in output `[CONFIRMED]`

### parseCsvString Edge Cases
- [ ] **handles CSV with only headers (no data rows)** — returns empty rows array, no errors `[EMERGENT: PapaParse]`
- [ ] **handles quoted fields with commas** — "Kumar, Dr. Rajesh" parsed as single field `[EMERGENT: PapaParse]`
- [ ] **handles UTF-8 characters** — names with diacritics parsed correctly `[EMERGENT: PapaParse]`
