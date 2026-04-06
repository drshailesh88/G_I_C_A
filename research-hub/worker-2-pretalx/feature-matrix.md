# pretalx — Feature Matrix

Research by Worker 2 | 2026-04-05

---

## Feature Checklist

### Legend
- Y = Yes, fully supported
- P = Partial / with limitations
- N = No / not available
- Plugin = Available via plugin

---

### Event Management

| Feature | Status | Notes |
|---------|--------|-------|
| Create/manage events | Y | Full event creation wizard with copy-from-previous |
| Multi-day events | Y | Full support with day tabs |
| Multi-track events | Y | Color-coded tracks, track-specific permissions |
| Multi-room events | Y | Rooms as columns in schedule grid |
| Event series / recurring | P | Copy settings from previous event; no formal series concept |
| Custom branding (logo, colors) | Y | Logo, primary color, custom CSS |
| Custom domain | Y | Supported on hosted and self-hosted |
| Multi-language events | Y | Multiple content locales, multi-language templates |
| Timezone handling | Y | Auto-converts to attendee timezone in public view |

### Call for Papers / Submissions

| Feature | Status | Notes |
|---------|--------|-------|
| Configurable submission form | Y | Drag-and-drop form builder with live preview |
| Custom question types | Y | 10 field types (text, number, URL, date, file, select, etc.) |
| Multiple submission types | Y | Session types with different durations and deadlines |
| Multiple deadlines | Y | Per session type, override global deadline |
| Access codes for submission | Y | Extend deadlines, restrict to tracks/types |
| Speaker profile collection | Y | Name, bio, photo, social media, availability |
| Co-speaker support | Y | Invite by email, configurable max co-speakers |
| Draft/submit workflow | Y | Speakers can save drafts, edit while CfP open |
| File attachments on submissions | Y | File upload field type |
| Submission confirmation email | Y | Sent immediately on submit |
| Track/topic selection | Y | Optional; can require access codes |
| Abstract + description fields | Y | Both supported, abstract shown in bold publicly |

### Review & Selection

| Feature | Status | Notes |
|---------|--------|-------|
| Configurable review phases | Y | Multiple phases, auto-activation by date |
| Weighted score categories | Y | Multiple categories with weights, labels |
| Anonymous/blind review | Y | Hide speaker names, create redacted text versions |
| Review dashboard | Y | Sortable table with aggregate scores |
| Bulk accept/reject | Y | Checkboxes + action buttons |
| Pending states | Y | Invisible to speakers, apply in bulk |
| Track-based reviewer assignment | Y | Restrict reviewer teams to tracks |
| Individual reviewer assignment | Y | Manual or CSV import |
| Reviewer custom fields | Y | Additional structured data in review form |
| Conflict of interest handling | P | No formal CoI system; use track restrictions |
| Review statistics | P | Progress bar (X/Y reviewed), score columns |
| Save-and-next workflow | Y | Advances to next unreviewed (fewest reviews first) |
| Keyboard shortcuts | Y | Ctrl+Enter to save review |

### Schedule Management

| Feature | Status | Notes |
|---------|--------|-------|
| Drag-and-drop schedule editor | Y | Core feature — rooms as columns, time as rows |
| Grid time intervals | Y | 5, 15, 30, 60 min (adjustable) |
| Speaker conflict detection | Y | Warning when same speaker double-booked |
| Room overlap detection | Y | Warning for overlapping sessions in same room |
| Speaker availability warnings | Y | Visual indicators on grid |
| Room availability windows | Y | Configurable per room |
| Break/lunch scheduling | Y | Public items, "copy to other rooms" |
| Blocker/placeholder items | Y | Internal-only time reservations |
| Schedule versioning | Y | WIP + named releases, unlimited versions |
| Public changelog | Y | Version history + RSS feed |
| Schedule release workflow | Y | Named version, review warnings, notify speakers |
| Embeddable schedule widget | Y | JavaScript widget with configurable styling |

### Speaker Management

| Feature | Status | Notes |
|---------|--------|-------|
| Speaker profiles | Y | Name, bio, photo, social media with icons |
| Speaker availability collection | Y | Visual calendar widget |
| Multi-speaker sessions | Y | Any number of speakers per session |
| Speaker confirmation workflow | Y | Confirmation link in acceptance email |
| Speaker notification on schedule changes | Y | Email with iCal attachment |
| Speaker portal | P | Can view/edit proposals, see schedule; no rich dashboard |

### Communication

| Feature | Status | Notes |
|---------|--------|-------|
| Email outbox (review before send) | Y | Core design principle — almost all emails queued |
| Email templates with placeholders | Y | Built-in + custom templates, rich placeholder system |
| Group emails (filtered recipients) | Y | Filter by state, type, track, locale, tags, custom fields |
| Reviewer/team emails | Y | Direct send (no outbox) |
| Email preview | Y | Rendered preview with sample values |
| Auto-deduplication | Y | Same email to speaker with multiple matching proposals = 1 email |
| Custom SMTP server | Y | Full SMTP configuration with test button |
| Multi-language emails | Y | Auto-selects language based on speaker preference |
| SMS/WhatsApp notifications | N | Email only |
| Push notifications | N | Not available |
| In-app notifications | N | Not available |

### Public-Facing Features

| Feature | Status | Notes |
|---------|--------|-------|
| Public schedule page | Y | Grid view with day tabs, timezone selector |
| Public sessions list | Y | Linear list view with filter and day tabs |
| Public speaker list | Y | Speaker cards with bio and talk links |
| Session detail pages | Y | Full info, speaker cards, attachments, feedback |
| Session favoriting | Y | Star icon on sessions (client-side, local storage) |
| Schedule filtering | Y | Filter button on schedule |
| Timezone auto-conversion | Y | Shows times in attendee's local timezone |
| iCal per-session export | Y | iCal button on session detail page |
| "Jump to now" button | Y | Floating button for current time |
| Version history | Y | Dropdown to view past schedule versions |
| Feedback/comments on sessions | Y | Comment icon on session detail page |
| CfP landing page | Y | Shows tracks, deadlines, submission button |
| Event home page | Y | Customizable welcome text with CTAs |

### Exports & Integrations

| Feature | Status | Notes |
|---------|--------|-------|
| Schedule JSON export | Y | Frab-compatible c3voc schema (public, no auth) |
| iCal export | Y | Per-session and full schedule |
| Schedule RSS feed | Y | Changelog of version updates |
| CSV speaker export | Y | For pretix voucher integration |
| REST API | Y | Comprehensive, OpenAPI 3.0 schema |
| Frab XML compatibility | Y | Standard conference format |
| Embeddable widget | Y | JavaScript custom element |
| Static HTML export | Y | Download schedule pages for static hosting |
| Webhooks | N | Must poll API |
| GraphQL API | N | REST only |
| PDF program book | N | No native export (browser print only) |

### Registration & Ticketing

| Feature | Status | Notes |
|---------|--------|-------|
| Attendee registration | N | Out of scope; use pretix |
| Ticketing | N | Out of scope; use pretix |
| Check-in | N | Out of scope |
| Badge printing | N | Out of scope |
| Payment processing | N | Out of scope |
| Certificates | N | Out of scope |

### Administration

| Feature | Status | Notes |
|---------|--------|-------|
| Team/permission management | Y | Granular permissions with team hierarchy |
| Role-based access control | Y | Organiser, event admin, reviewer roles |
| Audit log | Y | Log entries preserved even when members removed |
| Copy settings between events | Y | Tracks, review config, email templates, rooms |
| Plugin system | Y | Django plugins, several community plugins |
| Self-hosting | Y | Docker, pip, comprehensive admin docs |
