# Session 13: Retool — Web Research
**Module:** Roles & Access (#1) — Admin Panel RBAC Patterns
**Date:** 2026-04-05
**Sources:** retool.com, docs.retool.com, retoolers.io, boldtech.dev, web search
**Purpose:** Steal admin panel UX patterns for our custom GEM App build, not use Retool itself.

---

## 1. RBAC Model in Retool

### How Roles Work
- RBAC is managed via **Settings > Roles & Permissions**.
- Roles are assigned to **Groups**, not directly to individual users.
- Users inherit the **combined permissions** of all roles assigned to their groups.
- Workaround for individual assignment: create a single-user group, assign role to group.

### Default vs. Custom Roles
| Type | Details |
|------|---------|
| **Admin** (default) | Full access, cannot be modified or deleted |
| **Custom roles** | Created by admins, can be edited/deleted |

### Permission Scopes
- Business plan: 11 scopes (query library, account details, audit logs, themes, usage analytics, Assist, draft app management)
- Enterprise plan: 30 scopes (adds SSO, billing, user management, IAM, environments)

### Permission Categories
- User management
- Query library
- Organization
- Customization
- Configuration
- Assist

### Creating Custom Roles
1. Navigate to Settings > Roles & Permissions
2. Click **Create Role**
3. Enter descriptive name + purpose description
4. Select permissions via **checkboxes** (searchable/filterable by keyword or category)
5. Review in **Permissions preview pane**
6. Save

### Role Assignment (Two Paths)
1. **From Roles page:** Select role > Assignments tab > Add group
2. **From Groups page:** Select group > Modify role assignments

### GEM App Takeaway
The Group-based assignment model is heavier than we need. For our 4 roles, direct user-to-role assignment (like Clerk) is simpler. But the **checkbox permission matrix** and **preview pane** patterns are worth stealing for our role definition UI.

---

## 2. Role-Based UI Visibility Patterns

### Component Show/Hide via `Hidden` Property
The core pattern in Retool for role-based UI:

```javascript
// Hide "Delete User" button for non-admins
{{ !retoolContext.user.groups.includes('Retool_Admin') }}
```

This uses the `Hidden` property on any component, evaluating to `true` (hidden) or `false` (visible) based on the logged-in user's group membership.

### Three Layers of Access Control
Retool best practice uses **all three simultaneously**:

| Layer | Mechanism | What It Does |
|-------|-----------|-------------|
| **1. UI Visibility** | `Hidden` property | Hides components entirely from unauthorized users |
| **2. Button Disabling** | `Disabled` property | Shows but grays out actions, preventing clicks |
| **3. Query-Level Enforcement** | "Run this query only when" | Server-side gate; prevents data access even if UI is bypassed |

### Data Filtering by Role
```sql
-- Sales reps see only their leads; admins see all
SELECT * FROM leads
WHERE {{ retoolContext.user.groups.includes('Admin')
  ? '1=1'
  : `owner_email = '${retoolContext.user.email}'`
}}
```

### UX Implications for "Restricted" States

| Strategy | When to Use | User Experience |
|----------|------------|-----------------|
| **Hidden** | Feature doesn't exist for this role | Clean, no confusion. User never knows the feature exists. |
| **Grayed/Disabled** | User should know the feature exists but can't use it | Shows capability, implies "ask for access" or "upgrade." Tooltip explains why disabled. |
| **"No Access" Message** | User navigates to restricted page directly | Explicit error: "You don't have permission to view this page. Contact your admin." |

### GEM App Mapping
For our 4 roles:
- **Super Admin:** Everything visible, nothing disabled.
- **Event Coordinator:** Sees speakers, schedule, sessions, communications. Logistics and badge sections hidden (not grayed).
- **Ops:** Sees logistics, badges, check-in, reports (read). Speaker management hidden.
- **Read-only:** Sees all sections but all write actions (buttons, forms) are **disabled/grayed** with tooltip "Read-only access."

---

## 3. Admin Panel Layout Patterns

### The Standard Layout: Sidebar + Main Content

```
+------------------+----------------------------------------+
| SIDEBAR          | MAIN CONTENT                           |
|                  |                                        |
| [Logo]           | [Header: Page Title + Actions]         |
| [Nav Item 1]     |                                        |
| [Nav Item 2]     | [Filters / Search Bar]                 |
| [Nav Item 3]     |                                        |
|  ...             | [Data Table]                           |
|                  |                                        |
| [Settings]       | [Pagination]                           |
| [User Avatar]    |                                        |
+------------------+----------------------------------------+
```

### Navigation Patterns

**Vertical Sidebar (Preferred for Admin Panels)**
- Works best when there are many top-level menu items.
- Can be combined with a Header for universal actions (search, account).
- Retool's Sidebar Frame component enables slide-in navigation on mobile.
- Supports nested items for sub-sections.

**Role-Based Navigation:**
- Show/hide sidebar items based on role using the same `Hidden` property pattern.
- Each role sees only their relevant nav items.
- Avoids the "empty sections" anti-pattern where users click and find nothing.

**Navigation Component Behavior:**
- Defaults to horizontal orientation.
- Supports vertical orientation within Sidebar Frame.
- Auto-configures slide-in menu on mobile layouts.
- Can pass data between pages (e.g., selected row ID persists across navigation).

### Header Patterns
- Dynamic header space for: show/hide elements, filters, aggregate statistics, or navbar.
- Fixed positioning: header stays visible while content scrolls.
- Action bars condense multiple buttons into dropdowns to reduce clutter.

---

## 4. Table Display Patterns

### Layout Pattern 1: Side Panel Focus (Most Common)
```
+------------------------------------------+------------------+
| DATA TABLE                               | SIDE PANEL       |
| [Search] [Filter] [+ Add]               |                  |
| +---------+---------+--------+--------+  | [Detail View]    |
| | Name    | Email   | Role   | Status |  | Name: John Doe   |
| | John... | john@.. | Admin  | Active |  | Email: john@...  |
| | Jane... | jane@.. | Ops    | Active |  | Role: Admin      |
| +---------+---------+--------+--------+  | Joined: Jan 15   |
|                                          |                  |
| [< Prev] [1] [2] [3] [Next >]          | [Edit] [Delete]  |
+------------------------------------------+------------------+
```

- Click a table row to populate side panel with details.
- Best for: record-by-record viewing, customized breakdowns, read-only or edit-light workflows.
- Limitation: reduces horizontal table space.

### Layout Pattern 2: Full-Width Table with Action Columns
```
+----------------------------------------------------------------+
| [Search] [Filter] [Bulk Actions v] [+ Add New]                |
| +-------+--------+-------+--------+-----------+-------+       |
| | [ ]   | Name   | Email | Role   | Status    | Actions|      |
| | [x]   | John   | j@... | Admin  | Active    | [E][D] |      |
| | [ ]   | Jane   | j@... | Ops    | Inactive  | [E][D] |      |
| | [x]   | Bob    | b@... | Reader | Active    | [E][D] |      |
| +-------+--------+-------+--------+-----------+-------+       |
| [2 selected] [Change Role v] [Deactivate] [Delete]            |
| [< Prev] Page 1 of 5 [Next >]                                 |
+----------------------------------------------------------------+
```

- Full screen width for maximum data visibility.
- Custom action columns: Edit (pencil icon), Delete (trash icon).
- Best for: comparing records, spreadsheet-like workflows, simple accept/reject.
- Avoid when: heavy editing needed or long text values require horizontal scroll.

### Layout Pattern 3: Modal for Editing
- Pop-up dialog for create/edit forms.
- Pre-fills fields with current row values.
- Keeps editing separate from viewing.
- Best for: high-risk actions, infrequent edits.
- Trade-off: extra clicks, poor for comparing data with table.

---

## 5. Data Table UX Details

### Column Management
- **Column show/hide:** Use `Hidden When` property per column with conditional logic.
- Role-based columns: hide sensitive columns (e.g., salary, phone) from Read-only users.
- Dynamic show/hide: use a temporary state + toggle to let users customize visible columns.
- Table automatically collapses hidden columns (no blank space left).

### Filtering
- **Filter component:** Specifies column to filter, operator, and value.
- **Programmatic filtering:** `table.setFilters()` function.
- **Dynamic filter container:** Toggle visibility with a button, ternary operator controls button text ("Show Filters" / "Hide Filters").
- Filters can be excluded from specific columns.
- Hidden columns can still be filtered on (data-level, not display-level).

### Inline Editing
- Tables support inline editing of cells directly.
- Changes captured via `table1.changesetObject` for batch submission.
- **UX Warning:** Inline editing with horizontal scroll creates bad UX. Limit to 1-2 editable columns.
- Lacks built-in data validation compared to form-based editing.
- Requires "surprising amount of clicks" for complex edits.
- **Recommendation:** Use inline editing only for simple field updates (status toggles, checkboxes). Use modals or side panels for complex edits.

### Bulk Selection & Actions
- Checkbox column enables multi-select.
- When items selected, a **bulk-action bar** slides into view.
- Bar must be visually tied to the selected items (proximity principle).
- Action patterns by complexity:
  - **Simple:** Inline bulk edits for routine changes (status change, role change).
  - **Complex:** Wizard flows for actions with dependencies or branching logic.
  - **Flexible:** Allow switching between inline and wizard modes.
- Bulk action bar shows count: "[3 selected] [Change Role] [Deactivate] [Delete]"

### Sorting
- Click column headers to toggle: Unsorted > Ascending > Descending.
- Visual indicator (arrow) shows current sort direction.

### Pagination
- Standard: Previous / Next buttons with page numbers.
- Configurable page size (5, 10, 25, 50 rows).
- Show total record count.

---

## 6. Form Layouts & Data Entry

### Core Principle
> "Anything permanently editable is a risk."

Separate **edit mode** from **view mode**. Never leave fields always editable.

### Create/Edit Form Patterns

**Modal Form (Preferred for Admin Panels):**
```
+----------------------------------+
| Create New User            [X]   |
|                                  |
| Name:     [________________]     |
| Email:    [________________]     |
| Role:     [Dropdown v      ]     |
| Status:   [Active v        ]     |
|                                  |
| [Cancel]           [Save User]   |
+----------------------------------+
```

- Pre-populate fields when editing (not blank).
- Keep editable fields to non-critical data.
- Ensure edited content appears on-screen during submission.

**Wizard (Multi-Step) Form:**
- Use for: creation flows with dependencies or branching logic.
- Each step determines next options.
- Good for: cascading logic, conditional workflows.
- Bad for: quick edits, viewing data during form completion.

### Success/Error Messages
- **Success:** Brief toast notification, auto-dismiss after 3-5 seconds. "User created successfully."
- **Error:** Persistent inline error below the field, or toast with action. "Email already exists. [View User]"
- **Validation:** Real-time field validation on blur. Red border + error text below field.

---

## 7. Action Button Placement Patterns

### Primary Actions
| Location | Pattern | When to Use |
|----------|---------|------------|
| **Top-right of page** | [+ Add New] | Creating new records |
| **Table action column** | [Edit] [Delete] icons | Per-row actions |
| **Bulk action bar** | [Change Role] [Delete] | Multi-select actions |
| **Side panel footer** | [Edit] [Delete] | Detail view actions |
| **Modal footer** | [Cancel] [Save] | Form submission |

### Action Bar Consolidation
- When more than 3 actions: consolidate into a dropdown menu.
- Primary action stays as a button; secondary actions go in "More..." dropdown.
- Example: [Edit] [More v] where More contains: Duplicate, Export, Archive, Delete.

### Destructive Actions
- **Delete buttons:** Red color, placed rightmost or in dropdown.
- **Confirmation:** Modal with "Are you sure?" and explicit action name.
- **Undo option:** Toast with "Undo" link for soft-delete operations.

---

## 8. Responsive & Layout Best Practices

### Single-Page Layout Rule
> "Aim for single-page layout" — minimize scrolling, eliminate horizontal scroll in tables.

### Key Principles
1. **No blank components:** Hide empty tables/containers. Avoid appearing broken.
2. **Table column management:** Handle long headers/values with CSS truncation or hover tooltips.
3. **Responsive testing:** Verify layouts on smaller screens.
4. **Avoid multi-app systems:** Combine related functions into one app using tabs, modals, or hidden containers.
5. **Data passing:** Pass selected row ID between pages/views so context persists during navigation.

### Mobile Considerations
- Sidebar converts to slide-in hamburger menu.
- Tables may need to hide non-essential columns on small screens.
- Action buttons should stack vertically on mobile.

---

## 9. Key Patterns for GEM App

### What We Steal from Retool

**RBAC UI Patterns:**
1. **Three-layer access control** — Hide + Disable + Query-level enforcement. We implement all three.
2. **Role-based sidebar navigation** — Each of our 4 roles sees only their relevant nav items.
3. **Hidden vs. Disabled vs. No-Access** — Use hidden for irrelevant features, disabled for read-only, explicit message for direct URL access.
4. **Permission checkbox matrix** with search/filter for role definition UI.

**Table Patterns:**
5. **Side panel + table** layout for user management (click row, see details).
6. **Full-width table with action columns** for data-heavy views (speaker list, session list).
7. **Bulk action bar** that appears on multi-select with count + action buttons.
8. **Inline editing** only for simple toggles (status, checkbox); modals for complex edits.
9. **Column show/hide** per role (hide sensitive columns from Read-only).

**Form & Action Patterns:**
10. **Modal forms** for create/edit with pre-populated fields.
11. **Toast notifications** for success; inline errors for validation.
12. **Action button placement:** + Add (top-right), Edit/Delete (row-level), Bulk (selection bar).
13. **Destructive action confirmation** — red button + "Are you sure?" modal.

**Layout Patterns:**
14. **Sidebar + Main Content** as our default admin layout.
15. **Fixed header** with page title + primary action buttons.
16. **Single-page layout** principle — no unnecessary page transitions.
17. **Dynamic filter container** — toggle-able filter bar above tables.

### Role-Based View Matrix

| UI Element | Super Admin | Event Coordinator | Ops | Read-only |
|-----------|-------------|-------------------|-----|-----------|
| Sidebar: All nav items | Visible | Filtered | Filtered | Filtered |
| Action buttons (Create/Edit/Delete) | Enabled | Enabled (own modules) | Enabled (own modules) | **Disabled** (grayed, tooltip) |
| Sensitive data columns | Visible | Visible | Visible | **Hidden** |
| Bulk actions | Enabled | Enabled (own modules) | Enabled (own modules) | **Hidden** |
| Settings/Admin page | Visible | **Hidden** | **Hidden** | **Hidden** |
| Export button | Enabled | Enabled | Enabled | **Disabled** |
| Inline status toggles | Enabled | Enabled | Enabled | **Disabled** |

---

## Sources
- [Retool RBAC Configuration Guide](https://docs.retool.com/permissions/guides/roles-permissions)
- [Retool Admin Permissions Reference](https://docs.retool.com/permissions/reference/admin-permissions)
- [Secure Role-Based Access in Retool](https://retoolers.io/blog-posts/secure-role-based-access-in-retool-scalable-permission-layers)
- [Retool Admin Dashboard UI Layouts](https://blog.boldtech.dev/ui-sessions-exploring-different-admin-dashboard-uis-in-retool/)
- [Retool Sidebar Frame](https://retool.com/blog/introducing-the-sidebar-frame-create-intuitive-interfaces-for-complex-apps)
- [Retool Navigation Components](https://docs.retool.com/apps/guides/interaction-navigation/navigation)
- [Retool Table Component](https://docs.retool.com/apps/reference/components/data)
- [Retool Filter Component](https://docs.retool.com/apps/reference/components/filter)
- [Retool Table UX Best Practices (Community)](https://community.retool.com/t/guide-table-component-ux-ui-best-practices-ui-tips-for-data-dashboards/42038)
- [Bulk Action UX Guidelines](https://www.eleken.co/blog-posts/bulk-actions-ux)
- [Retool User Access Management Template](https://retool.com/templates/user-access-management)
