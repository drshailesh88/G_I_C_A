# Click Map + UX Traceability Audit

> Source of truth: the 43 PNG wireframes in `research-hub/wireframes/`
>
> Important inventory note: the older inventory docs are stale. This audit follows the actual exported screens and the corrected mapping from `CLICK_MAP_PROMPT.md`, including `P5jNY = M28 Registration Success`, `JIykr = M29 Registration Admin`, and `mQxoB = M59 Reset Password`.

## 1. Click Map

### M16 — Login (`DkS7G.png`)
**Entry points:**
- App launch while signed out
- Post-logout return

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Email field | Inline input | No navigation |
| Password field | Inline input | No navigation |
| `Forgot password?` | M17 Forgot Password | |
| `Sign In` | M01 Dashboard Home | Standard admin/coordinator landing; role-specific variants are not fully drawn |
| `Continue with Google` | External OAuth flow | No post-OAuth screen designed |

### M17 — Forgot Password (`a62TV.png`)
**Entry points:**
- M16 `Forgot password?`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Email field | Inline input | No navigation |
| `Send Reset Link` | Check-email confirmation state | ❌ No screen; reset happens out-of-band by email |
| `Back to Sign In` | M16 Login | |

### M59 — Reset Password (`mQxoB.png`)
**Entry points:**
- Password-reset email link after M17

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| New Password field | Inline input | No navigation |
| Confirm Password field | Inline input | No navigation |
| `Reset Password` | M16 Login | Success confirmation screen is not drawn; likely returns to sign-in |
| `Back to Sign In` | M16 Login | |

### M01 — Dashboard Home (`f3KPo.png`)
**Entry points:**
- M16 `Sign In`
- Bottom-tab `HOME` from other tabbed screens

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Active Event card / chevron | Inline event selector | No standalone picker screen |
| Bell icon | Notification list | ❌ No screen |
| Avatar | Profile/settings | ❌ No screen |
| Metric card: `Delegates` | M03 People List | Delegates-filtered view |
| Metric card: `Faculty` | M03 People List | Faculty-filtered view |
| Metric card: `Emails Sent` | M13 Communications | Email delivery-log context inferred |
| Metric card: `WA Sent` | M13 Communications | WhatsApp context inferred |
| Quick Action: `Create Event` | M14 Create Event | |
| Quick Action: `Import People` | M32 CSV Import Column Mapping | Lands on mapping step; upload step not drawn |
| Quick Action: `Reports` | M47 Reports & Exports | |
| Tab: `HOME` | M01 Dashboard Home | Current tab |
| Tab: `EVENTS` | M02 Events List | |
| Tab: `PEOPLE` | M03 People List | |
| Tab: `PROGRAM` | M04 Scientific Program Attendee | |
| Tab: `MORE` | M08 More Menu | |

### M02 — Events List (`fCOC4.png`)
**Entry points:**
- Bottom-tab `EVENTS`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `+ New` | M14 Create Event | |
| Any event card (`GEM India Summit 2026`, `GEM West Zone Workshop`, `GEM India Annual 2025`) | Event overview / edit workspace | ❌ No event-detail screen is drawn |
| Tab: `HOME` | M01 Dashboard Home | |
| Tab: `EVENTS` | M02 Events List | Current tab |
| Tab: `PEOPLE` | M03 People List | |
| Tab: `PROGRAM` | M04 Scientific Program Attendee | |
| Tab: `MORE` | M08 More Menu | |

