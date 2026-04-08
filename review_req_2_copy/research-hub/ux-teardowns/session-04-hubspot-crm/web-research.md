# HubSpot Free CRM -- UX Teardown for Contact & Data Management

> **Research date:** 2026-04-05
> **Researcher:** UX Research Agent
> **Purpose:** Inform the GEM India Conference App Master People Database module design
> **Focus:** Contact list views, create/edit forms, CSV import, deduplication, export, lists & segmentation

---

## 1. Contact List View

### Default Layout

The contacts home page (`CRM > Contacts`) displays records in a **tabular list** with a toolbar above and pagination below.

| Element | Details |
|---------|---------|
| **Default columns** | Name (first + last), Email, Phone number, Contact owner, Last activity date, Lead status, Create date |
| **Column customization** | Click "Edit columns" to add, remove, or reorder. Drag the handle to the left of a column name to reposition. Any contact property (default or custom) can be surfaced as a column. |
| **Sorting** | Click any column header to sort ascending/descending. Only one sort active at a time. |
| **Search bar** | Global search at the top; supports up to 3,000-character queries (API). In-UI search filters across name, email, phone, and other indexed fields. |
| **Filters** | Property-based dropdown filters above the table. "Advanced filters" button opens a panel with AND/OR logic across any property. |
| **Saved views** | Filtered + sorted + column configurations can be saved as named **view tabs**. Users switch views via horizontal tabs. A "Create new view" button adds new tabs. Pre-built default views (e.g., "All contacts", "My contacts", "Recently created") ship out of the box. |
| **Pagination** | Standard next/prev page controls at the bottom. API uses cursor-based pagination. The UI shows record count (e.g., "1-100 of 5,432"). |
| **Bulk actions** | Select one or more rows via checkboxes to access: Delete, Edit property values, Enroll in sequence, Assign owner, Add to list, Export, Create tasks. |

### UX Pattern Takeaways for GEM App

- **Saved views are first-class citizens** -- they sit as persistent tabs, not buried in a dropdown. This is excellent for role-based workflows (e.g., "Speakers", "Sponsors", "Volunteers").
- **Column customization is per-user** -- each user personalizes without affecting others.
- **Bulk actions appear contextually** when rows are selected (toolbar transforms).

---

## 2. Create Contact Form

### Access & Flow

Users click the **"Create contact"** button (top-right of Contacts page). A **right-hand slide-over panel** appears (not a full page) with form fields.

### Default Fields on the Create Form

| Field | Required? | Notes |
|-------|-----------|-------|
| Email | **Required** (enforced) | HubSpot validates format before submission. Primary unique identifier. |
| First name | Optional | |
| Last name | Optional | |
| Phone number | Optional | |
| Job title | Optional | |
| Lifecycle stage | Optional | Dropdown with pre-set values (Subscriber, Lead, MQL, SQL, Opportunity, Customer, Evangelist) |
| Lead status | Optional | Dropdown: New, Open, In Progress, Unqualified, etc. |
| Contact owner | Optional | Dropdown of HubSpot users |

### Customizing the Create Form (Admin)

Admins can configure which fields appear on the create form via **Settings > Objects > Contacts > "Creating contacts" tab**. Fields can be:
- Added from any existing property
- Marked as required (toggling "Make this field required")
- Reordered via drag-and-drop
- Removed from the form (property still exists, just not shown at creation time)

### Custom Property Field Types

When creating new properties (Settings > Properties), HubSpot offers these field types:

| Field Type | Description | Best For |
|------------|-------------|----------|
| **Single-line text** | Short text, any characters | Names, emails, IDs |
| **Multi-line text** | Resizable text area with line breaks | Notes, descriptions, bios |
| **Number** | Numeric values only; supports >, <, between filtering | Quantities, ratings, scores |
| **Dropdown select** | Predefined options, single selection | Status, category, role |
| **Multiple checkboxes** | Predefined options, multi-select | Tags, interests, dietary needs |
| **Date picker** | Calendar date input; supports before/after/between filtering | Event dates, DOB, deadlines |
| **Radio select** | Single selection displayed as radio buttons | Yes/No with clear options |
| **Single checkbox** | Boolean true/false | Consent, opt-in, attendance confirmed |
| **Calculation** | Computed from other number properties | Revenue calculations (paid tiers) |
| **Score** | Computed score based on criteria | Lead scoring (paid tiers) |
| **Rich text** | Formatted text with HTML | Long-form content |
| **File** | File upload attachment | Documents, photos |

