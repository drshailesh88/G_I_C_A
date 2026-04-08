# Airtable UX Teardown: Grouped Views, Filtering, and Kanban for Transport & Arrival Planning

**Session:** 09 - Airtable Views Research
**Date:** 2026-04-05
**Purpose:** Evaluate Airtable's grouped table views, filtering, saved views, color coding, and Kanban views as reference patterns for the GEM India Conference App's Transport & Arrival Planning module.

**Core ops question this module answers:** "How many people arrive at what time, from where, so we can plan pickup vehicles and batches."

---

## 1. Grouped Table View

### How Grouping Works

Airtable's grid view supports grouping records by one or more fields. When grouping is applied, records are visually clustered under collapsible group headers. Each group header displays the group field value and a **record count** showing how many records fall into that group.

**To set up grouping:**
1. Click the **Group** button in the view toolbar (located between Filter and Sort buttons).
2. Select a field to group by from suggested fields, or click "See all fields" for the full list.
3. Records immediately re-organize into collapsible sections.

**Supported view types for grouping:** Grid, Timeline, List, and Gantt views.

### Nested / Multi-Level Grouping

Airtable supports **multiple grouping levels** (nested grouping). Adding a second grouping field creates subgroups within each top-level group.

**Example for arrival planning:**
- **Level 1:** Group by `Arrival Date` -- shows all arrivals for Day 1, Day 2, etc.
- **Level 2:** Group by `Arrival Time Slot` -- within each date, shows time-based batches (e.g., "Morning 8-10 AM", "Afternoon 2-4 PM").
- **Level 3:** Group by `Arrival City` -- within each time slot, cluster by origin city.

This nested structure directly maps to the ops planning hierarchy: Date > Time > Origin City.

### Date/Time Grouping Nuances

A critical detail: if you group on a date field that **includes a time component**, Airtable groups by the exact date+time combination, which creates too many groups (every unique timestamp becomes its own group).

**Workaround patterns observed in the Airtable community:**
- Create a **formula field** using `DATETIME_FORMAT()` to extract just the date portion, then group by that formula field.
- Use `YEAR()`, `MONTH()`, `WEEKDAY()`, or `WEEKNUM()` functions for broader date grouping (by month, week, etc.).
- For time-slot grouping, create a formula field that maps arrival times into buckets (e.g., "Morning", "Afternoon", "Evening").

**Relevance to our app:** We should provide pre-bucketed time slots rather than raw times, so the grouped view shows meaningful operational batches rather than dozens of individual timestamps.

### Record Count Per Group

Every group header automatically shows a **count of records** in that group. This is crucial for arrival planning -- the ops team can instantly see "14 people arriving on Day 1, Morning slot, from Mumbai" without manual counting.

**Limitation noted in community forums:** There is no built-in way to count the number of groups themselves (e.g., "how many distinct time slots have arrivals"). This requires workarounds with formula fields or summary blocks.

### Visual Appearance

- Group headers appear as **colored horizontal bars** spanning the full width of the table.
- Each header shows the field value and record count.
- Groups are **collapsible/expandable** -- clicking a group header toggles visibility of its records.
- Nested groups create an **indented hierarchy** with sub-headers within parent groups.
- Collapsed groups show just the header bar with the count, making it easy to scan totals across all groups.

---

## 2. Filtering

### How Filters Work

Filters restrict which records are visible in a view. Filters do not delete or modify data -- they simply hide non-matching records from the current view.

**Filter setup:**
1. Click the **Filter** button in the view toolbar.
2. Select a field, choose an operator (is, is not, contains, is before, is after, etc.), and enter a comparison value.
3. Records that do not match are hidden immediately.

### Combining Filters

Multiple filter conditions can be combined using:
- **AND** conjunction -- all conditions must be true.
- **OR** conjunction -- any condition can be true.
- **Conditional groups** -- nested groups of AND/OR logic for complex filtering.

**Example filter combinations for arrival planning:**
- `Arrival Date` is "2026-12-15" AND `Origin City` is "Mumbai" -- shows only Mumbai arrivals for a specific date.
- `Status` is "Confirmed" AND `Arrival Date` is "2026-12-15" -- shows only confirmed arrivals for Day 1.
- `Transport Mode` is "Flight" OR `Transport Mode` is "Train" -- shows all arrivals by air or rail.

### Filter UI Pattern

The filter bar appears as a **horizontal strip below the toolbar** showing active filter conditions as inline tags/pills. Each filter pill shows the field name, operator, and value. Filters can be removed individually by clicking an "x" on each pill.

### Saved Filter Views

