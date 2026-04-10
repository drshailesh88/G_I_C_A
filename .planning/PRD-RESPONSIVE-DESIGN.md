# PRD: Full-Screen Responsive Design — GEM India Conference Platform

**Author:** Product Design + Engineering  
**Date:** 2026-04-10  
**Status:** Ready for Linear breakdown  
**Priority:** P0 — Blocks production deployment  
**Estimated scope:** 5,000–6,000 lines across ~45 files, 7 new files  

---

## 1. Problem Statement

The GEM India conference management app is locked to `max-w-lg` (512px) on every screen. All 33 client components, 44 pages, and 4 layouts render inside a 512px centered column regardless of device. Only 8 of 60+ component files use any Tailwind responsive prefixes. The bottom tab bar renders on all screen sizes including desktops. No `next/image` optimization exists. No container queries are used. No safe area support is implemented.

This means:
- **Laptops/desktops** (1280px+): 928px+ of wasted whitespace. Admin users managing 500+ delegates see a phone UI.
- **Tablets** (768–1024px): 256–512px of wasted space. Coordinators get no data density benefit.
- **Small phones** (< 380px): Some hardcoded `grid-cols-3` layouts overflow.
- **Foldable phones** (Samsung Fold inner ~717px): Phone UI with large margins.
- **All devices**: Typography, spacing, and touch targets are fixed — never scale.

### Business Impact

This is a ₹20 lakh product. Three user classes depend on this app:

| User | Device | Primary Tasks | Current Experience |
|------|--------|--------------|-------------------|
| Ground Staff | Phone (375–430px) | QR scanning, check-in, transport tracking | Adequate but touch targets too small |
| Coordinator | Tablet or Phone (768–1024px) | Registrations, travel review, communications | Phone UI with large margins |
| Admin/Director | Laptop/Desktop (1280px+) | Schedule building, certificates, reports, branding | Phone UI with 900px+ dead space |

### Success Criteria

- Every page renders correctly and looks intentional on: iPhone SE (375px), iPhone 15 (393px), iPad (810px), iPad Pro (1024px), MacBook (1440px), iMac (1920px), Samsung Galaxy Fold (384px folded / 717px unfolded)
- No horizontal overflow on any device
- Touch targets minimum 44×44px on all interactive elements
- Lighthouse performance score ≥ 90 on mobile at all viewports
- QR scanner page renders in < 1 second on mid-range phone
- Zero visual regression after migration (Playwright tests at 4 viewports)

---

## 2. Current Codebase Inventory

### File Counts
- **Layout files:** 4 (root, auth, app, public)
- **Page files:** 44
- **Client components:** 33 (total 9,154 lines)
- **Shared/UI components:** 6
- **Navigation:** 1 (tab-bar.tsx, 78 lines)
- **Styling:** 1 (globals.css, 30 lines — Tailwind v4 @theme)
- **Total UI surface:** ~12,000 lines across 117 files

### Largest Client Components (modification priority)
| File | Lines | Current Responsive State |
|------|-------|------------------------|
| certificates-client.tsx | 903 | Zero responsive prefixes |
| sessions-manager-client.tsx | 598 | Zero responsive prefixes |
| session-form-client.tsx | 565 | Zero responsive prefixes |
| branding-form-client.tsx | 422 | 2 responsive prefixes |
| travel-form-client.tsx | 413 | Zero responsive prefixes |
| vehicle-kanban-client.tsx | 377 | Zero responsive prefixes |
| dashboard-client.tsx | 374 | Zero responsive prefixes |
| csv-import-client.tsx | 373 | Zero responsive prefixes |
| accommodation-form-client.tsx | 368 | Zero responsive prefixes |
| schedule-grid-client.tsx | 345 | Zero responsive prefixes |
| qr-checkin-client.tsx | 346 | Best responsive — 3 breakpoints |
| accommodation-list-client.tsx | 334 | Zero responsive prefixes |
| person-detail-client.tsx | 329 | Zero responsive prefixes |
| generation-client.tsx | 327 | Zero responsive prefixes |
| attendee-program-client.tsx | 313 | 2 responsive prefixes |

