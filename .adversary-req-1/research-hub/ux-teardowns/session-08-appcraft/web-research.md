# Session 8: AppCraft Events -- Web Research
**Platform:** AppCraft Events
**Research date:** 2026-04-05
**Sources:** appcraft.events, industry comparisons (RoomTrust, MeetingMax, EventPipe, Mews)

---

## 1. Platform Overview

AppCraft Events is a comprehensive B2B event management SaaS platform serving 1,500+ event planners. It offers 150+ features organized across modules including registration, logistics, hospitality, mobile apps, interactivity, gamification, networking, and carbon footprint measurement. The platform claims to save organizers approximately 2 hours daily on administrative tasks.

Three tiers: **EXPRESS** (autonomous/DIY), **PREMIUM** (full support for one-off events), **AGENCY** (tailored for event professionals).

Key differentiator: Deep integration between participant CRM, rooming management, logistics/transport, and mobile app -- all modules share the same participant database, eliminating manual re-entry.

---

## 2. Rooming List Management

### Room Assignment Fields
- Hotel name (multiple hotels per event supported)
- Room type (standard, suite, sea view, etc.)
- Room number (assigned after confirmation)
- Roommate name (self-selected or admin-assigned)
- Check-in date
- Check-out date
- Special notes (dietary requirements, accessibility needs)
- Participant profile link (connected to registration data)

### Grid/Table View Interface
- **Spreadsheet-like "Grid View"** for all room assignments
- Supports filtering, sorting, and bulk editing
- Centralized database eliminates version control issues from Excel workflows
- All users work on the same live data -- no conflicting file versions
- Admin can manipulate data "as quickly as you would in a spreadsheet, but with the security of a centralized database"

### Assignment Mechanisms
1. **Self-selection by participant:** Guests search and select their own roommate from the registrant list during registration or via their personal space
2. **Admin manual assignment:** Organizer assigns individual or multiple participants to rooms
3. **Batch/smart assignment:** System auto-assigns remaining unmatched participants using rules based on department, country, gender, or randomization
4. **Profile-based restrictions:** VIP/management profiles can be restricted to or given exclusive access to specific hotels and room types (e.g., suites visible only to VIP category)

---

## 3. Multi-Hotel and Quota Management

### Multi-Hotel Support
- Unlimited hotels per event
- Each hotel configured independently with its own room inventory
- Per-hotel, per-room-type quota definition
- Organizer enters availability data in back office: number of hotels, rooms per hotel, capacity by day

### Quota Tracking
- **Real-time occupancy monitoring** across all properties
- Dashboard shows reservations by hotel, room type, date range, and occupancy level
- **Visual indicators:** Fully booked rooms/hotels highlighted with **orange boxes** in admin dashboard
- When quota is reached, hotel/room type displays as "fully booked" to participants, preventing overbooking
- Organizers can **increase room quotas at any time** via the back office

### Fixed vs. Flexible Date Modes
- **Flexible dates:** Participants check individual nights on a calendar-style interface (non-consecutive nights supported)
- **Fixed dates:** Participants select consecutive arrival/departure date range; system shows available inventory for entire stay
- Note: Both modes cannot operate simultaneously for the same event

### Quota Data Export
- Exportable to **Excel format** for detailed analysis and logistics planning

---

## 4. Hotel Sharing Links

### Dynamic Sharing Mechanism
- Generate a **unique HTTPS link per hotel partner**
- Hotelier views a **filtered, secure version** of the rooming list through the link
- Updates reflect **immediately** when organizer makes changes -- no manual re-sending
- Eliminates the traditional workflow of exporting Excel files, emailing them, and tracking versions

### GDPR Compliance
- Sensitive personal data (passports, dietary requirements) not transmitted via unencrypted email
- Secure HTTPS links ensure data protection
- Filtered views mean hotels only see data relevant to them

### Rooming List Output
- Generates "clean, legible, and complete rooming lists" including dietary requirements and special notes
- Ready for hotel submission with a single click
- Connected directly to registration data -- no manual re-entry

---

