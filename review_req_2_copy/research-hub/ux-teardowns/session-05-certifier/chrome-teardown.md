# Certifier.io — Chrome UX Teardown

**Date**: 2026-04-05
**Platform**: Certifier.io (app.certifier.io)
**Plan**: Starter (Free) — 250 credentials/year
**Browser**: Chrome on macOS

---

## GLOBAL NAVIGATION

### Left Sidebar (persistent across all pages)

**Top**: Account switcher ("shailesh" + chevron), copy icon, Quick Search (Cmd+K), help (?) icon

**"Issue & Track" section:**
- Dashboard (`/dashboard`)
- Credentials (expandable chevron)
  - Credential Templates (`/credential-templates`)
  - All Credentials (`/credentials`)
- Pathways (`/pathways`) — Advanced Plan paywall
- Analytics (`/analytics/engagement`) — Professional Plan paywall

**"Graphic Assets" section:**
- Design Templates (`/designs`)
- Email Templates (`/email-templates`) — Professional Plan paywall

**Hidden in sidebar (discovered via read_page):**
- Integrations (`/integrations`)
- Automations (`/automations`)

**Bottom of sidebar:**
- Getting Started checklist (33% completed, collapsible)
  - "Add credential template" — blue "First" badge
  - "Issue credentials"
- Credential Usage: 0 / 250 (progress bar)
- Upgrade button (blue, full-width)

### Top Bar
- Breadcrumb navigation (Back / Page Title)
- Context-specific actions on right (varies by page)

---

## FLOW 1: TEMPLATE EDITOR (Certificate Design)

### Step 1: Entry Point — Design Templates List

**Screen**: Design Templates
**URL**: `app.certifier.io/designs`
**Layout**: Standard list page

**Top bar**: "Design Templates" header — "Create Design Template" button (blue, top-right)

**Toolbar**: 
- Sort: "Newest Created" toggle
- Filter: "Filter" button
- Search: "Search designs" text input + magnifying glass icon
- Pagination: `< 1 / 0 >` — "100 / page" dropdown
- View toggle: list view icon

**Empty state**: Illustration of photo placeholder + "You have no design templates yet" heading. Body text explains design templates define credential appearance and can be reused across credential templates via dynamic attributes. "+ Create Design Template" link.

**Create flow**: Clicking "Create Design Template" opens a **dropdown menu** with two options:
1. **Certificate Design** (document icon)
2. **Badge Design** (gear/badge icon)

**Transition**: Dropdown → page navigation to `/designs/create`

---

### Step 2: Certificate Design Editor

**Screen**: New Design Template
**URL**: `app.certifier.io/designs/create` (unsaved) → `app.certifier.io/designs/{uuid}` (after save)
**Layout**: Three-column — left tool sidebar | center tool panel + template gallery | right canvas

#### Top Bar
- Breadcrumb: "Back / New Design Template" (changes to "Back / My design #1" after save)
- Design name field: text input, default "My design #1" (editable)
- "Create Design Template" button (blue) → changes to "Save" after first save

#### Left Tool Sidebar (icon + label, vertical stack)
1. **Templates** (grid icon) — ACTIVE by default
2. **Uploads** (image icon)
3. **Elements** (shapes icon)
4. **Text** (T icon)
5. **Attributes** (brackets [ ] icon) — MOST CRITICAL
6. **QR Codes** (QR icon)
7. **Layers** (stack icon)

Each tool has an active state: blue background highlight + blue text.

#### Canvas Toolbar (above the canvas)
- "Add Background Image" button (with image icon)
- Undo / Redo buttons (circular arrow icons) — 3 levels shown
- Paper Size toggle: **A4** | **US Letter** (with info icon)
- Fullscreen button (expand icon)
- "Preview" button (eye icon)

---

### Step 2a: Templates Panel (default open)

**Orientation toggle**: **Landscape** (active, blue underline) | **Portrait**

**Filter chips** (pill buttons with + icon):
- **Category** — opens checkbox dropdown:
  - Course, CPD, Completion, Participation, Webinar, Training, Recognition, Achievement, Appreciation, Employee of the Month
- **Style** — checkbox dropdown (not expanded)
- **Color** — checkbox dropdown (not expanded)
- **"Clear All"** link