### Current Layout Structure
```
src/app/layout.tsx (root — 24 lines)
├── (auth)/layout.tsx (13 lines) — login, forgot/reset password
├── (app)/layout.tsx (16 lines) — ALL admin screens, uses max-w-lg + tab-bar
└── (public)/layout.tsx (13 lines) — event landing, registration, faculty confirm
```

### Current Navigation
- `src/components/tab-bar.tsx` — Fixed bottom bar, 5 items, renders on ALL screen sizes
- No sidebar exists
- No responsive navigation switching

### Current Styling
- `src/app/globals.css` — 30 lines: `@import "tailwindcss"` + `@theme` block with 13 design tokens (colors, fonts, border radius)
- No custom breakpoints
- No fluid typography
- No fluid spacing
- No container queries
- No safe area support

---

## 3. Technical Strategy

### Architecture: 5 Phases, Built Bottom-Up

The strategy follows a layered approach validated by adversarial review (Codex). The foundation does the heavy lifting; patterns provide reusable responsive behavior; pages adopt patterns mechanically.

**Key architectural decisions:**
1. **Fluid tokens over breakpoint-per-element** — Typography and spacing scale continuously via `clamp()`. No per-breakpoint overrides for text/spacing.
2. **Container queries over viewport queries for components** — Reusable components respond to their container width, not the viewport. This allows the same component to work in full-width AND split-panel contexts.
3. **CSS Grid for app shell** — `grid-template-columns: auto 1fr` instead of brittle `md:pl-64` offsets.
4. **Feature flag for migration safety** — New responsive shell runs behind `NEXT_PUBLIC_RESPONSIVE_SHELL=true`. Old `max-w-lg` layout continues until all pages are migrated.
5. **Bottom-up pattern emergence** — Build only proven patterns upfront (list, grid, detail-view, image). Let form layouts and filter patterns emerge from actual usage.
6. **Print stylesheets are core, not polish** — Certificate printing is a production requirement.

---

## 4. Phase 0: Day-Zero Validation Spike

**Goal:** Validate three architectural bets before writing production code. Runs on a throwaway branch.

### 0A: Fluid Token Compatibility
- Test if `fluid-tailwind` npm package works with Tailwind CSS v4's CSS-first `@theme` configuration
- **If compatible:** Install and configure with Utopia-generated scales
- **If incompatible (likely):** Hand-write `clamp()` values directly in `@theme` CSS custom properties. This requires ~20 lines of CSS and zero plugins.
- Generate fluid type scale using utopia.fyi calculator: min viewport 375px, max viewport 1440px, min font 16px (1rem), max font 18px (1.125rem), scale ratio 1.2 (minor third)
- Generate fluid spacing scale: 8 steps from 2xs to 3xl
- **Output:** A working `globals.css` with fluid tokens that compile cleanly with `@tailwindcss/postcss`

### 0B: App Shell Prototype
- Install shadcn/ui Sidebar component into the project
- Build throwaway prototype: CSS Grid shell with sidebar (desktop) + bottom bar (mobile)
- Verify Clerk's `<UserButton>` and `<OrganizationSwitcher>` render correctly inside the sidebar
- Verify shadcn/ui Dialog, Sheet, DropdownMenu, Popover position correctly with sidebar present (overlay centering issue)
- **Output:** Confirmed shell pattern, documented conflicts (if any), resolution approach

### 0C: Container Query Verification
- Verify Tailwind v4's native `@container` / `@sm:` / `@md:` / `@lg:` syntax works in the project
- Build one test card component that switches from vertical to horizontal layout based on container width
- **Output:** Confirmed container query syntax for the project

### Spike Deliverables
- Spike branch with throwaway code (not merged)
- Decision document: which fluid token approach (plugin vs hand-written)
- Decision document: any Clerk/overlay conflicts and fixes
- Green light to proceed with Phase 1

---

## 5. Phase 1: Foundation

**Goal:** Build the responsive design system and app shell. After this phase, every page in the app has access to fluid tokens and renders inside a responsive shell.

**Depends on:** Phase 0 spike results

### 1A: Design Tokens (globals.css)

Add to the existing `@theme` block:

