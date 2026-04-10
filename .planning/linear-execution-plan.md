# Linear Execution Plan — Responsive Design

Generated: 2026-04-10
Source PRD: `.planning/PRD-RESPONSIVE-DESIGN.md`
Project: Gem India Project
Team: DRS
Board: https://linear.app/drshailesh88/project/gem-india-project-54e67f73431e

## Summary

| Metric | Count |
|--------|-------|
| Phases | 6 (0-5) |
| Parent issues | 6 |
| Subtask issues | 33 |
| Dependency relations | 44 |
| Execution groups | 8 |
| Max parallel agents | 6 (Groups E/F) |

## Issue Map

### Parents (Phase Trackers)
| Issue | Phase | Title |
|-------|-------|-------|
| DRS-6 | 0 | Day-Zero Validation Spike |
| DRS-7 | 1 | Foundation — Tokens, Shell, Navigation |
| DRS-8 | 2 | Responsive Patterns + Test Infrastructure |
| DRS-9 | 3 | Page-by-Page Migration — 33 Components |
| DRS-10 | 4 | Polish — Safe Areas, A11y, Performance |
| DRS-11 | 5 | Ship — Remove Flag, Verify, Deploy |

### Subtasks
| Issue | ID | Title | Parent | Blocked By |
|-------|----|-------|--------|------------|
| DRS-12 | 0.1 | Validate fluid token compatibility | DRS-6 | — |
| DRS-13 | 0.2 | Prototype app shell with Sidebar + Clerk | DRS-6 | — |
| DRS-14 | 0.3 | Verify container query syntax | DRS-6 | — |
| DRS-15 | 1.1 | Add fluid design tokens to globals.css | DRS-7 | DRS-12 |
| DRS-16 | 1.2 | Create useResponsiveNav hook | DRS-7 | — |
| DRS-17 | 1.3 | Build Sidebar component | DRS-7 | DRS-13, DRS-16 |
| DRS-18 | 1.4 | Build AppShell and wire responsive layout | DRS-7 | DRS-15, DRS-16, DRS-17 |
| DRS-19 | 2.1 | Build ResponsiveList pattern | DRS-8 | DRS-14, DRS-15 |
| DRS-20 | 2.2 | Build ResponsiveMetricGrid pattern | DRS-8 | DRS-15 |
| DRS-21 | 2.3 | Build DetailView pattern | DRS-8 | DRS-14 |
| DRS-22 | 2.4 | Build ResponsiveImage + FormGrid | DRS-8 | DRS-15 |
| DRS-23 | 2.5 | Set up Playwright visual regression | DRS-8 | DRS-18 |
| DRS-24 | 3.1.1 | Responsive dashboard-client | DRS-9 | DRS-20 |
| DRS-25 | 3.1.2 | Responsive event-workspace-client | DRS-9 | DRS-20 |
| DRS-26 | 3.1.3 | Responsive schedule-grid-client (BESPOKE) | DRS-9 | DRS-15, DRS-18 |
| DRS-27 | 3.1.4 | Responsive sessions-manager-client | DRS-9 | DRS-21 |
| DRS-28 | 3.1.5 | Responsive certificates-client + print CSS | DRS-9 | DRS-21, DRS-22 |
| DRS-29 | 3.1.6 | Responsive reports-client | DRS-9 | DRS-20 |
| DRS-30 | 3.2.1 | Responsive people-list-client | DRS-9 | DRS-19 |
| DRS-31 | 3.2.2 | Responsive registrations-list-client | DRS-9 | DRS-19, DRS-20 |
| DRS-32 | 3.2.3 | Responsive travel-list-client | DRS-9 | DRS-19 |
| DRS-33 | 3.2.4 | Responsive accommodation-list-client | DRS-9 | DRS-19 |
| DRS-34 | 3.2.5 | Responsive transport-planning-client | DRS-9 | DRS-19 |
| DRS-35 | 3.2.6 | Responsive failed-notifications-client | DRS-9 | DRS-19 |
| DRS-36 | 3.3.1 | Responsive session-form-client | DRS-9 | DRS-22 |
| DRS-37 | 3.3.2 | Responsive travel-form-client | DRS-9 | DRS-22 |
| DRS-38 | 3.3.3 | Responsive accommodation-form-client | DRS-9 | DRS-22 |
| DRS-39 | 3.3.4 | Responsive branding-form-client | DRS-9 | DRS-22 |
| DRS-40 | 3.3.5 | Responsive registration-form-client (PUBLIC) | DRS-9 | DRS-22 |
| DRS-41 | 3.3.6 | Responsive faculty-invite-client | DRS-9 | DRS-22 |
| DRS-42 | 3.4.1 | Responsive qr-checkin-client | DRS-9 | DRS-15 |
| DRS-43 | 3.4.2 | Responsive vehicle-kanban-client | DRS-9 | DRS-15 |
| DRS-44 | 3.4.3 | Responsive csv-import, editor, generation | DRS-9 | DRS-21, DRS-22 |
| DRS-45 | 3.5.1 | Responsive admin lighter pages (5 files) | DRS-9 | DRS-20 |
| DRS-46 | 3.5.2 | Responsive public-facing pages (5 files) | DRS-9 | DRS-22 |
| DRS-47 | 4.1 | Safe area sweep + foldable support | DRS-10 | DRS-45, DRS-46 |
| DRS-48 | 4.2 | Accessibility pass | DRS-10 | DRS-45, DRS-46 |
| DRS-49 | 4.3 | Performance verification | DRS-10 | DRS-47, DRS-48 |
| DRS-50 | 5.1 | Remove feature flag + final verification | DRS-11 | DRS-49 |

