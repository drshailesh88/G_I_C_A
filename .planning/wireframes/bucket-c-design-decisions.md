# Bucket C — Design Decisions (All 6 Features)

Date: 2026-04-17
Wireframes: pencil-welcome-desktop.pen (12 screens total)

All open questions from the missing-feature audit and DEFERRED_TICKETS.md are resolved below. Each feature is now buildable (Bucket C -> Bucket A).

---

## 1. p2-d7-terms-privacy-page (D7)

**Wireframe screens:** Mobile (375px), Desktop (800px)

| Question | Decision |
|----------|----------|
| Single page or two pages? | **Single page** with tab toggle: "Terms of Service" / "Privacy Policy" |
| Static or CMS-editable? | **Static MDX** for v1. Super Admin CMS editor deferred to v2 |
| Content source? | Founder writes initial copy. Legal template placeholder in wireframe |
| Mobile layout? | Scrollable with **collapsible accordion sections** (shadcn Accordion) |
| Desktop layout? | Centered 600px prose column, same accordion pattern |
| Route? | `/terms` under `(public)` layout, same `max-w-lg` shell as registration |
| Footer placement? | "Back to Registration" ghost button at bottom of page |
| Standalone or event-branded? | **Standalone legal section** — not event-specific. Same `(public)` layout |
| Entry point? | M07 registration form footer link. Currently dead link → will point to `/terms` |

**DB changes:** None.

---

## 2. p2-d5-speaker-profile (D5)

**Wireframe screens:** Mobile (375px), Desktop (800px)

| Question | Decision |
|----------|----------|
| Expandable card or separate page? | **Neither** — modal (desktop) / bottom sheet (mobile) overlay on M25 |
| Mobile interaction? | Tap speaker card → full-height **bottom sheet** slides up |
| Desktop interaction? | Click speaker card → **centered modal** with two-column layout |
| Fields shown? | Name, designation, organization, bio, photo placeholder, sessions list |
| Bio length? | Free text, no hard limit. Rendered with `textGrowth: fixed-width` wrapping |
| Photo source? | Ellipse placeholder → will use `people.photoStorageKey` (R2 signed URL) |
| Session list scope? | Only sessions where person is faculty for THIS event (filtered by `eventId`) |
| Session-link behavior? | Session cards show title, time, hall, and role badge. No link-through for v1 |
| Card expansion vs route? | No new route. Profile is an overlay on `/e/[eventSlug]` landing page |

**DB changes required:**
- Add `bio` (text, nullable) to `people` table
- Add `photoStorageKey` (text, nullable) to `people` table

---

## 3. p3-ops-resend-logistics-notification

**Wireframe screens:** Mobile (375px), Desktop (800px)

| Question | Decision |
|----------|----------|
| Row action or standalone button? | **Row action** via `···` ellipsis menu (DropdownMenu) on each record |
| Which channels? | User picks: **radio toggle** — Email or WhatsApp (not both simultaneously) |
| Confirmation dialog? | **Yes** — bottom sheet (mobile) / modal (desktop) before resend |
| Cooldown visible? | **Yes** — warning banner: "Last sent 2 hours ago via Email" |
| Mirror across views? | **Yes** — same UX for travel and accommodation. Transport deferred (no template) |
| Template used? | System template for that notification type (`travel_update`, `accommodation_details`) |
| Audit presentation? | Existing `isResend: true` + `resendOfId` in notification_log. No new UI needed |
| Preview before send? | **No** — confirmation dialog shows recipient + channel. Full preview is overkill for resend |

**Existing infrastructure (no new code needed):**
- `resendNotification()` in `lib/notifications/send.ts`
- `manualResend()` server action in `lib/actions/notifications.ts`
- Pattern: `failed-notifications-client.tsx` retry/resend buttons

**DB changes:** None.

---

## 4. p2-m30-conflict-fix-action (D2)

**Wireframe screens:** Mobile (375px), Desktop (800px)

| Question | Decision |
|----------|----------|
| Navigate where on Fix? | `/events/[eventId]/sessions/[sessionId]` with `?conflict=true` query param |
| Which session to edit? | The **second conflicting session** (`sessionIds[1]` from ConflictWarning) |
| How to highlight conflict? | Warning border (2px orange) + warning icon on Time Slot and Faculty fields |
| Conflicting session comparison? | **Mobile:** warning alert banner at top of edit sheet. **Desktop:** side-by-side — read-only conflict card (left) + edit form (right) |
| After save? | Navigate back to M30 Schedule Grid. Conflict banner disappears if resolved |
| Banner Fix button? | Added to existing conflict banner — orange primary button labeled "Fix" |

