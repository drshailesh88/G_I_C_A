# TERMINAL 7: WATI.io — Chrome UX Teardown

You are Worker 7 doing a detailed UX teardown of WATI.io's WhatsApp Business dashboard for the GEM India Conference App project.

## Context
Web research (web-research.md) documented the template syntax, API, webhook events, and delivery lifecycle. What we need: the actual template creation UI, broadcast campaign builder, delivery status dashboard, and contact management interface.

## Account Setup
Go to https://app.wati.io and sign up for a free trial.

## FLOW 1: Template Creation

1. Navigate to Campaign > Template Messages > New Template Message. Document:
   - Template name field: rules shown? (underscores, no spaces?)
   - Category selector: Utility / Marketing / Authentication — how displayed?
   - Language selector
2. Message body editor:
   - How do you type the body text?
   - Where is the "Add Variable" button? What does clicking it do?
   - How do variables appear in the text? (highlighted? colored? badge?)
   - What's the character count indicator?
3. Header section:
   - None / Text / Image / Video / Document — how do you select?
   - For Image: upload UI? preview?
4. Footer field
5. Buttons section:
   - How do you add a CTA button? Quick reply button?
   - What fields per button?
6. PREVIEW: Where is the phone preview? Does it update live as you type?
7. Save as Draft vs Save & Submit — both buttons visible? Their positions?
8. After submitting: where do you see approval status? What does "Pending" look like?

## FLOW 2: Broadcast Campaign (Bulk Sending)

1. Navigate to create a broadcast. Document:
   - Step 1: Select template — how does the template picker look?
   - Step 2: Select recipients — all contacts? filtered? CSV upload?
   - Step 3: Fill variable values — THIS IS CRITICAL:
     - How do you map variables? Per-person? From contact attributes?
     - If CSV upload: what does the mapping screen look like?
     - Can you preview individual messages before sending?
   - Step 4: Schedule — immediate or future? Time zone handling?
2. After sending: what does the campaign results page show?

## FLOW 3: Delivery Status & Logs

1. After a broadcast, view delivery status. Document:
   - Aggregate view: total sent / delivered / read / failed — visual layout?
   - Per-recipient view: how do you see status for each person?
   - What does "Failed" look like? Is there a reason shown?
2. Click into a contact's conversation. Document the chat view:
   - Message bubbles: template vs free-form appearance?
   - Status indicators per message: sent/delivered/read icons?

## FLOW 4: Contact Management

1. Navigate to Contacts. Document the contact list:
   - What columns? Search? Filters?
   - Click on a contact: what detail view shows?
2. Import contacts via CSV:
   - Upload flow? Column mapping?
   - How are custom attributes handled during import?
3. Add a custom attribute to a contact manually. Where? How?

## Output Format

Write ALL findings to: `/research-hub/ux-teardowns/session-06-wati/chrome-teardown.md`

For each flow: screen name, layout, every clickable element, form fields, transitions, empty/error states.

After completing, update `/research-hub/_MASTER_STATUS.md` with your progress.
