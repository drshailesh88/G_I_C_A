# Indico — Call for Abstracts

**Source:** https://indico.docs.cern.ch/conferences/cfa/  
**Screenshots:** 8 production screenshots  
**Related pages:** Submitting an Abstract (/conferences/submitting/), Reviewing Abstracts (/conferences/reviewing/)

---

## Page Structure

1. Email notifications
2. Configure abstract submission
3. Configure Abstract Reviewing options
4. The Book of Abstracts
5. The List of Abstracts
6. Open the Call for Abstracts

---

## Enabling the Module

1. Event management → **Call for Abstracts** on left sidebar under **Workflows**
2. Click **Enable module**
3. Directed to Call for Abstracts management page

---

## 1. Email Notifications

### Flow
1. Click **Notifications** → **Add new one**
2. Create a **notification ruleset**: specific email template sent when a rule is matched

### Ruleset Configuration
| Field | Description |
|-------|-------------|
| **Title** | Ruleset name |
| **Email template** | Template type (e.g., "Submit") |
| **Rule** | Trigger condition (e.g., "Submitted", "Accepted", "Rejected") |

Multiple rulesets can be created for different abstract states.

---

## 2. Configure Abstract Submission

### Flow
1. Click **Settings** on the Submissions row → Configure abstract submission screen

### Settings
| Option | Description |
|--------|-------------|
| **Announcement** | Text displayed when users submit abstracts |
| **Allow multiple tracks** | Whether submitters can select multiple tracks |
| **Track selection mandatory** | Whether track assignment is required |
| **Authorized submitters** | Limit submission to specific users |
| **Instructions** | Additional advice for submitters |

### Contribution Types
From **Fields and types** row → **Contribution types** → **New contribution type**
- Define allowed types: e.g., **Oral**, **Poster**

### Custom Abstract Fields
From **Fields and types** row → **Abstract fields** → **Add new field**
- Field types available: **Single choice** (with radio buttons, vertical/horizontal display)
- Can add custom questions or text fields tailored to the event

---

## 3. Configure Abstract Reviewing

### Roles (from Reviewing options row)
Click **Roles** to assign:

| Role | Description |
|------|-------------|
| **Reviewers** | Assess abstracts with reviews; can only see their own reviews |
| **Conveners** | Can read ALL reviews in their tracks; can act as judges |
| **Judges** | Accept or reject abstracts based on reviewer feedback |

- Reviewers and Conveners can be assigned per-track or for all tracks
- Search for existing Indico users to add

### Review Settings (from Reviewing options row → Settings)
| Setting | Description |
|---------|-------------|
| **Review questions** | Questions used as guide for reviewers |
| **Scale** | Rating scale (e.g., 0 to 5) |
| **Allow conveners to accept/reject** | Toggle |
| **Allow comments** | Toggle for review page comments |
| **Allow contributors in comments** | Toggle |
| **Reviewer instructions** | Guidance text for reviewers |
| **Judge instructions** | Guidance text for judges |

---

## 4. Book of Abstracts

- Configurable and **downloadable PDF** document
- Only **accepted abstracts** are published
- Settings: additional text, sorting criteria for abstract order
- Click **Settings** from Book of Abstracts row

---

## 5. List of Abstracts

- Built automatically once Call for Abstracts is open
- Rearrangeable via **Manage** button
- Shows all submitted abstracts regardless of status

---

## 6. Opening the Call for Abstracts

Two options:
- **Schedule** — select start date, end date, and modification deadline
- **Start now** — opens immediately

Once open, can be **closed** or **rescheduled** from the same management page.

---

## Key Image Files
| Image | Description |
|-------|-------------|
| conference_abstract_def.png | CfA management page overview |
| conference_abstract_submit_config.png | Abstract submission configuration |
| conference_abstract_type.png | Contribution type creation |
| conference_abstract_custom.png | Custom field creation (single choice) |
| conference_review_def.png | Review settings and questions |
| conference_reviewers.png | Reviewer/convener role assignment |
| conference_review_instructions.png | Review instructions configuration |
| conference_abstracts_book_list.png | Book of abstracts / list of abstracts |

---

## Abstract Workflow Summary for G.I.C.A. Reference

```
1. Manager defines Tracks (Programme page)
2. Manager configures CfA: submission settings, fields, contribution types
3. Manager sets up reviewing: roles, questions, scale
4. Manager opens CfA (schedule or immediately)
5. Authors submit abstracts (choose tracks, fill fields)
6. Reviewers review (rate, comment, propose accept/reject)
7. Conveners/Judges make final decision (accept/reject/merge)
8. Accepted abstracts → automatic Contribution creation
9. Contributions → scheduled in Timetable
10. Book of Abstracts generated (PDF with accepted abstracts)
```