**Fluid Type Scale (7 steps):**
```
--font-size-xs:   clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)
--font-size-sm:   clamp(0.875rem, 0.8rem + 0.35vw, 1rem)
--font-size-base: clamp(1rem, 0.925rem + 0.4vw, 1.125rem)
--font-size-lg:   clamp(1.125rem, 1rem + 0.55vw, 1.25rem)
--font-size-xl:   clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem)
--font-size-2xl:  clamp(1.5rem, 1.25rem + 1.25vw, 2rem)
--font-size-3xl:  clamp(1.875rem, 1.5rem + 1.875vw, 2.5rem)
```

**Fluid Spacing Scale (8 steps):**
```
--space-2xs: clamp(0.25rem, 0.2rem + 0.25vw, 0.375rem)
--space-xs:  clamp(0.5rem, 0.425rem + 0.375vw, 0.75rem)
--space-sm:  clamp(0.75rem, 0.65rem + 0.5vw, 1rem)
--space-md:  clamp(1rem, 0.875rem + 0.625vw, 1.5rem)
--space-lg:  clamp(1.5rem, 1.25rem + 1.25vw, 2rem)
--space-xl:  clamp(2rem, 1.625rem + 1.875vw, 3rem)
--space-2xl: clamp(3rem, 2.5rem + 2.5vw, 4rem)
--space-3xl: clamp(4rem, 3.25rem + 3.75vw, 6rem)
```

**Touch Target Minimum:**
```
--touch-min: 44px
```

**Safe Area Utilities (add to CSS layer):**
```css
.safe-area-pt { padding-top: env(safe-area-inset-top, 0px); }
.safe-area-pb { padding-bottom: env(safe-area-inset-bottom, 0px); }
.safe-area-pl { padding-left: env(safe-area-inset-left, 0px); }
.safe-area-pr { padding-right: env(safe-area-inset-right, 0px); }
```

**Viewport meta:** Add `viewport-fit=cover` to root layout.tsx metadata.

**Files:** `src/app/globals.css`, `src/app/layout.tsx`

### 1B: App Shell

**New: `src/hooks/use-responsive-nav.ts`**
- Uses `matchMedia` listeners (not just CSS) to track viewport width
- Returns `navMode`: `'mobile'` (< 768px) | `'tablet'` (768–1023px) | `'desktop'` (≥ 1024px)
- Returns `isSidebarOpen`, `toggleSidebar`, `closeSidebar`
- Handles device rotation and foldable posture changes via `resize` event
- Stores sidebar collapsed state in `localStorage` for persistence

**New: `src/components/app-shell.tsx`**
- CSS Grid layout: `grid-template-columns: auto 1fr`
- Wraps the sidebar + main content area
- Main content: `max-w-6xl` with fluid horizontal padding on desktop. No max-width constraint on tablet. Full-width with `var(--space-md)` padding on mobile.
- Feature flag: reads `NEXT_PUBLIC_RESPONSIVE_SHELL`. When `false`, falls back to current `max-w-lg` centered layout.

**New: `src/components/sidebar.tsx`**
- Wraps shadcn/ui Sidebar component
- Desktop (≥ 1024px): Persistent, 256px width, full icon + label navigation
- Tablet (768–1023px): Icon-only rail, 64px width, expandable on hover/click to full 256px as overlay
- Mobile (< 768px): Hidden entirely. Navigation handled by bottom tab bar.
- Contains: All navigation items currently in tab-bar.tsx + additional items (Settings, Team, More) that don't fit in bottom bar
- Contains: Clerk `<UserButton>` and `<OrganizationSwitcher>` at bottom of sidebar
- Contains: Event selector dropdown at top of sidebar (when inside event context)

**Modified: `src/components/tab-bar.tsx`**
- Add condition: only render when `navMode === 'mobile'` (from `useResponsiveNav`)
- Add `pb-[env(safe-area-inset-bottom)]` for notch/home indicator support
- Keep existing 5-item layout — it's good for mobile

**Modified: `src/app/(app)/layout.tsx`**
- Replace `<main className="mx-auto max-w-lg">` with `<AppShell>` component
- Wrap with sidebar provider context
- Content area gets `pb-16 md:pb-0` (clear bottom bar on mobile, no padding on desktop)

**Files:** New `use-responsive-nav.ts`, `app-shell.tsx`, `sidebar.tsx`. Modified `tab-bar.tsx`, `(app)/layout.tsx`.

### 1C: Touch Target Baseline

