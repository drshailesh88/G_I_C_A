# Spec 05: Notifications (Dual-Channel)

Module: accommodation
Source: feature-census/accommodation/CENSUS.md

## Checkpoints

### CP-49: Email sent on accommodation update (when person has email)
- **Action:** handleAccommodationUpdated for person with email
- **Pass:** sendNotification called with channel='email', templateKey='accommodation_update'
- **Fail:** No email notification sent

### CP-50: WhatsApp sent on accommodation update (when person has phone)
- **Action:** handleAccommodationUpdated for person with phoneE164
- **Pass:** sendNotification called with channel='whatsapp', templateKey='accommodation_update'
- **Fail:** No WhatsApp notification sent

### CP-51: Email sent on accommodation cancel (when person has email)
- **Action:** handleAccommodationCancelled for person with email
- **Pass:** sendNotification called with channel='email', templateKey='accommodation_cancelled'
- **Fail:** No email notification sent

### CP-52: WhatsApp sent on accommodation cancel (when person has phone)
- **Action:** handleAccommodationCancelled for person with phoneE164
- **Pass:** sendNotification called with channel='whatsapp', templateKey='accommodation_cancelled'
- **Fail:** No WhatsApp notification sent

### CP-53: No email sent when person has no email
- **Action:** handleAccommodationUpdated for person with email=null
- **Pass:** No email sendNotification call made
- **Fail:** Sends to null email

### CP-54: No WhatsApp sent when person has no phone
- **Action:** handleAccommodationUpdated for person with phoneE164=null
- **Pass:** No whatsapp sendNotification call made
- **Fail:** Sends to null phone

### CP-55: Safe notification wrapper never throws
- **Action:** sendNotification throws Error inside safeSendNotification
- **Pass:** Handler completes without throwing; error logged + captured to Sentry
- **Fail:** Cascade handler throws/crashes

### CP-56: Idempotency key includes all uniqueness components
- **Action:** Check idempotency key format
- **Pass:** Contains eventId, personId, recordId, timestamp, channel
- **Fail:** Missing uniqueness component

### CP-57: System templates exist for accommodation_details
- **Action:** Check SYSTEM_TEMPLATE_SEEDS for templateKey='accommodation_details'
- **Pass:** Found for both email and whatsapp channels
- **Fail:** Missing template

### CP-58: System templates exist for accommodation_update
- **Action:** Check SYSTEM_TEMPLATE_SEEDS for templateKey='accommodation_update'
- **Pass:** Found for both email and whatsapp channels
- **Fail:** Missing template

### CP-59: System templates exist for accommodation_cancelled
- **Action:** Check SYSTEM_TEMPLATE_SEEDS for templateKey='accommodation_cancelled'
- **Pass:** Found for both email and whatsapp channels
- **Fail:** Missing template
