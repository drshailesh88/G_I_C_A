# pretalx — Platform Overview

Research by Worker 2 | 2026-04-05

---

## A. Platform Overview

### What Is It?

pretalx is an open-source conference management tool focused on the submission-to-schedule pipeline: Call for Participation (CfP), peer review, speaker management, schedule editing, and publishing. It does NOT handle registration or ticketing (those are delegated to companion tools like pretix).

### Who Maintains It?

- **Primary maintainer:** Tobias Kunze (GitHub: rixx), based in Germany
- **Organization:** pretalx org on GitHub
- **Funding:** Patreon (patreon.com/rixx), hosting fees on pretalx.com
- **Contributors:** 159 on GitHub

### License

- Apache 2.0 (permissive, commercial-friendly)
- Dual model: self-host free, or pay for hosted instance on pretalx.com

### Maturity

- **GitHub stars:** 891
- **Forks:** 247
- **Commits:** 7,670+
- **Releases:** 36 (latest: v2025.2.2, Dec 2025)
- **Active development:** commits within hours (as of research date)
- **Used by:** FOSDEM, many PyCon events, tech conferences worldwide
- **Documentation:** Comprehensive (docs.pretalx.org), well-maintained

### Tech Stack

| Component | Technology |
|-----------|-----------|
| **Backend** | Python 3 / Django |
| **Frontend** | Server-rendered HTML + Vue.js (schedule editor) |
| **Database** | PostgreSQL (recommended), MySQL, SQLite |
| **Languages** | Python 83.8%, HTML 8.8%, JS 3.2%, CSS 3.0%, Vue 1.1% |
| **API** | REST (DRF), OpenAPI 3.0 schema |
| **Schedule format** | Frab-compatible JSON (c3voc schema) |
| **Package** | PyPI (pip install pretalx) |
| **Dependencies** | Redis (caching), Celery (async tasks) |

---

## B. Core Features

### Event/Conference Creation

- **Organiser hierarchy:** Organiser > Teams > Events
- **Event setup fields:** Name, slug, dates, timezone, locale(s), logo, primary color, custom CSS
- **Copy settings** from previous events (tracks, review config, email templates, venue)
- **Multi-language support:** Event and CfP can be configured in multiple languages

### Call for Papers / Abstract Submission

- **Configurable CfP form** with drag-and-drop field ordering, live preview
- **Built-in fields:** Title (required), Session type, Abstract, Description, Track, Duration, Content locale, Additional speakers
- **Speaker profile fields:** Name, Biography, Profile picture (crop-to-square), Availability (visual calendar widget)
- **Custom fields:** Text, multi-line, number, URL, date, datetime, yes/no, file upload, single-select, multi-select
- **Field scoping:** Custom fields can target specific tracks or session types
- **Access codes:** Extend deadlines, grant access to restricted tracks/types
- **Multiple deadlines:** Per session type, overriding global CfP deadline
- **Submission wizard:** Multi-step (General > Questions > Account > Profile > Done)

### Review & Selection Workflow

- **Review phases:** Configurable phases (e.g., Review > Selection), one active at a time
- **Score categories:** Weighted, with customizable labels (0-4 scale typical)
- **Aggregation:** Median or mean across reviewers
- **Anonymisation:** Hide speaker names, create redacted proposal text, hide reviewer identities
- **Track-based assignment:** Restrict reviewers to specific tracks
- **Individual assignment:** Assign specific reviewers to proposals (manual or CSV)
- **Proposal visibility:** All proposals or assigned-only
- **Review dashboard:** Sortable table with scores, accept/reject buttons
- **Bulk operations:** Accept/reject with pending states, apply all at once
- **Review modes:** Detail view (one-at-a-time with "Save and next") or Bulk view (table)

### Schedule/Timetable Management

- **Drag-and-drop schedule editor** — the crown jewel
- **Rooms as columns,** time as rows
- **Grid intervals:** 5, 15, 30, or 60 minutes (adjustable)
- **Sidebar:** Unscheduled sessions panel; drag onto grid
- **Modes:** Expanded (full preview) and Condensed (compact working view)
- **Breaks:** Publicly visible (coffee, lunch), "Copy to other rooms"
- **Blockers:** Internal-only time reservations
- **Version control:** WIP schedule + named release snapshots
- **Public changelog:** RSS feed of schedule changes
- **Conflict detection warnings:**
  - Session outside room availability
  - Speaker unavailable at scheduled time
  - Room overlap (two sessions same room/time)
  - Speaker double-booked (same speaker, two rooms, same time)
- **Schedule widget:** Embeddable JavaScript for external websites

### Speaker Management

- **Speaker profiles:** Name, bio, photo, social media links (with platform icons)
- **Availability:** Visual calendar widget, intersection for multi-speaker sessions
- **Session lifecycle:** Submitted > Accepted > Confirmed > (on schedule)
- **Pending states:** Invisible to speakers, apply in bulk
- **Multiple speakers per session:** Any number, add/remove at any time

### Registration & Ticketing

- **NOT included** in pretalx itself
- Designed to work alongside **pretix** (same developer) for ticketing
- CSV speaker export for pretix voucher integration

### Multi-Track / Multi-Day Support

