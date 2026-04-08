# TERMINAL 1: Certifier.io — Chrome UX Teardown

You are Worker 1 doing a detailed UX teardown of Certifier.io for the GEM India Conference App project.

## Context
We already have web research in this folder (web-research.md). We know the features. What we DON'T have is the actual interactive UX — the click-by-click flows, screen transitions, form states, and micro-interactions.

## Your Job
Log into Certifier.io (free account — 250 certs included) and document every screen, every click, every transition for the following flows. Do NOT guess. Only document what you actually see and click.

## Account Setup
Go to https://certifier.io and create a free account. Complete onboarding.

## FLOW 1: Template Editor (Most Critical)

Start from the dashboard. Click to create a new certificate design.

Document the EXACT sequence:
1. What is the first screen after clicking "Create Design"? What choices are presented? (Certificate vs Badge? Orientation? Template gallery?)
2. In the template gallery: How are templates organized? What filters exist? How many are shown per page? What does the hover state look like on a template card?
3. Pick a template and open the editor. Screenshot the FULL editor layout:
   - What's in the left panel? List every tool/tab.
   - What's in the center canvas?
   - What's in the right panel (if any)?
   - What's in the top toolbar?
4. Click on EACH tool in the left panel and document what opens:
   - Background tool: what options? color picker? image upload? what file types? max size?
   - Images tool: upload flow? drag onto canvas? resize handles?
   - Elements tool: what shapes/icons? how do you search? how do you resize/recolor?
   - Text tool: what text presets? font picker UI? size/alignment controls?
   - Dynamic Attributes tool: THIS IS CRITICAL. What does the "Add attribute" button show? What's the dropdown list? How are default vs custom attributes distinguished visually (grey vs blue tags)?
   - QR Code tool: what options? color? size? placement?
5. Click on an element on the canvas. Document:
   - What selection handles appear? (corners? edges? rotation?)
   - What does the right panel show when an element is selected?
   - How does layer ordering work? Can you drag layers?
6. Click Preview. What happens? Does sample data auto-fill? How does the preview look different from the editor?
7. Click Save. What's the save flow? Does it ask for a name? Is there auto-save?

## FLOW 2: Bulk Certificate Generation

After saving a template:
1. What is the EXACT next screen? Does it prompt to add recipients?
2. Document the "Create Group" flow — what fields are asked?
3. Click to upload a spreadsheet. Document:
   - File upload UI (drag-and-drop? browse button? what formats shown?)
   - After upload: what does the COLUMN MAPPING screen look like? THIS IS CRITICAL.
   - How are CSV columns displayed? Left side? Right side?
   - How are certificate attributes shown? Dropdown? Auto-matched?
   - What does a successful auto-match vs unmatched column look like visually?
   - Is there a "Skip column" option? What does it look like?
   - Is there a "Create new attribute" option inline?
4. After mapping, what's the preview step? Can you click through individual certificates? Is there pagination?
5. What are the two final options? (Publish vs Draft) What does each button say exactly?

## FLOW 3: Email Delivery Setup

1. Navigate to the email template builder (separate from certificate editor).
2. Document the email editor:
   - What can you customize? Logo? Colors? Text? CTA button?
   - Where do dynamic attributes appear in the email body?
   - Sender name / sender email / reply-to fields — where are these?
3. What does the preview of a delivery email look like?

## FLOW 4: Post-Issuance Management

1. Go to the list of issued certificates. Document the list view:
   - What columns are shown?
   - What filters exist?
   - Can you search? By what fields?
2. Click on one certificate. What does the detail view show?
3. Can you edit after issuance? What fields? Does it update live?
4. Where is the resend button? The revoke button?
5. Where are analytics? What metrics are shown?

## FLOW 5: Verification Page

1. Open a certificate's public URL. Document what the recipient sees:
   - Page layout top to bottom
   - Where is the download PDF button?
   - Where is the QR code?
   - What does "Verify Credential" show when clicked?

## Output Format

Write ALL findings to: `/research-hub/ux-teardowns/session-05-certifier/chrome-teardown.md`

For each flow, document:
- **Screen name** (what would you call this page?)
- **URL pattern** (if visible)
- **Layout description** (what's where — top/left/center/right/bottom)
- **Every clickable element** (buttons, links, dropdowns, toggles)
- **Form fields** (name, type, required/optional, placeholder text)
- **Transitions** (what happens on click — slide-over? modal? page navigation? toast?)
- **Empty states** (what does it look like with no data?)
- **Error states** (what happens if you skip a required field or upload wrong format?)

After completing all flows, update `/research-hub/_MASTER_STATUS.md` with your progress.