### M03 — People List (`G2rDe.png`)
**Entry points:**
- Bottom-tab `PEOPLE`
- M01 metric cards (`Delegates`, `Faculty`)

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Import` | M32 CSV Import Column Mapping | Import starts mid-flow; upload/preview screens are absent |
| `+ Add` | Add Person form | ❌ No screen |
| Search field | Inline search/filter | No navigation |
| Filter chip: `All` | M03 People List | Inline filter |
| Filter chip: `Delegates` | M03 People List | Inline filter |
| Filter chip: `Faculty` | M03 People List | Inline filter |
| Filter chip: `Sponsors` | M03 People List | Inline filter |
| Any person card | M09 Person Detail | |
| Tab: `HOME` | M01 Dashboard Home | |
| Tab: `EVENTS` | M02 Events List | |
| Tab: `PEOPLE` | M03 People List | Current tab |
| Tab: `PROGRAM` | M04 Scientific Program Attendee | |
| Tab: `MORE` | M08 More Menu | |

### M04 — Scientific Program Attendee (`oRvH5.png`)
**Entry points:**
- Bottom-tab `PROGRAM`
- M25 `View Full Schedule`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Day pills (`Day 1`, `Day 2`, `Day 3`, `Day 4`) | M04 Scientific Program Attendee | Inline filter |
| Hall pills (`All Halls`, `Hall A`, `Hall B`, `Hall C`) | M04 Scientific Program Attendee | Inline filter |
| Any session card | Inline expanded abstract/details | No separate session-detail screen drawn |
| Tab: `HOME` | M01 Dashboard Home | |
| Tab: `EVENTS` | M02 Events List | |
| Tab: `PEOPLE` | M03 People List | |
| Tab: `PROGRAM` | M04 Scientific Program Attendee | Current tab |
| Tab: `MORE` | M08 More Menu | |

### M08 — More Menu (`w8SrX.png`)
**Entry points:**
- Bottom-tab `MORE`
- M05 bottom nav `MORE`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Tile: `Travel` | M35 Travel Records List | |
| Tile: `Accommodation` | M05 Accommodation + Flags | |
| Tile: `Transport` | M10 Transport Planning | |
| Tile: `Email` | M13 Communications | Email tab |
| Tile: `WhatsApp` | M13 Communications | WhatsApp tab |
| Tile: `Certificates` | M12 Certificate Generation | |
| Row: `QR Scanner` | M11 QR Scanner | |
| Row: `Reports & Exports` | M47 Reports & Exports | |
| Row: `Branding & Letterheads` | M15 Branding | |
| Row: `Settings & Team` | M19 Team & Roles | |
| Tab: `HOME` | M01 Dashboard Home | |
| Tab: `EVENTS` | M02 Events List | |
| Tab: `PEOPLE` | M03 People List | |
| Tab: `PROGRAM` | M04 Scientific Program Attendee | |
| Tab: `MORE` | M08 More Menu | Current tab |

### M14 — Create Event (`1isf8.png`)
**Entry points:**
- M01 `Create Event`
- M02 `+ New`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Previous screen | Typically M01 or M02 |
| Event Name / Date / Venue / Description fields | Inline input/pickers | No navigation |
| Module toggles | Same screen | Inline ON/OFF configuration |
| `Save` | Post-save event workspace | ❌ Exact next screen is not shown; this is the main handoff gap in the event flow |

### M22 — Session Manager (`Gaavt.png`)
**Entry points:**
- No visible inbound button in the current wireframes
- Likely intended after event creation or from an event workspace

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior event-management screen | No event workspace screen is drawn |
| `+ Add` | M23 Add Session Form | |
| Any session card | M23 Add Session Form | Same layout likely reused as edit mode |

### M23 — Add Session Form (`CpuHI.png`)
**Entry points:**
- M22 `+ Add`
- M22 session-card tap (edit reuse inferred)

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M22 Session Manager | |
| All form fields / pickers | Inline input/pickers | No navigation |
| `+ Add Sub-session` | Same screen | Adds inline sub-session row |
| `Save` | M22 Session Manager | |

### M30 — Admin Schedule Grid (`fooPM.png`)
**Entry points:**
- No visible inbound button in the current wireframes
- Likely intended after session setup

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior scheduling screen | Likely M22, but no visible source button exists |
| `Send All` | Bulk faculty-responsibility send action | No preview / confirmation screen shown |
| Day pills (`Day 1`, `Day 2`, `Day 3`) | M30 Admin Schedule Grid | Inline filter |
| Session blocks / empty `Drop session here` cell | Same screen | Drag/drop spatial editing, no separate detail state drawn |
| `Fix` on conflict banner | Conflict resolution flow | ❌ No screen |

### M51 — Event Field Builder (`ZpAv1.png`)
**Entry points:**
- No visible inbound button in the current wireframes
- Likely intended from event/session configuration

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior configuration screen | No source screen shown |
| Any field toggle | Same screen | Enables/disables field |
| `+ Add Custom Field` | Custom-field definition flow | ❌ No screen |
| `Import field config from Excel` | File import flow | No dedicated screen shown |
| `Save` | Prior configuration screen | No source screen shown |

### M52 — Version History / Program Changes (`VHcOm.png`)
**Entry points:**
- No visible inbound button in the current wireframes
- Likely intended after schedule edits

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior scheduling screen | No source screen shown |
| `Preview Revised Emails` | Revised-email preview | ❌ No screen |
| `Publish & Send Revised Mails` | Publish/send action | No confirmation screen drawn |
| Row: `v2 — Initial schedule published` | Version detail / diff view | ❌ No screen |
| Row: `v1 — Draft created` | Version detail / diff view | ❌ No screen |

### M09 — Person Detail (`waUUL.png`)
**Entry points:**
- M03 person-card tap

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M03 People List | |
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
| Back arrow | Previous import step | Upload step is not drawn |
| Each mapping pill / dropdown | Same screen | Inline field mapping |
| Duplicate-handling radio options | Same screen | Inline choice |
| `Back` | Previous import step | Upload step is not drawn |
| `Import 86 People` | M03 People List | Import success screen is not drawn |

### M57 — Merge Duplicates (`9GInC.png`)
**Entry points:**
- No visible inbound button in the current wireframes
- Likely intended from People or import duplicate review

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Previous duplicate-review context | No source screen shown |
| Any field-value choice chip | Same screen | Inline selection of surviving value |
| `Skip` | Previous duplicate-review context | No source screen shown |
| `Merge Records` | M09 Person Detail | Post-merge record view inferred |

### M07 — Registration Form (`3IR5p.png`)
**Entry points:**
- M25 `Register Now`
- M25 sticky `Register`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| All form fields / dropdowns | Inline input/pickers | No navigation |
| `Register` | M28 Registration Success | |
| `Terms & Privacy Policy` | Terms/privacy page | ❌ No screen |

### M25 — Event Landing Page (`qpTp8.png`)
**Entry points:**
- Public event URL
- Marketing/email/WhatsApp campaign link

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Hero CTA: `Register Now` | M07 Registration Form | |
| Any speaker card | Speaker profile | ❌ No screen |
| `View Full Schedule` | M04 Scientific Program Attendee | |
| Venue / map block | External maps link | External action inferred |
| Sticky footer CTA: `Register` | M07 Registration Form | |

### M28 — Registration Success (`P5jNY.png`)
**Entry points:**
- M07 `Register`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Add to Calendar` | External calendar action | No separate screen |
| `Share on WhatsApp` | Native / WhatsApp share | External action |
| QR code card | Same screen | Informational only |

