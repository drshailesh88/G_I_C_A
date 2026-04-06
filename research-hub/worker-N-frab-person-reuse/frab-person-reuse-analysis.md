# Frab: Person Reuse Across Conferences — Complete Analysis

## Executive Summary

Frab implements a **global Person database** that is conference-independent. People exist once in the system and are linked to specific conferences/events through junction tables. This is exactly the "Master People DB" pattern GEM India needs.

Key quote from frab's manual: Accounts are shared across conferences inside one frab installation, enabling organizers to make decisions based on previous experiences with a speaker.

---

## 1. How People (Speakers, Moderators, Staff) Are Stored

### The `people` Table — Global Master Record

People exist in a **single global table**, independent of any conference:

```sql
CREATE TABLE people (
  id            INTEGER PRIMARY KEY,
  first_name    VARCHAR(255) DEFAULT '',
  last_name     VARCHAR(255) DEFAULT '',
  public_name   VARCHAR(255) NOT NULL,        -- Display name (required)
  email         VARCHAR(255) NOT NULL,         -- Required, indexed
  email_public  BOOLEAN DEFAULT TRUE,
  gender        VARCHAR(255),
  avatar_file_name    VARCHAR(255),
  avatar_content_type VARCHAR(255),
  avatar_file_size    INTEGER,
  avatar_updated_at   DATETIME,
  abstract      TEXT,                          -- Short bio
  description   TEXT,                          -- Long bio
  note          TEXT,                          -- Internal crew notes
  include_in_mailings BOOLEAN DEFAULT FALSE,
  use_gravatar  BOOLEAN DEFAULT FALSE,
  user_id       INTEGER REFERENCES users(id), -- Links to login account
  created_at    DATETIME NOT NULL,
  updated_at    DATETIME NOT NULL
);
CREATE INDEX index_people_on_email ON people(email);
CREATE INDEX index_people_on_user_id ON people(user_id);
```

### Related Contact Detail Tables (also global, not per-conference)

| Table | Key Columns | Notes |
|-------|------------|-------|
| `im_accounts` | person_id, im_type, im_address | Telegram, XMPP, etc. |
| `phone_numbers` | person_id, phone_type, phone_number | Mobile, office, etc. |
| `links` | linkable_id, linkable_type, title, url | Polymorphic (person or event) |
| `languages` | attachable_id, attachable_type, code | Polymorphic, stores language codes |

### The `users` Table — Authentication (Separate from Person)

```sql
CREATE TABLE users (
  id                     INTEGER PRIMARY KEY,
  email                  VARCHAR(255) NOT NULL UNIQUE,
  encrypted_password     VARCHAR(255) NOT NULL,
  role                   VARCHAR(255) DEFAULT 'submitter',  -- admin, crew, submitter
  -- Devise fields: confirmation, reset, lockout, sign-in tracking
  provider               VARCHAR(255),   -- OAuth provider
  uid                    VARCHAR(255),   -- OAuth UID
  ...
);
```

**Critical Design Decision:** `User` (authentication) and `Person` (profile) are **separate entities** with a 1:1 relationship. A User automatically gets a Person record created on signup. This means:
- A person can exist without a user account (crew-added speakers)
- A user always has exactly one person record
- Person data is the "master" profile; User is just for login

---

## 2. Can the Same Person Appear in Multiple Conferences?

**YES — This is a core design principle.**

### How It Works

People are linked to conferences through **three junction patterns**:

#### Pattern A: Person → EventPerson → Event → Conference (Talk assignments)
```
Person ──has_many──→ EventPerson ──belongs_to──→ Event ──belongs_to──→ Conference
```

#### Pattern B: Person → Availability → Conference (Schedule availability)
```
Person ──has_many──→ Availability ──belongs_to──→ Conference
```

#### Pattern C: Person → Expense/TransportNeed → Conference (Logistics)
```
Person ──has_many──→ Expense ──belongs_to──→ Conference
Person ──has_many──→ TransportNeed ──belongs_to──→ Conference
```

#### Pattern D: User → ConferenceUser → Conference (Crew/Organizer roles)
```
User ──has_many──→ ConferenceUser ──belongs_to──→ Conference
```