- Audit shadcn/ui Button default sizes against 44px minimum
- Create CSS utility: `.touch-target { min-height: var(--touch-min); min-width: var(--touch-min); }`
- Identify all icon-only buttons in codebase and ensure they meet 44px minimum tap area (padding can extend beyond visual bounds)

**Files:** `globals.css` (add utility), audit notes for Phase 3

---

## 6. Phase 2: Responsive Patterns + Test Infrastructure

**Goal:** Build 4 proven reusable patterns + 1 utility + visual regression test infrastructure.

**Depends on:** Phase 1 complete

### Pattern 1: ResponsiveList (`src/components/responsive/responsive-list.tsx`)

A component that renders data as cards on mobile and as a data table on desktop. Uses `@container` queries so it responds to available width, not viewport.

**Props:**
```typescript
interface ResponsiveListProps<T> {
  data: T[]
  columns: ColumnDef<T>[]          // Full column definitions for table view
  columnPriority: string[]          // Which columns show on mobile card (first 2-3)
  renderCard: (item: T) => ReactNode // Custom card renderer for mobile
  renderRow?: (item: T) => ReactNode // Optional custom row renderer
  emptyState?: ReactNode
  isLoading?: boolean
}
```

**Behavior:**
- Container < 640px: Card stack (single column, using `renderCard`)
- Container 640–1023px: 2-column card grid
- Container ≥ 1024px: Full data table with column headers, horizontal scroll on overflow, sticky first column

**Used by:** people-list, registrations-list, travel-list, accommodation-list, transport-planning, failed-notifications (6 components)

### Pattern 2: ResponsiveMetricGrid (`src/components/responsive/responsive-metric-grid.tsx`)

A grid that automatically reflows using the RAM pattern. Zero breakpoints.

**Props:**
```typescript
interface ResponsiveMetricGridProps {
  children: ReactNode
  minCardWidth?: number  // Default 240px. Certificates: 300px. Stats: 180px.
  gap?: string           // Default var(--space-md)
}
```

**CSS:** `grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--card-min, 240px)), 1fr))`

**Used by:** dashboard, event-workspace, reports, registrations summary, events-list, import-success (6 components)

### Pattern 3: DetailView (`src/components/responsive/detail-view.tsx`)

A split-panel layout for list + detail views.

**Props:**
```typescript
interface DetailViewProps {
  list: ReactNode
  detail: ReactNode
  properties?: ReactNode  // Optional third panel
  listWidth?: string       // Default '40%' on desktop
}
```

**Behavior:**
- Container < 768px: Full-screen panels with back button navigation (only one visible at a time)
- Container 768–1279px: Side-by-side split (list 40% + detail 60%)
- Container ≥ 1280px: Three-panel if `properties` provided (list 30% + detail 45% + properties 25%)

**Used by:** sessions-manager, certificates, editor, vehicle-kanban, person-detail (5 components)

### Pattern 4: ResponsiveImage (`src/components/responsive/responsive-image.tsx`)

A wrapper around `next/image` with sensible responsive defaults.

**Props:**
```typescript
interface ResponsiveImageProps {
  src: string
  alt: string
  context: 'hero' | 'card' | 'thumbnail' | 'full-width'
  aspectRatio?: string  // Default '16/9'
  priority?: boolean
}
```

**Behavior:**
- Auto-calculates `sizes` based on `context`:
  - `hero`: `100vw`
  - `full-width`: `(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px`
  - `card`: `(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw`
  - `thumbnail`: `96px`
- Uses `fill` layout with `object-fit: cover` by default
- Lazy loading by default, `priority` for above-the-fold images

**Used by:** branding-form, event-landing, certificates preview, generation preview

### Utility: FormGrid (`src/components/responsive/form-grid.tsx`)

NOT a rigid pattern — a lightweight CSS Grid utility for responsive form layouts.

```typescript
interface FormGridProps {
  children: ReactNode
  columns?: 1 | 2 | 3  // Max columns on desktop. Default 2.
}
```

**CSS:**
```css
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-md);
}
@container (min-width: 640px) {
  .form-grid { grid-template-columns: repeat(2, 1fr); }
}
@container (min-width: 960px) {
  .form-grid-3col { grid-template-columns: repeat(3, 1fr); }
}
```