Filters are **saved per view**. This means you can create a view called "Mumbai Arrivals" with a permanent filter for `Origin City = Mumbai`, and another view called "Day 1 Arrivals" with `Arrival Date = 2026-12-15`. Each view preserves its filter configuration independently.

---

## 3. Saved Views

### Creating and Naming Views

A single Airtable table can have **unlimited named views**, each with its own independent configuration of:
- Visible/hidden fields
- Field order
- Filters
- Sorts
- Grouping
- Record coloring
- Row height

**Key principle:** "Any customizations you make only apply to the view you're currently in." The underlying data is shared across all views -- changing a record's value in one view changes it everywhere.

### View Access Levels

Three access tiers (paid plans offer all three):
- **Collaborative view** -- visible and editable by all collaborators.
- **Personal view** -- visible only to the creator.
- **Locked view** -- visible to all but only the creator/owner can modify the view configuration (filters, sorts, etc.). Other users can still edit the data.

### Duplicating Views

Right-click a view name or click the caret dropdown to access **Duplicate view**. This creates a copy with identical configuration that can then be renamed and adjusted. This is efficient for creating variants like "Day 1 Arrivals" and "Day 2 Arrivals" that share the same grouping/sorting but differ only in the date filter.

### Organizing Views

Views appear in a **sidebar list** on the left side of the screen. For tables with many views, Airtable supports organizing views into **sections** for easier navigation.

### Application to Arrival Planning

Recommended named views for the ops team:
| View Name | Type | Filter | Grouping |
|---|---|---|---|
| All Arrivals | Grid | None | Date > Time Slot |
| Day 1 Arrivals | Grid | Date = Dec 15 | Time Slot > Origin City |
| Day 2 Arrivals | Grid | Date = Dec 16 | Time Slot > Origin City |
| Mumbai Arrivals | Grid | City = Mumbai | Date > Time Slot |
| Pending Confirmations | Grid | Status = Pending | Date > Origin City |
| Arrival Status Board | Kanban | None | Stacked by Status |
| Transport Assignment | Grid | None | Vehicle Assigned > Time Slot |

---

## 4. Color Coding

### Record Coloring Methods

Airtable offers two approaches to color records in grid view:

#### Method 1: Color by Single Select Field

- Choose a single select field (e.g., `Status`) and each option's color becomes the record's color.
- Colors are defined when configuring the single select field options (e.g., Confirmed = green, Pending = yellow, Cancelled = red).
- The first single select field is applied by default, but you can choose which field to use from a dropdown.
- Changing the color of an option in the field configuration also updates the record coloring automatically.

#### Method 2: Color by Conditions

- Define conditional rules similar to filters: select a field, operator, and value, then assign a color.
- Multiple conditions can be combined with AND/OR logic.
- **Priority rule:** A record can only have one color. If a record matches multiple conditions, it receives the color of the **first matching condition** (top of the list).

### Visual Appearance

**Important distinction from spreadsheets:** Airtable record coloring does **not** fill the entire row background with color. Instead, it adds a **thin colored vertical line on the left edge** of the record row. This is more subtle than Excel-style conditional formatting.

**Single select field pills:** Within cells, single select values appear as **colored pill/badge elements** -- small rounded rectangles with colored backgrounds and text. These are visually prominent and provide at-a-glance status recognition.

### Plan Availability

Record coloring is only available on **paid plans** (Plus, Pro, Enterprise).

### Application to Arrival Planning

- Color by `Status` single select: Confirmed (green), Pending (yellow), Cancelled (red), No-Show (gray).
- The colored pills in the Status column provide immediate visual scanning capability.
- Ops team can instantly distinguish confirmed vs. pending arrivals within any grouped view.

---

## 5. Sorting

### Sorting Within Groups

Sorts can be applied **within grouped views**. Records inside each group are ordered by the sort criteria while maintaining their group membership.

**Sort setup:**
1. Click the **Sort** button in the view toolbar.
2. Select a field and choose ascending or descending order.
3. Add multiple sort levels for tie-breaking (e.g., sort by Time, then by Name).

### Sort + Group Interaction

Groups themselves are sorted by the group field value (alphabetically or chronologically for dates). Within each group, the explicit sort rules apply. This means you can group by `Arrival Date` and sort within each date group by `Arrival Time` ascending, giving a chronological arrival sequence within each day.

### Application to Arrival Planning

- Group by Date, sort within groups by Time -- gives chronological arrival timeline.
- Group by Time Slot, sort within groups by Origin City -- clusters same-city arrivals for vehicle batching.
- Group by Vehicle Assignment, sort by Time -- shows each vehicle's pickup sequence.