## 5. Participant View (Mobile App + Web)

### Accommodation Details Displayed to Participant
- Room number
- Roommate's name
- Hotel name and address
- Information sent **automatically via mobile app** once room is confirmed

### Self-Service Capabilities
- Available **online 24 hours** for participants to:
  - Choose their hotel from available options
  - Select a roommate from the registrant list
  - View room types and rates
  - Make reservations directly
- Creates immediate engagement and reduces last-minute email requests

### Unified Digital Roadmap
- Participants access a single-click view combining:
  - Hotel confirmation
  - Flight terminal information
  - Room number
  - Shuttle schedule
- Eliminates the need to search through emails for different pieces of logistics info

---

## 6. Logistics and Transport Integration

### Flight Tracking (Amadeus Integration)
- Connected to **Amadeus GDS** for flight data
- Participants enter flight details with "simplified entry and instant validation"
- System validates flight information in real-time against Amadeus database
- Flight data used to auto-group attendees by arrival/departure windows

### Shuttle and Transfer Coordination
- System **automatically segments participant groups** based on flight schedules
- Groups attendees arriving in similar time windows for shared transfers
- Each attendee receives transfer notifications with:
  - Meeting time
  - Meeting place
  - Transport details
- Notifications pushed via mobile app

### Pre-Transfer Notifications
- Automated alerts sent before each transfer
- Include logistics details (time, meeting point)
- Centralized within the mobile app -- no separate communication needed

---

## 7. Cross-Module Linkage: Travel + Accommodation + Transport

This is the critical architectural pattern for GEM:

### How AppCraft Links Everything Per Person
1. **Registration** creates the participant record in the CRM
2. **Flight data** attached to participant (via Amadeus-validated entry)
3. **Accommodation** assigned to same participant (hotel, room, roommate, dates)
4. **Transport/shuttle** auto-calculated from flight arrival time
5. **Mobile app** surfaces all of the above in a unified participant dashboard

### Dynamic Group Segmentation (CRM-Driven)
- The CRM creates **segments based on participation status and preferences**
- Segments drive automatic room and transfer assignments
- When segment criteria change (e.g., a participant changes their flight), groups update automatically
- Logistics teams receive **alerts when changes affect assignments**

### Change Cascade Pattern
- Participant changes flight --> system can flag that shuttle assignment may need updating
- Room assignment change --> notification to participant and hotel (via dynamic link)
- Registration status change --> can trigger room release or reassignment

### Centralized Task Management
- To-do system structures tasks by event phase
- Drag-and-drop prioritization
- Task assignment to colleagues and service providers
- Email reminders for pending tasks

---

## 8. Change Management and Alerts

### Organizer-Side Alerts
- Real-time updates when participants change their own data (flight, roommate preference)
- Dynamic CRM segments trigger alerts when changes affect logistics
- Dashboard flags for rooms approaching or exceeding quota (orange box indicator)

### Participant-Side Notifications
- Automatic mobile push when room is confirmed
- Shuttle schedule notifications before transfer
- Flight terminal and logistics info in unified view

### Hotel-Side Updates
- Dynamic sharing links update in real-time -- no manual notification needed
- Hotels always see current rooming list data

---

## 9. Export Capabilities

| Data Type | Format | Notes |
|---|---|---|
| Rooming list (for hotels) | Dynamic link / single-click export | Clean, legible, includes special notes |
| Quota/occupancy data | Excel | By hotel, room type, date range |
| Participant data | Connected to registration export | Via CRM module |
| Logistics data | Not explicitly documented | Likely available via CRM export |

---

## 10. UX Patterns Worth Noting for GEM App

### What Works Well
- **Single participant record** that connects registration, travel, accommodation, and transport
- **Self-service roommate selection** reduces admin workload dramatically
- **Smart batch assignment** with rules (department, country, gender) for remaining unmatched participants
- **Real-time quota visualization** with color-coded indicators prevents overbooking
- **Dynamic hotel sharing links** eliminate the Excel-email-version-control nightmare
- **Amadeus flight validation** ensures clean flight data entry
- **Unified mobile dashboard** gives participant everything in one place

