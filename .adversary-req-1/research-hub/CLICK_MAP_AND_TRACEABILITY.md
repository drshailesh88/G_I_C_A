# Click Map + UX Traceability Audit

> Re-audit date: 2026-04-06
>
> Source of truth: the current `48` PNG wireframes in `research-hub/wireframes/` plus `wireframes/GEM-India-Final-48-Screens-v4.pdf`
>
> Inventory note: the older markdown inventories are still stale. The original 43-screen set now has 5 added screens:
> - `JiBMN.png` — Check Your Email
> - `ZjqBg.png` — Event Workspace / Event Detail Hub
> - `IitpV.png` — Import Complete
> - `r9Yyd.png` — Participation Confirmed
> - `rPVBY.png` — Certificates Generated

## Re-Audit Verdict

The wireframes are materially better than the previous pass. Most of the structural navigation gaps are now fixed, and `6 of 7` critical journeys are screen-complete.

This is **not fully locked for full-scope coding yet** because a few real UX gaps remain, most importantly the **program revision flow** (`Preview Revised Emails` now has a CTA on M52, but still no dedicated preview state) plus several secondary dead ends (`Add Person`, `Invite Member`, `Speaker Profile`, `Conflict Fix` destination, `Issued Certificates List`, etc.).

If you want to start coding the **core app and MVP flows**, you are close enough. If you want the wireframes to be the **final, complete build contract**, one more cleanup pass is still warranted.

## 1. Click Map

### M16 — Login (`DkS7G.png`)
**Entry points:**
- App launch while signed out
- Return after logout

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Email field | Inline input | No navigation |
| Password field | Inline input | No navigation |
| `Forgot password?` | M17 Forgot Password | |
| `Sign In` | M01 Dashboard Home or M54 More Menu Ops Role | Role-based landing |
| `Continue with Google` | External OAuth flow | No dedicated post-OAuth screen |

### M17 — Forgot Password (`a62TV.png`)
**Entry points:**
- M16 `Forgot password?`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Email field | Inline input | |
| `Send Reset Link` | `JiBMN` Check Your Email | New screen closes prior dead end |
| `Back to Sign In` | M16 Login | |

### JiBMN — Check Your Email (`JiBMN.png`)
**Entry points:**
- M17 `Send Reset Link`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Resend Reset Link` | JiBMN Check Your Email | Same-screen resend state |
| `Back to Sign In` | M16 Login | |
| Password-reset link in email | M59 Reset Password | External email path |

### M59 — Reset Password (`mQxoB.png`)
**Entry points:**
- Password-reset link from JiBMN email

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| New Password field | Inline input | |
| Confirm Password field | Inline input | |
| `Reset Password` | M16 Login | Success returns user to sign-in |
| `Back to Sign In` | M16 Login | |

### M01 — Dashboard Home (`f3KPo.png`)
**Entry points:**
- M16 `Sign In` for admin/coordinator/read-only roles
- Bottom-tab `HOME`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Active Event card / chevron | Inline event switcher | No standalone picker screen |
| Bell icon | Notification list | ❌ No screen |
| Avatar | Profile/settings | ❌ No screen |
| Metric card `Delegates` | M03 People List | Delegates-filtered intent |
| Metric card `Faculty` | M03 People List | Faculty-filtered intent |
| Metric card `Emails Sent` | M13 Communications | Delivery-log intent |
| Metric card `WA Sent` | M13 Communications | WhatsApp delivery-log intent |
| `Create Event` | M14 Create Event | |
| `Import People` | M32 CSV Import Column Mapping | Lands on mapping step |
| `Reports` | M47 Reports & Exports | |
| Tab `HOME` | M01 Dashboard Home | Current tab |
| Tab `EVENTS` | M02 Events List | |
| Tab `PEOPLE` | M03 People List | |
| Tab `PROGRAM` | M04 Scientific Program Attendee | |
| Tab `MORE` | M08 More Menu | |

### M02 — Events List (`fCOC4.png`)
**Entry points:**
- Bottom-tab `EVENTS`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `+ New` | M14 Create Event | |
| Any event card | ZjqBg Event Workspace | New hub screen resolves prior dead end |
| Tab `HOME` | M01 Dashboard Home | |
| Tab `EVENTS` | M02 Events List | Current tab |
| Tab `PEOPLE` | M03 People List | |
| Tab `PROGRAM` | M04 Scientific Program Attendee | |
| Tab `MORE` | M08 More Menu | |

### ZjqBg — Event Workspace / Event Detail Hub (`ZjqBg.png`)
**Entry points:**
- M02 event-card tap
- M14 `Save`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M02 Events List | |
| Gear icon | M14 Create Event | Reused as edit/settings form, inferred |
| Tile `Sessions` | M22 Session Manager | |
| Tile `Schedule Grid` | M30 Admin Schedule Grid | |
| Tile `Event Fields` | M51 Event Field Builder | |
| Tile `Changes` | M52 Version History / Program Changes | |
| Tile `Registrations` | M29 Registration Admin | |
| Tile `Invite Faculty` | M26 Faculty Invitation | |
| Tile `Templates` | M13 Communications | Template list entry |
| Tile `Triggers` | M53 Automation Triggers | |
| Tile `Certificates` | M12 Certificate Generation | |
| Tile `QR Check-in` | M11 QR Scanner | |

### M03 — People List (`G2rDe.png`)
**Entry points:**
- Bottom-tab `PEOPLE`
- M01 metrics (`Delegates`, `Faculty`)
- `IitpV` View People List

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Import` | M32 CSV Import Column Mapping | |
| `+ Add` | Add Person form | ❌ No screen |
| Search field | Inline filter | |
| Filter chips (`All`, `Delegates`, `Faculty`, `Sponsors`) | M03 People List | Inline views |
| Any person card | M09 Person Detail | |
| Tab `HOME` | M01 Dashboard Home | |
| Tab `EVENTS` | M02 Events List | |
| Tab `PEOPLE` | M03 People List | Current tab |
| Tab `PROGRAM` | M04 Scientific Program Attendee | |
| Tab `MORE` | M08 More Menu | |