### M29 — Registration Admin (`JIykr.png`)
**Entry points:**
- No visible inbound button in the current wireframes
- Likely intended from event-management admin flow

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Export` | File export action | No separate screen |
| Status tabs (`All`, `Going`, `Pending`, `Waitlist`, `Checked In`) | M29 Registration Admin | Inline filter |
| Any registration row | Registration detail / status drawer | ❌ No screen |

### M26 — Faculty Invitation (`WVLsf.png`)
**Entry points:**
- No visible inbound button in the current wireframes
- Likely intended from program / people / session-management flows

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior admin flow | No source screen shown |
| Person / Role / Session selectors | Inline dropdowns | No navigation |
| `Send Invitation Email` | Send action | No sent-confirmation screen shown |
| `Also Send via WhatsApp` | Send action | No sent-confirmation screen shown |

### M55 — Faculty Confirm Participation (`jlDVA.png`)
**Entry points:**
- Invitation email / WhatsApp link sent from M26

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Accept & Confirm` | Faculty-confirmed success state | ❌ No screen |
| `Decline Invitation` | Decline confirmation state | ❌ No screen |
| `Contact info@gemindia.org` | Mail compose | External action |

### M13 — Communications (`1fB7u.png`)
**Entry points:**
- M08 `Email`
- M08 `WhatsApp`
- M01 communication metric cards (inferred)

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior screen | Usually M08 |
| Tab: `Email` | M13 Communications | Inline tab |
| Tab: `WhatsApp` | M13 Communications | Inline tab |
| Template card: `Registration Confirmation` | M39 Template Editor | |
| Template card: `Faculty Responsibilities` | M39 Template Editor | |
| Template card: `Travel Itinerary` | M39 Template Editor | |
| Template card: `Accommodation Details` | M39 Template Editor | |
| `Retry` on failed delivery row | Retry action | No dedicated retry/result screen shown |

### M39 — Template Editor (`FGhXX.png`)
**Entry points:**
- M13 template-card tap

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M13 Communications | |
| `Save` | M13 Communications | |
| Tab: `Email` | M39 Template Editor | Inline editor mode |
| Tab: `WhatsApp` | M39 Template Editor | Inline editor mode |
| Variable chips | Same screen | Inserts token into template |
| `Preview with Sample Data` | Template preview state | Preview state is not drawn as a separate screen |

### M53 — Automation Triggers (`LG8tQ.png`)
**Entry points:**
- No visible inbound button in the current wireframes
- Likely intended from communications settings

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M13 Communications | Inferred only; no explicit source button exists |
| Any trigger toggle | Same screen | Enable/disable automation |
| Channel chips (`Email`, `WhatsApp`) | Same screen | Inline channel selection |
| Template selector under each trigger | Same screen | Inline template selection |

### M06 — Travel Info Form (`t7kqa.png`)
**Entry points:**
- M35 `+ Add`
- M35 record-row tap (edit reuse inferred)

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M35 Travel Records List | |
| Stepper (`Select`, `Details`, `Send`) | Same screen | Indicates stage; no dedicated step screens drawn |
| All fields / dropdowns | Inline input/pickers | No navigation |
| Upload area | System file picker | External/native chooser |
| `Cancel` | M35 Travel Records List | |
| `Save & Send` | M35 Travel Records List | No separate send-confirmation screen drawn |