### UX Pattern Takeaways for GEM App

- **Slide-over panel** for creation keeps list context visible -- faster than full-page navigation.
- **Email as the only hard-required field** is a deliberate choice for CRM; for GEM, we may want Name + Phone as required (Indian context: not all attendees use email daily).
- **Admin-configurable form fields** separate data model from UI -- powerful pattern to adopt.

---

## 3. Contact Detail Page

### Three-Column Layout

The contact record page is organized into **three persistent sections**:

#### Left Sidebar
- **Action buttons:** Call, Email, Log activity, Create task, Create note
- **"About this contact" card:** Key properties displayed in an editable card format; users can click any value to edit inline
- **Communication subscriptions card:** Email opt-in/out status
- **Website activity card:** Page views and visit history
- **Collapsed sections** for additional property groups

#### Middle Column (Tabs)
- **Overview tab** (default landing): Highlighted property values + recent activities summary
- **Activities tab:** Full chronological **activity timeline** showing emails, calls, meetings, notes, tasks, form submissions, page views. Each activity type has a distinct icon. Filter controls let users show/hide activity types.
- **Sales tab:** Sales-specific properties and deal pipeline visualization
- **Custom tabs:** Admins can add additional tabs via "Customize tabs"

#### Right Sidebar
- **Associations panel:** Cards showing linked Companies, Deals, Tickets, and other associated records. Click to expand a table view with filters by object type or association label.
- **Segment memberships:** Which lists/segments this contact belongs to
- **Attachments:** Files associated with the record
- **Playbooks:** (Paid) Sales playbooks assigned to this contact

### UX Pattern Takeaways for GEM App

- **Activity timeline as the central feature** -- everything that happened with this person in one chronological stream. Critical for conference ops (registration, check-in, session attendance, feedback).
- **Association cards** in the sidebar are powerful for linking People to Events, Sessions, Committees, Accommodations.
- **Inline editing** on the detail page reduces friction vs. opening a separate edit form.

---

## 4. CSV Import Flow

### Step-by-Step Process

#### Step 1: Start Import
Navigate to **CRM > Contacts > Import** (or Settings > Import & Export). Click **"Start an import"**.

#### Step 2: Select Import Type
Choose between:
- **File from computer** (CSV, XLSX, or XLS)
- **Opt-out list** (for unsubscribes)

Then select:
- **One file** or **Multiple files**
- **One object** (contacts only) or **Multiple objects** (contacts + companies)

#### Step 3: Upload File
- Accepted formats: `.csv`, `.xlsx`, `.xls`
- File must contain **one sheet only**
- Must include a **header row** (column headers = property names)
- Column order does not matter
- Click "Choose a file" to upload

#### Step 4: Column Mapping

This is the core UX of the import flow:

| Feature | Details |
|---------|---------|
| **Auto-mapping** | HubSpot attempts to automatically match CSV column headers to existing contact properties. Matched columns show a green checkmark. |
| **Manual mapping** | Unmatched columns show a dropdown. User searches for and selects the target HubSpot property. Hovering over a property shows its details (type, description) before selection. |
| **Create new property** | If no match exists, user clicks "Create new property" in the dropdown. A right-panel form lets them define name, type, and group -- the column data maps to the new property immediately. |
| **Unique identifier row** | For contacts, the **Email** column must be mapped (shown with a key icon). This is the deduplication key. If a Record ID column exists, it maps to Record ID. |
| **Skip column** | Users can choose "Don't import" to skip a column entirely. |
| **Preview** | A preview of mapped data appears showing sample rows so users can verify correctness before proceeding. |

#### Step 5: Duplicate Handling

During import, HubSpot offers these options for records where the email already exists:

| Option | Behavior |
|--------|----------|
| **Update existing records** | Overwrites property values on matching contacts with CSV data |
| **Do not update existing records** | Skips rows where email matches; only creates new records |
| **Create new record** | Forces creation even if email matches (creates duplicate) |

#### Step 6: Review & Finalize
- Review total records to import
- Name the import (for history tracking)
- Opt-in to send notifications on completion
- Click **"Finish import"**

#### Post-Import
- Import history page shows status (complete, in progress, errors)
- Error file downloadable with row-level error details
- Imported contacts tagged with import name for easy filtering

### UX Pattern Takeaways for GEM App