### M09 — Person Detail (`waUUL.png`)
**Entry points:**
- M03 person-card tap
- M57 `Merge Records`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M03 People List or import review flow | Depends on entry point |
| Phone icon | Device dialer | External action |
| Email icon | Mail compose | External action |
| WhatsApp icon | WhatsApp chat | External action |

### M32 — CSV Import Column Mapping (`TCWwB.png`)
**Entry points:**
- M03 `Import`
- M01 `Import People`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior upload step | Upload step still not drawn |
| Any mapped / unmapped field control | Same screen | Inline mapping |
| Duplicate-handling radio options | Same screen | Inline choice |
| `Back` | Prior upload step | Upload step still not drawn |
| `Import 86 People` | `IitpV` Import Complete | New screen closes prior jump-to-list gap |

### IitpV — Import Complete (`IitpV.png`)
**Entry points:**
- M32 `Import 86 People`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `View People List` | M03 People List | |
| `Review 1 Possible Duplicate` | M57 Merge Duplicates | New bridge resolves prior orphan |

### M57 — Merge Duplicates (`9GInC.png`)
**Entry points:**
- `IitpV` `Review 1 Possible Duplicate`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | IitpV Import Complete | |
| Any field-value choice | Same screen | Inline winner selection |
| `Skip` | IitpV Import Complete | |
| `Merge Records` | M09 Person Detail | |

### M04 — Scientific Program Attendee (`oRvH5.png`)
**Entry points:**
- Bottom-tab `PROGRAM`
- M25 `View Full Schedule`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Day pills | M04 Scientific Program Attendee | Inline filter |
| Hall pills | M04 Scientific Program Attendee | Inline filter |
| Session cards | Inline details / expansion | No separate session-detail screen |
| Tab `HOME` | M01 Dashboard Home | |
| Tab `EVENTS` | M02 Events List | |
| Tab `PEOPLE` | M03 People List | |
| Tab `PROGRAM` | M04 Scientific Program Attendee | Current tab |
| Tab `MORE` | M08 More Menu | |

