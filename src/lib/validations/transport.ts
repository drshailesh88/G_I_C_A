import { z } from 'zod';
import { normalizePhone } from './person';

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

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parseUtcTimestamp(value: string): Date | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.(\d{1,3}))?Z$/,
  );

  if (!match) {
    return null;
  }

  const [, yearPart, monthPart, dayPart, hourPart, minutePart, secondPart, , millisPart] = match;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const second = Number(secondPart);
  const millisecond = millisPart ? Number(millisPart.padEnd(3, '0')) : 0;

  if (
    month < 1 || month > 12
    || day < 1 || day > 31
    || hour > 23
    || minute > 59
    || second > 59
  ) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
    || parsed.getUTCHours() !== hour
    || parsed.getUTCMinutes() !== minute
    || parsed.getUTCSeconds() !== second
    || parsed.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return parsed;
}

function isValidServiceDate(value: string): boolean {
  return isValidDateOnly(value) || parseUtcTimestamp(value) !== null;
}

function isValidUtcTimestamp(value: string): boolean {
  return parseUtcTimestamp(value) !== null;
}

function getTimestampMillis(value: string): number | null {
  return parseUtcTimestamp(value)?.getTime() ?? null;
}

const requiredServiceDateSchema = z.preprocess(
  trimString,
  z
    .string()
    .min(1, 'Service date is required')
    .refine(isValidServiceDate, 'Service date must be a valid date'),
);

const optionalServiceDateSchema = z.preprocess(
  trimString,
  z
    .string()
    .min(1, 'Service date must be a valid date')
    .refine(isValidServiceDate, 'Service date must be a valid date')
    .optional(),
);

const requiredUtcTimestampSchema = (label: string) =>
  z.preprocess(
    trimString,
    z
      .string()
      .min(1, `${label} is required`)
      .refine(isValidUtcTimestamp, `${label} must be a valid UTC timestamp`),
  );

const optionalUtcTimestampSchema = (label: string) =>
  z.preprocess(
    trimString,
    z.union([
      z.literal(''),
      z
        .string()
        .min(1, `${label} must be a valid UTC timestamp`)
        .refine(isValidUtcTimestamp, `${label} must be a valid UTC timestamp`),
    ]).optional(),
  );

const optionalTransportPhoneSchema = (label: string) =>
  z.preprocess(
    trimString,
    z
      .union([
        z.literal(''),
        z
          .string()
          .max(20)
          .refine((value) => {
            try {
              normalizePhone(value);
              return true;
            } catch {
              return false;
            }
          }, `Invalid ${label}`)
          .transform((value) => normalizePhone(value)),
      ])
      .optional(),
  );

// ── Create transport batch ────────────────────────────────────
export const createBatchSchema = z.object({
  movementType: z.enum(MOVEMENT_TYPES),
  batchSource: z.enum(BATCH_SOURCES).default('manual'),
  serviceDate: requiredServiceDateSchema,
  timeWindowStart: requiredUtcTimestampSchema('Start time'),
  timeWindowEnd: requiredUtcTimestampSchema('End time'),
  sourceCity: z.string().trim().min(1, 'Source city is required').max(200),
  pickupHub: z.string().trim().min(1, 'Pickup hub is required').max(300),
  pickupHubType: z.enum(HUB_TYPES).default('other'),
  dropHub: z.string().trim().min(1, 'Drop hub is required').max(300),
  dropHubType: z.enum(HUB_TYPES).default('other'),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  const startMillis = getTimestampMillis(data.timeWindowStart);
  const endMillis = getTimestampMillis(data.timeWindowEnd);

  if (startMillis !== null && endMillis !== null && endMillis <= startMillis) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End time must be after start time',
      path: ['timeWindowEnd'],
    });
  }
});

// ── Update transport batch ────────────────────────────────────
export const updateBatchSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID'),
  serviceDate: optionalServiceDateSchema,
  timeWindowStart: optionalUtcTimestampSchema('Start time'),
  timeWindowEnd: optionalUtcTimestampSchema('End time'),
  sourceCity: z.string().trim().min(1).max(200).optional(),
  pickupHub: z.string().trim().min(1).max(300).optional(),
  pickupHubType: z.enum(HUB_TYPES).optional(),
  dropHub: z.string().trim().min(1).max(300).optional(),
  dropHubType: z.enum(HUB_TYPES).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (!data.timeWindowStart || !data.timeWindowEnd) {
    return;
  }

  const startMillis = getTimestampMillis(data.timeWindowStart);
  const endMillis = getTimestampMillis(data.timeWindowEnd);

  if (startMillis !== null && endMillis !== null && endMillis <= startMillis) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End time must be after start time',
      path: ['timeWindowEnd'],
    });
  }
});

// ── Create vehicle assignment ─────────────────────────────────
export const createVehicleSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID'),
  vehicleLabel: z.string().trim().min(1, 'Vehicle label is required').max(100),
  vehicleType: z.enum(VEHICLE_TYPES),
  plateNumber: z.string().trim().max(20).optional().or(z.literal('')),
  vendorName: z.string().trim().max(200).optional().or(z.literal('')),
  vendorContactE164: optionalTransportPhoneSchema('vendor contact number'),
  driverName: z.string().trim().max(200).optional().or(z.literal('')),
  driverMobileE164: optionalTransportPhoneSchema('driver mobile number'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(100),
  scheduledPickupAtUtc: optionalUtcTimestampSchema('Scheduled pickup time'),
  scheduledDropAtUtc: optionalUtcTimestampSchema('Scheduled drop time'),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (!data.scheduledPickupAtUtc || !data.scheduledDropAtUtc) {
    return;
  }

  const pickupMillis = getTimestampMillis(data.scheduledPickupAtUtc);
  const dropMillis = getTimestampMillis(data.scheduledDropAtUtc);

  if (pickupMillis !== null && dropMillis !== null && dropMillis <= pickupMillis) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Scheduled drop time must be after pickup time',
      path: ['scheduledDropAtUtc'],
    });
  }
});

// ── Update vehicle assignment ─────────────────────────────────
export const updateVehicleSchema = z.object({
  vehicleAssignmentId: z.string().uuid('Invalid vehicle assignment ID'),
  vehicleLabel: z.string().trim().min(1).max(100).optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  plateNumber: z.string().trim().max(20).optional().or(z.literal('')),
  vendorName: z.string().trim().max(200).optional().or(z.literal('')),
  vendorContactE164: optionalTransportPhoneSchema('vendor contact number'),
  driverName: z.string().trim().max(200).optional().or(z.literal('')),
  driverMobileE164: optionalTransportPhoneSchema('driver mobile number'),
  capacity: z.coerce.number().int().min(1).max(100).optional(),
  scheduledPickupAtUtc: optionalUtcTimestampSchema('Scheduled pickup time'),
  scheduledDropAtUtc: optionalUtcTimestampSchema('Scheduled drop time'),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (!data.scheduledPickupAtUtc || !data.scheduledDropAtUtc) {
    return;
  }

  const pickupMillis = getTimestampMillis(data.scheduledPickupAtUtc);
  const dropMillis = getTimestampMillis(data.scheduledDropAtUtc);

  if (pickupMillis !== null && dropMillis !== null && dropMillis <= pickupMillis) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Scheduled drop time must be after pickup time',
      path: ['scheduledDropAtUtc'],
    });
  }
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