Each form field can span full width with `col-span-full` class. Each form owns its field arrangement — FormGrid only provides the responsive column grid.

**Used by:** session-form, travel-form, accommodation-form, branding-form, registration-form, faculty-invite, csv-import, generation (8 components)

### Test Infrastructure: Playwright Visual Regression (`e2e/responsive/`)

**Setup:**
- 4 viewport presets: `phone` (375×812), `tablet` (768×1024), `laptop` (1280×800), `desktop` (1440×900)
- Screenshot test template that captures each page at all 4 viewports
- Baseline screenshots generated after Phase 3 Priority 1
- CI integration for automatic regression detection

**Files:**
- `e2e/responsive/viewports.ts` — viewport preset definitions
- `e2e/responsive/screenshot.spec.ts` — parameterized test that visits each route at each viewport
- `e2e/responsive/helpers.ts` — auth setup, route list, comparison utilities

---

## 7. Phase 3: Page-by-Page Migration

**Goal:** Migrate all 33 client components to use responsive patterns and fluid tokens. Run visual regression after each priority group.

**Depends on:** Phase 2 patterns complete. Feature flag ON during migration.

### Priority 1: Admin Command Center (6 files)

These pages benefit most from desktop optimization — admins live here.

**3.1.1 dashboard-client.tsx (374 lines)**
- Pattern: ResponsiveMetricGrid
- Replace hardcoded `grid-cols-2` KPI grid with ResponsiveMetricGrid (minCardWidth: 200)
- Replace fixed text sizes with fluid tokens
- Add fluid spacing

**3.1.2 event-workspace-client.tsx (186 lines)**
- Pattern: ResponsiveMetricGrid
- Module navigation cards use ResponsiveMetricGrid (minCardWidth: 180)
- Quick stats section uses ResponsiveMetricGrid (minCardWidth: 160)

**3.1.3 schedule-grid-client.tsx (345 lines)**
- Pattern: BESPOKE (not a reusable pattern — too specialized)
- **Mobile (< 768px):** Single-column agenda view. Sessions listed chronologically. Track shown as colored left border. Hall headers become filter chips at top.
- **Tablet (768–1023px):** Horizontal scroll container with `scroll-snap-type: x mandatory`. Each hall column `min-width: 280px`. Sticky time column on left. Swipeable between halls.
- **Desktop (≥ 1024px):** Full CSS Grid with named lines. All halls visible simultaneously. `grid-template-columns: [times] 4rem [hall-1] 1fr [hall-2] 1fr ...`. Sticky header row. `HOUR_HEIGHT` should be responsive (60px mobile, 80px desktop).
- Budget: 500+ lines of changes. This is the most complex single component.

**3.1.4 sessions-manager-client.tsx (598 lines)**
- Pattern: DetailView
- Session list (left) + session detail/form (right)
- Mobile: session list full-screen, tap navigates to detail view
- Desktop: side-by-side split

**3.1.5 certificates-client.tsx (903 lines)**
- Pattern: DetailView + **print stylesheet**
- Template list (left) + certificate editor/preview (right)
- Mobile: template list full-screen, tap navigates to editor
- Desktop: side-by-side with live preview
- **Print CSS:** `@media print` stylesheet for certificate output. Hide nav, chrome, controls. Full-page certificate rendering. This is a core feature — coordinators print certificates on-site.

**3.1.6 reports-client.tsx (173 lines)**
- Pattern: ResponsiveMetricGrid
- Export type cards use ResponsiveMetricGrid (minCardWidth: 240)
- Replace fixed text sizes with fluid tokens

### Priority 2: List Pages (6 files)

Most frequently used screens. Each needs column priority definition.

**3.2.1 people-list-client.tsx (266 lines)**
- Pattern: ResponsiveList
- Column priority: Name + role (mobile card), + email + tags (tablet), + phone + org (desktop table)
- Filter pills: keep horizontal scroll on mobile, inline bar on desktop

**3.2.2 registrations-list-client.tsx (252 lines)**
- Pattern: ResponsiveList
- Column priority: Name + status (mobile card), + type + date (tablet), + actions (desktop table)
- Fix hardcoded `grid-cols-3` summary cards — use ResponsiveMetricGrid
- Status filter: keep horizontal scroll on mobile, inline on desktop

