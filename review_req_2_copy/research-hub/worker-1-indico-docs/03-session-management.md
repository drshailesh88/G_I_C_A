# Indico — Session Management

**Source:** https://indico.docs.cern.ch/conferences/sessions/  
**Screenshots:** 16 production screenshots  
**Image base URL:** https://indico.docs.cern.ch/assets/

---

## Page Structure (Table of Contents)

1. Creating a session type
2. Creating a session
3. Managing a session
4. Distinction between session coordinators and conveners

---

## 1. Creating a Session Type

Session types help organize sessions but are **not required** unless using poster sessions.

### Flow
1. Navigate to management area → **Sessions** under Organisation
2. Click **Settings** → **Session types** from dropdown
3. Click **New session type**
4. Fields:
   - **Name** (required)
   - **Poster** toggle — if enabled, session becomes a poster session (contributions auto-scheduled in parallel)

### Sessions Management Page (Screenshot: sessions_management.png)
- Left sidebar: Organisation section with Sessions highlighted
- Main area: Session list table with columns: checkbox, ID, Title, Code
- Toolbar: **Add new session** (blue button), Remove, Author list, Export, Assign programme codes
- Search: ID/text search field with result count (e.g., "2/2")

---

## 2. Creating a Session

### Flow
1. Navigate to Sessions page
2. Click **Add new session** in top menu
3. Fill in dialog fields:

### Create Session Dialog (Screenshot: create_session_2.png)
| Field | Required | Description |
|-------|----------|-------------|
| **Title** | Yes | Session name |
| **Type** | No | Dropdown of session types created above |
| **Default contribution duration** | No | Default duration for contributions scheduled in this session |
| **Location** | No | Venue/Room from Room booking module. If empty, event location used as default |
| **Description** | No | Session description |
| **Color** | No | Session color (displayed in timetable) |

4. Click **Save**

---

## 3. Managing a Session

### Session List Actions
Each session row has action icons on the right:
- **Pencil icon** — Edit session settings
- **Clock icon** — View session timetable
- **Bin icon** — Delete session (**Warning: deletes all session blocks and unschedules contributions**)
- **Shield icon** — Manage session protection/permissions

### Quick Actions from List
- **Change session type**: Click type column directly
- **Remove session type**: Click type again to unselect
- **View blocks**: See scheduled session blocks in "Blocks" column
- **Upload material**: Click Material column link → upload files dialog
  - Files added to whole session (not per-block)
  - Visible in timetable in every session block of that session
  - Available under "Presentation materials" in session details

### Session Protection/Permissions (Screenshot: coordinate.png)
Click shield icon → dialog to grant access:

| Permission Level | Description |
|-----------------|-------------|
| **Full management** | Total control over session |
| **Coordination rights** | Limited rights (see below) |

### Session Coordinator Rights
Default coordinator permissions:
- View session data
- Schedule contributions
- Create breaks

Additional rights (toggled from main Protection page → "Session coordinator rights"):
- **Contributions** toggle — modify contributions in their sessions
- **Session blocks** toggle — manage session blocks, including creating new ones

### "My Sessions" Feature
Any person assigned as manager or coordinator of at least one session can manage their sessions from main event page under **My sessions**.

---

## 4. Session Coordinators vs Conveners

| Role | Rights | Where assigned | Displayed |
|------|--------|----------------|-----------|
| **Session Coordinators** | Extra management rights over session (configurable) | Session protection dialog | Not displayed in timetable |
| **Session Conveners** | No extra rights (display-only, like contribution speakers) | Session block dialog (in timetable) | Shown in top-right corner of session blocks |

---

## Key Image Files
| Image | Description |
|-------|-------------|
| sessions_management.png | Sessions list with toolbar |
| session_settings.png | Settings dropdown with Session types |
| add_session_type.png | Add new session type dialog |
| create_session_2.png | Create session dialog with all fields |
| edit_session.png | Edit session pencil icon |
| set_session_type.png | Set session type inline |
| blocks_material.png | Blocks and Material columns |
| protection.png | Shield icon for permissions |
| coordinate.png | Coordination rights dialog |
| coordination_rights.png | Session coordinator rights toggles |
| my_sessions.png | "My sessions" view for coordinators |
| conveners.png | Conveners displayed in timetable |
