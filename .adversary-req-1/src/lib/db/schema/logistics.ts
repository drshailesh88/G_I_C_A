import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { events } from './events';
import { people } from './people';
import { eventRegistrations } from './registrations';

// ── Travel Records ──────────────────────────────────────────────
// One record = one journey segment (leg). Multiple per person per event.
export const travelRecords = pgTable('travel_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),
  registrationId: uuid('registration_id').references(() => eventRegistrations.id, { onDelete: 'set null' }),

  direction: text('direction').notNull(),
  // CHECK: inbound | outbound | intercity | other
  travelMode: text('travel_mode').notNull(),
  // CHECK: flight | train | car | bus | self_arranged | other

  fromCity: text('from_city').notNull(),
  fromLocation: text('from_location'), // airport/station/address
  toCity: text('to_city').notNull(),
  toLocation: text('to_location'),

  departureAtUtc: timestamp('departure_at_utc', { withTimezone: true }),
  arrivalAtUtc: timestamp('arrival_at_utc', { withTimezone: true }),

  carrierName: text('carrier_name'),
  serviceNumber: text('service_number'), // flight/train/bus number
  pnrOrBookingRef: text('pnr_or_booking_ref'),
  seatOrCoach: text('seat_or_coach'),
  terminalOrGate: text('terminal_or_gate'),

  attachmentUrl: text('attachment_url'), // R2 storage key

  recordStatus: text('record_status').notNull().default('draft'),
  // CHECK: draft | confirmed | sent | changed | cancelled
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  notes: text('notes'),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_travel_records_event_id').on(table.eventId),
  index('idx_travel_records_person_id').on(table.personId),
  index('idx_travel_records_registration_id').on(table.registrationId),
  index('idx_travel_records_event_person').on(table.eventId, table.personId),
  index('idx_travel_records_event_direction').on(table.eventId, table.direction),
  index('idx_travel_records_event_status').on(table.eventId, table.recordStatus),
  index('idx_travel_records_arrival').on(table.eventId, table.arrivalAtUtc),
]);

export const travelRecordsRelations = relations(travelRecords, ({ one, many }) => ({
  event: one(events, { fields: [travelRecords.eventId], references: [events.id] }),
  person: one(people, { fields: [travelRecords.personId], references: [people.id] }),
  registration: one(eventRegistrations, { fields: [travelRecords.registrationId], references: [eventRegistrations.id] }),
  passengerAssignments: many(transportPassengerAssignments),
}));

// ── Accommodation Records ───────────────────────────────────────
export const accommodationRecords = pgTable('accommodation_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),
  registrationId: uuid('registration_id').references(() => eventRegistrations.id, { onDelete: 'set null' }),

  hotelName: text('hotel_name').notNull(),
  hotelAddress: text('hotel_address'),
  hotelCity: text('hotel_city'),
  googleMapsUrl: text('google_maps_url'),

  roomType: text('room_type'),
  roomNumber: text('room_number'),
  sharedRoomGroup: text('shared_room_group'),
  // Grouping key for shared occupants. V1 approach.

  checkInDate: timestamp('check_in_date', { withTimezone: true }).notNull(),
  checkOutDate: timestamp('check_out_date', { withTimezone: true }).notNull(),

  bookingReference: text('booking_reference'),
  attachmentUrl: text('attachment_url'), // R2 storage key
  specialRequests: text('special_requests'),

  recordStatus: text('record_status').notNull().default('draft'),
  // CHECK: draft | confirmed | sent | changed | cancelled
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  notes: text('notes'),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_accommodation_records_event_id').on(table.eventId),
  index('idx_accommodation_records_person_id').on(table.personId),
  index('idx_accommodation_records_registration_id').on(table.registrationId),
  index('idx_accommodation_records_event_person').on(table.eventId, table.personId),
  index('idx_accommodation_records_event_status').on(table.eventId, table.recordStatus),
  index('idx_accommodation_records_shared_group').on(table.eventId, table.sharedRoomGroup),
  index('idx_accommodation_records_hotel').on(table.eventId, table.hotelName),
]);

export const accommodationRecordsRelations = relations(accommodationRecords, ({ one }) => ({
  event: one(events, { fields: [accommodationRecords.eventId], references: [events.id] }),
  person: one(people, { fields: [accommodationRecords.personId], references: [people.id] }),
  registration: one(eventRegistrations, { fields: [accommodationRecords.registrationId], references: [eventRegistrations.id] }),
}));

