# Deferred Tickets — Design Before Module Ships

> These are NOT forgotten. They are explicitly tracked items that need
> wireframe design before their parent module enters development.
> Do NOT improvise these during coding — design them first.

| # | Item | What's Needed | Current Wireframe Coverage | Parent Module | Design Before Phase |
|---|------|--------------|----------------------------|---------------|-------------------|
| D1 | Preview Revised Emails | Modal overlay on M52 showing sample revised email with diff highlights | M52 now has a `Preview Revised Emails` CTA, but no preview state | Scientific Program | Phase 2 |
| D2 | Conflict Fix action | M30 `Fix` → navigates to M23 with conflicting session pre-loaded, conflict highlighted | M30 now has conflict banner + `Fix` CTA, but no destination state | Scientific Program | Phase 2 |
| D3 | Add Person form | Slide-up bottom sheet from M03 `+ Add` — Name, Designation, Specialty, City, Mobile, Email, Role tags | M03 has the `+ Add` CTA, but no add-person screen/sheet | People | Phase 2 |
| D4 | Invite Member modal | Bottom sheet on M19 — Email field + Role dropdown + Send button | M19 now has `Invite` CTA, but no invite modal/sheet | Team & Roles | Phase 6 |
| D5 | Speaker Profile view | Expandable card or separate detail view from M25 speaker cards — Name, Bio, Photo, Sessions list | M25 now shows speaker cards, but no speaker profile view | Registration / Public Pages | Phase 2 |
| D6 | View All Issued Certificates | List screen from M61 `View All` link — search by name/reg#, resend/revoke per row | M61 now has `View All Issued Certificates` link, but no list screen | Certificates | Phase 5 |
| D7 | Terms & Privacy page | Simple text page linked from M07 `Terms & Privacy Policy` | Registration form flow exists; dedicated policy page still absent | Registration | Phase 2 |
| D8 | Notification drawer | Slide-down or bottom sheet from M01 bell icon — list of recent notifications | M01 now shows bell icon, but no drawer/sheet | Dashboard | Phase 6 |
| D9 | Profile/account sheet | From M01 avatar — name, email, role, sign out | M01 now shows avatar entrypoint, but no profile sheet | Dashboard | Phase 6 |

## How to Handle These

1. When you start building a Phase, check this list
2. If any deferred items belong to that Phase, design the wireframe FIRST
3. Then build
4. Mark as DONE here when designed and built
