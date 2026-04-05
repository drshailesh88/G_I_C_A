# Session 7: TravelPerk -- Web Research
**Platform:** TravelPerk (now rebranded as Perk)
**Research date:** 2026-04-05
**Sources:** travelperk.com / perk.com, TravelPerk Support Center, G2/Capterra reviews, Research.com

---

## 1. Platform Overview

TravelPerk (rebranded to Perk in 2025-2026) is a corporate travel management platform founded in 2015. It describes itself as "The intelligent platform for travel and spend." The platform consolidates flight booking, hotel reservations, ground transport, itinerary management, expense tracking, and reporting into a single interface. It also acquired Yokoy (spend management).

Key differentiator: TravelPerk combines a consumer-grade booking UX with enterprise-grade admin controls, approval workflows, and policy enforcement.

---

## 2. Itinerary View Layout

### Per-Trip Itinerary Display
- Each trip has a dedicated itinerary page showing a **breakdown of every booking item** within that trip
- Items display their current **status**: being finalized, awaiting approval from travel manager, or confirmed
- The itinerary aggregates flights, hotels, car rentals, and rail into a **unified timeline view** per trip
- Travelers see their full itinerary without needing to check multiple accounts or search through emails
- Multi-leg trips can be booked and viewed together (booking a multi-leg trip takes under 5 minutes per user reports)

### Booking Detail Fields (Per Segment)
- **Flights:** Departure city/airport, arrival city/airport, departure date/time, arrival date/time, airline, flight number, booking reference/PNR, seat assignment, cabin class
- **Hotels:** Hotel name, address, check-in date, check-out date, room type, confirmation number
- **Rail:** Station, departure/arrival times, operator, booking reference
- **Car rental:** Provider, pickup/drop-off location, dates, confirmation number

### Document Attachments
- Travel documents (passport, national ID card, TSA PreCheck) can be stored in traveler profiles
- Documents are associated with the traveler and auto-applied to relevant bookings
- E-ticket PDFs and confirmation documents are generated and accessible from the itinerary view

---

## 3. Traveler Profile Fields

### Standard Profile Fields
- Full name (first, middle, last)
- Date of birth
- Sex/gender
- Country of residence
- Contact information (email, phone)
- Loyalty/frequent flyer program numbers
- Personal payment cards (for booking)

### Travel Documents Stored
- Passport (number, issuing country, expiry date)
- National ID card
- TSA PreCheck / Known Traveler Number
- Documents are linked to the profile and used during booking

### Custom Profile Fields
- Admins can create **free-text custom fields** on user profiles
- Used for unique identifiers from external systems (e.g., employee number, ERP ID, cost center code)
- Custom fields can be **imported via CSV** for bulk updates
- Custom fields appear in reports but **cannot be modified during the booking flow**
- Two types: **User profile fields** (static on profile) and **Booking flow fields** (filled at time of booking)

### Travel Policy Assignment
- Each traveler is assigned a travel policy
- Approval process configuration per traveler
- Cost center assignment
- Travel manager assignment (admins can add/remove travelers assigned to specific travel managers)

---

## 4. Admin / Travel Manager Dashboard

### Trip Management View
- Travel managers see a **Trips page** listing all trips for their assigned travelers
- Trips can be filtered, reviewed, changed, or cancelled
- Each trip shows status (upcoming, in-progress, completed, cancelled)
- Admins can manage any trip; travel managers see only their assigned travelers

### People Management
- Admin view of all company travelers with profile data
- **Export capability:** CSV or XLS file export of people data, with option to export filtered subset or all data
- Bulk operations via CSV upload for adding travelers and updating profile fields

### Interactive Map Tracking
- Managers can monitor **traveler locations and trip progress** on a global map
- Real-time visibility into where travelers currently are

### Access Roles
- **Admin:** Full access to all settings, reports, trips, and people
- **Travel Manager:** Oversight of assigned travelers' trips and approvals
- **Analyst:** Access to reporting and analytics
- **Traveler:** Self-service booking within policy, view own itineraries

---

## 5. Group Travel & Events (Perk Events)

### Event Creation and Attendee Management
- Anyone in the organization can create an event
- **Invite attendees** and track responses and booking status
- Unlimited attendee capacity within company accounts
- Dedicated for groups of 10+ travelers, hotel blocks of 9+ rooms, meetings 2-50 people, conferences 50-1000+

### Shared Visibility
- All participants' travel plans visible in one place: arrival/departure times, accommodation details
- Participants can see each other's trip details (sensitive data like pricing is excluded)
- Shared trip details include attendee names, logistics, agendas, and itineraries

### Communication
- Centralized updates when plans change
- Attendees kept informed about logistics and schedule changes
- Eliminates fragmented email threads for event coordination

### Coordination UX Pattern
- Acts as a "one-stop destination" for event travel management
- Consolidates attendee management, booking, and scheduling
- Admin sees aggregate view of who is arriving when, where they are staying

---

## 6. Summary Views and Aggregation

### Reporting Dashboard
- **Flexible reporting** covering every aspect of business travel
- Data breakdowns available by:
  - Individual traveler
  - Transport type (flight, hotel, rail, car)
  - Booking type
  - Cancellations
  - Recoverable VAT
  - Cost distribution across teams, transport modes, trip locations