### M08 — More Menu (`w8SrX.png`)
**Entry points:**
- Bottom-tab `MORE`
- M05 bottom nav `MORE`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Travel` | M35 Travel Records List | |
| `Accommodation` | M05 Accommodation + Flags | |
| `Transport` | M10 Transport Planning | |
| `Email` | M13 Communications | |
| `WhatsApp` | M13 Communications | Same screen, different tab intent |
| `Certificates` | M12 Certificate Generation | |
| `QR Scanner` | M11 QR Scanner | |
| `Reports & Exports` | M47 Reports & Exports | |
| `Branding & Letterheads` | M15 Branding | |
| `Settings & Team` | M19 Team & Roles | |
| Tab `HOME` | M01 Dashboard Home | |
| Tab `EVENTS` | M02 Events List | |
| Tab `PEOPLE` | M03 People List | |
| Tab `PROGRAM` | M04 Scientific Program Attendee | |
| Tab `MORE` | M08 More Menu | Current tab |

### M14 — Create Event (`1isf8.png`)
**Entry points:**
- M01 `Create Event`
- M02 `+ New`
- ZjqBg gear icon | edit-mode reuse inferred

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior screen | Usually M01 or M02 |
| Event fields / date pickers / module toggles | Inline input | |
| `Save` | ZjqBg Event Workspace | New hub resolves prior handoff gap |

### M22 — Session Manager (`Gaavt.png`)
**Entry points:**
- ZjqBg `Sessions`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | ZjqBg Event Workspace | |
| `+ Add` | M23 Add Session Form | |
| Any session card | M23 Add Session Form | Edit-mode reuse inferred |

### M23 — Add Session Form (`CpuHI.png`)
**Entry points:**
- M22 `+ Add`
- M22 session-card tap

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M22 Session Manager | |
| Fields / pickers / faculty selectors | Inline input | |
| `+ Add Sub-session` | Same screen | Adds inline item |
| `Save` | M22 Session Manager | |

### M30 — Admin Schedule Grid (`fooPM.png`)
**Entry points:**
- ZjqBg `Schedule Grid`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | ZjqBg Event Workspace | |
| `Send All` | Bulk faculty-send action | No dedicated preview/confirmation screen |
| Day pills | M30 Admin Schedule Grid | Inline filter |
| Session cells / drop zone | Same screen | Drag/drop editing |
| `Fix` on conflict banner | Conflict-resolution flow | ❌ No screen |

### M51 — Event Field Builder (`ZpAv1.png`)
**Entry points:**
- ZjqBg `Event Fields`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | ZjqBg Event Workspace | |
| Field toggles | Same screen | Inline enable/disable |
| `+ Add Custom Field` | Custom-field creation flow | ❌ No screen |
| `Import field config from Excel` | Native file picker / import action | External/native action inferred |
| `Save` | ZjqBg Event Workspace | |

### M52 — Version History / Program Changes (`VHcOm.png`)
**Entry points:**
- ZjqBg `Changes`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | ZjqBg Event Workspace | |
| `Preview Revised Emails` | Revised-email preview | ❌ No screen |
| `Publish & Send Revised Mails` | Send action | Action exists, but preview step is missing |
| Published-version row `v2` | Version detail / diff | ❌ No screen |
| Published-version row `v1` | Version detail / diff | ❌ No screen |

### M29 — Registration Admin (`JIykr.png`)
**Entry points:**
- ZjqBg `Registrations`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Export` | File export action | No separate screen |
| Status tabs (`All`, `Going`, `Pending`, `Waitlist`, `Checked In`) | M29 Registration Admin | Inline filter |

### M26 — Faculty Invitation (`WVLsf.png`)
**Entry points:**
- ZjqBg `Invite Faculty`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | ZjqBg Event Workspace | |
| Person / Role / Session selectors | Inline pickers | |
| `Send Invitation Email` | Outbound send action | No dedicated sent-state screen |
| `Also Send via WhatsApp` | Outbound send action | |

### M55 — Faculty Confirm Participation (`jlDVA.png`)
**Entry points:**
- Email / WhatsApp invite link from M26

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Accept & Confirm` | `r9Yyd` Participation Confirmed | New screen closes prior dead end |
| `Decline Invitation` | Decline-confirmation state | ❌ No screen |
| Contact email | External mail compose | |

### r9Yyd — Participation Confirmed (`r9Yyd.png`)
**Entry points:**
- M55 `Accept & Confirm`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Add to Calendar` | External calendar action | |

