# people — Spec 002: Server Actions (Gap Tests)

STATUS: PENDING
TESTED: 0/31
PASS: 0
FAIL: 0
BLOCKED: 0
MODULE: people
TEST_TYPE: unit (vitest)
FILE: src/lib/actions/person.test.ts

---

### updatePerson
- [ ] **updatePerson updates fullName** — call updatePerson with personId + fullName, verify db.update called with fullName `[CONFIRMED]`
- [ ] **updatePerson updates email** — call with personId + email, verify updateData includes email `[CONFIRMED]`
- [ ] **updatePerson normalizes phone** — call with phone "9876543210", verify phoneE164 set to "+919876543210" `[CONFIRMED]`
- [ ] **updatePerson clears optional field** — call with email: "", verify updateData sets email to null `[CONFIRMED]`
- [ ] **updatePerson throws when unauthenticated** — mockAuth returns null userId, expect "Unauthorized" `[CONFIRMED]`
- [ ] **updatePerson throws on invalid personId** — call with personId "bad", expect ZodError `[CONFIRMED]`
- [ ] **updatePerson throws when person not found** — db.update returns empty array, expect "Person not found" `[CONFIRMED]`
- [ ] **updatePerson sets updatedBy and updatedAt** — verify updateData includes userId and new Date `[CONFIRMED]`
- [ ] **updatePerson revalidates paths** — verify revalidatePath called for /people and /people/{id} `[CONFIRMED]`

### searchPeople
- [ ] **searchPeople returns paginated results** — mock db returning rows + count, verify page/totalPages math `[CONFIRMED]`
- [ ] **searchPeople applies query filter** — call with query "Rajesh", verify ilike conditions for fullName, email, org `[CONFIRMED]`
- [ ] **searchPeople applies organization filter** — call with organization "AIIMS", verify ilike condition `[CONFIRMED]`
- [ ] **searchPeople applies city filter** — call with city "Delhi", verify ilike condition `[CONFIRMED]`
- [ ] **searchPeople applies specialty filter** — call with specialty "Cardiology", verify ilike condition `[CONFIRMED]`
- [ ] **searchPeople applies tag filter** — call with tag "VIP", verify JSONB containment query `[CONFIRMED]`
- [ ] **searchPeople faculty view filters by tag** — call with view "faculty", verify tags @> '["faculty"]' `[CONFIRMED]`
- [ ] **searchPeople recent view orders by createdAt desc** — call with view "recent", verify desc ordering `[CONFIRMED]`
- [ ] **searchPeople escapes SQL wildcards** — call with query "100%_done", verify % and _ are escaped `[CONFIRMED]`
- [ ] **searchPeople excludes archived** — verify isNull(archivedAt) in WHERE `[CONFIRMED]`
- [ ] **searchPeople excludes anonymized** — verify isNull(anonymizedAt) in WHERE `[CONFIRMED]`
- [ ] **searchPeople throws when unauthenticated** — mockAuth null userId, expect "Unauthorized" `[CONFIRMED]`
- [ ] **searchPeople totalPages calculation** — 51 results with limit 25 = 3 pages `[CONFIRMED]`

### importPeopleBatch
- [ ] **importPeopleBatch imports valid rows** — batch of 3 valid rows, verify 3 created `[CONFIRMED]`
- [ ] **importPeopleBatch tracks duplicates** — batch where createPerson returns duplicate, verify duplicates count `[CONFIRMED]`
- [ ] **importPeopleBatch tracks errors** — batch with invalid data causing throw, verify errors count `[CONFIRMED]`
- [ ] **importPeopleBatch returns per-row results** — verify each row has rowNumber and status `[CONFIRMED]`
- [ ] **importPeopleBatch throws when unauthenticated** — mockAuth null, expect "Unauthorized" `[CONFIRMED]`
- [ ] **importPeopleBatch revalidates /people** — verify revalidatePath called once after batch `[CONFIRMED]`

### getEventPeople
- [ ] **getEventPeople returns linked people** — mock join query, verify returns id/fullName/email/phone `[CONFIRMED]`
- [ ] **getEventPeople excludes anonymized** — verify isNull(anonymizedAt) in WHERE `[CONFIRMED]`
- [ ] **getEventPeople throws when unauthenticated** — mockAuth null, expect "Unauthorized" `[CONFIRMED]`
