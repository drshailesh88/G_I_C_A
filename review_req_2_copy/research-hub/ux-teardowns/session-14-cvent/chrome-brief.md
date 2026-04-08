# Session 14: Cvent — Travel + Housing Integration
**Modules:** Travel (#7), Accommodation (#8) — cross-module integration
**URL:** https://www.cvent.com/en/event-management-software/housing-travel-management
**Time:** 30 minutes

## Integration Pattern
- Connection: registration → travel → housing in single flow
- Attendee travel preferences during registration
- Admin unified view: person's registration + travel + hotel
- Cross-module change flagging (travel date change → housing flag)
- Admin "per-person summary" across all modules

**Critical because in GEM India:**
Changing a travel record must trigger:
1. Update to transport planning
2. Red-flag to accommodation team
3. Notification to the delegate

Need to understand how mature platforms handle cross-module dependency.