**Implementation notes:**
- Conflict banner exists at `schedule-grid-client.tsx:624` — add `<Link>` to Fix button
- `SessionFormClient` needs `conflict` search param handling to show warning state
- `ConflictWarning.sessionIds` provides both conflicting session IDs
- No schema changes needed

**DB changes:** None.

---

## 5. p6-d8-notification-drawer (D8)

**Wireframe screens:** Mobile (375px), Desktop (800px)

| Question | Decision |
|----------|----------|
| Drawer type? | **Mobile:** bottom sheet. **Desktop:** right-side drawer (360px) |
| Feed source? | `notification_log` table, filtered by `eventId`, ordered by `queuedAt DESC`, limit 20 |
| Read/unread model? | Orange dot indicator on unread items. Unread = `status !== 'read'` |
| Filters? | Three tab pills: All, Unread (count), Failed |
| Mark-as-read? | "Mark all read" link in drawer header. Individual mark-on-click deferred |
| Each row shows? | Subject (from `renderedSubject` or `templateKeySnapshot`), recipient, channel icon (mail/message-circle), status, relative timestamp |
| Status colors? | Sent/Delivered = muted. Failed = destructive red. Read = muted |
| "View all" link? | Yes — links to `/events/[eventId]/communications` (full notification history) |
| Real-time updates? | **Polling on drawer open** for v1. No WebSocket/Inngest real-time. Refresh on open |
| Drill-through? | "View all notifications" link at bottom. No per-item drill-through for v1 |
| Bell badge? | Red circle with unread count. Hidden when count = 0 |

**Implementation notes:**
- Hook `onClick` on bell button at `dashboard-client.tsx:114`
- New server action: `getRecentNotifications(eventId, limit)` querying `notificationLog`
- Reuse card layout pattern from `failed-notifications-client.tsx`

**DB changes:** None (all fields exist in `notificationLog`).

---

## 6. p2-d1-preview-revised-emails (D1)

**Wireframe screens:** Mobile (375px), Desktop (800px)

**Dependency:** Requires `programVersions` table and M52 Program Changes page (Bucket A item `p2-m52-version-history`). Wireframe designed with assumed diff data from `changesSummaryJson`.

| Question | Decision |
|----------|----------|
| Modal or full-screen? | **Mobile:** full-screen sheet. **Desktop:** centered modal (560px) |
| Faculty dropdown? | **Yes** — "Preview as: Dr. X" dropdown. Shows what THAT faculty would receive |
| Affected count? | Shown as "1 of 3 affected" next to dropdown, and "3 faculty will receive this email" in footer |
| Email rendering? | Real template render via `template-renderer.ts` using `program_update` template with actual variables substituted |
| Diff format? | Color-coded inline blocks: green (added), orange (changed/moved), red (removed). Each diff block has icon + description text |
| "Send All" button? | **Yes** — at bottom of modal. Publishes version AND sends all emails in one action |
| What template? | `program_update` system template: `{{salutation}}`, `{{fullName}}`, `{{eventName}}`, `{{versionNo}}`, `{{changesSummary}}` |

**Implementation notes:**
- M52 page route needs scaffolding first: `/events/[eventId]/program/changes`
- Diff data comes from `programVersions.changesSummaryJson` (jsonb)
- `template-renderer.ts` renders Mustache templates — reuse for preview
- No React Email — plain text/HTML rendered via Resend

**DB changes:** None (programVersions schema already has `changesSummaryJson`).

---

## Summary: Build Readiness

| Feature | Wireframed | Decisions Resolved | DB Changes | Build-Ready? |
|---------|------------|-------------------|------------|-------------|
| p2-d7-terms-privacy-page | Yes (2 screens) | All | None | Yes |
| p2-d5-speaker-profile | Yes (2 screens) | All | Add `bio`, `photoStorageKey` | Yes |
| p3-ops-resend-notification | Yes (2 screens) | All | None | Yes |
| p2-m30-conflict-fix-action | Yes (2 screens) | All | None | Yes |
| p6-d8-notification-drawer | Yes (2 screens) | All | None | Yes |
| p2-d1-preview-revised-emails | Yes (2 screens) | All | None | Yes (after M52) |