- **Auto-mapping with manual override** is the gold standard for CSV import UX. Reduces friction for well-formatted files while handling edge cases.
- **Preview before commit** builds confidence; essential for non-technical conference organizers.
- **"Create new property" inline** during mapping is a power-user feature that prevents import abandonment.
- **Named imports with history** are critical for audit trails (e.g., "Speaker list batch 3 - March 2026").

---

## 5. Deduplication & Merge

### Detection Criteria

HubSpot identifies potential duplicates by comparing:

**For Contacts:** Email address, First name + Last name, Phone number, IP country, Zip code, Company name

**For Companies:** Company domain name, Company name, Country/Region, Phone number, Industry

Identical email addresses are **automatically deduplicated** at creation time. Near-matches (e.g., john@company.com vs. john.doe@gmail.com) require manual review.

### Manage Duplicates Tool

| Feature | Details |
|---------|---------|
| **Access** | `CRM > Contacts > Actions > Manage duplicates` |
| **Availability** | Operations Hub Professional and Enterprise only (NOT free tier) |
| **Display** | Potential duplicate pairs listed, ranked by **confidence score** |
| **Scan frequency** | Runs once daily (newly created duplicates not caught immediately) |
| **Viewing limits** | Professional: up to 5,000 pairs/day; Enterprise: up to 10,000/day |
| **Filtering** | Filter duplicates by Owner, Create date, Last activity date, Discovered date, or Lifecycle stage |

### Merge Workflow

1. From the duplicates list, click **"Review"** on a pair
2. Both records displayed **side by side** with all properties compared
3. Select which record to keep as **primary** (recommendation: pick the one with most recent engagement + earliest creation date)
4. For conflicting properties, select values from either record field-by-field using **"Set properties to review"**
5. Click **Merge** to execute

### Field Survival Rules

| Rule | Details |
|------|---------|
| **Primary record wins by default** | Property values from the primary record take priority for conflicts |
| **Activities merge** | All activities, notes, and associations from both records combine into the surviving record |
| **Email engagement** | Unique email engagement data and form submissions merge from both records |
| **Opt-out preferences** | Primary record's email opt-out preferences are kept |
| **Creation date** | The oldest creation date is preserved |
| **Original source** | Primary record's original source is retained |
| **Recent submissions** | For automatic merges (same email/token), most recent submission data overwrites earlier data |

### Free Tier Deduplication

- **Automatic:** Exact email match deduplication at record creation (all plans)
- **Automatic:** User token (browser cookie) based merging (all plans)
- **Manual merge:** Available on all plans -- open a contact, click Actions > Merge, search for duplicate, compare and merge
- **Manage Duplicates tool:** NOT available on free plan (requires Operations Hub Professional+)
- **Bulk merge via workflows:** Not supported natively on any plan; requires third-party tools (Insycle, Koalify, Dedupely)

### UX Pattern Takeaways for GEM App

- **Side-by-side comparison** is the standard UX for merge decisions -- we should adopt this.
- **Confidence scoring** for duplicate pairs helps prioritize review effort.
- **Field-by-field selection** during merge gives users control without forcing all-or-nothing decisions.
- For GEM, we should consider **phone number + name** as primary duplicate detection (not just email) given the Indian attendee base.

---

## 6. Export

### Export Flow

1. Navigate to the contacts list view
2. Apply filters and/or select a saved view to narrow the dataset
3. Click **"Export"** button (or from Actions menu)
4. Choose export scope:
   - **All contacts** in current view
   - **Selected contacts** (if rows are checked)
5. Choose columns:
   - **"Include only properties in the view"** -- exports only visible columns
   - **"All properties"** -- exports every contact property
6. Choose file format
7. Click Export; file delivered via email or direct download

### File Format Options

| Format | Best For | Limits |
|--------|----------|--------|
| **CSV** | Universal compatibility, Google Sheets, no column limit | Auto-zipped if > 2MB; split into multiple files if > 1,000,000 rows |
| **XLS** | Legacy Excel | Max 65,535 rows; split if exceeded |
| **XLSX** | Modern Excel | Max 1,000,000 rows; split if exceeded |

### Association Handling in Exports

- Up to 1,000 associated record names included by default
- Option for "All associated records" (CSV only)
- Associated record data appears as additional columns

### UX Pattern Takeaways for GEM App