---

## 6. Kanban View

### Overview

Airtable's Kanban view displays records as **cards organized into vertical columns (stacks)**. Each stack represents a value from a designated stacking field. It is commonly used for status tracking but works for any categorical grouping.

### Setting Up a Kanban View

1. Open the Views sidebar and click the **Kanban** option under "Create..."
2. Name the view and select the access level (Collaborative, Personal, or Locked).
3. Select a **stacking field** -- the field whose values define the columns.

### Stacking Field Options

The stacking field can be:
- **Single select field** -- most common; each option becomes a column (e.g., Confirmed, Pending, Cancelled).
- **Collaborator field** -- each team member gets a column.
- **Linked record field** -- each linked record value becomes a column.

### Card Appearance and Interaction

- Each record appears as a **card** within its stack.
- Cards show a subset of fields (configurable -- you choose which fields are visible on the card face).
- Cards can have **cover images** from attachment fields.
- **Drag and drop:** Cards can be dragged between stacks to change their stacking field value. For example, dragging a card from "Pending" to "Confirmed" updates the Status field to "Confirmed" automatically.
- Changes propagate in **real-time** to all collaborators viewing the same base.

### Record Count Per Stack

Each stack header shows the **count of cards** in that column. This gives immediate visibility into how many arrivals are in each status.

### Stack Management

- Individual stacks can be **hidden or shown** based on relevance.
- Stacks can be reordered by dragging the column headers.

### Kanban + Filters/Sorts

Filters and sorts apply to Kanban views just as they do to grid views:
- Filter to show only a specific date's arrivals, then see them distributed across status columns.
- Sort cards within each stack by arrival time or origin city.

### Application to Arrival Planning

**Status Board (primary use):**
- Stacking field: `Confirmation Status` (Confirmed | Pending | Cancelled | No-Show)
- Card fields: Delegate Name, Origin City, Arrival Time, Flight/Train Number
- Ops team drags cards from Pending to Confirmed as confirmations come in.
- At-a-glance count shows "42 Confirmed, 8 Pending, 3 Cancelled."

**Vehicle Assignment Board (secondary use):**
- Stacking field: `Assigned Vehicle` (Van-1 | Van-2 | Van-3 | Unassigned)
- Card fields: Delegate Name, Arrival Time, Pickup Point
- Drag delegates between vehicles to balance loads.
- Count per stack shows vehicle capacity utilization.

---

## 7. Field Types Relevant to Arrival Planning

### Date Field

- Stores dates with optional time component.
- Toggle "Include time" ON/OFF to show/hide the time portion.
- Date formats: Local, Friendly, US, European, ISO.
- Time formats: 12-hour or 24-hour.
- Supports date-based filtering operators: is, is before, is after, is within (past/next N days).

### Single Select Field

- Dropdown with predefined options; only one value per record.
- Each option has a **configurable color** (appears as a colored pill/badge in the cell).
- Ideal for: Status (Confirmed/Pending/Cancelled), Transport Mode (Flight/Train/Bus/Car), Time Slot (Morning/Afternoon/Evening), Origin City.
- Can be used as the stacking field in Kanban views and the coloring field in grid views.

### Text Fields

- **Single line text:** Short entries like names, flight numbers, vehicle plate numbers.
- **Long text:** Notes, special requirements, pickup instructions.

### Other Relevant Field Types

- **Number:** For capacity counts, vehicle seat limits.
- **Phone number:** Delegate contact info.
- **Email:** Delegate email.
- **Attachment:** Travel document scans, ticket copies.
- **Linked record:** Connect arrival records to a Delegates table, Vehicles table, or Hotels table.
- **Formula:** Computed fields for time-slot bucketing, auto-categorization.
- **Lookup:** Pull fields from linked tables (e.g., hotel name from Delegates table).

---

## 8. Design Patterns to Adopt for GEM India Conference App

### From Grouped Table View

1. **Collapsible group headers with record counts** -- essential for the ops team to see "N arrivals in this batch" without scrolling through all records.
2. **Nested grouping (Date > Time Slot > City)** -- directly maps to the planning hierarchy.
3. **Pre-bucketed time slots** rather than raw times -- formula fields that categorize arrivals into operational batches (Morning/Afternoon/Evening or 2-hour windows).

### From Filtering

4. **Persistent saved filters per named view** -- so "Day 1 Mumbai Arrivals" always shows the right subset.
5. **Filter pills/tags in the toolbar** -- visible active filters prevent confusion about why some records are missing.
6. **AND/OR filter combinations** -- for complex operational queries.