// ── Transport Batches ───────────────────────────────────────────
// Operational grouping by date + time window + hub.
// Passenger counts and vehicle counts are DERIVED, not stored.
export const transportBatches = pgTable('transport_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),

  movementType: text('movement_type').notNull(),
  // CHECK: arrival | departure
  batchSource: text('batch_source').notNull().default('manual'),
  // CHECK: auto | manual

  serviceDate: timestamp('service_date', { withTimezone: true }).notNull(),
  timeWindowStart: timestamp('time_window_start', { withTimezone: true }).notNull(),
  timeWindowEnd: timestamp('time_window_end', { withTimezone: true }).notNull(),

  sourceCity: text('source_city').notNull(),
  pickupHub: text('pickup_hub').notNull(),
  // Actual operational pickup point: BOM T2, Mumbai Central, Hotel Leela Lobby
  pickupHubType: text('pickup_hub_type').notNull().default('other'),
  // CHECK: airport | railway_station | hotel | venue | other
  dropHub: text('drop_hub').notNull(),
  dropHubType: text('drop_hub_type').notNull().default('other'),
  // CHECK: hotel | venue | airport | railway_station | other

  batchStatus: text('batch_status').notNull().default('planned'),
  // CHECK: planned | ready | in_progress | completed | cancelled
  notes: text('notes'),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_transport_batches_event_id').on(table.eventId),
  index('idx_transport_batches_event_date').on(table.eventId, table.serviceDate),
  index('idx_transport_batches_event_movement').on(table.eventId, table.movementType),
  index('idx_transport_batches_event_status').on(table.eventId, table.batchStatus),
  index('idx_transport_batches_pickup_hub').on(table.eventId, table.pickupHub),
]);

export const transportBatchesRelations = relations(transportBatches, ({ one, many }) => ({
  event: one(events, { fields: [transportBatches.eventId], references: [events.id] }),
  vehicleAssignments: many(vehicleAssignments),
  passengerAssignments: many(transportPassengerAssignments),
}));

// ── Vehicle Assignments ─────────────────────────────────────────
// One vehicle attached to a transport batch.
export const vehicleAssignments = pgTable('vehicle_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull().references(() => transportBatches.id, { onDelete: 'cascade' }),

  vehicleLabel: text('vehicle_label').notNull(), // Van-1, Sedan-2
  vehicleType: text('vehicle_type').notNull(),
  // CHECK: sedan | suv | van | tempo_traveller | bus | other
  plateNumber: text('plate_number'),
  vendorName: text('vendor_name'),
  vendorContactE164: text('vendor_contact_e164'),
  driverName: text('driver_name'),
  driverMobileE164: text('driver_mobile_e164'),
  capacity: integer('capacity').notNull(),

  scheduledPickupAtUtc: timestamp('scheduled_pickup_at_utc', { withTimezone: true }),
  scheduledDropAtUtc: timestamp('scheduled_drop_at_utc', { withTimezone: true }),

  assignmentStatus: text('assignment_status').notNull().default('assigned'),
  // CHECK: assigned | dispatched | completed | cancelled
  notes: text('notes'),

  // Audit
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_vehicle_assignments_event_id').on(table.eventId),
  index('idx_vehicle_assignments_batch_id').on(table.batchId),
  index('idx_vehicle_assignments_status').on(table.assignmentStatus),
]);

export const vehicleAssignmentsRelations = relations(vehicleAssignments, ({ one, many }) => ({
  event: one(events, { fields: [vehicleAssignments.eventId], references: [events.id] }),
  batch: one(transportBatches, { fields: [vehicleAssignments.batchId], references: [transportBatches.id] }),
  passengers: many(transportPassengerAssignments),
}));

// ── Transport Passenger Assignments ─────────────────────────────
// Which person is on which vehicle in which batch.
export const transportPassengerAssignments = pgTable('transport_passenger_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull().references(() => transportBatches.id, { onDelete: 'cascade' }),
  vehicleAssignmentId: uuid('vehicle_assignment_id').references(() => vehicleAssignments.id, { onDelete: 'set null' }),
  // Nullable until a vehicle is chosen
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'restrict' }),
  travelRecordId: uuid('travel_record_id').notNull().references(() => travelRecords.id, { onDelete: 'restrict' }),

  assignmentStatus: text('assignment_status').notNull().default('pending'),
  // CHECK: pending | assigned | boarded | completed | no_show | cancelled
  pickupNote: text('pickup_note'),
  dropNote: text('drop_note'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_transport_passenger_event_id').on(table.eventId),
  index('idx_transport_passenger_batch_id').on(table.batchId),
  index('idx_transport_passenger_vehicle_id').on(table.vehicleAssignmentId),
  index('idx_transport_passenger_person_id').on(table.personId),
  index('idx_transport_passenger_travel_id').on(table.travelRecordId),
  index('idx_transport_passenger_status').on(table.batchId, table.assignmentStatus),
]);

export const transportPassengerAssignmentsRelations = relations(transportPassengerAssignments, ({ one }) => ({
  event: one(events, { fields: [transportPassengerAssignments.eventId], references: [events.id] }),
  batch: one(transportBatches, { fields: [transportPassengerAssignments.batchId], references: [transportBatches.id] }),
  vehicle: one(vehicleAssignments, { fields: [transportPassengerAssignments.vehicleAssignmentId], references: [vehicleAssignments.id] }),
  person: one(people, { fields: [transportPassengerAssignments.personId], references: [people.id] }),
  travelRecord: one(travelRecords, { fields: [transportPassengerAssignments.travelRecordId], references: [travelRecords.id] }),
}));