## Parallel Execution Groups

### Group A — Start immediately (no dependencies)
| Issue | Title | Est. Lines |
|-------|-------|-----------|
| DRS-12 | [0.1] Validate fluid tokens | ~30 |
| DRS-13 | [0.2] Prototype app shell | ~80 |
| DRS-14 | [0.3] Verify container queries | ~20 |

**3 agents in parallel**

### Group B — After Group A
| Issue | Title | Blocked By |
|-------|-------|-----------|
| DRS-15 | [1.1] Fluid design tokens | DRS-12 |
| DRS-16 | [1.2] useResponsiveNav hook | — (can start with A) |
| DRS-21 | [2.3] DetailView pattern | DRS-14 |

**3 agents in parallel** (DRS-16 has no blockers, can start with Group A)

### Group C — After Group B
| Issue | Title | Blocked By |
|-------|-------|-----------|
| DRS-17 | [1.3] Sidebar component | DRS-13, DRS-16 |
| DRS-19 | [2.1] ResponsiveList | DRS-14, DRS-15 |
| DRS-20 | [2.2] ResponsiveMetricGrid | DRS-15 |
| DRS-22 | [2.4] ResponsiveImage + FormGrid | DRS-15 |

**4 agents in parallel**

### Group D — After Group C
| Issue | Title | Blocked By |
|-------|-------|-----------|
| DRS-18 | [1.4] AppShell wiring | DRS-15, DRS-16, DRS-17 |
| DRS-23 | [2.5] Playwright tests | DRS-18 |

**Sequential** (DRS-23 depends on DRS-18)

### Group E — After Group D (Phase 3 P1 + P2 + P4 start)
| Issue | Title | Blocked By |
|-------|-------|-----------|
| DRS-24 | [3.1.1] dashboard | DRS-20 |
| DRS-25 | [3.1.2] event-workspace | DRS-20 |
| DRS-26 | [3.1.3] schedule-grid (BESPOKE) | DRS-15, DRS-18 |
| DRS-29 | [3.1.6] reports | DRS-20 |
| DRS-42 | [3.4.1] qr-checkin | DRS-15 |
| DRS-43 | [3.4.2] vehicle-kanban | DRS-15 |

**6 agents in parallel**

### Group F — After Group D (Phase 3 P2 lists + P3 forms + P5)
| Issue | Title | Blocked By |
|-------|-------|-----------|
| DRS-30 | [3.2.1] people-list | DRS-19 |
| DRS-32 | [3.2.3] travel-list | DRS-19 |
| DRS-33 | [3.2.4] accommodation-list | DRS-19 |
| DRS-34 | [3.2.5] transport-planning | DRS-19 |
| DRS-35 | [3.2.6] failed-notifications | DRS-19 |
| DRS-36 | [3.3.1] session-form | DRS-22 |
| DRS-37 | [3.3.2] travel-form | DRS-22 |
| DRS-38 | [3.3.3] accommodation-form | DRS-22 |
| DRS-40 | [3.3.5] registration-form (PUBLIC) | DRS-22 |
| DRS-41 | [3.3.6] faculty-invite | DRS-22 |
| DRS-45 | [3.5.1] admin lighter pages | DRS-20 |

