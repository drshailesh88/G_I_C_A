# Feature Census: Program Module

Generated: 2026-04-09

## Layer 1: Code Extraction

### 1. Hall Management (CRUD)
| # | Feature | Source | Type |
|---|---------|--------|------|
| H1 | Create hall with name, capacity, sortOrder | `src/lib/actions/program.ts:43` | server action |
| H2 | Unique hall name per event (validation) | `src/lib/actions/program.ts:48` | business rule |
| H3 | Update hall (name, capacity, sortOrder) | `src/lib/actions/program.ts:70` | server action |
| H4 | Delete hall | `src/lib/actions/program.ts:110` | server action |
| H5 | List halls ordered by sortOrder, name | `src/lib/actions/program.ts:125` | server action |

### 2. Session Management (CRUD)
| # | Feature | Source | Type |
|---|---------|--------|------|
| S1 | Create session with full metadata | `src/lib/actions/program.ts:139` | server action |
| S2 | 10 session types: keynote, panel, workshop, free_paper, plenary, symposium, break, lunch, registration, other | `src/lib/validations/program.ts:4` | enum |
| S3 | One-level-only parent-child hierarchy | `src/lib/actions/program.ts:144-156` | business rule |
| S4 | Hall validation on create/update | `src/lib/actions/program.ts:159-167` | business rule |
| S5 | Date+time to UTC conversion | `src/lib/actions/program.ts:170-172` | data transform |
| S6 | End time must be after start time (Zod refine) | `src/lib/validations/program.ts:69-76` | validation |
| S7 | Update session (partial fields) | `src/lib/actions/program.ts:201` | server action |
| S8 | Self-referencing parent check on update | `src/lib/actions/program.ts:226` | business rule |
| S9 | Session status transitions: draft->scheduled->completed/cancelled | `src/lib/validations/program.ts:14-19` | state machine |
| S10 | Update session status with transition validation | `src/lib/actions/program.ts:276` | server action |
| S11 | Cancelled sessions get cancelledAt timestamp | `src/lib/actions/program.ts:303` | business rule |
| S12 | Delete session | `src/lib/actions/program.ts:316` | server action |
| S13 | Get single session | `src/lib/actions/program.ts:332` | server action |
| S14 | List sessions ordered by date, start time, sortOrder | `src/lib/actions/program.ts:346` | server action |

### 3. Session Role Requirements
| # | Feature | Source | Type |
|---|---------|--------|------|
| R1 | Create role requirement (session + role + requiredCount) | `src/lib/actions/program.ts:360` | server action |
| R2 | 7 role types: speaker, chair, co_chair, moderator, panelist, discussant, presenter | `src/lib/validations/program.ts:22-24` | enum |
| R3 | Unique role per session constraint | `src/lib/actions/program.ts:374-385` | business rule |
| R4 | Update role requirement count | `src/lib/actions/program.ts:400` | server action |
| R5 | Delete role requirement (with event ownership check via join) | `src/lib/actions/program.ts:429` | server action |
| R6 | List session role requirements | `src/lib/actions/program.ts:455` | server action |

### 4. Session Assignments (Faculty-to-Session)
| # | Feature | Source | Type |
|---|---------|--------|------|
| A1 | Create assignment (session + person + role) | `src/lib/actions/program.ts:476` | server action |
| A2 | Duplicate assignment prevention (session+person+role unique) | `src/lib/actions/program.ts:489-502` | business rule |
| A3 | Auto-upsert event_people junction on assign | `src/lib/actions/program.ts:520-524` | side effect |
| A4 | Presentation title + duration fields | `src/lib/actions/program.ts:512-513` | data field |
| A5 | Update assignment (role, sortOrder, title, duration, notes) | `src/lib/actions/program.ts:531` | server action |
| A6 | Delete assignment | `src/lib/actions/program.ts:566` | server action |
| A7 | List session assignments ordered by sortOrder | `src/lib/actions/program.ts:581` | server action |

### 5. Conflict Detection
| # | Feature | Source | Type |
|---|---------|--------|------|
| C1 | Hall time overlap detection | `src/lib/actions/program.ts:643-672` | algorithm |
| C2 | Faculty double-booking detection | `src/lib/actions/program.ts:674-721` | algorithm |
| C3 | Excludes cancelled sessions | `src/lib/actions/program.ts:636-638` | business rule |
| C4 | Returns warnings (non-blocking) | `src/lib/actions/program.ts:602-608` | design decision |

### 6. Faculty Invites
| # | Feature | Source | Type |
|---|---------|--------|------|
| F1 | Create faculty invite with crypto random token | `src/lib/actions/program.ts:730-783` | server action |
| F2 | Prevent duplicate active invites per person+event | `src/lib/actions/program.ts:745-759` | business rule |
| F3 | Re-invite allowed after expired/declined | `src/lib/actions/program.ts:758` | business rule |
| F4 | Invite status transitions: sent->opened->accepted/declined/expired | `src/lib/validations/program.ts:31-37` | state machine |
| F5 | Token-based status update with validation | `src/lib/actions/program.ts:785-828` | server action |
| F6 | Get invite by ID (authenticated) | `src/lib/actions/program.ts:830` | server action |
| F7 | Get invite by token (public, no auth) | `src/lib/actions/program.ts:846` | server action |
| F8 | List event faculty invites | `src/lib/actions/program.ts:859` | server action |
| F9 | Auto-upsert event_people on invite | `src/lib/actions/program.ts:776-779` | side effect |