### M13 — Communications (`1fB7u.png`)
**Entry points:**
- M08 `Email`
- M08 `WhatsApp`
- ZjqBg `Templates`
- M01 email/WA metric cards

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior screen | Usually M08 or ZjqBg |
| `Email` tab | M13 Communications | Inline tab |
| `WhatsApp` tab | M13 Communications | Inline tab |
| Any template card | M39 Template Editor | |
| `Retry` on failed delivery log row | Retry action | No separate result screen |

### M39 — Template Editor (`FGhXX.png`)
**Entry points:**
- M13 template-card tap

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M13 Communications | |
| `Save` | M13 Communications | |
| `Email` / `WhatsApp` tabs | M39 Template Editor | Inline mode switch |
| Variable chips | Same screen | Inline insertion |
| `Preview with Sample Data` | Inline preview state | No separate screen shown |

### M53 — Automation Triggers (`LG8tQ.png`)
**Entry points:**
- ZjqBg `Triggers`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | ZjqBg Event Workspace | |
| Trigger toggles | Same screen | Inline ON/OFF |
| Channel chips | Same screen | Inline channel selection |
| Template selectors | Same screen | Inline template selection |

### M06 — Travel Info Form (`t7kqa.png`)
**Entry points:**
- M35 `+ Add`
- M35 row tap

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M35 Travel Records List | |
| Stepper labels | Same screen | Informational |
| Form fields / dropdowns | Inline input | |
| Upload area | Native file picker | External/native action |
| `Cancel` | M35 Travel Records List | |
| `Save & Send` | M35 Travel Records List | Status reflected in list |

### M35 — Travel Records List (`RSElF.png`)
**Entry points:**
- M08 `Travel`
- M54 `Travel`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `+ Add` | M06 Travel Info Form | |
| Any travel record row | M06 Travel Info Form | View/edit reuse inferred |

### M05 — Accommodation + Flags (`92NPy.png`)
**Entry points:**
- M08 `Accommodation`
- M54 `Accommodation`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `+ Add` | M36 Accommodation Form | |
| `Show flagged` | M05 Accommodation + Flags | Inline filter toggle |
| `Mark Reviewed` | M05 Accommodation + Flags | Same-screen state change |
| `Resolve` / `Mark Resolved` | M05 Accommodation + Flags | Same-screen state change |
| Unflagged row with chevron | M36 Accommodation Form | |
| Tab `HOME` | M01 Dashboard Home | |
| Tab `EVENTS` | M02 Events List | |
| Tab `PEOPLE` | M03 People List | |
| Tab `PROGRAM` | M04 Scientific Program Attendee | |
| Tab `MORE` | M08 More Menu | |

### M36 — Accommodation Form (`IMpCm.png`)
**Entry points:**
- M05 `+ Add`
- M05 row tap

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M05 Accommodation + Flags | |
| Fields / pickers | Inline input | |
| Upload area | Native file picker | External/native action |
| `Save & Send` | M05 Accommodation + Flags | |

### M10 — Transport Planning (`H25vw.png`)
**Entry points:**
- M08 `Transport`
- M54 `Transport`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior More menu | M08 or M54 |
| Day pills | M10 Transport Planning | Inline filter |
| Any arrival batch row | M38 Vehicle Assignment Kanban | |

### M38 — Vehicle Assignment Kanban (`5FfEr.png`)
**Entry points:**
- M10 arrival-batch row

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M10 Transport Planning | |
| Delegate cards | Same screen | Long-press drag interaction |

### M12 — Certificate Generation (`Y3HLt.png`)
**Entry points:**
- M08 `Certificates`
- ZjqBg `Certificates`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior screen | Usually M08 or ZjqBg |
| Event pill | Inline event switcher | |
| Any template card | M56 Certificate Template Editor | |
| Recipient radio options | Same screen | Inline selection |
| `Preview Certificate` | Inline preview state | No separate screen shown |
| `Generate & Send` | `rPVBY` Certificates Generated | New completion screen closes prior gap |

### M56 — Certificate Template Editor (`nZ08H.png`)
**Entry points:**
- M12 template-card tap

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M12 Certificate Generation | |
| Tool buttons | Same screen | Inline editor controls |
| Variable chips | Same screen | Inline insertion |
| `Upload background image` | Native file picker | |
| `Preview with Sample Data` | Inline preview state | No separate screen shown |