- Full support for multiple tracks (color-coded)
- Multi-day events with day tabs
- Multiple rooms with column layout
- Timezone-aware schedule display (auto-converts to attendee's timezone)

---

## C. India-Specific Fit

### Localization / Multi-Language

- Built-in i18n (English, German natively; community translations)
- Multi-language CfP (speakers choose content locale)
- Multi-language email templates
- RTL support unknown — likely needs testing

### Payment Gateway Integration

- N/A (no payment handling in pretalx itself)
- Would need pretix or custom integration for Razorpay/UPI

### Mobile Responsiveness / PWA

- **Responsive design** but NOT a PWA
- Schedule grid does NOT reflow well to mobile (columns become cramped)
- Sessions list view is a better mobile alternative (linear layout)
- No native app; web-only
- "Jump to now" floating button is mobile-friendly

### Offline Capability

- **None** — fully server-dependent
- Static HTML export could work for offline schedule viewing
- Schedule JSON could be cached client-side for a custom app

### Scalability

- Django/PostgreSQL stack scales well for thousands of attendees
- Schedule JSON export is lightweight
- API has pagination for large datasets
- Hosting on pretalx.com handles infrastructure

---

## D. Extensibility

### Plugin/Extension Architecture

- Django plugin system (pretalx plugins on PyPI)
- Plugins can add: new views, export formats, custom questions, integrations
- Active plugin ecosystem (e.g., pretalx-venueless for video, pretalx-pages for CMS)

### API Completeness

- **REST API** with OpenAPI 3.0 schema
- **Endpoints:** Events, submissions, speakers, reviews, schedule, rooms, tracks, tags, questions/answers
- **Authentication:** Token-based (API tokens from user settings)
- **Public endpoints:** Schedule JSON, speaker list, session details (no auth needed)
- **Authenticated endpoints:** Submissions, reviews, email management
- **Pagination:** Offset-based with configurable page size
- **Filtering:** By state, track, session type, etc.
- **No webhooks** — must poll for changes
- **No GraphQL** — REST only

### Schedule JSON Format

Uses the Frab-compatible c3voc schema. Sample structure:

```json
{
  "$schema": "https://c3voc.de/schedule/schema.json",
  "generator": {"name": "pretalx", "version": "2026.1.0.dev0"},
  "schedule": {
    "version": "v1.12",
    "conference": {
      "acronym": "democon",
      "title": "DemoCon",
      "start": "2026-04-05",
      "end": "2026-04-07",
      "daysCount": 3,
      "timeslot_duration": "00:05",
      "time_zone_name": "Asia/Manila",
      "colors": {"primary": "#3aa57c"},
      "rooms": [
        {"name": "Magenta Room", "slug": "131-magenta-room", "description": "...", "capacity": null}
      ],
      "tracks": [
        {"name": "Realigned & co", "slug": "89-realigned-co", "color": "#3B01AA"}
      ],
      "days": [{
        "index": 1,
        "date": "2026-04-05",
        "day_start": "2026-04-05T04:00:00+08:00",
        "day_end": "2026-04-06T03:59:00+08:00",
        "rooms": {
          "Magenta Room": [/* talk objects */],
          "Khaki Room": [/* talk objects */]
        }
      }]
    }
  }
}
```

**Talk object keys:** guid, code, id, logo, date, start, duration, room, slug, url, title, subtitle, track, type, language, abstract, description, recording_license, do_not_record, persons (speakers array with code/name/avatar/biography/public_name/guid/url), links, feedback_url, origin_url, attachments

### Customization Difficulty

- **Theming:** Custom logo, primary color, custom CSS upload
- **Custom domain:** Supported on pretalx.com and self-hosted
- **Template overrides:** Django template system for deep customization
- **Branding:** Moderate effort for custom look; significant effort for major UI changes

### Self-Hosting Requirements

- Python 3.9+, PostgreSQL, Redis, web server (nginx/Apache)
- Docker image available
- Celery for background tasks
- Documentation: comprehensive administrator guide
- Moderate complexity — similar to other Django applications

---

## E. Gaps & Risks

### What's Missing for Our Use Case

1. **No registration/ticketing** — must use separate tool (pretix) or build custom
2. **No native mobile app** — web-only, schedule grid poor on small screens
3. **No offline capability** — fully online
4. **No video/live streaming integration** built-in (plugin needed: pretalx-venueless)
5. **No attendee features** — no networking, Q&A, polls, gamification
6. **No payment handling** — no Razorpay/UPI integration possible within pretalx
7. **No webhooks** — must poll API for changes
8. **No push notifications** — email-only communication
9. **No certificate generation** — not built in
10. **No poster/abstract book generation** — no PDF export of program book

### Known Limitations

- Schedule editor requires full desktop browser (not touch-friendly)
- Vue.js schedule editor is complex custom code (hard to extend)
- Email system is powerful but email-only (no SMS, no WhatsApp, no in-app notifications)
- No built-in analytics or reporting dashboard
- Review system is per-event (no cross-event reviewer database)

### Community Health / Risk of Abandonment

- **Low risk** — actively maintained by dedicated developer
- Single primary maintainer (rixx) is both strength (consistent vision) and risk (bus factor = 1)
- 159 contributors but most are occasional
- Funded by hosting revenue + Patreon (sustainable model)
- Used by major conferences (FOSDEM, PyCons) — strong user base

---

## Pricing (pretalx.com Hosted)

| Attendees | Ticket Price | Cost |
|-----------|-------------|------|
| 0-100 | EUR 0-100 | EUR 199 |
| Higher tiers | Sliding scale | Increases with size |

- **Free testing** — create event, explore all features, pay only before going public
- **25% discount** for community/non-profit events
- **Self-hosted:** Free (open source)