### 7. Program Versioning
| # | Feature | Source | Type |
|---|---------|--------|------|
| V1 | Publish program version with snapshot (sessions+assignments+halls) | `src/lib/actions/program.ts:873` | server action |
| V2 | Auto-incrementing version number per event | `src/lib/actions/program.ts:877-885` | business rule |
| V3 | Diff computation (added/removed sessions vs previous version) | `src/lib/actions/program.ts:904-929` | algorithm |
| V4 | Affected person IDs tracking | `src/lib/actions/program.ts:902` | data field |
| V5 | Base version chain (self-FK) | `src/lib/actions/program.ts:937-947` | data model |
| V6 | List program versions ordered by versionNo desc | `src/lib/actions/program.ts:962` | server action |
| V7 | Get specific program version | `src/lib/actions/program.ts:972` | server action |

### 8. Schedule Data (Combined Queries)
| # | Feature | Source | Type |
|---|---------|--------|------|
| SD1 | getScheduleData: full internal schedule with conflicts | `src/lib/actions/program.ts:1022` | server action |
| SD2 | Parent-child session assembly | `src/lib/actions/program.ts:1089-1107` | data transform |
| SD3 | Hall name resolution | `src/lib/actions/program.ts:1042` | data transform |
| SD4 | getPublicScheduleData: public sessions only, no auth | `src/lib/actions/program.ts:1122` | server action |
| SD5 | Filters out cancelled + non-public sessions | `src/lib/actions/program.ts:1127-1134` | business rule |

### 9. UI: Attendee Program View
| # | Feature | Source | Type |
|---|---------|--------|------|
| UI1 | Date tab filtering | `src/app/(app)/program/attendee-program-client.tsx` | UI |
| UI2 | Hall filter | `src/app/(app)/program/attendee-program-client.tsx` | UI |
| UI3 | Session type color badges (10 types) | `src/app/(app)/program/attendee-program-client.tsx:23-34` | UI |
| UI4 | Role labels display (7 roles) | `src/app/(app)/program/attendee-program-client.tsx:49-57` | UI |
| UI5 | CME credits display | `src/app/(app)/program/attendee-program-client.tsx` | UI |
| UI6 | Responsive: mobile cards vs desktop grid | `src/app/(app)/program/attendee-program-client.tsx` | UI |

### 10. UI: Sessions Manager (Admin)
| # | Feature | Source | Type |
|---|---------|--------|------|
| UI7 | Session list with search | `src/app/(app)/events/[eventId]/sessions/sessions-manager-client.tsx` | UI |
| UI8 | Session delete from list | `src/app/(app)/events/[eventId]/sessions/sessions-manager-client.tsx:22` | UI |
| UI9 | Conflict warnings display | `src/app/(app)/events/[eventId]/sessions/sessions-manager-client.tsx:74` | UI |
| UI10 | Expandable parent/child sessions | `src/app/(app)/events/[eventId]/sessions/sessions-manager-client.tsx` | UI |
| UI11 | Role-based access (useRole) | `src/app/(app)/events/[eventId]/sessions/sessions-manager-client.tsx:21` | UI |

### 11. UI: Schedule Grid (Admin)
| # | Feature | Source | Type |
|---|---------|--------|------|
| UI12 | Hall-based columns | `src/app/(app)/events/[eventId]/schedule/schedule-grid-client.tsx` | UI |
| UI13 | Date tab switching | `src/app/(app)/events/[eventId]/schedule/schedule-grid-client.tsx:70` | UI |
| UI14 | Conflict indicators | `src/app/(app)/events/[eventId]/schedule/schedule-grid-client.tsx:6` | UI |

### 12. Zod Input Validation
| # | Feature | Source | Type |
|---|---------|--------|------|
| Z1 | Hall name: 1-200 chars, trimmed | `src/lib/validations/program.ts:41` | validation |
| Z2 | Session title: 1-300 chars, trimmed | `src/lib/validations/program.ts:57` | validation |
| Z3 | Session description: max 5000 chars | `src/lib/validations/program.ts:58` | validation |
| Z4 | UUID validation on all ID fields | `src/lib/validations/program.ts` (multiple) | validation |
| Z5 | CME credits: 0-100 int | `src/lib/validations/program.ts:67` | validation |
| Z6 | Role requirement count: 1-50 int | `src/lib/validations/program.ts:109` | validation |
| Z7 | Presentation duration: 1-480 min | `src/lib/validations/program.ts:124` | validation |
| Z8 | Invite token: min 1 char | `src/lib/validations/program.ts:145` | validation |

### 13. Authorization & Data Isolation
| # | Feature | Source | Type |
|---|---------|--------|------|
| AUTH1 | assertEventAccess on every action | all actions | security |
| AUTH2 | requireWrite for mutations | all mutation actions | security |
| AUTH3 | eventId scoping via withEventScope on all queries | all queries | security |
| AUTH4 | Public endpoints: getFacultyInviteByToken, getPublicScheduleData | `program.ts:846,1122` | design |

## Layer 2: Library Enrichment

Dependencies providing emergent capabilities:
- **drizzle-orm**: typed SQL queries, automatic migration support, join-based ownership checks
- **zod**: runtime schema validation, type inference, refinement predicates
- **date-fns / date-fns-tz**: timezone conversion (UTC storage, IST display)
- **@clerk/nextjs**: RBAC via `has()`, org-level permissions
- **react-hook-form**: form state management in session/hall forms
- **@dnd-kit**: drag-and-drop reordering capability (sort order)
- **lucide-react**: consistent icon set for session types and actions

## Summary

| Category | Count |
|----------|-------|
| Server Actions | 29 |
| Business Rules | 16 |
| State Machines | 2 (sessions, faculty invites) |
| Algorithms | 3 (conflict detection x2, version diff) |
| UI Components | 5 (attendee view, sessions manager, schedule grid, session form, faculty invite) |
| Zod Schemas | 14 |
| Total Capabilities | ~70 |