### M35 — Travel Records List (`RSElF.png`)
**Entry points:**
- M08 `Travel`
- M54 `Travel`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `+ Add` | M06 Travel Info Form | |
| Any travel record row | M06 Travel Info Form | Same form likely reused as edit/view state |

### M05 — Accommodation + Flags (`92NPy.png`)
**Entry points:**
- M08 `Accommodation`
- M54 `Accommodation`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `+ Add` | M36 Accommodation Form | |
| `Show flagged` | M05 Accommodation + Flags | Inline filter toggle |
| `Mark Reviewed` | M05 Accommodation + Flags | Same-screen state transition: red → yellow |
| `Resolve` / `Mark Resolved` | M05 Accommodation + Flags | Same-screen state transition: yellow/red → cleared |
| Any unflagged row with chevron | M36 Accommodation Form | Same form likely reused as edit/view state |
| Tab: `HOME` | M01 Dashboard Home | |
| Tab: `EVENTS` | M02 Events List | |
| Tab: `PEOPLE` | M03 People List | |
| Tab: `PROGRAM` | M04 Scientific Program Attendee | |
| Tab: `MORE` | M08 More Menu | Active section owner |

### M36 — Accommodation Form (`IMpCm.png`)
**Entry points:**
- M05 `+ Add`
- M05 row tap / chevron

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M05 Accommodation + Flags | |
| Delegate / Hotel / Room / Date / Maps fields | Inline input/pickers | No navigation |
| Booking upload area | System file picker | External/native chooser |
| `Save & Send` | M05 Accommodation + Flags | No separate confirmation screen drawn |

### M10 — Transport Planning (`H25vw.png`)
**Entry points:**
- M08 `Transport`
- M54 `Transport`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior More menu | M08 or M54 |
| Day pills (`May 14`, `May 15`, `May 16`) | M10 Transport Planning | Inline filter |
| Any arrival batch row (`BOM`, `DEL`, `MAA`, `BLR`) | M38 Vehicle Assignment Kanban | Batch-specific drilldown inferred from chevrons |

### M38 — Vehicle Assignment Kanban (`5FfEr.png`)
**Entry points:**
- M10 arrival-batch row

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M10 Transport Planning | |
| Any delegate card | Same screen | Long-press + drag between columns |
| Column headers (`Van-1`, `Van-2`, `Unassigned`) | Same screen | Informational; drag target columns |

### M12 — Certificate Generation (`Y3HLt.png`)
**Entry points:**
- M08 `Certificates`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M08 More Menu | |
| Event pill | Inline event selector | No standalone screen |
| Any certificate template card | M56 Certificate Template Editor | Same editor reused for whichever template is selected |
| Recipient radio option (`All Delegates`, `Faculty Only`, `Custom Selection`) | Same screen | Inline selection |
| `Preview Certificate` | Preview state | No separate preview screen is drawn |
| `Generate & Send (1,247)` | Generation progress / issued certificates flow | ❌ No screen |

### M56 — Certificate Template Editor (`nZ08H.png`)
**Entry points:**
- M12 template-card tap

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M12 Certificate Generation | |
| Tool buttons (`Text`, `Image`, `QR Code`, `Shape`, `Variable`) | Same screen | Inline editor tools |
| Variable chips | Same screen | Inserts token into template |
| `Upload background image` | System file picker | External/native chooser |
| `Preview with Sample Data` | Preview state | No separate preview screen is drawn |

### M11 — QR Scanner (`wLTrF.png`)
**Entry points:**
- M08 `QR Scanner`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `X` close | M08 More Menu | |
| `Express` pill | M11 QR Scanner | Inline mode switch |
| Valid QR scan action | M44 Scan Success | System-triggered state |
| Duplicate QR scan action | M45 Scan Duplicate | System-triggered state |
| Stat cards (`Checked In`, `Remaining`, `Total`) | M58 Attendance Report | Inferred reporting drilldown |
| `Manual Check-in` | M46 Manual Check-in | |

### M44 — Scan Success (`9HWwn.png`)
**Entry points:**
- M11 valid QR scan
- M46 `Check In`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Success card / auto-dismiss timer | M11 QR Scanner | Auto-dismiss in 3 seconds |

### M45 — Scan Duplicate (`SCufz.png`)
**Entry points:**
- M11 duplicate QR scan

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| `Override & Check In Again` | M44 Scan Success | Override path inferred |
| Tap anywhere to dismiss | M11 QR Scanner | Explicit dismiss hint |