**Template gallery**: 3-column grid of certificate thumbnail previews. Templates show:
- Certificate title (e.g., "CERTIFICATE OF COMPLETION")
- `[recipient.name]` placeholder text
- Various design styles (formal, modern, minimal)
- One blank template card with "+" icon for starting from scratch
- Templates load lazily (grey placeholder cards shown initially)

**Behavior**: Clicking a template applies it to the canvas immediately. The canvas on the right updates to show the full certificate design.

---

### Step 2b: Uploads Panel

- **"Upload Image"** button (with upload icon)
- **Supported formats**: "Supports SVG, PNG and JPG. Up to 2MB."
- **"All Used"** section: Shows thumbnail grid of images already used in the current design (e.g., company logo, medal image, additional logo)

---

### Step 2c: Elements Panel

Categorized into sections, each with "See all" link and horizontal scroll arrows:

1. **Lines**: Vertical line, horizontal line
2. **Shapes**: 
   - Row 1 (filled): square, rectangle, circle, triangle
   - Row 2 (outlined): square, rectangle, circle, triangle
3. **Icons**: Laurel wreaths (various styles), stars, trophies, medals
4. **Ribbons**: Banner/ribbon decorative elements

Elements are clickable — clicking adds them to the canvas.

---

### Step 2d: Text Panel

- **"+ Add text box"** button at top

**Text Styles** section (3 presets):
- "Add heading" — large bold text
- "Add subheading" — medium bold text  
- "Add normal text" — regular text

**Combinations** section (pre-built text blocks):
- "CERTIFICATE OF ACHIEVEMENT" title block
- "CERTIFICATE OF COMPLETION" with `[recipient.name]`
- Signature block (cursive "Signature" + "Name Surname" + "Program Mentor")
- Issue Date block (`[certificate.issued_on]` + "Issue Date" label)
- Name Surname block
- `[certificate.uuid]` block

---

### Step 2e: Attributes Panel — CRITICAL

**"+ Add Custom Attribute"** button at top (full-width, outlined)

**Default attributes organized by category:**

**Recipient:**
- Recipient Name — shows **"In Use"** badge (blue, rounded) when placed on canvas

**Credential:**
- Credential UUID — **"Use"** button (blue text, rounded)
- Expiry Date (i) — "Use" button
- Issue Date (i) — "Use" button

**Issuer:**
- Issuer Name — "Use" button
- Issuer Support Email — "Use" button

**Group:**
- Group Name — "Use" button

**Bottom**: "Manage Attributes" link with gear icon (navigates to attribute settings)

**Visual distinction**: 
- **"In Use"** = attribute is already placed on the canvas (blue filled badge)
- **"Use"** = attribute is available but not yet placed (blue outlined button)
- Each attribute has a type icon: T (text), calendar (date), mail (email)

**Clicking "Use"**: Adds the attribute as a dynamic text element on the canvas in `[attribute.name]` format.

---

### Step 2f: QR Codes Panel

Two options:
1. **"+ Verification Page"** — "Redirects to the digital version of the certificate allowing anyone to verify its validity."
2. **"+ Custom URL"** — "Redirects to the specified link."

---

### Step 2g: Layers Panel

Lists all elements on the canvas as individual rows, ordered top-to-bottom (front-to-back z-order):
- Each row shows: **drag handle** (6-dot grip icon) | content preview (text content or image thumbnail)
- Layer types visible: text layers, image layers, dynamic attribute layers
- Layers can be reordered by dragging the grip handle

Example layer stack for default template:
- "Johnson" (signature), "Driben" (signature), "ADDITIONAL LOGO" (image), `[certificate.issued_on]`, "Issue date:", `[certificate.uuid]`, "Graduate No.:", medal image, "Co-founder, Director...", "Anthony Johnson", etc.

---

### Step 2h: Canvas Selection Behavior

**Clicking an element on canvas shows:**
- **Blue selection border** with **corner handles** (small circles at 4 corners)
- **Move handle** (4-arrow cross icon) at bottom center of selection
- **Floating toolbar** above the selected element with 4 icons:
  - Attributes `[ ]` icon
  - Fit/align icon
  - Delete/trash icon
  - `...` more options menu

**For text elements — top toolbar changes to text formatting:**
- Font family dropdown (e.g., "Marcellus")
- Font weight dropdown (e.g., "Regular")
- Font size: decrease (−) / size number / increase (+) (e.g., 35)
- "Scaling" checkbox (checked by default)
- Text color button (A with color indicator)
- **Bold (B)**, **Italic (I)**, **Underline (U)** toggle buttons
- Alignment buttons (left, center, right)