### rPVBY — Certificates Generated (`rPVBY.png`)
**Entry points:**
- M12 `Generate & Send`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Download ZIP (all PDFs)` | File download | External/system action |
| `Retry 2 Failed` | Retry-send action | Same-screen action inferred |
| `View All Issued Certificates` | Issued certificates list | ❌ No screen |

### M11 — QR Scanner (`wLTrF.png`)
**Entry points:**
- M08 `QR Scanner`
- ZjqBg `QR Check-in`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `X` close | Prior screen | Usually M08 or ZjqBg |
| `Express` | M11 QR Scanner | Inline mode state |
| Valid scan | M44 Scan Success | System state |
| Duplicate scan | M45 Scan Duplicate | System state |
| Stat cards (`Checked In`, `Remaining`, `Total`) | M58 Attendance Report | Drilldown inferred |
| `Manual Check-in` | M46 Manual Check-in | |

### M44 — Scan Success (`9HWwn.png`)
**Entry points:**
- M11 valid scan
- M46 `Check In`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Success card / auto-dismiss | M11 QR Scanner | Auto-dismiss in 3s |

### M45 — Scan Duplicate (`SCufz.png`)
**Entry points:**
- M11 duplicate scan

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Override & Check In Again` | M44 Scan Success | |
| Tap anywhere to dismiss | M11 QR Scanner | |

### M46 — Manual Check-in (`WoR84.png`)
**Entry points:**
- M11 `Manual Check-in`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M11 QR Scanner | |
| Search field | Inline filter | |
| Any `Check In` button | M44 Scan Success | |

### M58 — Attendance Report (`YBvs4.png`)
**Entry points:**
- M11 stat-card drilldown

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M11 QR Scanner | |
| `Export` | File export action | |

### M07 — Registration Form (`3IR5p.png`)
**Entry points:**
- M25 `Register Now`
- M25 sticky `Register`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Form fields / dropdowns | Inline input | |
| `Register` | M28 Registration Success | |
| `Terms & Privacy Policy` | Legal page / modal | ❌ No screen |

### M25 — Event Landing Page (`qpTp8.png`)
**Entry points:**
- Public event URL
- External marketing link

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Hero `Register Now` | M07 Registration Form | |
| Any speaker card | Speaker profile | ❌ No screen |
| `View Full Schedule` | M04 Scientific Program Attendee | |
| Venue / map block | External maps link | |
| Sticky `Register` | M07 Registration Form | |

### M28 — Registration Success (`P5jNY.png`)
**Entry points:**
- M07 `Register`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Add to Calendar` | External calendar action | |
| `Share on WhatsApp` | External share action | |

### M15 — Branding (`xFRfv.png`)
**Entry points:**
- M08 `Branding & Letterheads`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M08 More Menu | |
| Event pill | Inline event selector | |
| Logo card | Native file picker | |
| Header upload area | Native file picker | |
| Color swatches | Inline color action | |
| Settings fields | Inline input | |
| `Save` | M08 More Menu | |

### M19 — Team & Roles (`sbLsV.png`)
**Entry points:**
- M08 `Settings & Team`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M08 More Menu | |
| `Invite` | Invite-member flow | ❌ No screen |
| Role pills (`Coordinator`, `Ops`) | Same screen | Inline role dropdowns inferred |

### M47 — Reports & Exports (`i8T1g.png`)
**Entry points:**
- M01 `Reports`
- M08 `Reports & Exports`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior screen | M01 or M08 |
| Any report row | File export action | No preview screen shown |
| Any download icon | File export action | Same as row |

### M54 — More Menu Ops Role (`IWTdp.png`)
**Entry points:**
- M16 `Sign In` as Ops role

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Travel` | M35 Travel Records List | |
| `Accommodation` | M05 Accommodation + Flags | |
| `Transport` | M10 Transport Planning | |
| Locked rows (`Communications`, `Certificates`, `Branding & Settings`) | No access | Disabled |
| Tab `MORE` | M54 More Menu Ops Role | Current tab |

## 2. Dead Ends