### M46 — Manual Check-in (`WoR84.png`)
**Entry points:**
- M11 `Manual Check-in`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M11 QR Scanner | |
| Search field | Inline search | No navigation |
| Any `Check In` button | M44 Scan Success | Duplicate path would likely route to M45, but that state is not shown from this screen |

### M58 — Attendance Report (`YBvs4.png`)
**Entry points:**
- M11 stat-card drilldown (inferred)

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M11 QR Scanner | Inferred previous screen |
| `Export` | File export action | No separate screen |
| Session rows / hall rows | Same screen | Informational breakdowns; no deeper drilldown shown |

### M15 — Branding (`xFRfv.png`)
**Entry points:**
- M08 `Branding & Letterheads`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M08 More Menu | |
| Event pill | Inline event selector | No standalone screen |
| Event logo card | System file picker | External/native chooser |
| Header image upload area | System file picker | External/native chooser |
| Color swatches | Inline color picker | No separate screen |
| Sender / Reply-to / Subject fields | Inline input | No navigation |
| `Save` | M08 More Menu | |

### M19 — Team & Roles (`sbLsV.png`)
**Entry points:**
- M08 `Settings & Team`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | M08 More Menu | |
| `Invite` | Invite-member flow | ❌ No screen/modal is drawn |
| Role pill: `Coordinator` | Same screen | Inline role dropdown inferred |
| Role pill: `Ops` | Same screen | Inline role dropdown inferred |
| Pending invite row | Invite detail / resend / revoke flow | ❌ No screen |

### M47 — Reports & Exports (`i8T1g.png`)
**Entry points:**
- M01 `Reports`
- M08 `Reports & Exports`

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Back arrow | Prior screen | M01 or M08 |
| Row: `Agenda PDF` | File export action | Download icon duplicates same action |
| Row: `Faculty Roster` | File export action | |
| Row: `Delegate List` | File export action | |
| Row: `Travel Summary` | File export action | |
| Row: `Rooming List` | File export action | |
| Row: `Transport Plan` | File export action | |
| Row: `Delivery Log` | File export action | No separate report preview screen drawn |

### M54 — More Menu Ops Role (`IWTdp.png`)
**Entry points:**
- M16 sign-in as Ops role
- Role-restricted app state

**Tappable elements → Destination**
| Element | Destination Screen | Notes |
|---|---|---|
| Tile: `Travel` | M35 Travel Records List | |
| Tile: `Accommodation` | M05 Accommodation + Flags | |
| Tile: `Transport` | M10 Transport Planning | |
| Locked row: `Communications` | No access | Disabled |
| Locked row: `Certificates` | No access | Disabled |
| Locked row: `Branding & Settings` | No access | Disabled |
| Bottom tabs `HOME / EVENTS / PEOPLE / PROGRAM` | Ambiguous | Visually present, but they conflict with the access banner; this is a role-state inconsistency |
| Tab: `MORE` | M54 More Menu Ops Role | Current tab |

## 2. Dead Ends

| Screen | Element | Expected Destination | Status |
|---|---|---|---|
| M01 | Bell icon | Notification list | ❌ No screen |
| M01 | Avatar | Profile/settings | ❌ No screen |
| M02 | Any event card | Event overview / edit workspace | ❌ No screen |
| M03 | `+ Add` | Add Person form | ❌ No screen |
| M07 | `Terms & Privacy Policy` | Legal page / modal | ❌ No screen |
| M14 | `Save` | Post-save event workspace / next-step handoff | ❌ No explicit destination |
| M17 | `Send Reset Link` | Check-email confirmation state | ❌ No screen |
| M19 | `Invite` | Invite-member flow | ❌ No screen |
| M19 | Pending invite row | Resend / revoke / invite detail | ❌ No screen |
| M25 | Any speaker card | Speaker profile | ❌ No screen |
| M29 | Any registration row | Registration detail / status drawer | ❌ No screen |
| M30 | `Fix` on conflict banner | Conflict resolution flow | ❌ No screen |
| M51 | `+ Add Custom Field` | Custom-field definition flow | ❌ No screen |
| M52 | `Preview Revised Emails` | Revised-email preview | ❌ No screen |
| M52 | Published-version rows | Version detail / diff view | ❌ No screen |
| M55 | `Accept & Confirm` | Confirmation-success state | ❌ No screen |
| M55 | `Decline Invitation` | Decline-confirmation state | ❌ No screen |
| M12 | `Generate & Send` | Generation progress / issued list | ❌ No screen |

**Total dead ends:** 18

## 3. Orphan Screens

Orphan = no visible button on another designed screen points to it. Some of these still have legitimate external entry points.