**3.2.3 travel-list-client.tsx (214 lines)**
- Pattern: ResponsiveList
- Column priority: Name + dates (mobile card), + flight + status (tablet), + flags (desktop table)
- Red flags shown as badge on card, as column in table

**3.2.4 accommodation-list-client.tsx (334 lines)**
- Pattern: ResponsiveList
- Column priority: Name + hotel (mobile card), + dates + room (tablet), + flags + cost (desktop table)
- Red flags shown as badge on card, as column in table

**3.2.5 transport-planning-client.tsx (237 lines)**
- Pattern: ResponsiveList
- Column priority: Batch + vehicle (mobile card), + passengers + time (tablet), + route (desktop table)
- Batch filter: keep horizontal scroll on mobile

**3.2.6 failed-notifications-client.tsx (275 lines)**
- Pattern: ResponsiveList
- Column priority: Recipient + error (mobile card), + channel + time (tablet), + retry action (desktop table)

### Priority 3: Form Pages (6 files)

Each form uses FormGrid utility but owns its field arrangement.

**3.3.1 session-form-client.tsx (565 lines)**
- Utility: FormGrid (2-col)
- Layout: title (full-width), date + time (side-by-side), hall + track (side-by-side), description (full-width), speakers (full-width)

**3.3.2 travel-form-client.tsx (413 lines)**
- Utility: FormGrid (2-col)
- Layout: person (full-width), arrival date + departure date (side-by-side), arrival flight + departure flight (side-by-side), hotel (full-width), notes (full-width)

**3.3.3 accommodation-form-client.tsx (368 lines)**
- Utility: FormGrid (2-col)
- Layout: person + hotel (side-by-side), check-in + check-out (side-by-side), room type + room number (side-by-side), special requests (full-width), notes (full-width)

**3.3.4 branding-form-client.tsx (422 lines)**
- Utility: FormGrid (2-col) + ResponsiveImage
- Layout: primary color + secondary color (side-by-side), logo upload (full-width, uses ResponsiveImage for preview), header image (full-width, uses ResponsiveImage for preview), font selection (full-width)

**3.3.5 registration-form-client.tsx (205 lines) — public**
- Utility: FormGrid (2-col)
- Layout: first name + last name (side-by-side), email + phone (side-by-side), organization (full-width), registration type (full-width), dietary preferences (full-width)
- NOTE: This is a public-facing form. Must look polished on every device. Priority: mobile UX.

**3.3.6 faculty-invite-client.tsx (221 lines)**
- Utility: FormGrid (2-col)
- Layout: faculty select (full-width), role + session (side-by-side), message (full-width), send options (full-width)

### Priority 4: Specialized Pages (5 files)

**3.4.1 qr-checkin-client.tsx (346 lines)**
- Already partially responsive (best in codebase — 3 breakpoints)
- Refine: Add container queries. Fix `grid-cols-3` stats overflow on small phones. Add FilterSheet for session filter (replace horizontal scroll). Verify safe areas on all fixed elements.

**3.4.2 vehicle-kanban-client.tsx (377 lines)**
- Pattern: Custom responsive
- Mobile: Vertical list of vehicles with passengers as cards underneath. Single column.
- Tablet: Horizontal scroll kanban with `scroll-snap-type: x mandatory`. Each column `min-width: 300px`.
- Desktop: All columns visible side-by-side. Drag-drop between columns.

**3.4.3 csv-import-client.tsx (373 lines)**
- Utility: FormGrid for upload section
- Preview table: ResponsiveList for data preview
- Mapping UI: 2-col on desktop (source column → target field), stacked on mobile

**3.4.4 editor-client.tsx (294 lines)**
- Pattern: DetailView
- Canvas/editor full-screen on mobile
- Properties panel slides out as side panel on desktop

**3.4.5 generation-client.tsx (327 lines)**
- Utility: FormGrid for generation options
- Preview: ResponsiveImage for certificate preview
- Progress: full-width on all screens

### Priority 5: Lighter Pages (10 files)

These primarily benefit from fluid tokens and the app shell — minimal pattern work needed.

**3.5.1 events-list-client.tsx (114 lines)**
- ResponsiveMetricGrid for event cards (minCardWidth: 280)
- Fluid tokens for text/spacing