| Screen | Element | Expected Destination | Status |
|---|---|---|---|
| M01 | Bell icon | Notification list | ❌ No screen |
| M01 | Avatar | Profile/settings | ❌ No screen |
| M03 | `+ Add` | Add Person form | ❌ No screen |
| M07 | `Terms & Privacy Policy` | Legal page / modal | ❌ No screen |
| M19 | `Invite` | Invite-member flow | ❌ No screen |
| M25 | Speaker card | Speaker profile | ❌ No screen |
| M30 | `Fix` conflict | Conflict-resolution flow | ❌ No screen |
| M51 | `+ Add Custom Field` | Custom-field creation flow | ❌ No screen |
| M52 | `Preview Revised Emails` | Revised-email preview | ❌ No screen |
| M52 | Published version `v2` row | Version detail / diff | ❌ No screen |
| M52 | Published version `v1` row | Version detail / diff | ❌ No screen |
| M55 | `Decline Invitation` | Decline-confirmation state | ❌ No screen |
| rPVBY | `View All Issued Certificates` | Issued certificates list | ❌ No screen |

**Total dead ends:** `13`

## 3. Orphan Screens

Orphan = no button on another designed screen reaches it. External-entry screens still count as orphans in the in-app graph.

| Screen | Issue |
|---|---|
| M25 — Event Landing Page | Public-entry screen only |
| M55 — Faculty Confirm Participation | Reached only from external email / WhatsApp link |
| M59 — Reset Password | Reached only from external email link |

**Total orphan screens:** `3`

## 4. UX Traceability Matrix