| Screen | Issue |
|---|---|
| M22 — Session Manager | Exists, but no visible button in M01/M02/M14 reaches it |
| M25 — Event Landing Page | Public-entry screen only; no in-app button reaches it |
| M26 — Faculty Invitation | Exists, but no visible button from People / Sessions / Schedule reaches it |
| M29 — Registration Admin | Exists, but no visible admin entry point reaches it |
| M30 — Admin Schedule Grid | Exists, but no visible handoff from Session Manager reaches it |
| M51 — Event Field Builder | Exists, but no visible entry point reaches it |
| M52 — Version History / Program Changes | Exists, but no visible entry point reaches it |
| M53 — Automation Triggers | Exists, but no visible button from Communications reaches it |
| M54 — More Menu Ops Role | Role-entry screen only; not reachable from the standard admin flow |
| M55 — Faculty Confirm Participation | External email / WhatsApp link only |
| M57 — Merge Duplicates | Exists, but no visible button from People / Import reaches it |
| M59 — Reset Password | External email link only |

**Total orphan screens:** 12

## 4. UX Traceability Matrix

| Screen | Primary UX Pattern | Research Source | Specific Reference | Traceability |
|---|---|---|---|---|
| M16 Login | Standard email/password sign-in form | Client PDF only | `document_pdf.pdf` §2: "Auth: email + password, forgot/reset" | ⚠️ No dedicated teardown-backed auth UI source |
| M17 Forgot Password | Single-field reset-link request | Client PDF only | `document_pdf.pdf` §2: forgot/reset requirement | ⚠️ No dedicated teardown-backed auth UI source |
| M59 Reset Password | New password + confirm form | Client PDF only | `document_pdf.pdf` §2: forgot/reset requirement | ⚠️ No dedicated teardown-backed auth UI source |
| M01 Dashboard | Event selector + metrics + quick actions | Whova + Retool | `FINAL_SYNTHESIS.md` Module 13; `DESIGN_DECISIONS.md` UX Decision 1 | ✅ |
| M02 Events List | Event cards + create action | Whova | `FINAL_SYNTHESIS.md` Module 3 "Event Creation: Linear Wizard Pattern" | ✅ |
| M03 People List | Searchable people list with saved-view chips | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2; `ux-teardowns/session-04-hubspot-crm/web-research.md` "Tabular list with saved views" | ✅ |
| M04 Scientific Program Attendee | Mobile card-list schedule with day/hall filters | Sessionize + Fourwaves/Indico adaptation | `DESIGN_DECISIONS.md` UX Decision 3; `FINAL_SYNTHESIS.md` Module 5 | ✅ |
| M08 More Menu | Role-neutral utility hub / module launcher | Retool admin navigation | `FINAL_SYNTHESIS.md` Module 1 "Role-based sidebar navigation" adapted to mobile | ✅ |
| M14 Create Event | Simple event-setup form with module toggles | Whova + client spec | `FINAL_SYNTHESIS.md` Module 3; `document_pdf.pdf` §4 dynamic ON/OFF fields | ✅ |
| M22 Session Manager | Session list grouped by time/hall | Sessionize | `FINAL_SYNTHESIS.md` Module 5 schedule-building model | ✅ |
| M23 Add Session Form | Structured session form with faculty-role assignment | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5 "Role taxonomy expansion"; `document_pdf.pdf` §4 | ✅ |
| M30 Admin Schedule Grid | Two-panel hall×time grid builder | Sessionize | `FINAL_SYNTHESIS.md` Module 5 "Schedule Grid Builder (Gold Standard)" | ✅ |
| M51 Event Field Builder | Field-toggle builder for event-specific session schema | Client PDF + Sessionize custom fields | `document_pdf.pdf` §4 dynamic fields; `FINAL_SYNTHESIS.md` Module 5 custom fields | ⚠️ Exact toggle-list builder is a custom composition, not a direct teardown copy |
| M52 Version History / Program Changes | Change feed + publish revised mail | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5 "What changed awareness through revision notifications"; `document_pdf.pdf` §4 versioning / revised mailers | ✅ |
| M09 Person Detail | Person profile with activity timeline | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2 "Contact detail: 3-column layout" and "Activity timeline" | ✅ |
| M32 CSV Import Column Mapping | Auto-map + manual override + duplicate rule step | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2 "CSV import: 6-step flow"; HubSpot import notes in `session-04-hubspot-crm/web-research.md` | ✅ |
| M57 Merge Duplicates | Side-by-side field selection merge | HubSpot CRM | `FINAL_SYNTHESIS.md` Module 2 "Deduplication: side-by-side merge" | ✅ |
| M07 Registration Form | Public registration form with optional custom questions | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 4 "Registration Flow"; `document_pdf.pdf` §5 | ✅ |
| M25 Event Landing Page | Cover/header + speakers + schedule + sticky registration CTA | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 4 "Event Page Design (Lu.ma — Primary Inspiration)" | ✅ |
| M28 Registration Success | Immediate registration ID + QR + calendar/share actions | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 4 "Confirmation: Immediate email with calendar invite + QR code" | ✅ |
| M29 Registration Admin | Status-tab registration list | Lu.ma | `FINAL_SYNTHESIS.md` Module 4 "Registration Admin: 7 Status Tabs" | ✅ |
| M26 Faculty Invitation | Organizer-triggered invitation with role/session assignment | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5 "Notification Pipeline"; `document_pdf.pdf` §5 faculty invitation | ✅ |
| M55 Faculty Confirm Participation | Public confirmation screen from an invite link | Sessionize + client spec | `FINAL_SYNTHESIS.md` Module 5 "Inform → Confirm Participation"; `document_pdf.pdf` §5 | ✅ |
| M13 Communications | Template list + delivery-log dashboard | Stripo + React Email + WATI | `FINAL_SYNTHESIS.md` Modules 6 and 7 | ✅ |
| M39 Template Editor | Subject/body editor with variables and preview | Stripo + React Email + WATI | `FINAL_SYNTHESIS.md` Module 6 variable system; Module 7 template variables/buttons | ✅ |
| M53 Automation Triggers | Event→template automation rule list | WATI + client spec | `FINAL_SYNTHESIS.md` Module 7 "Triggers"; `document_pdf.pdf` §7 trigger list | ✅ |
| M06 Travel Info Form | Per-person itinerary form with send action | TravelPerk | `FINAL_SYNTHESIS.md` Module 8 "Per-Person Itinerary Card" | ✅ |
| M35 Travel Records List | Travel records list with status pills | TravelPerk | `FINAL_SYNTHESIS.md` Module 8 "Trips page" + "Summary views" | ✅ |
| M05 Accommodation + Flags | Accommodation list with 3-state red/yellow/cleared flags | AppCraft + locked custom decision | `FINAL_SYNTHESIS.md` Module 9; `DESIGN_DECISIONS.md` UX Decision 2 | ✅ |
| M36 Accommodation Form | Per-user hotel/room/check-in form | AppCraft Events | `FINAL_SYNTHESIS.md` Module 9 "Fields per record" | ✅ |
| M10 Transport Planning | Grouped arrival batches with counts/status pills | Airtable | `FINAL_SYNTHESIS.md` Module 10 "Nested grouping" + status pills | ✅ |
| M38 Vehicle Assignment Kanban | Drag cards into vehicle columns | Airtable | `FINAL_SYNTHESIS.md` Module 10 "Kanban: vehicle assignment" | ✅ |
| M12 Certificate Generation | Template selection + recipient selection + bulk-generate CTA | Certifier.io | `FINAL_SYNTHESIS.md` Module 11 "Bulk Generation: 4-Step Flow" | ✅ |
| M56 Certificate Template Editor | WYSIWYG certificate builder with variables + QR | Certifier.io | `FINAL_SYNTHESIS.md` Module 11 "Template Editor (Design Builder)" | ✅ |
| M11 QR Scanner | Express QR scan + manual fallback | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 12 "Two-Mode QR Check-in" | ✅ |
| M44 Scan Success | Auto-check-in positive feedback card | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 12 color-coded QR feedback conventions | ✅ |
| M45 Scan Duplicate | Duplicate-check-in warning state with override | Lu.ma + Whova | `FINAL_SYNTHESIS.md` Module 12 "Standard vs Express" and duplicate-warning pattern adaptation | ✅ |
| M46 Manual Check-in | Name/reg search fallback | Whova | `FINAL_SYNTHESIS.md` Module 12 "4 check-in methods — app name search" | ✅ |
| M58 Attendance Report | Attendance metrics and breakdowns | Whova + Lu.ma | `FINAL_SYNTHESIS.md` Modules 12 and 13; `document_pdf.pdf` §12 analytics | ✅ |
| M15 Branding | Per-event brand kit editor | Stripo | `FINAL_SYNTHESIS.md` Module 14 "Per-Event Brand Kit System" | ✅ |
| M19 Team & Roles | Members list + invite + role dropdowns | Clerk + Retool | `FINAL_SYNTHESIS.md` Module 1 "Members table" and "Invitation: Email + Role dropdown + Invite button" | ✅ |
| M47 Reports & Exports | Export catalog screen | Whova + TravelPerk + client spec | `FINAL_SYNTHESIS.md` Module 13 reports/export categories; Module 8 export pattern | ✅ |
| M54 More Menu Ops Role | Role-restricted navigation state | Clerk + Retool | `FINAL_SYNTHESIS.md` Module 1 "Role-based sidebar filtering" + three-layer access | ✅ |

