/**
 * Cascade Event Definitions
 *
 * All domain events follow the naming convention: conference/<domain>.<action>
 * Every event payload includes eventId for event isolation.
 *
 * Cascade direction (one-way):
 *   Travel → Accommodation + Transport
 *   Accommodation → Transport
 *   Transport → nothing (terminal)
 */

// ── Event Envelope ────────────────────────────────────────────
export type CascadeActor = {
  type: 'user' | 'system';
  id: string;
};

// ── Travel Events ─────────────────────────────────────────────
export type TravelCreatedPayload = {
  travelRecordId: string;
  personId: string;
  registrationId: string | null;
  direction: string;
  travelMode: string;
  fromCity: string;
  toCity: string;
  departureAtUtc: string | null;
  arrivalAtUtc: string | null;
  pickupHub: string | null;
  terminalOrGate: string | null;
};

export type TravelSavedPayload = TravelCreatedPayload;

export type TravelUpdatedPayload = {
  travelRecordId: string;
  personId: string;
  registrationId: string | null;
  previous: Record<string, unknown>;
  current: Record<string, unknown>;
  changeSummary: Record<string, { from: unknown; to: unknown }>;
};

export type TravelCancelledPayload = {
  travelRecordId: string;
  personId: string;
  registrationId: string | null;
  cancelledAt: string;
  reason: string | null;
};

// ── Accommodation Events ──────────────────────────────────────
export type AccommodationCreatedPayload = {
  accommodationRecordId: string;
  personId: string;
  registrationId: string | null;
  hotelName: string;
  checkInDate: string;
  checkOutDate: string;
  googleMapsUrl: string | null;
};

export type AccommodationSavedPayload = AccommodationCreatedPayload;

export type AccommodationUpdatedPayload = {
  accommodationRecordId: string;
  personId: string;
  previous: Record<string, unknown>;
  current: Record<string, unknown>;
  changeSummary: Record<string, { from: unknown; to: unknown }>;
  sharedRoomGroup: string | null;
};

export type AccommodationCancelledPayload = {
  accommodationRecordId: string;
  personId: string;
  cancelledAt: string;
  reason: string | null;
};

// ── Registration Events ──────────────────────────────────────
export type RegistrationCreatedPayload = {
  registrationId: string;
  personId: string;
  eventId: string;
};

export type RegistrationCancelledPayload = {
  registrationId: string;
  personId: string;
  eventId: string;
  cancelledAt: string;
};

// ── Session Events ───────────────────────────────────────────
export type SessionUpdatedPayload = {
  sessionId: string;
  previous: Record<string, unknown>;
  current: Record<string, unknown>;
  changeSummary: Record<string, { from: unknown; to: unknown }>;
  affectedFacultyIds: string[];
};

// ── Certificate Events ───────────────────────────────────────
export type CertificateGeneratedPayload = {
  certificateId: string;
  personId: string;
  templateId: string;
};

// ── Event Names ───────────────────────────────────────────────
export const CASCADE_EVENTS = {
  TRAVEL_CREATED: 'conference/travel.created',
  TRAVEL_SAVED: 'conference/travel.saved',
  TRAVEL_UPDATED: 'conference/travel.updated',
  TRAVEL_CANCELLED: 'conference/travel.cancelled',
  ACCOMMODATION_CREATED: 'conference/accommodation.created',
  ACCOMMODATION_SAVED: 'conference/accommodation.saved',
  ACCOMMODATION_UPDATED: 'conference/accommodation.updated',
  ACCOMMODATION_CANCELLED: 'conference/accommodation.cancelled',
  REGISTRATION_CREATED: 'conference/registration.created',
  REGISTRATION_CANCELLED: 'conference/registration.cancelled',
  SESSION_UPDATED: 'conference/session.updated',
  CERTIFICATE_GENERATED: 'conference/certificate.generated',
} as const;

export type CascadeEventName = (typeof CASCADE_EVENTS)[keyof typeof CASCADE_EVENTS];

// ── Cascade Event Map ─────────────────────────────────────────
// Documents which events trigger which downstream effects
export const CASCADE_DIRECTION = {
  'conference/travel.created': ['notify_delegate_itinerary'],
  'conference/travel.updated': ['accommodation_flag', 'transport_recalc', 'delegate_notification'],
  'conference/travel.cancelled': ['accommodation_flag', 'transport_flag', 'delegate_notification'],
  'conference/accommodation.created': ['accommodation_notification'],
  'conference/accommodation.saved': ['accommodation_notification'],
  'conference/accommodation.updated': ['transport_flag', 'delegate_notification', 'shared_room_flags'],
  'conference/accommodation.cancelled': ['transport_flag', 'delegate_notification'],
  'conference/travel.saved': ['notify_delegate_itinerary'],
  'conference/registration.created': ['send_confirmation', 'assign_qr'],
  'conference/registration.cancelled': ['accommodation_flag', 'transport_flag'],
  'conference/session.updated': ['notify_affected_faculty'],
  'conference/certificate.generated': ['notify_recipient_certificate'],
} as const;