- **"Export current view"** pattern is elegant -- users build the filter, then export exactly what they see. No separate export configuration needed.
- **Format choice at export time** (not a global setting) respects different use cases.
- For GEM, CSV should be the default export format for maximum compatibility with Indian government/institutional systems.

---

## 7. Lists & Segmentation

HubSpot recently rebranded "Lists" as **"Segments"** in the UI.

### Two Segment Types

| Type | Behavior | Membership | Best For |
|------|----------|------------|----------|
| **Active (Dynamic) segment** | Continuously re-evaluates criteria; members auto-added/removed as data changes | Automatic, condition-based | Ongoing campaigns, lead nurturing, behavioral targeting |
| **Static segment** | Captures a snapshot at creation time; membership fixed unless manually edited | Manual, point-in-time | Event attendee lists, one-time exports, historical snapshots |

### Creation Flow

#### Active Segment:
1. Navigate to **Contacts > Segments** (or Lists)
2. Click **"Create segment"** > choose **Active**
3. Define filter criteria using AND/OR logic
4. Name the segment
5. Save -- segment populates automatically and updates in real-time

#### Static Segment:
1. Navigate to **Contacts > Segments**
2. Click **"Create segment"** > choose **Static**
3. Populate via:
   - Manual contact selection (checkbox from list view)
   - CSV import directly into the list
   - One-time filter application (filter runs once, then membership frozen)
4. Name and save

### Filter Criteria Options

Filters can be built from:
- **Contact properties:** Job title, company, industry, lifecycle stage, lead status, create date, any custom property
- **Form submissions:** Specific form submitted, date range
- **Email engagement:** Opened, clicked, specific campaign
- **Page views:** Visited specific URL, visit frequency
- **Event data:** Attended, registered (with integrations)
- **Associated objects:** Company properties, deal properties (up to 60 associated object filters)

**Filter limits:** 250 filters per segment (across all AND/OR conditions); 60 associated object filters maximum.

### List-Based Actions

Once a segment exists, it can be used to:
- Trigger email campaigns or workflow automation
- Personalize landing page or email content (smart content)
- Initiate sales sequences
- Export the segment's members
- Run reports scoped to the segment
- Serve as enrollment criteria for other workflows

### Plan Limits

| Plan | Active Segments | Static Segments |
|------|----------------|-----------------|
| **Free** | 5 active lists | 1,000 static lists (older accounts may vary) |
| **Starter** | 25 active lists | 1,000 static lists |
| **Professional** | 1,000 active lists | 1,000 static lists |
| **Enterprise** | 1,500 active lists | 1,500 static lists |

### UX Pattern Takeaways for GEM App

- **Active vs. Static** distinction maps perfectly to our needs:
  - **Active segments** for "All registered delegates" (auto-updates as registrations come in)
  - **Static segments** for "Day 1 attendees" (snapshot after check-in closes)
- **250-filter limit** is generous and unlikely to be a constraint.
- **Filter-then-freeze** pattern for static lists is excellent UX for event snapshots.
- **Segment-based actions** (export, email, report) should be a core pattern in GEM.

---

## 8. Free Tier Limitations Summary

Key constraints relevant to GEM App architecture decisions:

| Feature | Free Tier Limit |
|---------|----------------|
| **Contacts** | 1,000 total (accounts created after Sept 2024); older accounts grandfathered at 1M |
| **Users** | Unlimited, but most are view-only; full edit requires paid seats |
| **Custom properties** | Up to 10 custom properties |
| **Active lists** | 5 active lists |
| **Static lists** | 1,000 static lists |
| **Deal pipelines** | 1 pipeline |
| **Marketing emails** | 2,000 sends/month |
| **Reporting** | Basic dashboards only; no custom reports |
| **Automation/Workflows** | Not available |
| **Lead scoring** | Not available |
| **Duplicate management tool** | Not available (manual merge only) |
| **Custom objects** | Not available |
| **A/B testing** | Not available |
| **HubSpot branding** | Cannot be removed |

---

## 9. Design Patterns to Adopt for GEM Master People Database

Based on this HubSpot teardown, the following patterns are directly applicable:

### Must-Have Patterns
1. **Tabular list view with saved views** -- tabs for "All People", "Speakers", "Delegates", "Sponsors", "Volunteers"
2. **Column customization per user** -- different roles need different columns visible
3. **Slide-over create form** -- fast contact creation without losing list context
4. **CSV import with auto-mapping + manual override** -- conference teams import from Excel constantly
5. **Side-by-side merge interface** -- deduplication is critical when importing from multiple sources
6. **Active + Static segment support** -- dynamic groups (registered for Day 2) + frozen snapshots (attendees who checked in)
7. **Activity timeline on contact detail** -- registration, payment, check-in, session attendance, feedback all in one stream