**3.5.2 person-detail-client.tsx (329 lines)**
- Single column on mobile, 2-column info grid on desktop
- Contact info + event history side-by-side on desktop

**3.5.3 more-menu-client.tsx (102 lines)**
- Mobile only (sidebar handles desktop navigation)
- Conditionally render: `if (navMode === 'desktop') return null`

**3.5.4 attendee-program-client.tsx (313 lines)**
- Simplified version of schedule grid (no editing, no drag-drop)
- Mobile: agenda list. Desktop: read-only schedule grid.

**3.5.5 event-landing-client.tsx (136 lines) — public**
- Full-width hero image using ResponsiveImage (context: 'hero')
- Event details: fluid typography, centered content with `max-w-4xl` on desktop
- CTA buttons: full-width on mobile, inline on desktop

**3.5.6 registration-success-client.tsx (79 lines) — public**
- Centered content. Replace fixed widths with fluid. Minimal changes.

**3.5.7 faculty-confirm-client.tsx (162 lines) — public**
- FormGrid for confirmation fields. Fluid tokens. Minimal changes.

**3.5.8 faculty-confirmed-client.tsx (46 lines) — public**
- Centered success message. Fluid tokens only. Minimal changes.

**3.5.9 import-success-client.tsx (106 lines)**
- Stats: ResponsiveMetricGrid. Fluid tokens. Minimal changes.

**3.5.10 team-management-client.tsx (261 lines)**
- Member list: ResponsiveList (name + role mobile, + email + joined desktop)
- Invite form: FormGrid

---

## 8. Phase 4: Polish & Edge Cases

**Goal:** Handle every device edge case that separates a ₹20 lakh product from a ₹5 lakh product.

**Depends on:** All Phase 3 pages migrated and passing visual regression.

### 4A: Safe Area Sweep
- Audit every `position: fixed` element for `env(safe-area-inset-*)` usage
- Bottom tab bar: `pb-[env(safe-area-inset-bottom)]` ✓ (done in Phase 1)
- Any floating action buttons: add safe area padding
- Test landscape mode on tablets — `safe-area-inset-left` and `safe-area-inset-right` become non-zero
- Test iPhone with Dynamic Island — `safe-area-inset-top` accounts for it automatically

### 4B: Foldable Device Support (Progressive Enhancement)
- Add `@media (horizontal-viewport-segments: 2)` for Samsung Galaxy Fold unfolded:
  - People list-detail: list on left segment, detail on right segment
  - Registration list-detail: same split
  - Session list-detail: same split
- This is pure progressive enhancement — no degradation on non-foldable devices

### 4C: Accessibility Pass
- Final touch target audit: every button, link, interactive element ≥ 44×44px tap area
- `prefers-reduced-motion`: disable sidebar transition animations, reduce any motion
- Focus-visible states on all interactive elements (keyboard navigation)
- Screen reader testing with VoiceOver on iOS Safari
- Color contrast verification at all viewport sizes (ensure fluid text stays readable)

### 4D: Performance Verification
- Lighthouse scores at all 4 viewport presets
- QR scanner: < 1 second render on Pixel 6a (mid-range baseline)
- Profile sidebar CSS transition cost
- Verify no CLS regressions from responsive image loading (all images must have explicit aspect ratios)
- Bundle size check: new pattern components should add < 5KB gzipped total

---

## 9. Phase 5: Ship

**Goal:** Remove feature flag, clean up, and deploy.

**Depends on:** Phase 4 complete. All Playwright visual regression tests green.

### 5A: Remove Feature Flag
- Delete `NEXT_PUBLIC_RESPONSIVE_SHELL` env var
- Remove feature flag conditional in `app-shell.tsx`
- Remove old `max-w-lg` layout code from `(app)/layout.tsx`

### 5B: Final Verification
- Full Playwright visual regression suite at all 4 viewports
- Real device testing:
  - iPhone SE or iPhone 13 mini (small phone)
  - iPad (tablet)
  - MacBook (laptop)
  - Samsung Galaxy Fold if available (foldable)
- Auth flow verification (Clerk sign-in, org switch, role-based access)
- Print certificate flow verification

