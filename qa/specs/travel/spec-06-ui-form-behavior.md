# Spec 06: Travel Form UI — Rendering & Behavior

**Census refs:** G1-G24
**Test file:** `src/app/(app)/events/[eventId]/travel/travel-form-behavior.test.tsx`
**Status:** ALL PASSING (12/12)

## Person Picker

- [x] CP-01: Person picker visible in create mode
- [x] CP-02: Person picker hidden in edit mode
- [x] CP-03: Person search shows no results below 2 chars
- [x] CP-04: Person search filters by name

## Dropdowns

- [x] CP-05: Direction dropdown has all 4 direction options
- [x] CP-06: Mode dropdown has all 6 mode options

## Edit Mode Pre-population

- [x] CP-07: Form pre-populates fromCity in edit mode
- [x] CP-08: Form pre-populates direction in edit mode

## Submit Button

- [x] CP-09: Submit shows 'Create Travel Record' in create mode
- [x] CP-10: Submit shows 'Update Travel Record' in edit mode

## Form Structure

- [x] CP-11: Back link points to /events/:eventId/travel
- [x] CP-12: formatDatetimeLocal converts Date to YYYY-MM-DDTHH:mm format