### Should-Have Patterns
8. **Inline editing on detail page** -- reduce clicks for quick corrections
9. **Export-what-you-see** -- current filtered view exports directly
10. **Named import history** -- audit trail for batch imports
11. **Bulk actions from list selection** -- assign tags, change status, export subset

### Nice-to-Have Patterns
12. **Confidence-scored duplicate detection** -- prioritized review queue
13. **Property-level field survival rules** -- configurable merge behavior
14. **Create-new-property inline during import** -- power-user efficiency

---

## Sources

### HubSpot Official Documentation
- [HubSpot Free CRM Overview](https://www.hubspot.com/products/crm)
- [Default Contact Properties](https://knowledge.hubspot.com/properties/hubspots-default-contact-properties)
- [Import Records for a Single Object](https://knowledge.hubspot.com/import-and-export/import-records-for-a-single-object)
- [Deduplicate Records in HubSpot](https://knowledge.hubspot.com/records/deduplication-of-records)
- [Create Active or Static Lists (Segments)](https://knowledge.hubspot.com/segments/create-active-or-static-lists)
- [View and Filter Records / Saved Views](https://knowledge.hubspot.com/crm-setup/create-customize-and-manage-your-saved-views)
- [Customize the Create Form](https://knowledge.hubspot.com/object-settings/set-up-fields-seen-when-manually-creating-records)
- [Property Field Types](https://knowledge.hubspot.com/properties/property-field-types-in-hubspot)
- [Understand Record Page Layout](https://knowledge.hubspot.com/records/work-with-records)
- [Export Records](https://knowledge.hubspot.com/import-and-export/export-records)
- [Create and Manage Saved Views](https://knowledge.hubspot.com/records/create-and-manage-saved-views)
- [Filter Activity Timelines](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline)
- [Customize Record Columns in Segments](https://knowledge.hubspot.com/segments/how-to-customize-list-columns)
- [Sample Import Files](https://knowledge.hubspot.com/import-and-export/sample-import-files)

### Third-Party Analysis & Guides
- [HubSpot Duplicate Contacts Guide 2026 -- Hublead](https://www.hublead.io/blog/hubspot-duplicate-contacts)
- [HubSpot Duplicates Management Guide 2026 -- Default.com](https://www.default.com/post/hubspot-duplicates)
- [Is HubSpot Free in 2026? -- EngageBay](https://www.engagebay.com/blog/is-hubspot-free/)
- [HubSpot Free Plan Limitations 2026 -- Claritysoft](https://claritysoft.com/hubspot-free-plan-limitations/)
- [Active vs Static List in HubSpot -- Pixcell](https://www.pixcell.io/blog/active-vs-static-list-in-hubspot)
- [HubSpot List Segmentation Best Practices -- Hublead](https://www.hublead.io/blog/hubspot-list-segmentation)
- [Using Custom Properties in HubSpot -- HubSpot Blog](https://blog.hubspot.com/customers/using-custom-properties-in-hubspot-crm)
- [HubSpot Export CSV Guide -- Skyvia](https://skyvia.com/blog/hubspot-export-csv-guide/)
- [How to Import Data Into HubSpot -- IV-Lead](https://www.iv-lead.com/hubspot-by-iv-lead/how-to-import-your-data-into-hubspot-a-comprehensive-guide)
- [Import CSV to HubSpot -- CSVBox](https://blog.csvbox.io/import-csv-to-hubspot/)
- [HubSpot CRM Structure in 7 Minutes -- HS-Simple](https://hs-simple.com/en/blog/setup-guide/hubspot-crm-structure)
- [HubSpot Merge Duplicates -- Insycle](https://support.insycle.com/hc/en-us/articles/6585453128599-HubSpot-Merge-Duplicates-Module-Overview)
- [HubSpot Contact Views -- MakeWebBetter](https://support.makewebbetter.com/hubspot-knowledge-base/how-to-create-customize-hubspot-contact-views/)
- [How to Filter Records in HubSpot -- Stream Creative](https://www.streamcreative.com/knowledge/filter-records-hubspot-crm)
