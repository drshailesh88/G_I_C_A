/**
 * System Template Seeds
 *
 * 10 V1 system template keys, each as email + WhatsApp = 20 templates total.
 * These are global defaults (eventId = null). Events can override any template.
 *
 * Template keys:
 * 1. registration_confirmation
 * 2. registration_cancelled
 * 3. faculty_invitation
 * 4. faculty_reminder
 * 5. program_update
 * 6. travel_update
 * 7. travel_cancelled
 * 8. accommodation_details
 * 9. certificate_ready
 * 10. event_reminder
 */

import type { Channel } from './types';

export type SystemTemplateSeed = {
  templateKey: string;
  channel: Channel;
  templateName: string;
  metaCategory: string;
  triggerType: string | null;
  sendMode: 'automatic' | 'manual' | 'both';
  subjectLine: string | null;
  bodyContent: string;
  previewText: string | null;
  allowedVariablesJson: string[];
  requiredVariablesJson: string[];
  isSystemTemplate: true;
};

export const SYSTEM_TEMPLATE_SEEDS: SystemTemplateSeed[] = [
  // ── 1. Registration Confirmation ────────────────────────────
  {
    templateKey: 'registration_confirmation',
    channel: 'email',
    templateName: 'Registration Confirmation Email',
    metaCategory: 'registration',
    triggerType: 'registration.created',
    sendMode: 'automatic',
    subjectLine: 'Registration Confirmed — {{eventName}}',
    bodyContent: `Dear {{salutation}} {{fullName}},

Your registration for {{eventName}} has been confirmed.

Registration Number: {{registrationNumber}}
Event Date: {{eventDate}}
Venue: {{venue}}

Please save this email for your records. Your QR code is attached for check-in on the day of the event.

Warm regards,
{{eventName}} Organizing Committee`,
    previewText: 'Your registration has been confirmed',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'registrationNumber', 'eventDate', 'venue', 'qrCodeUrl'],
    requiredVariablesJson: ['fullName', 'eventName', 'registrationNumber'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'registration_confirmation',
    channel: 'whatsapp',
    templateName: 'Registration Confirmation WhatsApp',
    metaCategory: 'registration',
    triggerType: 'registration.created',
    sendMode: 'automatic',
    subjectLine: null,
    bodyContent: `✅ Registration Confirmed

Dear {{fullName}},
Your registration for *{{eventName}}* is confirmed.

📋 Reg #: {{registrationNumber}}
📅 Date: {{eventDate}}
📍 Venue: {{venue}}

Show the QR code at check-in.`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'registrationNumber', 'eventDate', 'venue'],
    requiredVariablesJson: ['fullName', 'eventName', 'registrationNumber'],
    isSystemTemplate: true,
  },

  // ── 2. Registration Cancelled ───────────────────────────────
  {
    templateKey: 'registration_cancelled',
    channel: 'email',
    templateName: 'Registration Cancelled Email',
    metaCategory: 'registration',
    triggerType: 'registration.cancelled',
    sendMode: 'automatic',
    subjectLine: 'Registration Cancelled — {{eventName}}',
    bodyContent: `Dear {{salutation}} {{fullName}},

Your registration ({{registrationNumber}}) for {{eventName}} has been cancelled.

If you believe this is an error, please contact the event coordinator.

Regards,
{{eventName}} Organizing Committee`,
    previewText: 'Your registration has been cancelled',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'registrationNumber'],
    requiredVariablesJson: ['fullName', 'eventName', 'registrationNumber'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'registration_cancelled',
    channel: 'whatsapp',
    templateName: 'Registration Cancelled WhatsApp',
    metaCategory: 'registration',
    triggerType: 'registration.cancelled',
    sendMode: 'automatic',
    subjectLine: null,
    bodyContent: `❌ Registration Cancelled

Dear {{fullName}},
Your registration ({{registrationNumber}}) for *{{eventName}}* has been cancelled.

Contact the event coordinator if this is an error.`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'registrationNumber'],
    requiredVariablesJson: ['fullName', 'eventName', 'registrationNumber'],
    isSystemTemplate: true,
  },

  // ── 3. Faculty Invitation ───────────────────────────────────
  {
    templateKey: 'faculty_invitation',
    channel: 'email',
    templateName: 'Faculty Invitation Email',
    metaCategory: 'program',
    triggerType: 'faculty.invitation',
    sendMode: 'automatic',
    subjectLine: 'Invitation: {{eventName}} — Faculty Role',
    bodyContent: `Dear {{salutation}} {{fullName}},

We are pleased to invite you as faculty for {{eventName}}.

Your responsibilities:
{{responsibilitySummary}}

Event Date: {{eventDate}}
Venue: {{venue}}

Please confirm your participation by clicking the link below:
{{confirmationUrl}}

This invitation expires on {{expiresAt}}.

Warm regards,
{{eventName}} Organizing Committee`,
    previewText: 'You have been invited as faculty',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'responsibilitySummary', 'eventDate', 'venue', 'confirmationUrl', 'expiresAt'],
    requiredVariablesJson: ['fullName', 'eventName', 'confirmationUrl'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'faculty_invitation',
    channel: 'whatsapp',
    templateName: 'Faculty Invitation WhatsApp',
    metaCategory: 'program',
    triggerType: 'faculty.invitation',
    sendMode: 'automatic',
    subjectLine: null,
    bodyContent: `🎓 Faculty Invitation

Dear {{fullName}},
You are invited as faculty for *{{eventName}}*.

📅 {{eventDate}}
📍 {{venue}}

Confirm here: {{confirmationUrl}}

⏰ Expires: {{expiresAt}}`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'eventDate', 'venue', 'confirmationUrl', 'expiresAt'],
    requiredVariablesJson: ['fullName', 'eventName', 'confirmationUrl'],
    isSystemTemplate: true,
  },

  // ── 4. Faculty Reminder ─────────────────────────────────────
  {
    templateKey: 'faculty_reminder',
    channel: 'email',
    templateName: 'Faculty Reminder Email',
    metaCategory: 'program',
    triggerType: null,
    sendMode: 'manual',
    subjectLine: 'Reminder: {{eventName}} — Your Faculty Responsibilities',
    bodyContent: `Dear {{salutation}} {{fullName}},

This is a reminder about your upcoming faculty role at {{eventName}}.

Your responsibilities:
{{responsibilitySummary}}

Event Date: {{eventDate}}
Venue: {{venue}}

If you have any questions, please contact the event coordinator.

Regards,
{{eventName}} Organizing Committee`,
    previewText: 'Reminder about your faculty responsibilities',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'responsibilitySummary', 'eventDate', 'venue'],
    requiredVariablesJson: ['fullName', 'eventName'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'faculty_reminder',
    channel: 'whatsapp',
    templateName: 'Faculty Reminder WhatsApp',
    metaCategory: 'program',
    triggerType: null,
    sendMode: 'manual',
    subjectLine: null,
    bodyContent: `📢 Faculty Reminder

Dear {{fullName}},
Reminder: You are faculty at *{{eventName}}*.

📅 {{eventDate}}
📍 {{venue}}

{{responsibilitySummary}}`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'eventDate', 'venue', 'responsibilitySummary'],
    requiredVariablesJson: ['fullName', 'eventName'],
    isSystemTemplate: true,
  },

  // ── 5. Program Update ──────────────────────────────────────
  {
    templateKey: 'program_update',
    channel: 'email',
    templateName: 'Program Update Email',
    metaCategory: 'program',
    triggerType: 'program.version_published',
    sendMode: 'automatic',
    subjectLine: 'Program Update — {{eventName}}',
    bodyContent: `Dear {{salutation}} {{fullName}},

The scientific program for {{eventName}} has been updated (Version {{versionNo}}).

Changes affecting you:
{{changesSummary}}

Please review your updated responsibilities. If you have concerns, contact the event coordinator.

Regards,
{{eventName}} Organizing Committee`,
    previewText: 'The program has been updated',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'versionNo', 'changesSummary'],
    requiredVariablesJson: ['fullName', 'eventName', 'changesSummary'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'program_update',
    channel: 'whatsapp',
    templateName: 'Program Update WhatsApp',
    metaCategory: 'program',
    triggerType: 'program.version_published',
    sendMode: 'automatic',
    subjectLine: null,
    bodyContent: `📋 Program Updated

Dear {{fullName}},
The program for *{{eventName}}* has been updated (v{{versionNo}}).

Changes:
{{changesSummary}}

Please review your responsibilities.`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'versionNo', 'changesSummary'],
    requiredVariablesJson: ['fullName', 'eventName', 'changesSummary'],
    isSystemTemplate: true,
  },

  // ── 6. Travel Update ────────────────────────────────────────
  {
    templateKey: 'travel_update',
    channel: 'email',
    templateName: 'Travel Update Email',
    metaCategory: 'logistics',
    triggerType: 'travel.updated',
    sendMode: 'automatic',
    subjectLine: 'Travel Update — {{eventName}}',
    bodyContent: `Dear {{salutation}} {{fullName}},

Your travel details for {{eventName}} have been updated.

Changes:
{{changeSummary}}

Current details:
{{travelDetails}}

If these details are incorrect, please contact the operations team.

Regards,
{{eventName}} Operations Team`,
    previewText: 'Your travel details have been updated',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'changeSummary', 'travelDetails'],
    requiredVariablesJson: ['fullName', 'eventName', 'changeSummary'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'travel_update',
    channel: 'whatsapp',
    templateName: 'Travel Update WhatsApp',
    metaCategory: 'logistics',
    triggerType: 'travel.updated',
    sendMode: 'automatic',
    subjectLine: null,
    bodyContent: `✈️ Travel Updated

Dear {{fullName}},
Your travel for *{{eventName}}* has been updated.

Changes: {{changeSummary}}

Contact ops if incorrect.`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'changeSummary', 'travelDetails'],
    requiredVariablesJson: ['fullName', 'eventName', 'changeSummary'],
    isSystemTemplate: true,
  },

  // ── 7. Travel Cancelled ─────────────────────────────────────
  {
    templateKey: 'travel_cancelled',
    channel: 'email',
    templateName: 'Travel Cancelled Email',
    metaCategory: 'logistics',
    triggerType: 'travel.cancelled',
    sendMode: 'automatic',
    subjectLine: 'Travel Cancelled — {{eventName}}',
    bodyContent: `Dear {{salutation}} {{fullName}},

Your travel record for {{eventName}} has been cancelled.

Reason: {{reason}}

If this is an error, please contact the operations team immediately.

Regards,
{{eventName}} Operations Team`,
    previewText: 'Your travel has been cancelled',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'reason'],
    requiredVariablesJson: ['fullName', 'eventName'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'travel_cancelled',
    channel: 'whatsapp',
    templateName: 'Travel Cancelled WhatsApp',
    metaCategory: 'logistics',
    triggerType: 'travel.cancelled',
    sendMode: 'automatic',
    subjectLine: null,
    bodyContent: `❌ Travel Cancelled

Dear {{fullName}},
Your travel for *{{eventName}}* has been cancelled.

Reason: {{reason}}

Contact ops if this is an error.`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'reason'],
    requiredVariablesJson: ['fullName', 'eventName'],
    isSystemTemplate: true,
  },

  // ── 8. Accommodation Details ────────────────────────────────
  {
    templateKey: 'accommodation_details',
    channel: 'email',
    templateName: 'Accommodation Details Email',
    metaCategory: 'logistics',
    triggerType: 'accommodation.saved',
    sendMode: 'automatic',
    subjectLine: 'Accommodation Details — {{eventName}}',
    bodyContent: `Dear {{salutation}} {{fullName}},

Your accommodation for {{eventName}} has been arranged.

🏨 Hotel: {{hotelName}}
📍 Address: {{hotelAddress}}
📅 Check-in: {{checkInDate}}
📅 Check-out: {{checkOutDate}}
🛏️ Room Type: {{roomType}}

{{googleMapsUrl}}

Please bring a valid ID for check-in at the hotel.

Regards,
{{eventName}} Operations Team`,
    previewText: 'Your accommodation has been arranged',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'hotelName', 'hotelAddress', 'checkInDate', 'checkOutDate', 'roomType', 'googleMapsUrl'],
    requiredVariablesJson: ['fullName', 'eventName', 'hotelName', 'checkInDate', 'checkOutDate'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'accommodation_details',
    channel: 'whatsapp',
    templateName: 'Accommodation Details WhatsApp',
    metaCategory: 'logistics',
    triggerType: 'accommodation.saved',
    sendMode: 'automatic',
    subjectLine: null,
    bodyContent: `🏨 Accommodation Confirmed

Dear {{fullName}},
Your stay for *{{eventName}}*:

Hotel: {{hotelName}}
Check-in: {{checkInDate}}
Check-out: {{checkOutDate}}
Room: {{roomType}}

📍 Map: {{googleMapsUrl}}

Bring valid ID for hotel check-in.`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'hotelName', 'checkInDate', 'checkOutDate', 'roomType', 'googleMapsUrl'],
    requiredVariablesJson: ['fullName', 'eventName', 'hotelName', 'checkInDate', 'checkOutDate'],
    isSystemTemplate: true,
  },

  // ── 9. Certificate Ready ────────────────────────────────────
  {
    templateKey: 'certificate_ready',
    channel: 'email',
    templateName: 'Certificate Ready Email',
    metaCategory: 'certificates',
    triggerType: 'certificate.generated',
    sendMode: 'automatic',
    subjectLine: 'Your Certificate — {{eventName}}',
    bodyContent: `Dear {{salutation}} {{fullName}},

Your {{certificateType}} certificate for {{eventName}} is ready.

Certificate Number: {{certificateNumber}}

You can download your certificate using the link below:
{{downloadUrl}}

Congratulations!

Regards,
{{eventName}} Organizing Committee`,
    previewText: 'Your certificate is ready for download',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'certificateType', 'certificateNumber', 'downloadUrl'],
    requiredVariablesJson: ['fullName', 'eventName', 'certificateType', 'downloadUrl'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'certificate_ready',
    channel: 'whatsapp',
    templateName: 'Certificate Ready WhatsApp',
    metaCategory: 'certificates',
    triggerType: 'certificate.generated',
    sendMode: 'automatic',
    subjectLine: null,
    bodyContent: `🎓 Certificate Ready

Dear {{fullName}},
Your *{{certificateType}}* certificate for *{{eventName}}* is ready!

Certificate #: {{certificateNumber}}

Download: {{downloadUrl}}

Congratulations! 🎉`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'certificateType', 'certificateNumber', 'downloadUrl'],
    requiredVariablesJson: ['fullName', 'eventName', 'certificateType', 'downloadUrl'],
    isSystemTemplate: true,
  },

  // ── 10. Event Reminder ──────────────────────────────────────
  {
    templateKey: 'event_reminder',
    channel: 'email',
    templateName: 'Event Reminder Email',
    metaCategory: 'reminders',
    triggerType: null,
    sendMode: 'manual',
    subjectLine: 'Reminder: {{eventName}} — {{eventDate}}',
    bodyContent: `Dear {{salutation}} {{fullName}},

This is a reminder that {{eventName}} is coming up on {{eventDate}}.

Venue: {{venue}}
Registration #: {{registrationNumber}}

We look forward to seeing you!

Regards,
{{eventName}} Organizing Committee`,
    previewText: 'Event reminder',
    allowedVariablesJson: ['salutation', 'fullName', 'eventName', 'eventDate', 'venue', 'registrationNumber'],
    requiredVariablesJson: ['fullName', 'eventName', 'eventDate'],
    isSystemTemplate: true,
  },
  {
    templateKey: 'event_reminder',
    channel: 'whatsapp',
    templateName: 'Event Reminder WhatsApp',
    metaCategory: 'reminders',
    triggerType: null,
    sendMode: 'manual',
    subjectLine: null,
    bodyContent: `📅 Event Reminder

Dear {{fullName}},
*{{eventName}}* is on *{{eventDate}}*.

📍 {{venue}}
📋 Reg #: {{registrationNumber}}

See you there!`,
    previewText: null,
    allowedVariablesJson: ['fullName', 'eventName', 'eventDate', 'venue', 'registrationNumber'],
    requiredVariablesJson: ['fullName', 'eventName', 'eventDate'],
    isSystemTemplate: true,
  },
];

/**
 * Get all unique template keys from the system seeds.
 */
export function getSystemTemplateKeys(): string[] {
  const keys = new Set(SYSTEM_TEMPLATE_SEEDS.map((s) => s.templateKey));
  return Array.from(keys);
}

/**
 * Get seeds for a specific template key (email + WhatsApp).
 */
export function getSeedsForKey(templateKey: string): SystemTemplateSeed[] {
  return SYSTEM_TEMPLATE_SEEDS.filter((s) => s.templateKey === templateKey);
}