### Design Patterns to Consider

| Pattern | AppCraft Implementation | GEM App Relevance |
|---|---|---|
| Grid view for room assignments | Spreadsheet-like with filter/sort/bulk-edit | Room assignment management for delegates |
| Self-service roommate selection | Participant picks from registrant list | Delegate preference collection |
| Visual quota indicators | Orange boxes for fully booked | Dashboard showing room availability |
| Dynamic sharing links | HTTPS per-hotel with auto-updates | Share rooming list with hotel partners |
| Amadeus flight validation | Real-time validation on entry | Validate delegate flight details |
| Auto-grouping by arrival time | Flight schedule drives shuttle groups | Group delegates for airport pickups |
| Unified participant dashboard | Hotel + flight + shuttle in one view | Delegate sees all their logistics |
| Profile-based room restrictions | VIP sees suites, others see standard | Delegate category drives hotel options |
| Batch smart assignment | Rules-based auto-assignment | Fill remaining rooms efficiently |
| Calendar date picker (flex/fixed) | Individual nights or date range | Check-in/check-out selection |

### Limitations / Gaps
- Fixed vs. flexible date modes cannot coexist for same event
- Flight-to-accommodation linkage exists but **change cascade automation** specifics are unclear -- may still require manual intervention
- No explicit mention of room-level detail like floor, bed configuration, or accessibility features in the standard view
- Export formats appear limited to Excel; no API-driven integrations for rooming data documented
- Shuttle capacity management (max seats per vehicle) not explicitly described

---

## 11. Relevance to GEM Accommodation Module

**Direct patterns to adopt:**
- Grid view with filter/sort/bulk-edit as the primary admin interface for room assignments
- Per-person record linking: registration --> travel --> accommodation --> transport
- Self-service roommate selection during registration
- Smart batch assignment with configurable rules for unmatched participants
- Real-time quota tracking with visual indicators (color-coded occupancy)
- Dynamic sharing links for hotel partners (GDPR-compliant, auto-updating)
- Unified participant mobile view: room + flight + shuttle in one place
- Automated shuttle grouping based on flight arrival times

**Gaps GEM must fill that AppCraft does not explicitly address:**
- Visa status tracking linked to accommodation (no visa = hold room assignment)
- Invitation letter generation linked to hotel booking dates
- Multi-currency room rate display for international delegates
- Dietary/accessibility preferences surfaced to hotel (beyond "special notes" text field)
- Transport from hotel to venue (not just airport-to-hotel shuttle)
- Session schedule awareness in accommodation (early session = closer hotel preference)

---

## 12. Industry Context: Rooming List UX Patterns

From broader industry research (RoomTrust, MeetingMax, EventPipe, Mews):

- Modern rooming list software universally moves away from Excel toward **centralized web-based grid views**
- Key fields across all platforms: guest name, arrival date, departure date, room type, special requests, payment info
- **Smart rooming lists** within reservation management software are the standard expectation
- Advanced platforms offer **rules engines** for hiding/displaying room types based on participant category
- **Real-time quota monitoring** with visual status indicators is a baseline feature
- Room block management in one place with "simple and clear visual display" is the aspired UX

---

## Sources
- [AppCraft Events - Main Site](https://www.appcraft.events/en/)
- [AppCraft - Rooming List Feature](https://www.appcraft.events/en/our-event-features/event-rooming-list/)
- [AppCraft - Event Logistics](https://www.appcraft.events/en/our-event-features/event-logistics/)
- [AppCraft - Room Quota Management](https://www.appcraft.events/en/module/event-room-quota-management/)
- [EventPipe - Rooming Lists Guide](https://eventpipe.com/blog/rooming-lists)
- [Mews - Hotel Rooming List Guide](https://www.mews.com/en/blog/hotel-rooming-list)
- [RoomTrust - Group Accommodation Software](https://roomtrust.com/software.html)
- [MeetingMax - Room Block Management](https://meetingmax.cc/product/)
