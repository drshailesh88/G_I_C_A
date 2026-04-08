# Indico (CERN) — Comprehensive Documentation Summary

**System:** Indico — CERN's conference management system  
**Used by:** UN (180,000+ participants), CERN (900,000+ events)  
**Documentation source:** https://indico.docs.cern.ch/  
**Open source:** https://github.com/indico/indico  

---

## System Architecture Overview

Indico is organized into three event types:
1. **Lectures** — simple single-session events
2. **Meetings** — multi-item agendas with contributions
3. **Conferences** — full-featured with abstracts, papers, registration, timetable, badges

All events are organized within **Categories** (hierarchical folder structure).

---

## Complete Conference Lifecycle

### Phase 1: Setup
1. Create conference event (title, dates, location)
2. Define **Programme Tracks** (subject categories)
3. Configure **Call for Abstracts** (submission settings, review questions, contribution types)
4. Set up **Registration** (form builder, payment, accommodation, invitations)

### Phase 2: Submissions
5. Open Call for Abstracts → authors submit
6. Open Registration → attendees register (with accommodation, payment)
7. **Reviewers** review abstracts → **Judges** accept/reject
8. Accepted abstracts → auto-create **Contributions**

### Phase 3: Scheduling
9. Create **Sessions** (groupings by topic)
10. Create **Session Blocks** (time slots within sessions)
11. Build **Timetable** (drag-and-drop scheduling of contributions into blocks)
12. Add **Breaks** (lunch, coffee)
13. **Publish** timetable (toggle Draft mode off)

### Phase 4: Papers
14. Open **Call for Papers** → authors submit papers for accepted abstracts
15. **Content reviewers** and **Layout reviewers** review papers
16. **Judges** accept/reject/request corrections
17. Accepted papers published in contributions

### Phase 5: On-site
18. **Check-in** registrants
19. **Print Badges** (from registration list)
20. **Generate Documents** (certificates, receipts from templates)

---

## Key Feature Inventory

### Registration System
| Feature | Details |
|---------|---------|
| **Form builder** | 16 field types including Accommodation, Accompanying Persons |
| **Sections** | Custom sections with manager-only visibility option |
| **Drag-and-drop** | Reorder sections and fields |
| **Moderated registration** | Manager approval required |
| **Payment integration** | Manual, PostFinance, PayPal, Bank Transfer |
| **Accommodation field** | Arrival/departure dates, hotel choices, room pricing, capacity limits |
| **Invitation system** | Email invitations with skip-moderation option |
| **Registration limits** | Configurable maximum registrations |
| **Modification control** | Never / Until payment / Always |
| **Participant list** | Publishable on event page |
| **Check-in status** | Publishable on event page |
| **Tickets** | Configurable ticketing system |

### Timetable System
| Feature | Details |
|---------|---------|
| **Multi-day support** | Day tabs with date navigation |
| **Session blocks** | Time-bounded instances of sessions |
| **Parallel sessions** | Side-by-side columns in grid view |
| **Drag-and-drop** | Move items vertically, resize by edge-dragging |
| **Color coding** | Each session gets distinct color |
| **Detailed view** | Expand session blocks to show individual contributions |
| **Poster sessions** | Auto-parallel scheduling for poster contributions |
| **Reschedule** | Batch adjustment of start times or durations with optional gap |
| **Fit to content** | Auto-shrink session blocks to match content |
| **Draft mode** | Contributions hidden until explicitly published |
| **PDF/Print** | Export timetable as PDF |
| **Filter** | Filter timetable by session/track |

### Abstract Management
| Feature | Details |
|---------|---------|
| **Track-based submission** | Authors choose tracks for their abstracts |
| **Custom fields** | Single choice, text, etc. |
| **Contribution types** | Oral, Poster, etc. |
| **Multi-role review** | Reviewers, Conveners, Judges |
| **Per-track reviewers** | Assign reviewer teams per track |
| **Rating questions** | Configurable scale + custom questions |
| **Book of Abstracts** | Auto-generated PDF of accepted abstracts |
| **Email notifications** | Configurable rulesets per abstract state |

### Paper Peer Reviewing
| Feature | Details |
|---------|---------|
| **Dual review** | Content reviewing + Layout reviewing (independent) |
| **Paper templates** | Upload style templates for authors |
| **Reviewing teams** | Paper managers, judges, content/layout reviewers |
| **Competence matching** | Keyword-based reviewer assignment |
| **Custom questions** | Rating, Yes/No, Free text per review |
| **Deadlines** | Enforceable reviewing and judging deadlines |
| **Paper timeline** | Chronological view of all paper activity |
| **Correction cycles** | Judge requests corrections → author resubmits → re-review |

