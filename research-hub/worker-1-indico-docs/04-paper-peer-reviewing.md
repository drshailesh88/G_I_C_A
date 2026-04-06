# Indico — Paper Peer Reviewing

**Source:** https://indico.docs.cern.ch/conferences/papers/peer_reviewing/  
**Screenshots:** 44 production screenshots  
**Related pages:** Introduction (/conferences/papers/introduction/), Editing (/conferences/papers/editing/)

---

## Page Structure (Table of Contents)

1. Introduction
2. Setting up peer reviewing as a conference manager/organizer
   - Enabling the module
   - Uploading a paper template
   - Setting up content & layout reviewing
   - Setting up paper judging
   - Reviewing settings
   - Setting up reviewing teams
   - Enabling call for papers
   - Paper assignment
   - Permissions
3. Peer reviewing as a paper author
4. Peer reviewing as a reviewer
5. Peer reviewing as a judge

---

## 1. Introduction

The Peer Reviewing module allows:
- Submit papers for accepted abstracts
- Set up reviewing and judging teams and assign them to papers
- Review and judge papers
- Publish accepted papers

### Workflow Overview (Flowchart screenshot available)
Author submits paper → Reviewers review (content + layout) → Judge makes decision → Accept/Reject/Request corrections → If corrections: author resubmits → cycle repeats

---

## 2. Setting Up Peer Reviewing (Manager/Organizer View)

### Enabling the Module
1. Event management page → **Peer Reviewing** tab under **Workflows**
2. Click **Enable module**
3. New tabs appear in conference display area
4. Can be disabled from **Features** tab under **Advanced options**

### Uploading a Paper Template
1. Select **Peer Reviewing** tab in management area
2. Click **Manage** next to **Paper templates**
3. Upload template with name and optional description
4. Multiple templates supported
5. Visible in display area for authors to download

### Content & Layout Reviewing Setup

Two separate reviewing processes:
| Process | Default | Description |
|---------|---------|-------------|
| **Content reviewing** | Enabled | Reviews text correctness and completeness |
| **Layout reviewing** | Disabled | Reviews style, appearance, conference guideline compliance |

**Reviewing deadlines:**
- Set per process via **Deadline** button
- Optional enforcement (prevents reviewing after deadline)
- Displays info box in reviewing area

**Custom reviewing questions** (3 types):
| Type | Description |
|------|-------------|
| **Rating** | Numeric scale (configurable min/max) |
| **Yes/No** | Boolean question |
| **Free text** | Open text response |

Each question has: name, description, required toggle. Rating scale is global (same min/max for all rating questions).

### Paper Judging Setup
- Judging deadline (same behavior as reviewing deadlines)
- Only one judge per paper

### Reviewing Settings
Configurable options:
- **Announcement** — message displayed on peer reviewing page (supports Markdown + embedded images)
- **Rating scale** — min/max values for rating questions (changing rescales existing answers)
- **Email notifications** — configurable per role and action:
  - Who receives notifications (content reviewer, layout reviewer, judge columns)
  - Under what circumstances (paper submitted, reviewed, judged, etc.)
  - Most common notifications enabled by default

### Reviewing Teams
Click **Teams** button → dialog to add:
| Role | Description |
|------|-------------|
| **Paper managers** | Manage Peer Reviewing module settings |
| **Judges** | Final decision-makers on papers |
| **Content reviewers** | Review paper content |
| **Layout reviewers** | Review paper layout/style |

**Competences** — keywords describing expertise, used to match reviewers/judges to papers.

**Contact** — email reviewers/judges directly via built-in email dialog.

### Enabling Call for Papers
- Click **Start now** (immediate) or **Schedule** (set start/end dates)
- Once open, can be closed or rescheduled

### Paper Assignment
1. Click **Assign papers** next to Paper assignment
2. Overview page shows all submitted papers and their state
3. Select paper(s) → click **Assign** → select role from dropdown
4. Dialog shows people with their competences
5. Multiple papers can be assigned at once (bulk selection)
6. **Unassign** — select paper → Unassign → select role → select person

### Permissions Table

| Action | Who Can Do It |
|--------|---------------|
| Submit a paper | Abstract or contribution submitters |
| Review a paper | Paper reviewers + event managers (must be assigned) |
| Judge a paper | Paper judges + event managers (must be assigned) |
| Assign papers & manage settings | Paper managers + event managers |

---

## 3. Peer Reviewing as a Paper Author

### Workflow
1. Submit abstract → abstract accepted → contribution created
2. See contributions on **My contributions** page
3. When Call for Papers is open, click **Submit paper** on Paper Peer Reviewing page
4. If multiple contributions: choose which one
5. Can also submit from contribution page directly
6. Track progress in **My papers** section

### Author Actions
- Receive email notifications for all activity
- If corrections requested: upload new paper version
- Accepted papers published in corresponding contribution

---

## 4. Peer Reviewing as a Reviewer

### Workflow
1. See assigned papers in **Reviewing area** → **Papers to review**
2. Already reviewed: **Reviewed papers**
3. Select paper → open paper timeline
4. Download latest paper version from top of timeline
5. Click **Review** → choose review type (content/layout) if both enabled
6. Choose proposed action: Accept / Reject / Request corrections
7. Answer any custom reviewing questions

### Key Features
- Can edit review until judgment is made (click edit icon)
- Can add comments without formal review
- Comment visibility: configurable (e.g., judges-only for sensitive topics)
- If corrections requested → can review corrected paper

---

## 5. Peer Reviewing as a Judge

### Workflow
1. See assigned papers in **Judging area**
2. View assigned reviewers (content + layout)
3. Wait for reviewers to complete reviews
4. Add judgment: Accept / Reject / Request corrections
5. If corrections requested → author submits new version → re-judge

### Key Features
- Only ONE judge per paper
- Can reset judgment (Reset judgment icon)
- Can leave comments before judgment
- Deadlines may apply (enforced or informational)

---

## Key UI Patterns for G.I.C.A. Reference

### Paper Timeline
- Chronological view of all activity on a paper
- Shows: submissions, reviews, judgments, comments, corrections
- Download buttons for paper versions
- Edit/review action buttons

### Reviewing Area Layout
- Papers to review / Reviewed papers split
- Judging area separate from reviewing area
- Competence-based assignment UI

### Workflow States
Paper states: Submitted → Under review → Accepted / Rejected / Corrections requested → (Resubmitted) → ...

### Email Notification Matrix
Granular control over who gets notified for each event type, displayed as a table with checkboxes per role column.