**For background — top toolbar changes to:**
- Pencil/edit icon
- "Replace Background" button (with image icon)
- Delete/trash icon
- Undo/Redo buttons

**Dynamic attribute tooltip**: Clicking `[recipient.name]` shows tooltip: "[recipient.name] is a required dynamic attribute that will be replaced with real names of your certificate recipients... This attribute is mandatory, you cannot delete it. Learn more"

---

### Step 2i: Save Flow

- Click "Create Design Template" → saves immediately, URL changes to `/designs/{uuid}`, button text changes to "Save"
- Design name defaults to "My design #1" (editable text input in top bar)
- No separate save dialog or name prompt — inline editing
- Auto-save: not observed (manual save via button)

---

## FLOW 2: CREDENTIAL TEMPLATE CREATION (pre-requisite to issuance)

**Screen**: New Credential Template
**URL**: `app.certifier.io/credential-templates/create`

### Three tabs (horizontal):
1. **Info & Appearance** (default active, blue underline)
2. **Advanced Settings** (greyed out — tooltip: "To access Advanced Settings, you need to create a credential template first.")
3. **Email Settings** (greyed out — same restriction)

### Top bar actions:
- Three-dot menu (⋮)
- "+ Issue Credentials" (outlined button, disabled state)
- "Preview" (eye icon button)
- "Create Credential Template" (blue button)

### Info & Appearance tab fields:

**Name*** (required):
- Text input, placeholder: "ex. Healthcare Webinar"
- Helper text: "Specify the name of the occasion on which you would like to issue credentials."

**Appearance*** (required):
- "+ Attach Design" area — dashed border box with image placeholder icon
- Helper text: "Attach a design to this credential template. A credential template may include one certificate and one badge."

**Enhanced Details** section:
- Helper text: "Add more details about your event, such as type, level, format, duration, price, and related skills."
- **Type**: dropdown "Select type"
- **Level**: dropdown "Select level"
- **Format**: dropdown "Select format"
- **Duration**: dropdown "Select time frame"
- **Price**: dropdown "Select price"
- **Skills**: combobox/tag input "Start typing skill name..."

**About** section:
- **Description**: textarea with markdown support, placeholder about ACME Healthcare Webinar
- **Learning Event Link**: text input, placeholder "https://your-learning-event"

**Earning Criteria** section:
- "Add Earning Criteria" button
- Helper text: "Add an earning criteria to showcase the specific requirements to earn this award."

**Bottom**: "Create Credential Template" submit button

### First-visit modal:
- "What is a Credential Template?" info modal with "Got It, Thanks!" button
- Explains credential templates include name, design, description, and advanced options like expiration rules or recipient permissions

---

## FLOW 3: EMAIL DELIVERY SETUP

**Screen**: Email Templates
**URL**: `app.certifier.io/email-templates`

**Status**: Behind Professional Plan paywall — not accessible on free tier.

**Promotional page shows:**
- "You discovered Email Templates" heading
- Features: credential delivery emails, reminders, personalize with dynamic attributes, control email experience
- CTAs: "Upgrade to Access" (blue), "Schedule Demo" (outlined)

**Email preview mockup (right side):**
- From: your.company@domain.com
- Subject: "View your credential"
- Body: LOGO placeholder, "Congratulations! Here's your credential for [group.name]", grey placeholder blocks, "View Credential" blue CTA button

---

## FLOW 4: POST-ISSUANCE MANAGEMENT

### All Credentials List

**Screen**: All Credentials
**URL**: `app.certifier.io/credentials`

**Top bar**: "Issue Credentials" blue button (top-right)

**Toolbar**:
- Sort: "Newest Created" toggle
- Filter: "Filter" button  
- Search: "Search credentials" text input
- Pagination: `< 1 / 0 >` — "100 / page" dropdown
- Settings gear icon

**Empty state**: "You have no issued credentials yet" — "All Credentials section lets you manage the credentials you've issued — edit, resend, delete, or export them as PDFs." — "+ Issue Credentials" link

### Analytics

**Screen**: Analytics
**URL**: `app.certifier.io/analytics/engagement`

**Status**: Behind Professional Plan paywall.

**Promotional page shows:**
- "You discovered Advanced Analytics"
- Features: Track credential performance (email opens to shares/downloads), Compare across templates, Export insights

