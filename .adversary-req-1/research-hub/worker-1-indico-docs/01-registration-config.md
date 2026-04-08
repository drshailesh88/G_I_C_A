# Indico — Configuring the Registration Process

**Source:** https://indico.docs.cern.ch/conferences/registration_config/  
**Screenshots:** 9 production screenshots (Conference_Reg_Config_1.png through _9.png)  
**Image base URL:** https://indico.docs.cern.ch/assets/

---

## Page Structure (Table of Contents)

1. Enable payments
2. Related Registration configuration steps
3. Manage invitations

---

## 1. Enable Payments

### Flow
1. Enter event management area (pencil icon at top of display view)
2. Click **Registration** on the left sidebar under Organisation
3. By default, **payments are disabled**
4. Click **Enable payments** button, then **Confirm**
5. A **Payments** button appears in the left sidebar

### Payment Methods Available (Screenshot: Config_2)
The Payments page shows:
- **General settings** — "Configure general settings for payments" (Configure button)
- **Payment methods** — 4 options displayed as cards:
  - **Manual** — can be enabled/disabled
  - **PostFinance CERN** — institution-specific payment gateway
  - **PayPal** — requires PayPal ID
  - **Bank Transfer** — requires IBAN code

### Screenshot 1 (Config_1): Registration Management Dashboard
Shows the main Registration management area with:
- Left sidebar: Settings, Timetable, Protection, Organization (expanded showing Materials, Call for Abstracts, Call for Papers, Contributions, Programme, **Registration** (highlighted), Reminders, Roles, Sessions, Surveys, Room Booking)
- Main area sections:
  - "Payments disabled / Payments are disabled for this event" — with **Enable payments** button
  - **Registration managers** — "Add/remove users allowed to manage registrations" (Configure button)
  - **Participant list** — "Define how the participant list will be shown on the event page" (Customize button)
  - **List of registration forms** — "There are no registration forms yet" with **Create form** button

---

## 2. Related Registration Configuration Steps

### Creating a Registration Form

#### Step 1: Click "Create form" button
Opens a form configuration dialog with these fields:

#### Registration Form Settings (Screenshot: Config_3)
| Field | Type | Description |
|-------|------|-------------|
| **Contact info** | Text | How registrants can get in touch with somebody for extra information |
| **Moderated** | Toggle (YES/NO) | "If enabled, registrations require manager approval" |
| **Only logged-in users** | Toggle (NO default) | "Users must be logged in to register" |
| **Registrant must have account** | Toggle (NO default) | "Registrations emails must be associated with an Indico account" |
| **Limit registrations** | Toggle (NO default) | "Whether there is a limit of registrations" |
| **Modification allowed** | Dropdown (Never) | "Will users be able to modify their data? When?" — Options include: Never, Until payment is done, Always |
| **Publish registrations** | Toggle (NO default) | "Registrations from this form will be displayed in the event page" |
| **Publish number of registrations** | Toggle (NO default) | "Number of registered participants will be displayed in the event page" |
| **Publish check-in status** | Toggle (NO default) | "Check-in status will be shown publicly on the event page" |
| **Price options** | Section | Select currency and enter the fee |
| **Notification** | Section | Configure email headers and text for registrants and event managers |

**Important warning:** Be careful about Modification allowed because of electronic payment features. Allow modifications only **until payment is done** or select **Never**. Changing settings after payment may change the total due amount.

### Step 2: Configure the Registration Form Builder

After form creation, click **Configure** on the Registration form row.

#### Registration Management Panel (Screenshot: Config_4)
Shows the full management interface after form creation:
- "Registration form has been successfully created" banner
- **Registrations are not open yet** — "Start now or schedule opening" with **Schedule** / **Start now** buttons
- **General settings** — Edit settings for this form (Edit button)
- **Registration Form** — Add, remove or modify information registrants may fill out (Configure button)
- **List of registrations** — Add, remove or modify registrations (0 count, Manage button)
- **Invitations** — Manage invitations to register for your event (Manage button)
- **Tickets** — Configure ticketing system (Configure button)
- Left sidebar also shows: **Services**, **Agreements**, **Logistics** sections

### Step 3: Form Builder — Adding Sections and Fields

A default form is provided. You can add sections by clicking **Add section**.

#### Add Section Dialog
Fields:
- Section title
- Description
- Manager-only toggle (whether section visible only to event managers)