**Total screens with partial / missing research traceability:** 4  
`M16`, `M17`, `M59`, and `M51`

## 5. Flow Completeness

### Journey 1: New User Onboarding
1. M16 `Login` → tap `Sign In` → M01 `Dashboard Home` ✅
2. M01 → tap `Create Event` → M14 `Create Event` ✅
3. M14 → tap `Save` → expected event workspace / next-step handoff ❌ No explicit destination
4. M22 `Session Manager` exists, but no visible button from M14 or M02 reaches it ❌
5. If reached, M22 → tap `+ Add` → M23 `Add Session Form` → `Save` → M22 ✅
6. No visible button from M22 reaches M30 `Admin Schedule Grid` ❌
7. No visible button from M30 reaches M26 `Faculty Invitation`; `Send All` is a different action ❌

**VERDICT:** ❌ INCOMPLETE

### Journey 2: Delegate Registration
1. Public event URL → M25 `Event Landing Page` ✅
2. M25 → tap `Register Now` / sticky `Register` → M07 `Registration Form` ✅
3. M07 → tap `Register` → M28 `Registration Success` ✅
4. M28 shows registration ID + QR and offers calendar / WhatsApp share ✅
5. M29 `Registration Admin` exists for staff review, but no visible admin entry point reaches it ❌

