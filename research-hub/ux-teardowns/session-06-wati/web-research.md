# WATI.io -- WhatsApp Business Template Management & Messaging
## UX Research Teardown | Session 06
**Date:** 2026-04-05
**Researcher:** UX Research (automated)
**Focus:** Template creation, personalized variable messaging, bulk sending, delivery tracking, contact management, and API -- evaluated for GEM India Conference App integration.

---

## 1. Platform Overview

WATI (WhatsApp Team Inbox) is the #1 end-to-end WhatsApp API solution for SMBs, trusted by 16,000+ customers in 78+ countries. It processes 10+ billion messages and claims 99.9% historical uptime. WATI is built on the official WhatsApp Business API (via Meta's Cloud API).

**Core capabilities:**
- WhatsApp Business API messaging at scale
- Multi-channel support (WhatsApp, Instagram, Facebook, SMS, website chat)
- Shared team inbox with conversation history
- No-code chatbot builder (Wati AI)
- Broadcast campaigns with personalization
- 100+ integrations (Salesforce, HubSpot, Zapier, Shopify, WooCommerce)
- Full REST API for programmatic access

**Solution categories:** Marketing, Sales, Support

---

## 2. Template Creation

### 2.1 Navigation
`Campaign > Template Messages > Your Templates > New Template Message`

### 2.2 Template Metadata
| Field | Details |
|-------|---------|
| **Name** | Must use underscores, no spaces (e.g., `gem_event_reminder`) |
| **Category** | **Utility** (transactional: opt-ins, confirmations, updates, refunds), **Marketing** (promotional), **Authentication** (OTP/verification) |
| **Language** | Select from supported WhatsApp languages |

### 2.3 Character Limits
| Category | Max Body Length |
|----------|----------------|
| Marketing | 550 characters (including variable values) |
| Utility | 1024 characters (including variable values) |
| Authentication | 1024 characters (including variable values) |

### 2.4 Message Body & Variable/Placeholder Syntax

WATI supports two placeholder formats:

**Numbered placeholders (Meta's native format):**
```
{{1}}, {{2}}, {{3}}, ...
```

**Named placeholders (WATI's convenience layer):**
```
{{name}}, {{first_name}}, {{last_name}}, {{order_number}}, etc.
```

When creating a template, click **"Add Variable"** to insert dynamic fields into the body text. Example:
```
Dear {{1}}, you are invited to {{2}} at {{3}}, Hall {{4}} on {{5}} at {{6}}.
Your role: {{7}}. Hotel: {{8}}, Room: {{9}}.
```

**Variable rules (Meta-enforced):**
- Templates CANNOT start or end with a parameter
- Templates cannot have too many placeholders relative to message length
- Invalid: `{{1}}, your appointment is confirmed.`
- Valid: `Hi {{1}}, your appointment is confirmed.`

### 2.5 Header Options
| Type | Formats Supported |
|------|-------------------|
| None | No header |
| Text | Plain text title (can include variables) |
| Image | JPEG, PNG |
| Video | MP4 |
| Document | PDF and other valid MIME types |

### 2.6 Footer
Optional text line at the bottom (e.g., "Powered by GEM India Conference"). No variables allowed in footer.

### 2.7 Buttons
| Button Type | Details |
|-------------|---------|
| **Call-to-Action: Visit Website** | Button text + URL (static or dynamic with `{{variables}}`) |
| **Call-to-Action: Call Phone** | Button text + phone number (no `+` prefix) |
| **Quick Reply** | Up to 3 quick-reply buttons per template |

### 2.8 Carousel Templates
- Up to 5 scrollable media cards per message
- Category must be **Marketing**
- Each card has its own content, image, and CTA button
- Clicking a card's URL button opens a browser (exits WhatsApp)

### 2.9 Preview & Save
- **Save as Draft** -- editable later, not submitted to Meta
- **Save and Submit** -- sends to Meta for approval, becomes read-only with "Pending" status

### 2.10 Meta Approval Process

| Status | Meaning |
|--------|---------|
| **Draft** | Not yet submitted; fully editable |
| **Pending** | Submitted to Meta; read-only; awaiting review |
| **Approved** | Ready for use in campaigns and API calls |
| **Rejected** | Did not pass Meta review; must create new template |

**Timeline:** 30 minutes to 24 hours for approval.

**Critical policy change (effective April 9, 2025):** Meta now **automatically reclassifies** template categories if content does not match the submitted classification. The `allow_category_change` setting is no longer supported. If reclassified (e.g., utility -> marketing), billing reflects the new category immediately.

**Appeals:** Users can request category review within 60 days of creation or reclassification.

**Important:** Do NOT submit templates from WhatsApp Manager directly -- they will not sync to your WATI account. Always create through WATI's interface or API.

---

## 3. Sending Messages

### 3.1 Individual Sending (UI)
From the team inbox or contact view, select a contact and send an approved template. Fill in variable values manually for that specific recipient.

### 3.2 Broadcast Campaigns (Bulk Sending via UI)
1. Select an approved template
2. Choose recipients (all contacts, filtered segment, or uploaded list)
3. Fill placeholder values -- either:
   - **Static values** (same for all recipients)
   - **Contact attribute mapping** (auto-fills from stored contact data)
4. Schedule for immediate or future delivery (supports time zones)
5. Send

### 3.3 CSV Upload for Per-Person Variable Mapping
Upload a CSV where each row represents one recipient with their personalized variable values. WATI auto-cleans duplicate/invalid numbers.

**CSV structure (inferred from API + UI docs):**
```csv
whatsappNumber,name,event,venue,hall,date,time,role,hotel,room
919876543210,Dr. Sharma,GEM Summit 2026,Pragati Maidan,Hall A,2026-05-15,09:00 AM,Speaker,Taj Palace,Room 412
919876543211,Prof. Gupta,GEM Summit 2026,Pragati Maidan,Hall B,2026-05-15,10:30 AM,Panelist,ITC Maurya,Room 208
```

Each column after the phone number maps to a template variable in order ({{1}}, {{2}}, etc.) or by named parameter mapping.

### 3.4 Sending via API

**Single message (V1):**
```
POST /api/v1/sendTemplateMessage?whatsappNumber=919876543210
```
```json
{
  "broadcast_name": "gem_conference_reminder",
  "template_name": "gem_event_reminder",
  "channel_number": "919999999999",
  "parameters": [
    {"name": "name", "value": "Dr. Sharma"},
    {"name": "event", "value": "GEM Summit 2026"},
    {"name": "venue", "value": "Pragati Maidan"},
    {"name": "hall", "value": "Hall A"},
    {"name": "date", "value": "2026-05-15"},
    {"name": "time", "value": "09:00 AM"},
    {"name": "role", "value": "Speaker"},
    {"name": "hotel", "value": "Taj Palace"},
    {"name": "room", "value": "Room 412"}
  ]
}
```

**Bulk via API (V1):**
```
POST /api/v1/sendTemplateMessages
```
Body contains array of receivers, each with their own `customParams`:
```json
{
  "receivers": [
    {
      "whatsappNumber": "919876543210",
      "customParams": [
        {"name": "name", "value": "Dr. Sharma"},
        {"name": "event", "value": "GEM Summit 2026"}
      ]
    }
  ]
}
```

**Bulk via CSV (V1):**
```
POST /api/v1/sendTemplateMessageCSV
Content-Type: multipart/form-data
Query params: template_name, broadcast_name
Body: whatsapp_numbers_csv (binary CSV file)
```

**V3 (Recommended for new integrations):**
```
POST /api/ext/v3/messagetemplates/send      -- immediate
POST /api/ext/v3/messagetemplates/schedule   -- scheduled
```

---

## 4. Delivery Status & Logs

### 4.1 Webhook Events for Real-Time Tracking

| Event | Webhook Name | Status |
|-------|-------------|--------|
| Message sent from WATI | `templateMessageSent_v2` | `SENT` |
| Delivered to recipient | `sentMessageDELIVERED_v2` | `Delivered` |
| Recipient opened/read | `sentMessageREAD_v2` | `Read` |
| Recipient replied | `sentMessageREPLIED_v2` | `Replied` |
| User sends inbound message | `messageReceived` | `Received` |
| Sending failed | `templateMessageFailed` | `Failed` |

### 4.2 Webhook Payload Structure
Each event payload contains:
- `eventType` -- identifies the event
- `localMessageId` -- **critical unique ID** linking all status updates for one message
- `statusString` -- human-readable status
- `whatsappMessageId` -- WhatsApp's own message ID
- `timestamp` -- Unix timestamp

Failed messages include `failedCode` and `failedDetail` for troubleshooting.

### 4.3 Building a Message Lifecycle Tracker
Store `localMessageId` when sending. As webhook events arrive, match them by `localMessageId` to build a complete timeline:
```
SENT -> Delivered -> Read -> Replied
         or
SENT -> Failed (with failedCode + failedDetail)
```

### 4.4 API Endpoints for Message Status
```
GET /api/v1/whatsapp/messages/{phoneNumber}/{localMessageId}   -- single message status
GET /api/v1/getmessages/{whatsappNumber}                       -- full conversation history
```

### 4.5 Campaign Analytics (UI)
The broadcast/campaign dashboard shows aggregate metrics:
- Total sent, delivered, read, replied, failed counts
- Per-recipient delivery status
- Campaign-level performance analytics

---

## 5. Contact Management

### 5.1 Contact Storage
Each contact record includes:
- **Name** (required)
- **Country Code** (required)
- **Phone** (required)
- **Custom attributes** -- unlimited key-value pairs (e.g., `role`, `hotel`, `room_number`, `event_name`)
- **Contact status** -- VALID / INVALID
- **Opted-in** status (boolean)
- **Allow broadcast** flag (boolean)
- **Team assignment**
- **Created date**

### 5.2 Importing Contacts

**CSV format requirements:**
| Column | Required | Notes |
|--------|----------|-------|
| Name | Yes | Contact display name |
| CountryCode | Yes | Numeric, e.g., `91` for India |
| Phone | Yes | Without country code prefix |

- Column names must match exactly (case-sensitive, no extra spaces)
- Country code and phone must be in separate columns
- No duplicate contacts in the file

**Import process:**
1. Go to Contacts > Import
2. Upload CSV file
3. Map mandatory columns (Name, CountryCode, Phone)
4. Map optional/custom columns via dropdown search
5. Click Confirm Import

**Integration imports:** Direct import from Salesforce, HubSpot, Google Contacts (via Zapier).

### 5.3 Contact Attributes (Custom Fields)
To add custom attributes to a contact:
1. Go to Contacts > select contact > Edit icon
2. Open "Contact attributes" section
3. Click `+ Add Attribute` > `+ ADD NEW`
4. Enter attribute name (e.g., `hotel`, `room_number`, `event_role`) and value
5. Save

These attributes can be used as:
- Template variable auto-fill during broadcasts
- Segmentation/filtering criteria
- Automation triggers

### 5.4 Segmentation & Groups
WATI supports contact segmentation through:
- **Attribute-based filtering** -- filter contacts by any custom attribute value
- **Broadcast targeting** -- select filtered segments as broadcast recipients
- **Duplicate merging** -- automatic deduplication during import
- No explicit "groups" feature documented; segmentation is attribute-driven

---

## 6. API Reference Summary

### 6.1 Authentication
- **Method:** API Key in request header
- **Header:** `Authorization: Bearer {API_KEY}` (or equivalent token header)
- **Base URL:** `https://live-mt-server.wati.io/{tenant_id}/`

### 6.2 Key Endpoints

| Category | Method | Endpoint (V3 recommended) | Purpose |
|----------|--------|---------------------------|---------|
| **Templates** | GET | `/api/ext/v3/messagetemplates` | List all templates |
| | GET | `/api/ext/v3/messagetemplates/{id}` | Get template by ID |
| | POST | `/api/ext/v3/messagetemplates/send` | Send template message |
| | POST | `/api/ext/v3/messagetemplates/schedule` | Schedule template |
| **Contacts** | POST | `/api/ext/v3/contacts` | Add contact |
| | GET | `/api/ext/v3/contacts` | List contacts |
| | PUT | `/api/ext/v3/contacts` | Update contacts |
| | GET | `/api/ext/v3/contacts/{target}` | Get single contact |
| | GET | `/api/ext/v3/contacts/count` | Count contacts |
| **Messages** | GET | `/api/v1/getmessages/{number}` | Conversation history |
| | GET | `/api/v1/whatsapp/messages/{phone}/{msgId}` | Message status |
| **Legacy** | POST | `/api/v1/sendTemplateMessage` | Send single (V1) |
| | POST | `/api/v1/sendTemplateMessages` | Send bulk (V1) |
| | POST | `/api/v1/sendTemplateMessageCSV` | Send via CSV (V1) |

### 6.3 Postman Collection
Official Postman collection available at: `github.com/ClareAI/wati-postman-collection`

---

## 7. Relevance to GEM India Conference App

### 7.1 Template Design for Conference Notifications

**Recommended template structure for event reminders:**
```
Hi {{1}}, this is a reminder for {{2}}.

Venue: {{3}}
Hall: {{4}}
Date: {{5}}
Time: {{6}}
Your Role: {{7}}

Hotel: {{8}}
Room: {{9}}

We look forward to seeing you!
```

**Variable mapping for our use case:**
| Variable | Parameter Name | Example Value |
|----------|---------------|---------------|
| `{{1}}` | `name` | Dr. Rajesh Sharma |
| `{{2}}` | `event_name` | GEM Summit 2026 |
| `{{3}}` | `venue` | Pragati Maidan, New Delhi |
| `{{4}}` | `hall` | Hall A |
| `{{5}}` | `date` | 15 May 2026 |
| `{{6}}` | `time` | 09:00 AM IST |
| `{{7}}` | `role` | Keynote Speaker |
| `{{8}}` | `hotel` | Taj Palace |
| `{{9}}` | `room_number` | Room 412 |

**Character count consideration:** With 9 variables and typical conference values, the body will be approximately 200-400 characters -- well within the 1024-character Utility limit.

**Category recommendation:** Use **Utility** for event reminders and logistics (lower cost, higher delivery priority). Use **Marketing** only for promotional announcements.

### 7.2 Bulk Sending Strategy
1. Store all attendee data as contact attributes in WATI (name, role, hotel, room, etc.)
2. Create a broadcast campaign selecting the approved template
3. Map template variables to contact attributes for automatic per-person personalization
4. Alternatively, generate a CSV from the conference database and use the CSV upload endpoint

### 7.3 Delivery Monitoring
- Register webhooks for all 6 event types
- Track `localMessageId` per attendee
- Build a dashboard showing: total sent, delivered, read, failed
- Auto-retry or flag failed messages for manual follow-up

### 7.4 Integration Architecture
```
Conference App DB
    |
    v
API Layer (our backend)
    |
    v
WATI API (V3)
    POST /api/ext/v3/messagetemplates/send
    |
    v
WhatsApp Business API (Meta)
    |
    v
Attendee's WhatsApp
    |
    v
Webhook callbacks -> Our backend -> Status dashboard
```

---

## 8. Key Limitations & Considerations

| Concern | Detail |
|---------|--------|
| **Approval delay** | Templates take 30 min to 24 hours for Meta approval; submit well before events |
| **Category reclassification** | Meta may auto-reclassify templates (e.g., utility to marketing), changing billing |
| **Variable count** | Too many variables relative to static text may cause rejection |
| **Template cannot start/end with variable** | Must have static text before first and after last variable |
| **Marketing character limit** | Only 550 chars for marketing templates (vs 1024 for utility) |
| **24-hour messaging window** | Outside the window, only approved templates can be sent (no free-form) |
| **Opt-in required** | Contacts must have opted in to receive broadcast messages |
| **Rate limits** | WhatsApp API rate limits apply; see WATI blog on rate limit management |
| **No native groups** | Segmentation is attribute-based, not folder/group-based |

---

## Sources

- [WATI.io Main Site](https://www.wati.io)
- [WATI Features](https://www.wati.io/features)
- [WATI API Documentation](https://docs.wati.io)
- [How to Create Your First Template Message](https://support.wati.io/en/articles/11462953-how-to-create-your-first-template-message)
- [Template Formatting Guidelines](https://support.wati.io/en/articles/11463458-whatsapp-template-message-guidelines-naming-formatting-and-translations)
- [Meta Template Approval Updates](https://support.wati.io/en/articles/12320234-understanding-meta-s-latest-updates-on-template-approval)
- [Tracking Template Message Delivery via Webhooks](https://support.wati.io/en/articles/11463225-how-to-track-template-message-delivery-and-status-using-wati-webhooks)
- [Importing Contacts to WATI](https://support.wati.io/en/articles/11463441-how-to-import-contacts-in-wati)
- [Send Template Message API](https://docs.wati.io/reference/post_api-v1-sendtemplatemessage)
- [Send Template Messages CSV API](https://docs.wati.io/reference/post_api-v1-sendtemplatemessagecsv)
- [WATI API Guide](https://support.wati.io/en/articles/11462487-wati-api-guide)
- [WATI Postman Collection (GitHub)](https://github.com/ClareAI/wati-postman-collection)
- [How to Send Bulk WhatsApp Messages](https://www.wati.io/en/blog/send-bulk-whatsapp-messages/)
- [WhatsApp Template Guide](https://www.wati.io/en/blog/whatsapp-template/)
- [Interactive WhatsApp Message Templates](https://www.wati.io/blog/whatsapp-business-interactive-message-templates/)
- [Using Predefined Variables in WATI Shopify App](https://support.wati.io/en/articles/11463114-using-predefined-variables-in-wati-shopify-app-template-messages)
- [General FAQs: Template Messages](https://support.wati.io/en/articles/12033067-general-faqs-template-messages)
- [Contact Attributes in WATI](https://support.wati.io/en/articles/11463439-how-to-add-contact-attributes-to-a-contact-in-wati)
