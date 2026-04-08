# TERMINAL 3: HubSpot CRM — Chrome UX Teardown

You are Worker 3 doing a detailed UX teardown of HubSpot Free CRM for the GEM India Conference App project.

## Context
We already have web research (web-research.md) documenting features, field types, and capabilities from docs. What we DON'T have is the actual visual UX — the contact list layout, slide-over create form, 3-column detail page, CSV import mapping screen, and merge interface.

## Your Job
Log into HubSpot Free CRM and document every screen, every click. This directly maps to our Master People Database module.

## Account Setup
Go to https://app.hubspot.com and sign up for the free CRM. Add at least 10-15 sample contacts manually or via CSV import.

## FLOW 1: Contact List View

1. Navigate to CRM > Contacts. Screenshot the FULL page:
   - What are the DEFAULT columns? List every one with exact names.
   - Where is the search bar? What placeholder text?
   - Where are the filter controls? What does clicking "Advanced filters" open?
   - Where are the saved view TABS? What default views exist?
   - Where is the "Create contact" button? What color? What position?
2. Click "Edit columns":
   - How does the column customization panel work?
   - Can you drag to reorder? What's the drag handle look like?
   - How do you add a new column? Search? Dropdown?
3. Select 3 contacts via checkboxes. Document:
   - What BULK ACTION BAR appears? Where on screen?
   - What actions are listed? Exact button labels.
   - What does the count display look like? ("3 selected"?)
4. Pagination: What does the bottom of the list show? Record count format?

## FLOW 2: Create Contact (Slide-Over Panel)

1. Click "Create contact". Document the EXACT panel:
   - Does it slide from the right? How wide is it relative to the page?
   - Is the contact list still visible behind it?
   - What fields appear? List EVERY field with its type and whether it's required.
   - What does the required field indicator look like? (asterisk? red border?)
   - Where is the Save button? Cancel button? Their exact positions.
2. Try to save without filling required fields. What error appears? Where? (inline? toast? modal?)
3. Fill in and save. What confirmation appears? (toast? redirect? panel closes?)

## FLOW 3: Contact Detail Page (3-Column Layout — CRITICAL)

1. Click on a contact from the list. Document the FULL page layout:

   LEFT SIDEBAR:
   - What action buttons are at the top? (Call, Email, Log, Task, Note?) Icons or text?
   - What does the "About this contact" card look like? How are properties displayed?
   - Can you click a property value to edit inline? What happens? (text input appears? dropdown?)
   - What other cards are below? (Communication subscriptions? Website activity?)

   MIDDLE COLUMN:
   - What tabs exist? (Overview, Activities, Sales?) Exact tab names.
   - In the Activities tab: how does the timeline look? What icons per activity type?
   - What filter controls exist on the timeline?

   RIGHT SIDEBAR:
   - What association cards are shown? (Companies, Deals, Tickets?)
   - How does the "Add association" interaction work?

2. Edit a property value inline. Document the exact interaction: click → edit → save sequence.

## FLOW 4: CSV Import (6-Step Flow — CRITICAL)

This is one of the most important flows to document since our People DB will use this exact pattern.

1. Navigate to Import. Click "Start an import". Document every step:

   STEP 1 — Source selection:
   - What options? "File from computer" vs what else?
   - What does the screen look like?

   STEP 2 — Object selection:
   - "One file" vs "Multiple files"? "One object" vs "Multiple objects"?
   - Visual layout of these choices?

   STEP 3 — File upload:
   - Upload area design? Drag-and-drop zone? Browse button?
   - What formats listed as accepted?
   - What happens after file is selected? Progress indicator?

   STEP 4 — Column Mapping (MOST CRITICAL SCREEN):
   - How are CSV columns listed? Left side? Cards? Rows?
   - How are HubSpot properties shown as mapping targets? Dropdown per column?
   - What does a SUCCESSFUL auto-match look like visually? (green checkmark? highlighted?)
   - What does an UNMATCHED column look like? (red? yellow? just empty dropdown?)
   - Where is the "Don't import" / skip option?
   - Where is "Create new property" inline? What happens when clicked?
   - Is there a preview of sample data from each column?

   STEP 5 — Duplicate handling:
   - What are the exact options presented? Radio buttons? Dropdown?
   - Visual layout?

   STEP 6 — Review & finalize:
   - What summary information is shown?
   - Where do you name the import?
   - What does the "Finish import" button look like?

2. After import completes: what does the import history page look like? Can you download errors?

## FLOW 5: Deduplication & Merge

1. If available on free tier: Navigate to CRM > Contacts > Actions > Manage duplicates.
   - If NOT available (likely): Go to a contact, click Actions > Merge, and search for a duplicate.
2. Document the merge interface:
   - Side-by-side layout? How are the two records displayed?
   - How do you select which record is primary?
   - How do you pick field values from either record?
   - What does the final "Merge" button look like? Any confirmation?

## FLOW 6: Lists / Segments

1. Navigate to Contacts > Lists (or Segments). Create an Active list:
   - What does the filter builder look like?
   - How do you add AND/OR conditions?
   - What does the list preview show?
2. Save the list. How does it appear in the sidebar/tabs?

## Output Format

Write ALL findings to: `/research-hub/ux-teardowns/session-04-hubspot-crm/chrome-teardown.md`

For each flow:
- **Screen name** and URL
- **Full layout description** (what's where)
- **Every interactive element** with exact label text
- **Form fields** with types and required indicators
- **Transitions** (slide-over, modal, page nav, toast)
- **Empty states**, **error states**, **loading states**
- **Keyboard shortcuts** if you discover any

After completing, update `/research-hub/_MASTER_STATUS.md` with your progress.
