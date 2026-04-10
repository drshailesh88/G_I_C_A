# Transport Module — Feature Census

Generated: 2026-04-09

## Layer 1: Code Extraction

### 1. Pages & Routes

| # | Capability | File | Type |
|---|-----------|------|------|
| P1 | Transport batch list page (server) | `src/app/(app)/events/[eventId]/transport/page.tsx` | Server Component |
| P2 | Transport planning client (batch list + create form) | `src/app/(app)/events/[eventId]/transport/transport-planning-client.tsx` | Client Component |
| P3 | Vehicle assignment page (server) | `src/app/(app)/events/[eventId]/transport/assign/[batchId]/page.tsx` | Server Component |
| P4 | Vehicle kanban client (drag-and-drop board) | `src/app/(app)/events/[eventId]/transport/assign/[batchId]/vehicle-kanban-client.tsx` | Client Component |

### 2. Server Actions

| # | Capability | Function | File |
|---|-----------|----------|------|
| A1 | Create transport batch | `createTransportBatch` | `src/lib/actions/transport.ts` |
| A2 | Update transport batch fields | `updateTransportBatch` | `src/lib/actions/transport.ts` |
| A3 | Update batch status (state machine) | `updateBatchStatus` | `src/lib/actions/transport.ts` |
| A4 | List all event batches | `getEventTransportBatches` | `src/lib/actions/transport.ts` |
| A5 | Get single batch | `getTransportBatch` | `src/lib/actions/transport.ts` |
| A6 | Create vehicle assignment | `createVehicleAssignment` | `src/lib/actions/transport.ts` |
| A7 | Update vehicle status (state machine) | `updateVehicleStatus` | `src/lib/actions/transport.ts` |
| A8 | List batch vehicles | `getBatchVehicles` | `src/lib/actions/transport.ts` |
| A9 | Assign passenger to batch/vehicle | `assignPassenger` | `src/lib/actions/transport.ts` |
| A10 | Move passenger between vehicles (kanban drag-drop) | `movePassenger` | `src/lib/actions/transport.ts` |
| A11 | Update passenger status (state machine) | `updatePassengerStatus` | `src/lib/actions/transport.ts` |
| A12 | List batch passengers (with person join) | `getBatchPassengers` | `src/lib/actions/transport.ts` |

### 3. Validations & State Machines

| # | Capability | File |
|---|-----------|------|
| V1 | Batch status machine: planned -> ready -> in_progress -> completed/cancelled | `src/lib/validations/transport.ts` |
| V2 | Vehicle status machine: assigned -> dispatched -> completed/cancelled | `src/lib/validations/transport.ts` |
| V3 | Passenger status machine: pending -> assigned -> boarded -> completed/no_show/cancelled | `src/lib/validations/transport.ts` |
| V4 | createBatchSchema (Zod) — movement type, service date, time window, hubs | `src/lib/validations/transport.ts` |
| V5 | Time window validation — end must be after start | `src/lib/validations/transport.ts` |
| V6 | updateBatchSchema (Zod) — partial update with batchId | `src/lib/validations/transport.ts` |
| V7 | createVehicleSchema (Zod) — label, type, capacity 1-100 | `src/lib/validations/transport.ts` |
| V8 | updateVehicleSchema (Zod) — partial update | `src/lib/validations/transport.ts` |
| V9 | assignPassengerSchema (Zod) — batch, person, travel record, optional vehicle | `src/lib/validations/transport.ts` |
| V10 | movePassengerSchema (Zod) — reassign to vehicle or unassigned | `src/lib/validations/transport.ts` |
| V11 | Batch/Vehicle/Passenger ID validation (UUID) | `src/lib/validations/transport.ts` |

### 4. Cascade Handlers

| # | Capability | File |
|---|-----------|------|
| C1 | Travel update -> flag transport passenger assignments | `src/lib/cascade/handlers/travel-cascade.ts` |
| C2 | Travel cancel -> flag transport passenger assignments | `src/lib/cascade/handlers/travel-cascade.ts` |
| C3 | Dual-channel notifications (email + WhatsApp) on travel changes | `src/lib/cascade/handlers/travel-cascade.ts` |
| C4 | Graceful notification degradation (skip channel if no contact) | `src/lib/cascade/handlers/travel-cascade.ts` |
| C5 | Idempotency keys for notifications | `src/lib/cascade/handlers/travel-cascade.ts` |
| C6 | Cascade never throws (errors captured to Sentry) | `src/lib/cascade/handlers/travel-cascade.ts` |

### 5. UI Features