- **Budget performance metrics:** Under/over budget indicators
- **Carbon footprint reporting:** CO2 emissions by flight routes and hotel stays (Green Trip feature)
- **VAT recovery insights** with year-end savings predictions

### Export Formats
- All reports exportable as **CSV or PDF**
- People data exportable as **CSV or XLS**
- Custom report configuration: select specific data columns
- Scheduled reports: automated delivery at user-defined frequency and time

### Real-Time Alerts
- Travel incident alerts for ongoing or upcoming trips
- Flight delay, cancellation, and gate change notifications pushed to travelers
- Configurable alert thresholds for admin monitoring

---

## 7. Notification System

### Traveler Notifications
- **Booking confirmation email** with full details including passenger name and booking reference (PNR)
- **Check-in reminder** sent 24 hours before flight departure to both booker and all travelers on the trip
- **Real-time flight updates:** Delays, cancellations, gate changes pushed to travelers
- **Itinerary change alerts:** Notifications sent to booker and all travelers when changes or cancellations occur

### Admin/Manager Notifications
- Approval request notifications when travelers book outside policy
- Trip change and cancellation alerts
- Scheduled report delivery via email
- Travel incident alerts for active trips

---

## 8. UX Patterns Worth Noting for GEM App

### What Works Well (Per User Reviews)
- **Clean, frictionless booking flow** that fits into daily routines
- **Single-page itinerary** that eliminates email searching
- **Mobile app** rated as user-friendly, convenient for quick changes on the go
- **New employee onboarding:** Can trigger flows, gain approvals, and access itineraries without training
- **Fast confirmations** with clear overviews

### Design Patterns to Consider
| Pattern | TravelPerk Implementation | GEM App Relevance |
|---|---|---|
| Status badges per booking item | Finalized / Awaiting Approval / Confirmed | Show ticket status per delegate |
| Unified trip timeline | All segments (flight + hotel + car) on one page | Travel + accommodation + transport per person |
| Shared event itinerary | Participants see each other's plans | Delegates see fellow attendees' arrival info |
| 24h check-in reminder | Auto-sent to traveler and booker | Auto-remind delegates before departure |
| CSV bulk import | Upload traveler data in bulk | Bulk import delegate travel details |
| Custom profile fields | Employee ID, cost center, ERP codes | Delegate ID, organization, dietary needs |
| Role-based access | Admin / Travel Manager / Analyst / Traveler | Coordinator / Module Lead / Delegate |
| Map-based traveler tracking | Global map showing traveler locations | Not essential but interesting for large events |

### Limitations / Gaps
- Group travel/events features require **Premium subscription** and manual email requests to events@travelperk.com
- No native "event rooming list" -- hotels are booked individually per person
- No built-in roommate matching or room assignment grid
- Limited linkage between travel segments and accommodation for the same event context
- Custom fields are free-text only; no dropdowns, dates, or structured field types mentioned

---

## 9. Relevance to GEM Travel Module

**Direct patterns to adopt:**
- Per-person itinerary card showing all travel segments with status indicators
- Booking detail fields: departure/arrival city, date/time, airline, PNR, ticket number
- Document attachment capability (ticket PDF, e-ticket)
- Admin summary view: aggregate arrivals by date ("5 arriving March 10")
- Notification triggers: confirmation, 24h reminder, change alerts
- CSV/Excel export of traveler data with customizable columns
- Role-based visibility (coordinator sees all, delegate sees own + fellow attendees)

**Gaps GEM must fill that TravelPerk does not:**
- Direct linkage between travel record and accommodation record for same person
- Room assignment and rooming list management (handled by AppCraft pattern)
- Transport/shuttle assignment based on arrival time grouping
- Visa and invitation letter tracking per delegate
- Multi-event context (delegate attends specific sessions, not just "a trip")

---

## Sources
- [TravelPerk / Perk main site](https://www.perk.com/)
- [Perk Events - Meetings Management](https://www.perk.com/travel-solutions/events-meetings-management/)
- [Perk Travel Management Reporting](https://www.perk.com/travel-solutions/travel-management-reporting/)
- [TravelPerk Support: Custom Fields](https://support.travelperk.com/hc/en-us/articles/8665135144220-Add-traveler-information-to-custom-fields)
- [TravelPerk Support: User Profile Custom Fields](https://support.travelperk.com/hc/en-us/articles/8664874564508-User-profile-and-Booking-flow-custom-fields)
- [TravelPerk Support: Travel Documents](https://support.travelperk.com/hc/en-us/articles/115015903408-Add-a-travel-document-to-TravelPerk-passport-ID-card-or-TSA)
- [TravelPerk Support: Group Travel and Events](https://support.travelperk.com/hc/en-us/articles/360024807251-Book-group-travel-and-events)
- [TravelPerk Support: Getting Started for Travel Managers](https://support.travelperk.com/hc/en-us/articles/5520799199260-Getting-started-for-Travel-Managers)
- [TravelPerk Review 2026 - Research.com](https://research.com/software/reviews/travelperk)
- [Perk Group Bookings](https://www.perk.com/travel-solutions/group-bookings/)