### Key Model Scopes for Cross-Conference Queries

```ruby
# Find all people involved in a specific conference
scope :involved_in, ->(conference) {
  joins(events: :conference).where('conferences.id': conference).distinct
}

# Find speakers at a specific conference
scope :speaking_at, ->(conference) {
  joins(:event_people)
    .where('event_people.event_role': EventPerson::SPEAKERS)
    .joins(events: :conference)
    .where('conferences.id': conference).distinct
}

# Instance method: get a person's events in a specific conference
def events_in(conference)
  events.where(conference_id: conference.id)
end

# Instance method: get events in OTHER conferences (for cross-ref)
def events_as_presenter_not_in(conference)
  events.where('event_people.event_role': EventPerson::SUBSCRIBERS)
    .where.not(conference: conference)
end
```

---

## 3. How Deduplication / Person Merging Works

Frab has a dedicated `MergePersons` service class at `app/lib/merge_persons.rb`.

### The Merge Algorithm

```ruby
class MergePersons
  def initialize(keep_last_updated = true)
    @keep_last_updated = keep_last_updated
  end

  def combine!(keep, kill)
    # Optionally keep the more recently updated record
    return merge_persons(kill, keep) if retain_second_person?(keep, kill)
    merge_persons(keep, kill)
  end
end
```

### What Gets Merged (in order):

1. **User accounts** — If both persons have user accounts, merge them (keeping higher-privilege conference roles). If only one has an account, transfer it.
2. **Availabilities** — Import availability records for conferences where the "keep" person has none.
3. **Tickets** — Transfer ticket if "keep" doesn't have one.
4. **Languages** — Merge without duplicates.
5. **Event assignments (event_people)** — Transfer unless the "keep" person already has the same role in the same event.
6. **Event ratings** — Transfer all.
7. **IM accounts, links, phone numbers** — Transfer all.
8. **Conflicts** — Recalculate on all affected events.
9. **Destroy** the duplicate person record.

### Conference User Role Merge Logic

When merging users who were both crew on the same conference, the system keeps the **higher-privilege role**:

```ruby
# Role hierarchy: reviewer < coordinator < orga
if ConferenceUser::ROLES.index(u.role) > ConferenceUser::ROLES.index(collision.role)
  collision.update role: u.role
end
```

### Person Search (for finding duplicates)

The `PeopleController#search` uses **Ransack** to search across:
- first_name, last_name, public_name
- email
- abstract, description
- user email

The `PeopleController#lookup` provides **autocomplete/dropdown** with up to 99 results, cached for 3 minutes.

---

## 4. Profile Fields Per Person

### Core Person Fields
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| first_name | string(255) | No | Private name |
| last_name | string(255) | No | Private name |
| public_name | string(255) | **Yes** | Display name for schedules |
| email | string(255) | **Yes** | Indexed for search |
| email_public | boolean | No | Default true |
| gender | string(255) | No | Free-text |
| abstract | text | No | Short bio (translatable) |
| description | text | No | Long bio (translatable) |
| note | text | No | Internal crew notes |
| include_in_mailings | boolean | No | Default false |
| use_gravatar | boolean | No | Default false |
| avatar | attachment | No | Paperclip file upload |

### Related Records (global, not per-conference)
- **IM accounts** — type + address (multiple)
- **Phone numbers** — type + number (multiple)
- **Links** — title + URL (multiple, polymorphic)
- **Languages** — code (multiple, polymorphic)

### Per-Conference Records
- **Availabilities** — start_date, end_date, day_id (per conference)
- **Expenses** — name, value, reimbursed (per conference)
- **Transport needs** — at, transport_type, seats, booked, note (per conference)
- **Ticket** — remote_ticket_id (one per person)

---

## 5. How People Are Assigned to Events with Different Roles

### The `event_people` Junction Table