**Up to 11 agents in parallel** (but recommend batches of 6)

### Group G — After Groups E + F
| Issue | Title | Blocked By |
|-------|-------|-----------|
| DRS-27 | [3.1.4] sessions-manager | DRS-21 |
| DRS-28 | [3.1.5] certificates + print | DRS-21, DRS-22 |
| DRS-31 | [3.2.2] registrations-list | DRS-19, DRS-20 |
| DRS-39 | [3.3.4] branding-form | DRS-22 |
| DRS-44 | [3.4.3] csv+editor+generation | DRS-21, DRS-22 |
| DRS-46 | [3.5.2] public pages | DRS-22 |

**6 agents in parallel**

### Group H — After all Phase 3 (Polish + Ship)
| Issue | Title | Blocked By |
|-------|-------|-----------|
| DRS-47 | [4.1] Safe areas + foldable | DRS-45, DRS-46 |
| DRS-48 | [4.2] Accessibility pass | DRS-45, DRS-46 |
| DRS-49 | [4.3] Performance verification | DRS-47, DRS-48 |
| DRS-50 | [5.1] Remove flag + ship | DRS-49 |

**2 parallel (47+48) → 1 sequential (49) → 1 sequential (50)**

## Sprint Executor Commands

### Group A (3 agents in parallel):
```bash
./adapters/linear/sprint-executor.sh DRS-12 &
./adapters/linear/sprint-executor.sh DRS-13 &
./adapters/linear/sprint-executor.sh DRS-14 &
wait
```

### Group B (3 agents in parallel):
```bash
./adapters/linear/sprint-executor.sh DRS-15 &
./adapters/linear/sprint-executor.sh DRS-16 &
./adapters/linear/sprint-executor.sh DRS-21 &
wait
```

### Group C (4 agents in parallel):
```bash
./adapters/linear/sprint-executor.sh DRS-17 &
./adapters/linear/sprint-executor.sh DRS-19 &
./adapters/linear/sprint-executor.sh DRS-20 &
./adapters/linear/sprint-executor.sh DRS-22 &
wait
```

### Group D (sequential):
```bash
./adapters/linear/sprint-executor.sh DRS-18
./adapters/linear/sprint-executor.sh DRS-23
```

### Group E (6 agents in parallel):
```bash
./adapters/linear/sprint-executor.sh DRS-24 &
./adapters/linear/sprint-executor.sh DRS-25 &
./adapters/linear/sprint-executor.sh DRS-26 &
./adapters/linear/sprint-executor.sh DRS-29 &
./adapters/linear/sprint-executor.sh DRS-42 &
./adapters/linear/sprint-executor.sh DRS-43 &
wait
```

### Group F (batch of 6 + batch of 5):
```bash
# Batch 1
./adapters/linear/sprint-executor.sh DRS-30 &
./adapters/linear/sprint-executor.sh DRS-32 &
./adapters/linear/sprint-executor.sh DRS-33 &
./adapters/linear/sprint-executor.sh DRS-34 &
./adapters/linear/sprint-executor.sh DRS-35 &
./adapters/linear/sprint-executor.sh DRS-36 &
wait
# Batch 2
./adapters/linear/sprint-executor.sh DRS-37 &
./adapters/linear/sprint-executor.sh DRS-38 &
./adapters/linear/sprint-executor.sh DRS-40 &
./adapters/linear/sprint-executor.sh DRS-41 &
./adapters/linear/sprint-executor.sh DRS-45 &
wait
```

### Group G (6 agents in parallel):
```bash
./adapters/linear/sprint-executor.sh DRS-27 &
./adapters/linear/sprint-executor.sh DRS-28 &
./adapters/linear/sprint-executor.sh DRS-31 &
./adapters/linear/sprint-executor.sh DRS-39 &
./adapters/linear/sprint-executor.sh DRS-44 &
./adapters/linear/sprint-executor.sh DRS-46 &
wait
```

### Group H (sequential with parallel start):
```bash
./adapters/linear/sprint-executor.sh DRS-47 &
./adapters/linear/sprint-executor.sh DRS-48 &
wait
./adapters/linear/sprint-executor.sh DRS-49
./adapters/linear/sprint-executor.sh DRS-50
```

## Monitor Progress

```bash
# Terminal — all issues
linear issue list --project "Gem India Project" --all-states

# Browser
# https://linear.app/drshailesh88/project/gem-india-project-54e67f73431e
```