### Document Generation (Badges/Certificates)
| Feature | Details |
|---------|---------|
| **Template system** | HTML/Jinja2-based with CSS styling |
| **Custom parameters** | YAML-defined fields (input, textarea, dropdown, checkbox) |
| **Bulk generation** | Generate for multiple registrations at once |
| **Badge printing** | Print Badges action from registration list |
| **Ticket printing** | Print Tickets action from registration list |
| **Publishing** | Documents visible on registrant's profile or emailed |
| **Download options** | Single PDF, separate PDFs, ZIP archive |

### Session Management
| Feature | Details |
|---------|---------|
| **Session types** | Optional categorization (including poster type) |
| **Color assignment** | Per-session color for timetable display |
| **Default duration** | Per-session default contribution duration |
| **Material upload** | Files attached to whole session (visible in all blocks) |
| **Permission system** | Full management or Coordination rights |
| **Session coordinator rights** | Configurable: contributions, session blocks |
| **Conveners vs Coordinators** | Conveners = display only, Coordinators = management rights |

---

## UI/UX Patterns Observed

### Navigation
- **Left sidebar** — hierarchical navigation within event management
  - Sections: Settings, Timetable, Protection, Privacy, Organisation, Workflows, Room booking, Services, Reports, Customisation, Advanced options
- **Top header** — event name, dates, creator info
- **Table of Contents** — right sidebar on documentation pages

### Form Patterns
- **Toggle switches** — YES/NO for boolean settings (blue when active)
- **Dropdowns** — for selection fields
- **Action buttons** — Configure/Edit/Manage consistently on right side
- **Required fields** — marked with red asterisk (*)
- **Rich text editor** — CKEditor-style for email composition

### List/Table Patterns
- **Checkbox selection** — for bulk actions
- **Column sorting** — click column headers
- **Search/filter** — text search with result count
- **Toolbar** — action buttons above lists (Add new, Remove, Export, etc.)
- **Action icons** — pencil (edit), bin (delete), shield (permissions), clock (timetable)

### Timetable Patterns
- **Grid layout** — vertical time axis, horizontal session columns
- **Day tabs** — with left/right navigation arrows
- **Color-coded blocks** — per-session color with legend
- **Drag-and-drop** — vertical repositioning and edge-resize
- **Click-to-edit** — popup with quick actions on any item
- **Nested timetables** — session block has its own sub-timetable

---

## Screenshot Inventory

### Total Screenshots Captured/Referenced
| Page | Count | Prefix |
|------|-------|--------|
| Registration Config | 9 | Conference_Reg_Config_*.png |
| Timetable | 40 | Various (finished_timetable, add_contrib, block_dialog, etc.) |
| Session Management | 16 | sessions_management, create_session, etc. |
| Paper Peer Reviewing | 44 | Various |
| Call for Abstracts | 8 | conference_abstract_*, conference_review_* |
| Programme | 1 | conference_track.png |
| Document Generation | 5 | generate*.png, configuring.png, edit.png, create.png |
| **Total** | **123+** | |

All images available at: `https://indico.docs.cern.ch/assets/<filename>`

---

## Pages Not Found (404)

The following URLs from the original task assignment returned 404:
- `/conferences/registration/` — redirects to `/conferences/registration_config/`
- `/conferences/papers/` — 404 (correct URL: `/conferences/papers/peer_reviewing/`)
- `/conferences/badges_and_posters/` — 404 (replaced by `/document_templates/`)

---

## Output Files

| File | Content |
|------|---------|
| 00-navigation-map.md | Full site navigation structure |
| 01-registration-config.md | Registration form builder, payments, accommodation, invitations |
| 02-timetable.md | Timetable anatomy, creating/managing schedule |
| 03-session-management.md | Sessions, session types, coordinators vs conveners |
| 04-paper-peer-reviewing.md | Paper submission, review, judging workflow |
| 05-document-generation-badges.md | Template system, badge/certificate generation |
| 06-programme-tracks.md | Track definition for abstract classification |
| 07-call-for-abstracts.md | Abstract submission, review, book of abstracts |
| 08-indico-comprehensive-summary.md | This file — complete feature inventory |