**Mock data panels:**
- "Recipient Engagement Breakdown" — pie chart: Download 25%, LinkedIn 40%, Twitter 10%, Facebook 25%
- "Top Promoters" table — Name, Views, Channels columns with social media icons (LinkedIn, Facebook, X/Twitter)

---

## FLOW 5: VERIFICATION PAGE

Not directly testable without issued credentials. Based on the QR Code panel in the editor:
- Verification Page QR code redirects to a digital version of the certificate
- The verification page URL would be auto-generated per certificate
- Custom URL QR codes can redirect to any specified link

---

## ADDITIONAL FEATURES

### Pathways (Advanced Plan)
**URL**: `app.certifier.io/pathways`
- Create structured learning journeys with visual roadmaps
- Steps & progress trackers for learners
- Auto-issue credentials when pathway steps completed
- Visual mockup shows: Step 1: Fundamental course → Step 2: Practical module → Final: Master Certification

### Dashboard Overview
**URL**: `app.certifier.io/dashboard`
- "Issuing Overview" header — "Data updates every 24 hours"
- "+ Issue Credentials" blue button (top-right)
- Stats cards (right sidebar):
  - Issued Credentials: 0 (last 12 months)
  - Opened Credentials: 0 (last 12 months)
  - Shared Credentials: 0 (last 12 months)
- Center: credentials delivery summary analytics (empty state when no credentials issued)
- Plan indicator: "Starter Plan (Free) 250 credentials / yr." + Upgrade link

---

## KEY UX PATTERNS & OBSERVATIONS

### Design System
- **Color palette**: Blue primary (#2563EB-ish), white backgrounds, grey borders
- **Typography**: Clean sans-serif throughout the app shell; templates use serif fonts (Marcellus etc.)
- **Spacing**: Generous whitespace, cards with rounded corners
- **Icons**: Consistent line-icon style throughout sidebar and tools

### Navigation Patterns
- **Left sidebar** is persistent and always visible
- **Breadcrumb** navigation at top with "Back" link
- **Tab navigation** within pages (Info & Appearance / Advanced Settings / Email Settings)
- **Dropdown menus** for create actions (Certificate vs Badge)

### Empty States
- Every list page (designs, credentials) has a clear empty state with:
  - Illustrative icon/image
  - Explanatory heading
  - Descriptive body text
  - Primary action CTA

### Paywall Pattern
- Features behind paywall show a promotional page with:
  - Plan badge (Professional Plan / Advanced Plan)
  - "You discovered [Feature]" heading
  - Bullet-point feature list
  - "Upgrade to Access" (blue) + "Schedule Demo" (outlined) buttons
  - Visual mockup of the feature on the right side

### Onboarding
- "Getting Started" checklist in sidebar (collapsible, with progress bar)
- Info modals on first visit to key pages ("What is a Credential Template?")
- Tooltips for UI elements ("Control side menu")
- "First" badge on checklist items

### Dynamic Attributes System
- Attributes use `[attribute.name]` bracket syntax on canvas
- Default attributes: recipient.name, certificate.uuid, certificate.issued_on, expiry_date, issuer.name, issuer.support_email, group.name
- Custom attributes can be added via "+ Add Custom Attribute"
- Mandatory attribute (recipient.name) cannot be deleted — enforced with tooltip
- Visual distinction between "In Use" (placed on canvas) vs "Use" (available)

### Template System Architecture
- **Design Template** = visual layout (reusable across credential templates)
- **Credential Template** = design + metadata + settings (the issuance unit)
- **Credential** = issued instance to a recipient
- This 3-tier separation allows one design to serve multiple credential templates

---

## SIGNUP FLOW (documented before login)

**URL**: `certifier.io/sign-up` (redirects to `app.certifier.io/sign-up`)
**Layout**: Split — left form panel | right blue testimonial panel

**Form fields:**
- Business Email (text input, placeholder: "john@acme.com")
- Password (password input with visibility toggle)
  - Strength indicators: 8 characters, Lower case, Upper case, Special, Number (individual check icons)

**CTAs:**
- "Sign Up for Free" (blue button)
- "or" divider
- "Sign up with Google" (white button with G icon)

**Social proof (right panel):**
- Large testimonial quote on blue background
- Reviewer avatar, name, title, company
- Logo bar: Stanford Medicine, Amazon, Volvo, Warner Bros, USC

**Top bar**: Certifier logo | "Log in" link
