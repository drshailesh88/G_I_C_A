# pretalx — Verdict & Recommendation

Research by Worker 2 | 2026-04-05

---

## Executive Summary

pretalx is the **best-in-class open-source tool for the CfP-to-schedule pipeline**. It excels at submission management, peer review, and schedule editing. However, it deliberately excludes registration, ticketing, and attendee-facing features — meaning it can only serve as **one component** of the GEM India Conference App, not the whole solution.

---

## What Works Well (Copy These)

### 1. Schedule Editor (The Crown Jewel)
- Drag-and-drop grid with rooms as columns and time as rows
- Real-time conflict detection: speaker double-booking, room overlaps, availability violations
- Breaks and blockers as first-class schedule items
- Version control with named releases and public changelog
- Two modes: expanded (preview-like) and condensed (working mode)
- **Our takeaway:** This is the gold standard for conference schedule editors. Study its UX patterns closely.

### 2. Outbox-First Email System
- Almost all emails land in an outbox for review before sending
- Prevents accidental mass-emails, allows typo fixes
- Filter and batch-send by track, type, state
- Auto-deduplication for multi-proposal speakers
- **Our takeaway:** Implement this pattern. It's a safety net that organizers will love.

### 3. Review Workflow Flexibility
- Configurable phases with auto-activation
- Weighted multi-category scoring with median/mean aggregation
- Full anonymisation support (hide names, redact proposals, hide reviewers)
- Pending states: invisible decisions, apply in bulk
- "Save and next" with fewest-reviews-first prioritization
- **Our takeaway:** The pending state pattern is brilliant for large committees. Copy the phase-based review model.

### 4. CfP Form Builder
- Drag-and-drop field ordering with live preview
- 10 custom field types with scoping to tracks/session types
- Access codes for deadline extensions and restricted tracks
- Per-session-type deadlines
- **Our takeaway:** Good model. We need similar flexibility for medical conference abstracts.

### 5. Schedule JSON Format
- Uses Frab-compatible c3voc schema (industry standard)
- Rich talk objects with speakers, links, attachments, feedback URLs
- Conference-level metadata (rooms, tracks, colors, timezone)
- Day-oriented structure (days > rooms > talks)
- **Our takeaway:** Use this schema as a reference for our own API design.

### 6. Public Schedule UX
- Timezone auto-conversion (shows both event time and local time)
- Session favoriting (star icon)
- "Jump to now" floating button
- Version selector for comparing schedule releases
- Filter by track
- Two views: grid (parallel rooms) and list (linear/mobile-friendly)
- **Our takeaway:** All of these are table-stakes features we must have.

---

## What's Clunky (Improve These)

### 1. No Mobile-First Design
- Schedule grid does not reflow properly on phones
- Parallel room columns become unusable on small screens
- Sessions list view is the fallback but feels like a secondary citizen
- **Our improvement:** Build mobile-first. Card-based single-column schedule with swipe between rooms/tracks.

### 2. No Native App / PWA
- Pure web application, no offline support
- No push notifications (email only)
- **Our improvement:** Build as PWA with offline schedule caching, push notifications for schedule changes.

### 3. No Attendee Features
- No networking, messaging, Q&A, polls, gamification
- No attendee profiles or connections
- **Our improvement:** These are core features for GEM India — we must build them.

### 4. Email-Only Communication
- No SMS, WhatsApp, or in-app notifications
- India context: WhatsApp is more reliable than email for many speakers
- **Our improvement:** Multi-channel notifications (email + WhatsApp + push + in-app).

### 5. No Registration/Ticketing Integration
- Deliberately out of scope
- pretix integration exists but is a separate system
- **Our improvement:** Unified system with registration, ticketing, and schedule in one app.

### 6. No PDF/Print Program Book
- Browser print is the only option
- No abstract book generation
- **Our improvement:** Generate printable program book (PDF) with abstracts, speaker photos, schedule grid.

### 7. No Analytics/Reporting
- No dashboard showing submission stats, attendance metrics, review progress
- **Our improvement:** Build analytics dashboard for organizers.

### 8. Single-Maintainer Risk
- rixx (Tobias Kunze) is the primary developer
- Active and dedicated, but bus factor = 1
- **Our consideration:** If adopting pretalx as base, we'd need to be self-sufficient for maintenance.

---

## For G_I_C_A: Adopt, Adapt, or Build?

### Option A: Use pretalx as Backend (Adapt)
- **Pros:** Battle-tested CfP + review + scheduling, REST API, plugin system, Django familiarity
- **Cons:** No registration, no mobile app, no attendee features, Django monolith
- **Effort:** Medium-high to add missing features as plugins or fork
- **Risk:** Maintaining a fork diverges from upstream; plugin API may not cover all needs

### Option B: Use pretalx for CfP/Schedule Only (Integrate)
- **Pros:** Let pretalx handle what it does best, build custom app for everything else
- **Cons:** Two systems to maintain, data sync complexity, inconsistent UX
- **Effort:** Medium (integration layer, but less custom code for CfP/review)
- **Risk:** API polling (no webhooks) makes real-time sync difficult

### Option C: Build Custom, Inspired by pretalx (Build)
- **Pros:** Unified system, mobile-first, full control, India-specific features from day one
- **Cons:** Most effort, must rebuild proven patterns from scratch
- **Effort:** High, but we get exactly what we need
- **Risk:** Reinventing wheels that pretalx already solved

### Recommendation

**Option C (Build Custom) with heavy design inspiration from pretalx.**

Rationale:
1. GEM India needs registration, ticketing, mobile app, WhatsApp, certificates, CME credits — none of which pretalx provides
2. The amount of custom work needed on top of pretalx (registration, mobile app, notifications, analytics) exceeds the benefit of reusing pretalx's CfP/scheduling
3. pretalx's schedule editor, review workflow, email outbox, and JSON schema provide excellent design patterns to follow
4. Building custom allows mobile-first architecture, India-specific payment/communication, and unified UX

**Key patterns to copy from pretalx:**
- Schedule editor UX (drag-and-drop grid, conflict detection, version control)
- Outbox-first email system
- Phase-based review with weighted scoring and anonymisation
- Frab-compatible schedule JSON format
- CfP form builder with custom fields and access codes
- Pending states for bulk accept/reject
- Public schedule with timezone conversion, favoriting, and filtering

---

## Key Files Produced

| File | Contents |
|------|----------|
| `platform-overview.md` | Sections A-E: overview, features, India fit, extensibility, gaps |
| `feature-matrix.md` | Structured feature checklist with status and notes |
| `user-guide-notes.md` | Comprehensive notes from pretalx documentation |
| `api-notes.md` | API documentation findings (pending) |
| `pretalx-schema.yml` | Full OpenAPI schema (230KB) |
| `verdict.md` | This file — recommendation summary |
