# Program Module — Test Spec Gaps

Generated: 2026-04-09
Source: feature-census/program/CENSUS.md + existing tests analysis

## Already Covered (44 tests across 2 files)

### Validation schemas (program.test.ts in validations/) — 32 tests
- All 14 Zod schemas tested
- Both state machines (SESSION_TRANSITIONS, FACULTY_INVITE_TRANSITIONS) tested
- Defaults, edge cases, all enum values covered

### Server actions (program.test.ts in actions/) — 12 test blocks
- Hall CRUD: create/update/delete happy + error paths
- Session: create + status transitions + delete
- Role Requirements: create + duplicate prevention
- Assignments: create + duplicate prevention
- Conflict Detection: hall overlap, faculty double-booking, adjacent, empty
- Faculty Invites: create + status update + re-invite
- Program Versioning: publish first version

## Gaps (Untested Features)

### GAP-1: updateSession action
- **CP-1**: Updates session title, description, type
- **CP-2**: Updates session date/time fields with UTC conversion
- **CP-3**: Rejects self-referencing parent (A session cannot be its own parent)
- **CP-4**: Enforces one-level-only on parent change
- **CP-5**: Validates new hallId on update
- **CP-6**: Throws when session not found

### GAP-2: Read actions (getSession, getSessions, getHalls)
- **CP-7**: getSession returns session by ID
- **CP-8**: getSession throws when not found
- **CP-9**: getSessions returns ordered list
- **CP-10**: getHalls returns ordered list

### GAP-3: updateRoleRequirement + deleteRoleRequirement
- **CP-11**: updateRoleRequirement updates count
- **CP-12**: updateRoleRequirement rejects when not found (cross-event check)
- **CP-13**: deleteRoleRequirement deletes with event ownership check
- **CP-14**: deleteRoleRequirement rejects when not found

### GAP-4: updateAssignment + deleteAssignment + getSessionAssignments
- **CP-15**: updateAssignment updates role/title/notes
- **CP-16**: updateAssignment rejects when not found
- **CP-17**: deleteAssignment removes and returns success
- **CP-18**: deleteAssignment rejects when not found
- **CP-19**: getSessionAssignments returns ordered list

### GAP-5: Faculty invite read actions
- **CP-20**: getFacultyInvite returns by ID
- **CP-21**: getFacultyInvite rejects when not found
- **CP-22**: getFacultyInviteByToken returns by token (public, no auth)
- **CP-23**: getFacultyInviteByToken rejects invalid/empty token
- **CP-24**: getEventFacultyInvites returns list

### GAP-6: Program version read actions
- **CP-25**: getProgramVersions returns ordered list
- **CP-26**: getProgramVersion returns specific version
- **CP-27**: getProgramVersion rejects when not found

### GAP-7: Schedule data combined queries
- **CP-28**: getScheduleData returns sessions with assignments, requirements, halls, conflicts
- **CP-29**: getScheduleData assembles parent-child hierarchy
- **CP-30**: getPublicScheduleData filters out cancelled + non-public sessions
- **CP-31**: getPublicScheduleData requires no auth

### GAP-8: Side effects
- **CP-32**: createAssignment auto-upserts event_people junction
- **CP-33**: createFacultyInvite auto-upserts event_people junction
- **CP-34**: cancelledAt timestamp set on session cancellation

### GAP-9: Program version advanced features
- **CP-35**: Version number auto-increments from latest
- **CP-36**: Diff computation: added/removed sessions vs previous version
- **CP-37**: Affected person IDs extracted from assignments

## Summary

| Category | Existing | Gap | Total |
|----------|----------|-----|-------|
| Validation schemas | 32 | 0 | 32 |
| Hall CRUD | 5 | 2 | 7 |
| Session CRUD | 7 | 6 | 13 |
| Role Requirements | 2 | 4 | 6 |
| Assignments | 2 | 5 | 7 |
| Conflict Detection | 4 | 0 | 4 |
| Faculty Invites | 5 | 5 | 10 |
| Program Versioning | 1 | 6 | 7 |
| Schedule Data | 0 | 4 | 4 |
| Side Effects | 0 | 3 | 3 |
| **Total** | **58** | **37** | **93** |

37 new checkpoints needed.