| # | Capability | File |
|---|-----------|------|
| U1 | Batch list grouped by date, sorted by time window | `transport-planning-client.tsx` |
| U2 | Status badges with color coding (5 states) | `transport-planning-client.tsx` |
| U3 | Movement type display (Arrival/Departure) | `transport-planning-client.tsx` |
| U4 | Inline batch creation form | `transport-planning-client.tsx` |
| U5 | Empty state with icon and guidance text | `transport-planning-client.tsx` |
| U6 | Back navigation to event page | `transport-planning-client.tsx` |
| U7 | Kanban board with DndContext (@dnd-kit) | `vehicle-kanban-client.tsx` |
| U8 | Unassigned passengers column | `vehicle-kanban-client.tsx` |
| U9 | Vehicle columns with utilization (count/capacity) | `vehicle-kanban-client.tsx` |
| U10 | Over-capacity warning (red count) | `vehicle-kanban-client.tsx` |
| U11 | Drag-and-drop passenger cards between columns | `vehicle-kanban-client.tsx` |
| U12 | Inline add vehicle form | `vehicle-kanban-client.tsx` |
| U13 | Driver name display on vehicle column | `vehicle-kanban-client.tsx` |
| U14 | Moving feedback banner | `vehicle-kanban-client.tsx` |
| U15 | Drop zone visual feedback (ring highlight) | `vehicle-kanban-client.tsx` |
| U16 | Passenger card with name and phone | `vehicle-kanban-client.tsx` |

### 6. Auth & Security

| # | Capability | File |
|---|-----------|------|
| S1 | assertEventAccess on all read operations | `src/lib/actions/transport.ts` |
| S2 | assertEventAccess with requireWrite on all mutations | `src/lib/actions/transport.ts` |
| S3 | withEventScope on all database queries (event data isolation) | `src/lib/actions/transport.ts` |
| S4 | Redirect to login on access failure (pages) | Page files |
| S5 | Block updates on completed/cancelled batches | `src/lib/actions/transport.ts` |
| S6 | Block moves on completed/cancelled/no_show passengers | `src/lib/actions/transport.ts` |

### 7. Data Model (DB Schema)

| # | Entity | Table | Key Fields |
|---|--------|-------|-----------|
| D1 | Transport Batch | `transportBatches` | movementType, serviceDate, timeWindow, hubs, batchStatus |
| D2 | Vehicle Assignment | `vehicleAssignments` | vehicleLabel, vehicleType, capacity, driver, assignmentStatus |
| D3 | Passenger Assignment | `transportPassengerAssignments` | personId, travelRecordId, vehicleAssignmentId, assignmentStatus |

## Layer 2: Library Enrichment

| # | Library | Emergent Capability |
|---|---------|-------------------|
| L1 | @dnd-kit/core | Collision detection (closestCorners), pointer/keyboard sensors |
| L2 | @dnd-kit/sortable | Sortable items with CSS transforms |
| L3 | @dnd-kit/utilities | CSS.Transform for smooth drag animations |
| L4 | date-fns | Date formatting (format, grouping by date) |
| L5 | zod | Schema validation with custom refinements |
| L6 | drizzle-orm | Type-safe queries, joins, ordering |
| L7 | lucide-react | Icons (ArrowLeft, Plus, Bus, Users, GripVertical, etc.) |

## Layer 3: Runtime Crawl

Not performed — app not running. All features catalogued from code.

## Summary

| Category | Count |
|----------|-------|
| Pages/Routes | 4 |
| Server Actions | 12 |
| Validations/State Machines | 11 |
| Cascade Handlers | 6 |
| UI Features | 16 |
| Auth/Security | 6 |
| Data Model Entities | 3 |
| Library Capabilities | 7 |
| **Total Capabilities** | **65** |

## Existing Test Coverage

| Test File | Tests |
|-----------|-------|
| `src/lib/validations/transport.test.ts` | 42 tests — constants, state machines, schemas, BATCH_SOURCES |
| `src/lib/actions/transport.test.ts` | 49 tests — all server actions, auth, filtering, sorting, lifecycle chains |
| `src/lib/cascade/handlers/travel-cascade.test.ts` | 12 tests — cascade notifications, red flags, cancelled filtering |
| **Total** | **103 tests, all passing** |

## Spec Coverage

| Spec | Checkpoints | Status |
|------|-------------|--------|
| spec-01-batch-lifecycle | 17/17 | COMPLETE |
| spec-02-vehicle-lifecycle | 10/10 | COMPLETE |
| spec-03-passenger-lifecycle | 16/16 | COMPLETE |
| spec-04-cascade-integration | 10/10 | COMPLETE |
| spec-05-auth-and-event-scope | 5/5 | COMPLETE |
| spec-06-validation-schemas | 10/10 | COMPLETE |
| **Total** | **68/68** | **100%** |

### Uncovered Census Items (Not in Specs)

UI features (U1–U16) and Data Model (D1–D3) are not covered by unit test specs.
UI features would require Playwright E2E specs targeting the transport planning page and kanban board.