### From Saved Views

7. **Multiple named views on the same data** -- different ops roles see different slices (transport coordinator vs. welcome desk vs. hotel liaison).
8. **View duplication** for creating day-specific variants quickly.
9. **Locked views** to prevent accidental reconfiguration of critical ops dashboards.

### From Color Coding

10. **Single select colored pills** for status fields -- the most effective visual pattern (green/yellow/red for Confirmed/Pending/Cancelled).
11. **Left-edge color indicator** on rows for record-level status coloring.

### From Kanban

12. **Drag-to-update-status** interaction -- intuitive for status changes during event operations.
13. **Column counts** -- instant visibility of confirmation pipeline.
14. **Multi-purpose Kanban** -- same data, different stacking fields (status board vs. vehicle assignment board).

### From Sorting

15. **Sort within groups** -- chronological arrival sequence within each date/time group for pickup scheduling.

---

## 9. Mapping to Transport & Arrival Planning Module

| Ops Need | Airtable Pattern | Our Implementation |
|---|---|---|
| "How many arrive Day 1 morning?" | Grouped view: Date > Time Slot with record count | Grouped list with count badges |
| "Show only Mumbai arrivals" | Saved filtered view | Named filter preset |
| "Who is confirmed vs pending?" | Kanban stacked by Status | Status board with drag-to-update |
| "Assign delegates to vehicles" | Kanban stacked by Vehicle | Vehicle assignment board |
| "Quick visual status scan" | Single select colored pills | Status pill components (green/yellow/red) |
| "Sort by arrival time within a day" | Sort within group | Sortable columns within groups |
| "Transport coordinator's dashboard" | Locked collaborative view with specific filters | Role-based view presets |
| "Batch arrivals for pickup" | Nested grouping (Time Slot > City) | Grouped cards with batch count |

---

## 10. Sources

### Airtable Official Documentation
- [Getting Started with Airtable Views](https://support.airtable.com/docs/getting-started-with-airtable-views)
- [Guide to Grouped Records](https://support.airtable.com/docs/grouping-records-in-airtable)
- [Record Coloring in Airtable](https://support.airtable.com/docs/record-coloring-in-airtable)
- [Kanban View](https://support.airtable.com/docs/kanban-view)
- [Kanban Views in Airtable](https://support.airtable.com/docs/getting-started-with-airtable-kanban-views)
- [Create Custom Views of Data](https://www.airtable.com/guides/build/create-custom-views-of-data)
- [Supported Field Types Overview](https://support.airtable.com/docs/supported-field-types-in-airtable-overview)
- [Date and Time Field](https://support.airtable.com/docs/date-and-time-field)
- [Single Select Field](https://support.airtable.com/docs/single-select-field)

### Airtable Community & Tutorials
- [Grouping records by date when they have different times](https://community.airtable.com/t5/base-design/grouping-records-by-date-when-they-have-different-times/td-p/163771)
- [How to count unique records in grouped view](https://community.airtable.com/t5/other-questions/how-to-count-unique-records-in-grouped-view/td-p/58092)
- [Grouping datetime records by day](https://community.airtable.com/t5/formulas/grouping-datetime-records-by-day/td-p/53323)
- [Airtable Kanban Tutorial](https://jasonraisleger.com/airtable/using-kanban-view.html)
- [Custom Kanban View for Airtable](https://miniextensions.com/custom-kanban-view-for-airtable/)

### Airtable Templates & Guides
- [Event Planning Template](https://www.airtable.com/templates/event-planning/expKIiL87pUceFRjc)
- [How to Plan an Event - Airtable](https://www.airtable.com/articles/how-to-plan-an-event)
- [Organizing Airtable Views](https://support.airtable.com/docs/organizing-airtable-views)
- [A 5-Minute Quick Guide to Working with Airtable Views - Bannerbear](https://www.bannerbear.com/blog/a-5-minute-quick-guide-to-working-with-airtable-views/)
- [Mastering Airtable Views - GridPro Templates](https://gridprotemplates.com/mastering-airtable-views-grid-kanban-calendar-more/)

### Blog & Third-Party
- [Highlight Key Info with Color-Coding - Airtable Blog](https://blog.airtable.com/highlight-key-info-in-airtable-with-color-coding/)
- [How to Customize Airtable Views - Zapier](https://zapier.com/blog/airtable-views/)
- [Sorting, Grouping, and Coloring Records - LinkedIn Learning](https://www.linkedin.com/learning/learning-airtable/sorting-grouping-and-coloring-records)
