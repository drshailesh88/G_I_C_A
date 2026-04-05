# Session 12: Clerk — Web Research
**Module:** Roles & Access (#1)
**Date:** 2026-04-05
**Sources:** clerk.com, clerk.com/docs, ctx7 Clerk docs, web search

---

## 1. Organization Model

### Core Architecture
Clerk Organizations group users with Roles and Permissions, supporting multi-tenant B2B applications. The hierarchy is:

```
Application
  └── Organization (many)
        └── User/Member (many)
              └── Role (one per org membership)
                    └── Permissions (many)
```

- Roles and Permissions are defined once at the **application level** and apply across all organizations.
- Each user can belong to multiple organizations with **different roles in each**.
- The "Active Organization" determines which org-specific data the user can access and their role within that context.
- In multi-tab browsers, each tab independently maintains its own Active Organization.

### Organization Creation
- Organizations can be created via the Clerk Dashboard (admin) or through user-facing components and APIs (self-serve).
- Each organization has a profile, settings, and metadata support.
- Users switch between orgs using `<OrganizationSwitcher />`.

### Adding Members (3 approaches)
1. **Invitations** — user-initiated, with precise role control at invite time. Uses `organization.inviteMember({ emailAddress, role })`.
2. **Verified Domains** — automatic or suggested enrollment by email domain.
3. **Enterprise Connections** — SAML/OIDC-based centralized authentication.

### GEM App Mapping
Our "GEM India Conference 2026" is one Organization. Each staff member is invited with a specific role. If we later add regional chapters, each chapter could be its own Organization with the same role definitions.

---

## 2. Roles & Permissions System

### Default Roles
| Role | Key | Default Permissions |
|------|-----|-------------------|
| **Admin** | `org:admin` | Full access to all Organization resources and all system permissions |
| **Member** | `org:member` | Read members, Read billing only |

### Custom Roles
- Up to **10 custom roles** per application instance.
- Created in Dashboard > Roles & Permissions > "Add role".
- Each role requires: **name**, **key** (format: `org:<role>`), **description**.
- A role must be added to a **Role Set** before members can be assigned to it.
- Roles cannot be deleted if currently assigned to members.

### Permission Types

**System Permissions (8 total):**
- Manage Organization / Delete Organization
- Read Members / Manage Members
- Read Domains / Manage Domains
- Read Billing / Manage Billing

**Custom Permissions:**
- Format: `org:<feature>:<permission>`
- Common values: `create`, `read`, `update`, `delete`
- Example: `org:invoices:create`, `org:speakers:manage`, `org:schedule:update`

### Our 4-Role Mapping

| GEM Role | Clerk Key | Permissions Needed |
|----------|-----------|-------------------|
| **Super Admin** | `org:super_admin` | All system + all custom permissions |
| **Event Coordinator** | `org:event_coordinator` | Manage members, `org:speakers:*`, `org:schedule:*`, `org:sessions:*`, `org:communications:*` |
| **Ops** | `org:ops` | Read members, `org:logistics:*`, `org:badges:*`, `org:check_in:*`, `org:reports:read` |
| **Read-only** | `org:read_only` | Read members, `org:*:read` (all features, read only) |

---

## 3. Access Control Implementation

### The `has()` Helper
Primary mechanism for checking authorization. Works on both client and server:

**Client-side (React):**
```tsx
const { has } = useAuth()

if (has({ role: 'org:admin' })) {
  // show admin UI
}

if (has({ permission: 'org:speakers:manage' })) {
  // show speaker management controls
}
```

**Server-side (Next.js):**
```tsx
const { has } = await auth()

if (!has({ permission: 'org:schedule:update' })) {
  return new Response('Forbidden', { status: 403 })
}
```

### Two Granularity Levels
1. **Broad roles** — `has({ role: 'org:admin' })` for general access checks.
2. **Custom permissions** — `has({ permission: 'org:invoices:create' })` for fine-grained feature-level control.

### Conditional Rendering Pattern
```tsx
// Only show "Manage Speakers" button if user has permission
{has({ permission: 'org:speakers:manage' }) && (
  <Button>Manage Speakers</Button>
)}
```

### Key UX Pattern
The `<OrganizationSwitcher />` component enables users to change their active organization when access restrictions apply, facilitating permission-based navigation.

---

## 4. User Management

### User Object
Each user maintains:
- At least one auth identifier (email, phone, or username)
- Multiple contact methods possible; one primary email, one primary phone
- External accounts via social providers (Google, Apple, Facebook)
- Profile info: names, pictures
- **Public metadata** — accessible via Frontend + Backend APIs
- **Private metadata** — Backend API only

### Dashboard User Management
- Dedicated Users page at `dashboard.clerk.com/~/users`
- View and manage user profiles
- Create new users ("Create user" button)
- Delete users individually (no bulk deletion)
- Search and filter users

### Programmatic User Management
**Frontend:**
- Pre-built components: `<UserButton />`, `<UserProfile />`
- React hooks: `useUser()`, `useAuth()`, `useOrganization()`
- Custom flows via lower-level JS methods

**Backend:**
- `getUser()`, `createUser()`, `deleteUser()`
- Full Backend API for user administration

---

## 5. Pre-Built React Components

### Authentication Components
| Component | What It Does |
|-----------|-------------|
| `<SignIn />` | Full sign-in form with email/password, social providers, MFA |
| `<SignUp />` | Full registration form with field validation |
| `<UserButton />` | Google-style avatar button that opens account popover (sign out, manage account, switch org) |
| `<UserProfile />` | Full profile management page/modal (edit name, email, password, connected accounts) |

### Organization Components
| Component | What It Does |
|-----------|-------------|
| `<OrganizationSwitcher />` | Dropdown to switch active organization, create new orgs |
| `<OrganizationProfile />` | Org settings page: members list, roles, invitations, domains |
| `<OrganizationList />` | Grid/list of organizations the user belongs to |
| `<CreateOrganization />` | Form to create a new organization |

### Appearance Customization
- All components support theming via an `appearance` prop.
- Custom CSS variables for colors, fonts, spacing, border radius.
- Layout variants (e.g., modal vs. embedded page).
- Can override individual elements with custom CSS classes.

### Key UX Details
- `<UserButton />` renders a circular avatar in the top-right corner — the "familiar user button UI popularized by Google."
- Clicking opens a popover with: user info, manage account link, sign out, and org switcher.
- `<OrganizationProfile />` includes a members table with columns: User, Joined, Role, Actions (change role dropdown, remove button).
- Pagination built in: Previous / Next buttons with `hasPreviousPage` / `hasNextPage` logic.

---

## 6. Member Management UI (from Clerk's own code patterns)

### Members List Table
Clerk's built-in `<OrganizationProfile />` and custom flows both render a members table:

| User | Joined | Role | Actions |
|------|--------|------|---------|
| user@example.com (You) | 01/15/2026 | org:admin | [Role Dropdown] [Remove] |
| staff@example.com | 02/01/2026 | org:member | [Role Dropdown] [Remove] |

- **Role column** uses a `<select>` dropdown populated by `organization.getRoles()`.
- **Actions column** has a Remove button that calls `member.destroy()`.
- **Pagination** with Previous/Next buttons, `pageSize: 5` default.
- **(You)** label on the current user's row.

### Invitation Flow
```
[Email input] [Role dropdown] [Invite button]
```
- Role dropdown dynamically populated from org roles.
- After invite: list refreshes via `invitations.revalidate()`.
- Success state: email field clears, disabled state toggles.

### Role Change Flow
1. Admin clicks role dropdown on a member row.
2. Selects new role from list of all org roles.
3. Calls `member.update({ role: newRole })`.
4. Table revalidates automatically.

---

## 7. API Surface (Backend)

### Organization Roles Endpoints
```
GET    /v1/organization_roles                          — List all roles
POST   /v1/organization_roles                          — Create custom role
GET    /v1/organization_roles/{id}                     — Get role details
PATCH  /v1/organization_roles/{id}                     — Update role
DELETE /v1/organization_roles/{id}                     — Delete role
POST   /v1/organization_roles/{id}/permissions/{pid}   — Assign permission to role
DELETE /v1/organization_roles/{id}/permissions/{pid}   — Remove permission from role
```

### Invitation Endpoint
```
POST /organizations/{orgId}/invitations
Body: { emailAddress: "new@acme.com", role: "org:member" }
Response: { id: "inv_456", email_address: "new@acme.com", role: "org:member" }
```

---

## 8. Constraints & Limits

| Constraint | Value |
|-----------|-------|
| Max custom roles per instance | 10 |
| Monthly Retained Organizations (free) | 50 dev / 100 prod |
| Bulk user deletion | Not supported in Dashboard |
| Role deletion | Blocked if role is assigned to any member |
| Role assignment | Role must be in a Role Set first |

---

## 9. Key Patterns for GEM App

### Pattern: User -> Organization -> Role -> Permissions
This is the exact model we need. Our mapping:
- **User** = Conference staff member (Super Admin, Coordinator, Ops, Read-only viewer)
- **Organization** = "GEM India Conference 2026"
- **Role** = One of our 4 custom roles
- **Permissions** = Feature-level access (speakers, schedule, logistics, etc.)

### What We Steal from Clerk
1. **Role definition UI** — Name + Key + Description + Permission checkboxes.
2. **Invitation with role** — Email + Role dropdown + Invite button pattern.
3. **Members table** — User | Joined | Role (dropdown) | Actions (remove).
4. **`has()` pattern** — Simple boolean check for conditional rendering.
5. **Permission key format** — `org:<feature>:<action>` is clean and extensible.
6. **Org switcher** — If we ever support multiple events/chapters.
7. **Appearance customization model** — Theme via props, not CSS hacks.

### What We Build Differently
1. Clerk limits to 10 custom roles — we only need 4, so this is fine.
2. We need bulk user operations (Clerk Dashboard lacks bulk delete) — our admin panel must support this.
3. Our "Read-only" role needs more nuance than Clerk's default Member — custom permissions handle this.
4. We will integrate with our own backend, using Clerk's pattern but not necessarily Clerk itself.

---

## Sources
- [Clerk Organizations Overview](https://clerk.com/docs/organizations/overview)
- [Clerk Roles & Permissions](https://clerk.com/docs/organizations/roles-permissions)
- [Clerk Components Overview](https://clerk.com/docs/components/overview)
- [Clerk Users Overview](https://clerk.com/docs/users/overview)
- [Clerk Check Access Guide](https://clerk.com/docs/guides/organizations/control-access/check-access)
- [Clerk Manage Roles Custom Flow](https://clerk.com/docs/guides/development/custom-flows/organizations/manage-roles)
- [Clerk Manage Invitations Custom Flow](https://clerk.com/docs/guides/development/custom-flows/organizations/manage-organization-invitations)
- [Clerk Backend API — Organization Roles](https://clerk.com/docs/reference/backend-api/tag/organization-permissions)