### 5C: Deploy
- Merge to main
- Deploy to production
- Monitor Sentry for any layout-related errors post-deploy

---

## 10. Dependency Chain

```
Phase 0 (Spike)
    │ blocks
    ▼
Phase 1 (Foundation: tokens + shell + touch targets)
    │ blocks
    ▼
Phase 2 (Patterns: list + grid + detail + image + form-grid + tests)
    │ blocks
    ▼
Phase 3 (Pages — parallelizable within priority groups)
    ├── Priority 1: 6 admin pages (can run in parallel)
    ├── Priority 2: 6 list pages (can run in parallel, independent of P1)
    ├── Priority 3: 6 form pages (can run in parallel, independent of P1/P2)
    ├── Priority 4: 5 specialized pages (can run in parallel)
    └── Priority 5: 10 lighter pages (can run in parallel)
    │ all must complete
    ▼
Phase 4 (Polish: safe areas + foldables + a11y + perf)
    │ blocks
    ▼
Phase 5 (Ship: remove flag + verify + deploy)
```

**Maximum parallelism in Phase 3:** Up to 33 agents if all patterns are ready. Recommended: run by priority group (6 parallel → 6 parallel → 6 parallel → 5 parallel → 10 parallel).

---

## 11. Risk Register

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | fluid-tailwind incompatible with Tailwind v4 | Blocker | Phase 0 spike validates. Fallback: hand-write clamp() tokens. |
| R2 | App shell breaks all pages during migration | High | Feature flag. Old layout works until migration complete. |
| R3 | shadcn/ui overlays position incorrectly with sidebar | High | Phase 0 spike B verifies. Fix overlay container if needed. |
| R4 | Clerk components conflict with new shell | High | Phase 0 spike B tests Clerk inside sidebar. |
| R5 | Schedule grid bespoke rebuild exceeds budget | High | Budget 500+ lines. Do not treat as generic pattern. |
| R6 | Form abstractions too rigid | Medium | FormGrid is utility only. Each form owns its layout. |
| R7 | CSS specificity conflicts (fluid tokens + breakpoints) | Medium | Rule: fluid for typography/spacing, breakpoints for layout. Never mix on same property. |
| R8 | Performance regression on mobile | Medium | Phase 4D profiles. QR scanner < 1s. Sidebar transitions GPU-accelerated. |
| R9 | Visual regressions missed | Medium | Playwright at 4 viewports after each priority group. |
| R10 | Scope creep during page migration | Low | Each issue is self-contained. Pattern deviations documented, not improvised. |

---

## 12. Out of Scope

These are explicitly NOT part of this PRD:
- Dark mode implementation (tokens are ready for it, but not shipping now)
- PWA / service worker for offline QR (separate PRD)
- Native mobile app
- Redesigning any existing UI — only making existing UI responsive
- New features or functionality — purely layout/responsive adaptation
- Database or API changes — this is a frontend-only effort

---

## 13. Acceptance Criteria (Definition of Done)

- [ ] Every page renders without horizontal overflow at 375px, 768px, 1024px, 1440px
- [ ] Every interactive element has ≥ 44×44px touch target
- [ ] Typography scales fluidly from 375px to 1440px (no jumps)
- [ ] Spacing scales fluidly from 375px to 1440px (no jumps)
- [ ] Desktop (≥ 1024px) shows sidebar navigation, not bottom bar
- [ ] Tablet (768–1023px) shows icon-rail sidebar, not bottom bar
- [ ] Mobile (< 768px) shows bottom tab bar, no sidebar
- [ ] Data lists show cards on mobile, tables on desktop
- [ ] Forms use 2-column layout on desktop, single column on mobile
- [ ] Dashboard KPI cards reflow automatically (4 → 3 → 2 → 1 columns)
- [ ] Schedule grid shows agenda on mobile, full grid on desktop
- [ ] Certificates can be printed via browser print (clean output, no chrome)
- [ ] All branding images use next/image with responsive sizes
- [ ] Safe areas respected on notch/Dynamic Island devices
- [ ] Playwright visual regression tests pass at all 4 viewports
- [ ] Lighthouse performance ≥ 90 on mobile
- [ ] QR scanner renders < 1 second on mid-range phone
- [ ] Feature flag removed, old layout code deleted
