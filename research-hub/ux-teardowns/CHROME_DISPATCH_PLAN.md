# Chrome Teardown Dispatch Plan

> 7 terminals. 7 platforms. Every button clicked. Every transition documented.
> Web research is already done — Chrome sessions fill the gap: the actual interactive UX.

## Why These 7 (and Not the Other 7)

We skip platforms where:
- The web research already captured what we need (React Email, Retool, Cvent, TravelPerk)
- No free tier / no interactive demo available (AppCraft, Cvent)
- We're borrowing the data model, not the UX (Clerk — we use their SDK, not their dashboard)

We DO Chrome sessions where:
- We are **directly cloning** the interaction pattern into our app
- The critical UX is **behind a login wall** and couldn't be scraped
- Getting the flow wrong means rebuilding later

---

## TERMINAL 1: Certifier.io — Certificate System
**Priority: #1 (we're basically building this)**
**Account:** https://certifier.io — free, 250 certs
**Time:** 1-1.5 hours
**Writes to:** `/research-hub/ux-teardowns/session-05-certifier/`

## TERMINAL 2: Sessionize — Schedule Grid Builder
**Priority: #2 (heart of our Scientific Program module)**
**Account:** https://sessionize.com — free organizer account
**Time:** 1.5-2 hours
**Writes to:** `/research-hub/ux-teardowns/session-02-sessionize/`

## TERMINAL 3: HubSpot CRM — Master People Database
**Priority: #3 (our People DB copies this)**
**Account:** https://app.hubspot.com — free CRM
**Time:** 1.5 hours
**Writes to:** `/research-hub/ux-teardowns/session-04-hubspot-crm/`

## TERMINAL 4: Lu.ma — Event Pages + Registration
**Priority: #4 (our event page design inspiration)**
**Account:** https://lu.ma — free account
**Time:** 1 hour
**Writes to:** `/research-hub/ux-teardowns/session-03-luma/`

## TERMINAL 5: Whova — Event Management + Check-in + Badges
**Priority: #5 (event creation wizard, QR, badges)**
**Account:** https://whova.com — request demo or use public event pages
**Time:** 1.5-2 hours
**Writes to:** `/research-hub/ux-teardowns/session-01-whova/`

## TERMINAL 6: Airtable — Grouped Views for Transport Planning
**Priority: #6 (our Transport module's primary UX pattern)**
**Account:** https://airtable.com — free
**Time:** 45 min
**Writes to:** `/research-hub/ux-teardowns/session-09-airtable/`

## TERMINAL 7: WATI.io — WhatsApp Template Builder
**Priority: #7 (our WhatsApp notification system)**
**Account:** https://app.wati.io — free trial
**Time:** 45 min
**Writes to:** `/research-hub/ux-teardowns/session-06-wati/`