#### Adding Fields (Screenshot: Config_5 — CRITICAL)
Click the **+** sign on the right of the section title to see field type picker.

**Available Field Types (16 total):**

| Field Type | Icon | Description |
|-----------|------|-------------|
| Static label | Checkmark | Static text display |
| Text | T | Single-line text input |
| Country | Flag | Country selector |
| Number | # | Numeric input |
| File | Document | File upload |
| Email | Envelope | Email input |
| Text area | Lines | Multi-line text input |
| Checkbox | Check | Boolean checkbox |
| Single Choice | Radio | Single selection from options |
| Date | Calendar | Date picker |
| Multiple Choice | Checkboxes | Multiple selection |
| Yes/No | Toggle | Boolean yes/no |
| **Accommodation** | Bed icon | **Special accommodation field** (highlighted) |
| Phone | Phone | Phone number input |
| **Accompanying Persons** | Person icon | Companion/guest tracking |

**Default form sections shown:**
- Title (dropdown with "Choose an option")
- Affiliation (text)
- Address (text area)
- Position (text)
- "New Section" row with controls (link, settings, **+** for add field)
- **Back** button at bottom

### Accommodation Field Configuration (DETAILED)

After selecting the Accommodation field type, a settings dialog appears:

**Accommodation Field Settings:**
- **Arrival dates** — Select possible arrival dates
- **Departure dates** — Select possible departure dates
- **Choices** — List of accommodation options
  - Default: "No accommodation"
  - Click **Add new** to add accommodation options
  - Each option includes:
    - Accommodation name
    - **Room price** (monetary amount)
    - **Number of places available** (capacity limit)

### Drag and Drop Ordering
- Both **sections** and **fields** support drag and drop
- Drag handle is on the **left** of section and field titles
- When done, click **Back** at the bottom right of the page

---

## 3. Manage Invitations

### Flow
1. From event management page, click **Manage** on the **Invitations** row
2. Email invitations are sent containing a link to the registration form
3. Recipients can **Accept** or **Decline** the invitation

### Invite Dialog (Screenshots: Config_6, Config_7, Config_8)
Click **Invite** dropdown — two options:
- **New user** — invite external people
- **Indico users** — search and add existing Indico users

#### Invitation Form Fields:
| Field | Required | Description |
|-------|----------|-------------|
| **Users** | Yes (*) | User search with avatar, name, email, institution display |
| **+ User** button | | Add additional users |
| **Skip moderation** | Toggle | "If enabled, the user's registration will be approved automatically" (highlighted in pink) |
| **Email section:** | | |
| From | Yes (*) | Sender address (dropdown) |
| Email subject | Yes (*) | Default: "Invitation to register" |
| Email body | Yes (*) | Rich text editor with formatting toolbar, supports template variables like `{first_name}` |

### Opening Registration (Screenshot: Config_9)
1. Return to Registration page
2. Click **Manage** near Registrations
3. Click **Start now** to open registration immediately, or **Schedule** to set future opening

---

## Key UI Patterns Observed

1. **Toggle switches** — YES/NO toggles for boolean settings (blue when enabled)
2. **Configure/Edit/Manage buttons** — Consistent action buttons on right side of each section row
3. **Left sidebar navigation** — Hierarchical with sections: Settings, Timetable, Protection, Organization (with sub-items), Services
4. **Pink/magenta highlights** — Documentation uses pink circles/rectangles to call attention to key UI elements
5. **Breadcrumb context** — "LHC Conference 5 May" shown at top with creator info
6. **Form validation** — Required fields marked with red asterisk (*)
7. **Rich text editor** — Full CKEditor-style toolbar for email body composition

---

## Registration Config — Field Type Summary for G.I.C.A. Reference

### Built-in Special Fields
- **Accommodation** — arrival/departure dates, hotel choices with pricing and capacity
- **Accompanying Persons** — track companions/guests

### Standard Form Fields  
Text, Number, Text area, Email, Phone, Date, Country, File upload, Checkbox, Yes/No, Single Choice, Multiple Choice, Static label

### Registration Workflow Options
- **Automatic** — anyone can register immediately
- **Moderated** — manager must approve each registration
- **Invitation-only** — send invitations with optional skip-moderation

### Payment Integration
- Payments can be enabled/disabled at event level
- 4 payment gateway options (Manual, PostFinance, PayPal, Bank Transfer)
- Registration modification can be locked after payment