**VERDICT:** ❌ INCOMPLETE

### Journey 3: Faculty Invitation
1. M26 `Invite Faculty` exists ✅
2. M26 → tap `Send Invitation Email` / `Also Send via WhatsApp` → out-of-band invite link ✅
3. Faculty clicks link → M55 `Faculty Confirm Participation` ✅
4. M55 → `Accept & Confirm` / `Decline Invitation` → follow-up confirmation state ❌ No screen
5. No staff-facing status screen shows confirmed / declined invitation outcomes ❌

**VERDICT:** ❌ INCOMPLETE

### Journey 4: Travel Lifecycle
1. M35 `Travel Records List` → tap `+ Add` → M06 `Travel Info Form` ✅
2. M06 → tap `Save & Send` → back to M35 with sent status reflected ✅
3. Travel change is visible in M35 (`Changed` state) ✅
4. Downstream red flag appears in M05 `Accommodation + Flags` ✅
5. Ops taps `Mark Reviewed` → same-screen yellow reviewed state ✅
6. Ops taps `Resolve` / `Mark Resolved` → same-screen cleared state ✅

**VERDICT:** ✅ COMPLETE

### Journey 5: Certificate Lifecycle
1. M12 `Certificate Generation` → tap a template → M56 `Certificate Template Editor` ✅
2. M56 → edit template → back to M12 ✅
3. M12 → choose recipients → tap `Generate & Send` ❌ No generation-progress screen
4. No issued-certificates list, resend view, or public download / verification handoff is present in the current 43 screens ❌

**VERDICT:** ❌ INCOMPLETE

### Journey 6: QR Check-in Day
1. M08 `More` → tap `QR Scanner` → M11 `QR Scanner` ✅
2. M11 valid scan → M44 `Scan Success` ✅
3. M11 duplicate scan → M45 `Scan Duplicate` ✅
4. M11 `Manual Check-in` → M46 → tap `Check In` → M44 ✅
5. M11 stat-card drilldown reaches M58 `Attendance Report` ✅

**VERDICT:** ✅ COMPLETE

### Journey 7: Program Revision
1. M22 session-card tap can plausibly reuse M23 `Add Session Form` as edit mode ✅
2. M52 `Program Changes` screen exists for revision history ✅
3. But no visible button reaches M52 from M22 or M30 ❌
4. M52 `Preview Revised Emails` is a dead end ❌
5. `Publish & Send Revised Mails` exists as an action, but without the missing preview state the review/publish loop is broken ❌

**VERDICT:** ❌ INCOMPLETE

## 6. Summary

- Screens audited: **43**
- Total dead ends: **18**
- Total orphan screens: **12**
- Total partial / untraceable patterns: **4**
- Total incomplete journeys: **5 of 7**

### Highest-risk findings
- The event-management backbone is not actually connected: `M14 → M22 → M30 → M26/M52` is broken by missing handoffs.
- Several advanced admin screens exist but are unreachable from any visible button: `M22`, `M26`, `M29`, `M30`, `M51`, `M52`, `M53`, `M57`.
- Public / external-entry screens exist, but remain orphaned in the in-app graph: `M25`, `M55`, `M59`, `M54`.
- The QR + travel lifecycles are the only two critical journeys that are fully screen-covered in the current set.