| Screen | Primary UX Pattern | Research Source | Specific Reference | Traceability |
|---|---|---|---|---|
| M16 Login | Standard email/password sign-in | Client PDF only | `document_pdf.pdf` §2 auth requirement | ⚠️ Partial |
| M17 Forgot Password | Single-field reset request | Client PDF only | `document_pdf.pdf` §2 forgot/reset | ⚠️ Partial |
| JiBMN Check Your Email | Email-reset confirmation state | Client PDF only | `document_pdf.pdf` §2 forgot/reset | ⚠️ Partial |
| M59 Reset Password | New-password reset form | Client PDF only | `document_pdf.pdf` §2 forgot/reset | ⚠️ Partial |
| M01 Dashboard | Event selector + metrics + quick actions | Whova + Retool | `FINAL_SYNTHESIS.md` Module 13; `DESIGN_DECISIONS.md` UX Decision 1 | ✅ |
| M02 Events List | Event cards + create CTA | Whova | `FINAL_SYNTHESIS.md` Module 3 | ✅ |
| ZjqBg Event Workspace | Event-level module launcher / admin hub | Whova + Retool | `FINAL_SYNTHESIS.md` Modules 3 and 13 | ✅ |
| M03 People List | Searchable people list with saved views | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2 | ✅ |
| M09 Person Detail | Person profile + activity timeline | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2 | ✅ |
| M32 CSV Mapping | CSV auto-map + manual override | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2; HubSpot import research | ✅ |
| IitpV Import Complete | Import summary / outcomes screen | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2 import flow | ✅ |
| M57 Merge Duplicates | Side-by-side merge selection | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2 deduplication | ✅ |
| M04 Program Attendee | Mobile card-list program view | Sessionize + locked mobile decision | `DESIGN_DECISIONS.md` UX Decision 3 | ✅ |
| M08 More Menu | Mobile module launcher | Retool admin-navigation pattern adapted to mobile | `FINAL_SYNTHESIS.md` Module 1 | ✅ |
| M14 Create/Edit Event | Event setup form with toggles | Whova + client spec | `FINAL_SYNTHESIS.md` Module 3; `document_pdf.pdf` §4 | ✅ |
| M22 Session Manager | Session list by hall/time | Sessionize | `FINAL_SYNTHESIS.md` Module 5 | ✅ |
| M23 Add Session Form | Structured session form with role assignment | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5; `document_pdf.pdf` §4 | ✅ |
| M30 Schedule Grid | Hall×time grid builder | Sessionize | `FINAL_SYNTHESIS.md` Module 5 | ✅ |
| M51 Event Field Builder | Toggle-based event field schema editor | Sessionize custom fields + client spec | `FINAL_SYNTHESIS.md` Module 5; `document_pdf.pdf` §4 | ⚠️ Partial custom composition |
| M52 Program Changes | Revision feed + revised-mail publish | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5; `document_pdf.pdf` §4 | ✅ |
| M29 Registration Admin | Status-tab registration list | Lu.ma | `FINAL_SYNTHESIS.md` Module 4 "7 Status Tabs" | ✅ |
| M26 Faculty Invitation | Manual invite + role/session assignment | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5 notification pipeline | ✅ |
| M55 Faculty Confirm Participation | Public accept/decline screen | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5 "Confirm Participation" | ✅ |
| r9Yyd Participation Confirmed | Faculty-confirmed success state | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5 notification pipeline | ✅ |
| M13 Communications | Templates + delivery log | Stripo + React Email + WATI | `FINAL_SYNTHESIS.md` Modules 6 and 7 | ✅ |
| M39 Template Editor | Message editor + variables + preview | Stripo + React Email + WATI | `FINAL_SYNTHESIS.md` Modules 6 and 7 | ✅ |
| M53 Automation Triggers | Trigger-to-template rule list | WATI + client spec | `FINAL_SYNTHESIS.md` Module 7; `document_pdf.pdf` §7 | ✅ |
| M06 Travel Form | Per-person itinerary form | TravelPerk | `FINAL_SYNTHESIS.md` Module 8 | ✅ |
| M35 Travel Records List | Trips list with status pills | TravelPerk | `FINAL_SYNTHESIS.md` Module 8 | ✅ |
| M05 Accommodation + Flags | Accommodation list + 3-state flag cascade | AppCraft + locked design decision | `FINAL_SYNTHESIS.md` Module 9; `DESIGN_DECISIONS.md` UX Decision 2 | ✅ |
| M36 Accommodation Form | Hotel/room/check-in form | AppCraft Events | `FINAL_SYNTHESIS.md` Module 9 | ✅ |
| M10 Transport Planning | Grouped arrival planning view | Airtable | `FINAL_SYNTHESIS.md` Module 10 | ✅ |
| M38 Vehicle Assignment | Vehicle kanban | Airtable | `FINAL_SYNTHESIS.md` Module 10 | ✅ |
| M12 Certificate Generation | Template choice + recipient choice + generate | Certifier.io | `FINAL_SYNTHESIS.md` Module 11 | ✅ |
| M56 Certificate Editor | WYSIWYG cert editor with QR/variables | Certifier.io | `FINAL_SYNTHESIS.md` Module 11 | ✅ |
| rPVBY Certificates Generated | Post-generation success / delivery summary | Certifier.io | `FINAL_SYNTHESIS.md` Module 11 delivery & post-issuance | ✅ |
| M11 QR Scanner | Express scan + manual fallback | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 12 | ✅ |
| M44 Scan Success | Positive scan state | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 12 | ✅ |
| M45 Scan Duplicate | Duplicate scan warning | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 12 | ✅ |
| M46 Manual Check-in | Name/reg fallback | Whova | `FINAL_SYNTHESIS.md` Module 12 | ✅ |
| M58 Attendance Report | Attendance metrics/report view | Whova + Lu.ma | `FINAL_SYNTHESIS.md` Modules 12 and 13 | ✅ |
| M07 Registration Form | Delegate self-registration form | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 4 | ✅ |
| M25 Event Landing | Public event page with CTA, speakers, schedule | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 4 | ✅ |
| M28 Registration Success | Registration ID + QR + calendar/share | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 4 | ✅ |
| M15 Branding | Event brand-kit editor | Stripo | `FINAL_SYNTHESIS.md` Module 14 | ✅ |
| M19 Team & Roles | Member list + role pills + invite | Clerk + Retool | `FINAL_SYNTHESIS.md` Module 1 | ✅ |
| M47 Reports & Exports | Export catalog | Whova + TravelPerk + client spec | `FINAL_SYNTHESIS.md` Modules 8 and 13 | ✅ |
| M54 More Menu Ops Role | Role-restricted module access | Clerk + Retool | `FINAL_SYNTHESIS.md` Module 1 | ✅ |

**Total screens with partial / missing research traceability:** `5`  
`M16`, `M17`, `JiBMN`, `M59`, `M51`

## 5. Flow Completeness

### Journey 1: New User Onboarding
1. M16 `Login` → tap `Sign In` → M01 `Dashboard Home` ✅
2. M01 → tap `Create Event` → M14 `Create Event` ✅
3. M14 → tap `Save` → ZjqBg `Event Workspace` ✅
4. ZjqBg → tap `Sessions` → M22 `Session Manager` ✅
5. M22 → tap `+ Add` → M23 `Add Session Form` → `Save` → M22 ✅
6. ZjqBg → tap `Schedule Grid` → M30 `Admin Schedule Grid` ✅
7. ZjqBg → tap `Invite Faculty` → M26 `Faculty Invitation` ✅