```sql
CREATE TABLE event_people (
  id                    INTEGER PRIMARY KEY,
  event_id              INTEGER NOT NULL REFERENCES events(id),
  person_id             INTEGER NOT NULL REFERENCES people(id),
  event_role            VARCHAR(255) NOT NULL DEFAULT 'submitter',
  role_state            VARCHAR(255),
  comment               VARCHAR(255),
  confirmation_token    VARCHAR(255),
  notification_subject  VARCHAR(255),
  notification_body     TEXT,
  created_at            DATETIME NOT NULL,
  updated_at            DATETIME NOT NULL
);
CREATE INDEX index_event_people_on_event_id ON event_people(event_id);
CREATE INDEX index_event_people_on_person_id ON event_people(person_id);
```

### Event Roles (defined in EventPerson model)

```ruby
ROLES = %i(coordinator submitter speaker moderator assistant).freeze
```

| Role | Description |
|------|-------------|
| **coordinator** | Crew member managing the event |
| **submitter** | Person who submitted the proposal |
| **speaker** | Primary presenter — availability affects scheduling |
| **moderator** | Session moderator — availability affects scheduling |
| **assistant** | Helper — notified of changes but NOT in conflict calculations |

### Role States (lifecycle of an assignment)

```ruby
STATES = %i(canceled confirmed declined idea offer unclear attending).freeze
```

| State | Meaning |
|-------|---------|
| **idea** | Just an idea, not confirmed |
| **offer** | Invitation sent |
| **unclear** | Status unknown |
| **confirmed** | Person confirmed participation |
| **canceled** | Person canceled |
| **declined** | Person declined |
| **attending** | Person is attending |

### Role Groupings (used for queries)

```ruby
SPEAKERS   = %i(speaker moderator).freeze        # Affect scheduling conflicts
SUBSCRIBERS = %i(speaker moderator assistant).freeze  # Get notifications
JOINABLES  = %i(speaker assistant).freeze          # Can join via invitation
```

### Conference-Level Crew Roles (separate system)

```ruby
# ConferenceUser::ROLES
ROLES = ["reviewer", "coordinator", "orga"]
```

| Role | Description |
|------|-------------|
| **reviewer** | Can review/rate submissions |
| **coordinator** | Can manage events and people |
| **orga** | Full organizer access |

---

## 6. Complete Entity Relationship Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    GLOBAL (Conference-Independent)            │
│                                                              │
│  ┌──────────┐  1:1   ┌──────────┐                           │
│  │  users    │───────→│  people   │                          │
│  │(auth)     │        │(profiles) │                          │
│  └──────────┘        └──────────┘                           │
│       │                    │                                  │
│       │                    ├── im_accounts                    │
│       │                    ├── phone_numbers                  │
│       │                    ├── links (polymorphic)            │
│       │                    └── languages (polymorphic)        │
│       │                                                      │
└───────┼──────────────────────┼───────────────────────────────┘
        │                      │
        │ JUNCTION TABLES      │ JUNCTION TABLES
        │ (Conference-Scoped)  │ (Conference-Scoped)
        │                      │
        ▼                      ▼
┌──────────────────┐   ┌──────────────────┐
│ conference_users  │   │  event_people     │
│ (crew roles)      │   │  (talk roles)     │
│                   │   │                   │
│ user_id ──→ users │   │ person_id → people│
│ conference_id     │   │ event_id → events │
│ role: reviewer/   │   │ event_role:       │
│   coordinator/    │   │   submitter/      │
│   orga            │   │   speaker/        │
└────────┬─────────┘   │   moderator/      │
         │              │   coordinator/    │
         │              │   assistant       │
         │              │ role_state:       │
         │              │   idea/offer/     │
         │              │   confirmed/etc.  │
         │              └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────────────────────────────┐
