import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// BATCH STATUS MACHINE
// ═══════════════════════════════════════════════════════════════
export const BATCH_STATUSES = ['planned', 'ready', 'in_progress', 'completed', 'cancelled'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  planned: ['ready', 'cancelled'],
  ready: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],      // terminal
  cancelled: [],      // terminal
};

// ═══════════════════════════════════════════════════════════════
// VEHICLE STATUS MACHINE
// ═══════════════════════════════════════════════════════════════
export const VEHICLE_STATUSES = ['assigned', 'dispatched', 'completed', 'cancelled'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  assigned: ['dispatched', 'cancelled'],
  dispatched: ['completed', 'cancelled'],
  completed: [],      // terminal
  cancelled: [],      // terminal
};

// ═══════════════════════════════════════════════════════════════
// PASSENGER STATUS MACHINE
// ═══════════════════════════════════════════════════════════════
export const PASSENGER_STATUSES = ['pending', 'assigned', 'boarded', 'completed', 'no_show', 'cancelled'] as const;
export type PassengerStatus = (typeof PASSENGER_STATUSES)[number];

export const PASSENGER_TRANSITIONS: Record<PassengerStatus, PassengerStatus[]> = {
  pending: ['assigned', 'boarded', 'cancelled'],  // boarded = ops override
  assigned: ['boarded', 'no_show', 'cancelled'],
  boarded: ['completed', 'cancelled'],
  completed: [],      // terminal
  no_show: [],        // terminal
  cancelled: [],      // terminal
};

// ═══════════════════════════════════════════════════════════════
// MOVEMENT TYPES & VEHICLE TYPES
// ═══════════════════════════════════════════════════════════════
export const MOVEMENT_TYPES = ['arrival', 'departure'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const HUB_TYPES = ['airport', 'railway_station', 'hotel', 'venue', 'other'] as const;
export type HubType = (typeof HUB_TYPES)[number];

export const VEHICLE_TYPES = ['sedan', 'suv', 'van', 'tempo_traveller', 'bus', 'other'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const BATCH_SOURCES = ['auto', 'manual'] as const;
export type BatchSource = (typeof BATCH_SOURCES)[number];

// ═══════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════

// ── Create transport batch ────────────────────────────────────
export const createBatchSchema = z.object({
  movementType: z.enum(MOVEMENT_TYPES),
  batchSource: z.enum(BATCH_SOURCES).default('manual'),
  serviceDate: z.string().min(1, 'Service date is required'),
  timeWindowStart: z.string().min(1, 'Start time is required'),
  timeWindowEnd: z.string().min(1, 'End time is required'),
  sourceCity: z.string().trim().min(1, 'Source city is required').max(200),
  pickupHub: z.string().trim().min(1, 'Pickup hub is required').max(300),
  pickupHubType: z.enum(HUB_TYPES).default('other'),
  dropHub: z.string().trim().min(1, 'Drop hub is required').max(300),
  dropHubType: z.enum(HUB_TYPES).default('other'),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).refine(
  (data) => new Date(data.timeWindowEnd) > new Date(data.timeWindowStart),
  { message: 'End time must be after start time', path: ['timeWindowEnd'] },
);

// ── Update transport batch ────────────────────────────────────
export const updateBatchSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID'),
  serviceDate: z.string().optional(),
  timeWindowStart: z.string().optional(),
  timeWindowEnd: z.string().optional(),
  sourceCity: z.string().trim().min(1).max(200).optional(),
  pickupHub: z.string().trim().min(1).max(300).optional(),
  pickupHubType: z.enum(HUB_TYPES).optional(),
  dropHub: z.string().trim().min(1).max(300).optional(),
  dropHubType: z.enum(HUB_TYPES).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

// ── Create vehicle assignment ─────────────────────────────────
export const createVehicleSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID'),
  vehicleLabel: z.string().trim().min(1, 'Vehicle label is required').max(100),
  vehicleType: z.enum(VEHICLE_TYPES),
  plateNumber: z.string().trim().max(20).optional().or(z.literal('')),
  vendorName: z.string().trim().max(200).optional().or(z.literal('')),
  vendorContactE164: z.string().trim().max(20).optional().or(z.literal('')),
  driverName: z.string().trim().max(200).optional().or(z.literal('')),
  driverMobileE164: z.string().trim().max(20).optional().or(z.literal('')),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(100),
  scheduledPickupAtUtc: z.string().optional().or(z.literal('')),
  scheduledDropAtUtc: z.string().optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

// ── Update vehicle assignment ─────────────────────────────────
export const updateVehicleSchema = z.object({
  vehicleAssignmentId: z.string().uuid('Invalid vehicle assignment ID'),
  vehicleLabel: z.string().trim().min(1).max(100).optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  plateNumber: z.string().trim().max(20).optional().or(z.literal('')),
  vendorName: z.string().trim().max(200).optional().or(z.literal('')),
  vendorContactE164: z.string().trim().max(20).optional().or(z.literal('')),
  driverName: z.string().trim().max(200).optional().or(z.literal('')),
  driverMobileE164: z.string().trim().max(20).optional().or(z.literal('')),
  capacity: z.coerce.number().int().min(1).max(100).optional(),
  scheduledPickupAtUtc: z.string().optional().or(z.literal('')),
  scheduledDropAtUtc: z.string().optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

// ── Assign passenger to batch/vehicle ─────────────────────────
export const assignPassengerSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID'),
  vehicleAssignmentId: z.string().uuid('Invalid vehicle ID').optional().or(z.literal('')),
  personId: z.string().uuid('Invalid person ID'),
  travelRecordId: z.string().uuid('Invalid travel record ID'),
  pickupNote: z.string().trim().max(500).optional().or(z.literal('')),
  dropNote: z.string().trim().max(500).optional().or(z.literal('')),
});

// ── Move passenger between vehicles (kanban drag-and-drop) ────
export const movePassengerSchema = z.object({
  passengerAssignmentId: z.string().uuid('Invalid passenger assignment ID'),
  targetVehicleAssignmentId: z.string().uuid('Invalid target vehicle ID').optional().or(z.literal('')),
});

// ── ID schemas ────────────────────────────────────────────────
export const batchIdSchema = z.string().uuid('Invalid batch ID');
export const vehicleIdSchema = z.string().uuid('Invalid vehicle assignment ID');
export const passengerIdSchema = z.string().uuid('Invalid passenger assignment ID');

// ── Types ─────────────────────────────────────────────────────
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type AssignPassengerInput = z.infer<typeof assignPassengerSchema>;
export type MovePassengerInput = z.infer<typeof movePassengerSchema>;