**VERDICT:** ✅ COMPLETE

### Journey 2: Delegate Registration
1. Public URL → M25 `Event Landing Page` ✅
2. M25 → tap `Register Now` / `Register` → M07 `Registration Form` ✅
3. M07 → tap `Register` → M28 `Registration Success` ✅
4. M28 shows registration ID + QR and supports calendar / WhatsApp follow-up ✅
5. Admin can open ZjqBg → `Registrations` → M29 `Registration Admin` ✅

**VERDICT:** ✅ COMPLETE

### Journey 3: Faculty Invitation
1. ZjqBg → tap `Invite Faculty` → M26 `Faculty Invitation` ✅
2. M26 → send invite via email / WhatsApp ✅
3. Faculty clicks invite link → M55 `Faculty Confirm Participation` ✅
4. M55 → tap `Accept & Confirm` → r9Yyd `Participation Confirmed` ✅
5. Admin sees updated confirmation status on ZjqBg `Invite Faculty` summary tile (`86 invited · 82 confirmed`) ✅

**VERDICT:** ✅ COMPLETE

### Journey 4: Travel Lifecycle
1. M35 `Travel Records List` → tap `+ Add` → M06 `Travel Info Form` ✅
2. M06 → tap `Save & Send` → M35 with sent status ✅
3. Travel change appears in M35 as `Changed` ✅
4. Downstream red flag appears in M05 `Accommodation + Flags` ✅
5. Ops taps `Mark Reviewed` → yellow reviewed state ✅
6. Ops taps `Resolve` / `Mark Resolved` → cleared state ✅

**VERDICT:** ✅ COMPLETE

### Journey 5: Certificate Lifecycle
1. M12 `Certificate Generation` → tap template → M56 `Certificate Template Editor` ✅
2. M56 → save / return → M12 ✅
3. M12 → choose recipients → tap `Generate & Send` → rPVBY `Certificates Generated` ✅
4. rPVBY confirms generated/sent/failed counts and supports ZIP download / retry ✅
5. Delegate download happens via emailed / WhatsApp PDF attachment rather than a separate in-app screen ✅

**VERDICT:** ✅ COMPLETE

### Journey 6: QR Check-in Day
1. M08 or ZjqBg → tap `QR Scanner` → M11 `QR Scanner` ✅
2. Valid scan → M44 `Scan Success` ✅
3. Duplicate scan → M45 `Scan Duplicate` ✅
4. Manual fallback → M46 `Manual Check-in` → `Check In` → M44 ✅
5. Stats drill down to M58 `Attendance Report` ✅

**VERDICT:** ✅ COMPLETE

### Journey 7: Program Revision
1. ZjqBg → `Sessions` → M22 → tap session → M23 edit reuse ✅
2. ZjqBg → `Changes` → M52 `Program Changes` ✅
3. M52 → tap `Preview Revised Emails` → ❌ No screen
4. `Publish & Send Revised Mails` exists, but the missing preview state breaks the intended review/publish flow ❌

**VERDICT:** ❌ INCOMPLETE

## 6. Summary

- Screens audited: **48**
- Total dead ends: **13**
- Total orphans: **3**
- Total partial / untraceable patterns: **5**
- Total incomplete critical journeys: **1 of 7**

## Coding Readiness

### What is now good enough
- The **main navigation graph** is largely coherent.
- The **event-management backbone** now exists through ZjqBg.
- The **registration**, **faculty acceptance**, **travel/accommodation**, **certificates**, and **QR attendance** flows are screen-complete enough to build.

### What still needs one more pass before calling the wireframes fully locked
- `M52` needs a real **Preview Revised Emails** state.
- `M30` still exposes a **Conflict Fix** action with nowhere to go.
- `M03` still has no **Add Person** screen.
- `M19` still has no **Invite Member** flow.
- `M25` still implies a **Speaker Profile** screen that does not exist.
- `rPVBY` still links to **View All Issued Certificates** with no screen.
- Auth screens are still requirement-traceable but not teardown-traceable.

### Final verdict
- **For MVP coding:** `Yes, with caution.`
- **For full-scope wireframe lock:** `Not yet.`
