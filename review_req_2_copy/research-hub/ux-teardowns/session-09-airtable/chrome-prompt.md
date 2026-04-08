# TERMINAL 6: Airtable — Chrome UX Teardown

You are Worker 6 doing a detailed UX teardown of Airtable's grouped views and Kanban for the GEM India Conference App project.

## Context
Web research (web-research.md) documented grouping mechanics, filtering, and kanban from docs. What we need: the actual visual experience of building grouped views, seeing nested groups with counts, creating kanban boards, and the drag-to-update interaction.

## Account Setup
Go to https://airtable.com and create a free account.

## SETUP: Create the Test Base

Create a new base called "Arrival Planning" with a table that has these columns:
- Name (single line text)
- Arrival Date (date field — NO time component)
- Arrival Time Slot (single select — options: "Morning 8-10 AM", "Midday 10-12 PM", "Afternoon 2-4 PM", "Evening 6-8 PM")
- Arriving From (single select — options: "Mumbai BOM", "Delhi DEL", "Chennai MAA", "Bangalore BLR", "Kolkata CCU")
- Flight/Train Number (single line text)
- Terminal (single select — "T1", "T2", "T3")
- Status (single select — "Confirmed" in green, "Pending" in yellow, "Cancelled" in red)
- Assigned Vehicle (single select — "Van-1", "Van-2", "Van-3", "Unassigned")

Add 15-20 sample rows with varied data across dates, times, cities, and statuses.

## FLOW 1: Grouped Table View

1. Click the GROUP button. Document:
   - What appears? Dropdown? Panel?
   - How do you select the first grouping field?
2. Group by Arrival Date. Document:
   - How do group headers look? Color? Font? Background?
   - Where is the RECORD COUNT per group?
   - Are groups collapsible? What's the collapse/expand control?
3. Add a SECOND grouping level: Arrival Time Slot. Document:
   - How does nested grouping display? Indentation? Sub-headers?
   - Counts at each level?
4. Add a THIRD level: Arriving From. Document the 3-level hierarchy.
5. Collapse all groups. What does the overview look like? (Just headers + counts?)
6. Click inside a group to expand. How does the transition work?

## FLOW 2: Filtering

1. Click the FILTER button. Document:
   - How does the filter UI appear? Below toolbar? Dropdown?
   - Add a filter: Status is "Confirmed". How do you select field, operator, value?
   - What do the FILTER PILLS/TAGS look like in the toolbar?
2. Add a second filter with AND logic. Then switch to OR. How?
3. Remove a filter. How? (X button on pill?)

## FLOW 3: Saved Views

1. Create a new view called "Day 1 Arrivals". Set date filter + grouping.
2. Create another view called "Mumbai Arrivals Only".
3. Document:
   - Where do views appear? Sidebar? Tabs?
   - How do you switch between views?
   - How do you duplicate a view?
   - Collaborative vs Personal vs Locked — where are these options?

## FLOW 4: Color Coding

1. Click the color button (or record coloring option). Document:
   - Where is the color control?
   - Select "Color by a field" → Status. What happens?
   - How do the colored PILLS look in the Status column?
   - How does the LEFT-EDGE color indicator look on rows?
2. Try "Color by conditions". How does the condition builder look?

## FLOW 5: Kanban View

1. Create a new Kanban view. Document:
   - How do you select the stacking field?
   - Stack by Status (Confirmed / Pending / Cancelled).
2. Document the Kanban layout:
   - Column headers: what do they show? (name + count?)
   - Card layout: what fields are shown on each card?
   - How do you customize which fields appear on cards?
3. DRAG a card from "Pending" to "Confirmed". Document:
   - What happens during the drag? (ghost card? placeholder?)
   - What happens after drop? (status updates? animation? toast?)
4. Create a SECOND kanban view stacked by "Assigned Vehicle". Document vehicle assignment board.

## FLOW 6: Sorting Within Groups

1. In a grouped view, add a sort by Arrival Time Slot ascending.
2. Document how sorting interacts with grouping — do records reorder within each group?

## Output Format

Write ALL findings to: `/research-hub/ux-teardowns/session-09-airtable/chrome-teardown.md`

For each flow: screen name, layout, every clickable element, visual details (colors, spacing, typography), transitions, drag interactions.

After completing, update `/research-hub/_MASTER_STATUS.md` with your progress.