│              conferences                  │
│                                           │
│  ┌── events                               │
│  │   └── event_people → people            │
│  │                                         │
│  ├── availabilities → people              │
│  ├── expenses → people                    │
│  └── transport_needs → people             │
└───────────────────────────────────────────┘
```

---

## 7. How Frab's Pattern Maps to GEM India

### Direct Mappings

| Frab Concept | GEM India Equivalent |
|-------------|---------------------|
| `people` table | Master People DB |
| `events` table | Sessions/talks within a conference |
| `event_people` | SessionPeople (junction) |
| `event_role` | Role assignment per session |
| `role_state` | Confirmation workflow |
| `conferences` table | Conferences/events |
| `conference_users` | ConferenceStaff (crew roles) |
| `availabilities` | Speaker availability per conference |
| `MergePersons` service | Person deduplication service |

### Key Design Principles to Replicate

1. **Person is GLOBAL** — Never scoped to a conference. One record per human.
2. **User ≠ Person** — Separate auth from profile. A person can exist without logging in.
3. **Junction tables carry the role** — `event_people.event_role` defines what a person does in a specific event.
4. **Junction tables carry the state** — `event_people.role_state` tracks the confirmation lifecycle.
5. **Per-conference data lives in its own tables** — Availability, expenses, transport are conference-scoped but person-linked.
6. **Merge, don't prevent duplicates** — Frab allows duplicates to be created and provides a merge tool rather than strict dedup at creation time.
7. **Search is multi-field** — Ransack searches across name, email, bio fields for finding existing people.

### Suggested Drizzle ORM Schema (Skeleton)

```typescript
// Global person record
export const people = pgTable('people', {
  id: serial('id').primaryKey(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  publicName: varchar('public_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  emailPublic: boolean('email_public').default(true),
  gender: varchar('gender', { length: 255 }),
  abstract: text('abstract'),
  description: text('description'),
  note: text('note'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  userId: integer('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Junction: person ↔ event with role
export const eventPeople = pgTable('event_people', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => events.id),
  personId: integer('person_id').notNull().references(() => people.id),
  eventRole: varchar('event_role', { length: 50 }).notNull().default('submitter'),
  // Possible values: 'coordinator', 'submitter', 'speaker', 'moderator', 'assistant'
  roleState: varchar('role_state', { length: 50 }),
  // Possible values: 'idea', 'offer', 'confirmed', 'declined', 'canceled', 'attending'
  comment: varchar('comment', { length: 255 }),
  confirmationToken: varchar('confirmation_token', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Junction: user ↔ conference with crew role
export const conferenceUsers = pgTable('conference_users', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  conferenceId: integer('conference_id').references(() => conferences.id),
  role: varchar('role', { length: 50 }).notNull(),
  // Possible values: 'reviewer', 'coordinator', 'orga'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Per-conference availability
export const availabilities = pgTable('availabilities', {
  id: serial('id').primaryKey(),
  personId: integer('person_id').notNull().references(() => people.id),
  conferenceId: integer('conference_id').notNull().references(() => conferences.id),
  dayId: integer('day_id').references(() => days.id),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

---

## 8. Screenshots & UI Observations

From the wiki Screenshots page, frab provides these person management screens:

1. **"Show Person"** — Full profile view showing a person's details, their events across conferences, and availability
2. **"Speaker Availability"** — Calendar-style interface for marking available time slots per conference day
3. **"Edit Schedule"** — Drag-and-drop schedule builder where events (with assigned people) are placed on a grid
4. **"Event Review"** — Review interface showing event details including all assigned people and their roles
5. **"Select Conference"** — Conference picker showing the same user can switch between conferences (people persist across them)
6. **"CFP Interface"** — Public-facing form where speakers self-register, creating their person record in the global database

### Search/Lookup UX

When adding a person to an event, the controller provides:
- **Autocomplete dropdown** (max 99 results)
- **Multi-field search**: first_name, last_name, public_name, email, abstract, description
- **3-minute cache** on search results
- **Status messages**: "pick one" (2-99 matches), "not found" (0), "too many" (99+)

---

## 9. Key Takeaways for GEM India Implementation

1. **The global Person table is the foundation** — Everything else (events, conferences, logistics) references it.
2. **Separate auth from identity** — User table for login, Person table for who they are.
3. **Roles live on the junction** — A person can be a speaker at one event and a moderator at another, within the same or different conferences.
4. **State machines on assignments** — Track the lifecycle of each person-event assignment independently.
5. **Merge > Prevent** — Build a merge tool rather than trying to prevent all duplicates at creation.
6. **Self-service profile creation** — Let speakers create their own profiles via CFP; crew can also create profiles manually.
7. **Conference-scoped supplementary data** — Availability, expenses, transport needs are per-conference but linked to the global person.
