# Session 9: Airtable — Transport & Arrival Planning (Grouped Views)
**Module:** Transport & Arrival Planning (#9)
**URL:** https://airtable.com (free account)
**Time:** 30 minutes

## Setup
Create base "Arrival Planning" with columns:
- Name (text), Arrival Date (date), Arrival Time (time)
- Arriving From (text), Flight/Train Number (text)
- Terminal (text — T1, T2), Status (single select — Confirmed, Pending, Cancelled)
- Add 10-15 sample rows

## Grouped Table View
- GROUP by Arrival Date, then Arrival Time
- Grouped view appearance ("March 10 > 10:00 AM > 3 records")
- COUNT per group ("10 arriving 10:00 from BOM")
- FILTER by specific date or city
- Saved views ("Mumbai Arrivals Only", "Day 1 Arrivals")
- Row color-coding by Status
- Sorting within groups

## Kanban View
- Group by Status (Confirmed / Pending / Cancelled)
- Kanban layout appearance

**Maps to:** Transport & Arrival Planning module — ops teams need "how many people arrive at what time from where" to plan pickup vehicles and batches.
