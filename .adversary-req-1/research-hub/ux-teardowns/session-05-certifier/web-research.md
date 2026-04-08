# Certifier.io -- UX Research & Feature Teardown

**Research Date:** 2026-04-05
**Researcher:** UX Research Agent
**Subject:** Certifier.io (certifier.io) -- Digital credential platform for certificate design, bulk generation, delivery, and verification
**Relevance:** "Almost exactly what we need to build" per project lead. Primary competitive reference for GEM India Conference App certificate module.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Template Editor (Design Builder)](#2-template-editor-design-builder)
3. [Dynamic Attributes & Placeholders](#3-dynamic-attributes--placeholders)
4. [Bulk Certificate Generation](#4-bulk-certificate-generation)
5. [Delivery & Distribution](#5-delivery--distribution)
6. [Recipient Experience (Wallet/Portal)](#6-recipient-experience-walletportal)
7. [QR Code & Verification](#7-qr-code--verification)
8. [Certificate Management (Post-Issuance)](#8-certificate-management-post-issuance)
9. [Tracking & Analytics](#9-tracking--analytics)
10. [Integrations & API](#10-integrations--api)
11. [Branding & White-Label](#11-branding--white-label)
12. [Pricing & Plan Gating](#12-pricing--plan-gating)
13. [Key Takeaways for GEM India Conference App](#13-key-takeaways-for-gem-india-conference-app)
14. [Sources](#14-sources)

---

## 1. Platform Overview

Certifier.io is a digital credentials platform serving 2,000+ organizations that have issued over 1.1 million credentials. It covers the full credential lifecycle: **design -> generate -> deliver -> verify -> manage**. Target users include educational institutions, corporations, certification bodies, training providers, and event organizers.

**Core value proposition:** Automate the entire certificate workflow from a single platform -- design once, generate thousands, deliver instantly, verify forever.

**Standards:** OpenBadge 3.0 compliant. ISO 27001 and ISO 9001 certified. GDPR compliant. AWS cloud hosted with SSL encryption and external security audits.

---

## 2. Template Editor (Design Builder)

### Editor Type
**Drag-and-drop visual editor**, browser-based. No software installation required. Called the "Design Builder" internally.

### Workflow (Step by Step)
1. Navigate to **Designs** tab, click "Create Design"
2. Choose design type: Certificate or Badge
3. Select **orientation**: Landscape or Portrait
4. Browse **300+ pre-made templates** (filterable by Category, Style, Color) -- or start from scratch
5. Set **paper size**: A4 or US Letter
6. Customize in the editor
7. **Preview** with sample data auto-filled into all dynamic attributes
8. **Save** (changes are not auto-saved -- explicit "Create Design" / "Save Changes" button required)

### Template Gallery
- **2,000+ free templates** across the broader library (300+ directly in the builder picker)
- **Categories:** Attendance, Appreciation, Completion, Course, Participation, Training, OSHA Safety, First-Aid/CPR, Project Management (PMP), Continuing Education, HIPAA Compliance, Construction, and many more
- **Filters:** Category, Style, Orientation, Color
- Templates are watermark-free
- Also available for download in Microsoft Word, Google Docs, PowerPoint, Figma, and Google Slides formats (for offline editing)

### Editor Tools (Left Panel)

| Tool | Details |
|------|---------|
| **Background** | Color picker with HEX code input; OR upload custom background image (JPG, SVG, PNG; max 2MB) |
| **Images** | Upload logos and signatures (JPG, SVG, PNG; max 2MB each); removable |
| **Elements** | Library of lines, shapes, icons, ribbons, and bases; customizable shape, size, and color |
| **Text** | Multiple text box types; preset text combinations; full font/size/alignment (Left/Center/Right) controls |
| **Dynamic Attributes** | Insert placeholders via "Add attribute" button; auto-scaling enabled by default; width adjustment for multi-line text |
| **QR Code** | Add verification QR or custom-URL QR; customize color, size, description (Professional+ only) |

### Font System
- **45+ built-in fonts**: serif, sans-serif, and decorative categories
- **Custom font upload**: Available on Advanced plan and above
- Full control over font size, color, and alignment

### Layer Management
- Click any element to see its position in the layer stack
- **Drag-and-drop reordering** of layers to adjust z-index / stacking order
- **Group function**: Move all elements together without losing composition

### Canvas & Sizing
- Paper sizes: A4, US Letter
- Orientation: Landscape, Portrait
- No mention of custom pixel-level canvas dimensions

### Preview
- "Preview" button shows the certificate with **sample values auto-filled** for all dynamic attributes
- Allows visual verification before saving

### Key Limitations
- Template-based starting point required (even "from scratch" is a blank template)
- Cannot export un-issued designs directly as PDF
- QR codes restricted to Professional+ plans
- Custom fonts restricted to Advanced+ plans
- No explicit undo/redo mentioned in documentation
- Max file size: 2MB per uploaded element

---

## 3. Dynamic Attributes & Placeholders

### Concept
Attributes are **bracket-notation placeholders** embedded in certificate designs. They are replaced with recipient-specific data at generation time. One template serves thousands of personalized certificates.

### Syntax
All attributes use the format: `[entity.field]`

### Default Attributes (Available to All Plans)

| Attribute | Syntax | Source | Notes |
|-----------|--------|--------|-------|
| Recipient Name | `[recipient.name]` | CSV / manual entry | Displayed on PDF and in dashboard |
| Recipient Email | `[recipient.email]` | CSV / manual entry | Used for email delivery (required) |
| Issue Date | `[certificate.issued_on]` | Auto-generated or CSV | Format: DD-MM-YYYY |
| Expiry Date | `[certificate.expired_on]` | Auto-generated or CSV | Format: DD-MM-YYYY |
| Certificate ID | `[certificate.id]` | System-generated | 16-digit unique code |
| Certificate UUID | `[certificate.uuid]` | System-generated | Globally unique identifier for verification |
| Issuer Name | `[issuer.name]` | Account Settings | Auto-populated from org profile |
| Issuer Support Email | `[issuer.support_email]` | Account Settings | Auto-populated |
| Template/Group Name | `[group.name]` | Credential template name | Auto-populated |
| Course Name | `[course.name]` | Course settings | Auto-populated |

### Custom Attributes (Professional+ Plans)

**Creation workflow:**
1. Go to Profile -> Settings -> Attributes
2. Click "Create Attribute" button
3. Name the custom attribute (e.g., "grade", "hours", "instructor", "session")
4. The attribute becomes available in the design editor
5. Add a corresponding column in your CSV spreadsheet

**Use cases for custom attributes:**
- Event session names
- Instructor / facilitator names
- Training hours / CPD credits earned
- Grades or achievement scores
- Any arbitrary per-recipient data

**Visual distinction:** Default attributes show **grey tags** in the editor; custom attributes show **blue tags**.

### Image Attributes
Certifier supports **image-type attributes** where you provide image URLs in your spreadsheet. These follow the same mapping workflow as text attributes but render as images on the certificate (e.g., participant photos, sponsor logos).

### Date Format Requirement
All date fields **must** be in `DD-MM-YYYY` format. This is mandatory and non-negotiable in the current system.

### Attribute Placement in Editor
- Attributes are inserted as styled text elements
- Full control over font, size, color, width
- **Auto-scaling** enabled by default (text shrinks to fit if content is longer than expected)
- Width adjustment controls how multi-line text distributes
- Can be concatenated with static text, e.g., `Date: [certificate.issued_on]`

---

## 4. Bulk Certificate Generation

### End-to-End Workflow

#### Step 1: Design Creation
Create or select a template in the Design Builder. Add all required dynamic attributes as placeholders.

#### Step 2: Create a "Group" (Credential Batch)
After saving the design, a pop-up prompts the user to add recipients. Groups are the organizational unit for a batch of certificates.

#### Step 3: Data Upload
Two methods:
- **Manual entry**: Add names and emails one by one (for small batches)
- **Spreadsheet upload** (recommended): Upload **CSV, XLSX, or XLS** files

Certifier provides a **downloadable template** with pre-configured "Recipient Name" and "Email" columns. Users add custom columns matching their attributes.

#### Step 4: Column-to-Attribute Mapping
After upload, the system presents a **mapping UI**:
- Each spreadsheet column is shown alongside available certificate attributes
- System attempts **smart auto-mapping** (names to names, emails to emails, grades to grades)
- User can manually adjust mappings
- **"Skip column"** button available for columns not needed on the certificate
- Clear visual confirmation of each mapping

#### Step 5: Preview & Validation
Click **"Preview Before Publishing"** button:
- System generates a preview of how certificates will look with actual data
- Errors and issues are **identified and reported** (e.g., missing required fields, format errors)
- User reviews before proceeding

#### Step 6: Publishing
Two options presented:
- **Save as Draft**: Generate certificates but do not send yet (stored for later)
- **Save & Publish**: Generate AND immediately email all certificates to recipients

#### Step 7: Post-Generation
From the dashboard, administrators can:
- Download individual certificates
- Resend emails to specific recipients
- Delete certificates
- View delivery status

### Supported File Formats
- CSV
- XLSX (Excel)
- XLS (Legacy Excel)

### Automation via Google Sheets
Through the **Automations** feature, Certifier can monitor a connected Google Sheet. When new rows appear, certificates are **automatically generated and sent** without manual intervention. This enables real-time issuance triggered by form submissions, survey completions, course completions, etc.

---

## 5. Delivery & Distribution

### Email Delivery

**Email Template Builder:**
- Separate **visual builder** for email templates (accessed via "Emails" tab)
- Customize: text, logo placement, colors, CTA button
- Dynamic attributes work in email body too (e.g., `[recipient.name]`)

**Sender Configuration:**
- Custom **sender name** (organization or individual name)
- Custom **sender email address**
- Custom **reply-to** address
- **CC and BCC** fields supported
- Custom **email domain** available (white-label email sending)
- Emails distributed via Certifier's servers but **appear** to come from the issuer's organization

**What Recipients See:**
- Branded email with organization's logo and colors
- Personalized greeting with recipient's name
- **CTA button** that links directly to their digital wallet / credential page
- Professional appearance -- recipients cannot tell a third-party platform sent it

**Recipient Actions from Email:**
- Click CTA to view certificate in digital wallet
- Download certificate as PDF (free, one-click)
- Share on social media (LinkedIn, Facebook, X/Twitter)
- Add credential to LinkedIn profile
- Verify their own certificate
- Share via QR code

### Other Distribution Methods

| Method | Details |
|--------|---------|
| **Shareable URLs** | Each credential gets a unique, permanent URL; no login required to view |
| **QR Code Sharing** | Recipients can share their QR code for instant verification |
| **Social Media** | Direct sharing to LinkedIn, Facebook, X, email signatures |
| **PDF Download** | One-click export to PDF format |
| **Portal Access** | 24/7 access via recipient wallet (see next section) |

### Bulk Download
Certificates can be managed from the admin dashboard. While a single-click ZIP download is not explicitly documented as a headline feature, administrators can download certificates individually and manage bulk operations from the credential list view.

---

## 6. Recipient Experience (Wallet/Portal)

### Digital Wallet
Every recipient gets access to a **digital wallet** -- a hosted web page where their credentials live permanently.

**Wallet Features:**
- **24/7 access** to all issued credentials
- **No login required** -- accessed via unique URL from email
- **PDF download** -- one-click export
- **Social sharing** -- LinkedIn, Facebook, X, email
- **QR code display** -- for in-person verification
- **Verification button** -- recipients can verify their own credentials
- **Request corrections** -- report typos or errors to the issuer
- **Multi-language navigation** -- international accessibility
- **Permanent hosting** -- credentials never expire from the platform (no extra cost)

### Wallet Branding (White-Label)
- Custom **brand colors** and **logo**
- Customizable **footer text**
- Custom **domain** for wallet URL (e.g., credentials.yourcompany.com)
- Option to **remove Certifier branding** entirely

---

## 7. QR Code & Verification

### Adding QR Codes in the Editor
1. Open certificate design in the builder
2. Navigate to **QR Code** tool in left panel
3. QR code is **automatically generated unique to each credential** at issuance time
4. Customize color (foreground + background), size, and position
5. Best practice: place in corners on clean backgrounds with surrounding whitespace

### QR Code Types

| Type | Description | Recommended? |
|------|-------------|--------------|
| **Verification Page** | Links to live digital wallet with one-click verification, social sharing, PDF download, issuer info, expiration display, scan tracking | Yes (default) |
| **Custom URL** | Links to any specified URL (website, landing page, course catalog) | No (risk of link rot) |

### Verification System

**UUID-Based Verification:**
- Every credential is assigned a **globally unique identifier (UUID)**
- Impossible to duplicate or forge
- Verification checks UUID against Certifier's central database

**Verification Page (What the Verifier Sees):**
- Issuer information and identity
- Recipient name and details
- Issue date and expiration date
- Credential ID
- **"Verify Credential" button** for authenticity check
- Issuer status verification
- Social sharing options
- Downloadable PDF

**Issuer KYC (Know Your Customer):**
- Issuers can undergo identity verification through Certifier's KYC procedure
- Adds a "Verified Issuer" badge to credentials
- Builds trust and legitimacy

**API Verification:**
- Credentials can be **verified programmatically** via Certifier's Open API
- Use the unique credential link for API-based authentication
- Enables third-party systems to validate certificates automatically

**OpenBadge 3.0 Compliance:**
- Digital badges are issued compliant with OpenBadge 3.0 standard
- Ensures interoperability with other credential platforms

### QR Code Plan Requirements
- QR codes on certificates: **Professional plan and above**
- Free templates with QR capability exist in the template library (conflicting information -- may be template-only preview vs. actual issuance)

---

## 8. Certificate Management (Post-Issuance)

### Credential List / Dashboard
- View all issued credentials in a centralized list
- **Advanced group & data filters** for searching and organizing
- View credential history: creation date, publication date, update dates
- Status control for each credential

### Edit & Reissue After Generation
- **Fix typos and misspelled names** after certificates have been issued
- **Update issued credentials in real time** -- changes reflect on the live credential page
- **Set and update expiration dates** post-issuance
- **Manage renewal requests** from recipients
- Edit recipient information
- Recipients can **request corrections** through the wallet portal -- issuer reviews and approves

### Resend & Revoke
- Resend email to specific recipients
- Delete/revoke individual credentials
- Manage change requests seamlessly

### Credential History
- Full audit trail: creation, publication, and update timestamps
- View all modifications made to a credential

---

## 9. Tracking & Analytics

### Delivery Analytics
- Track **published credentials** count
- Monitor **email open rates**
- **Click-through rates** on email CTAs
- Delivery status per recipient

### Engagement Metrics
- Certificate **downloads** count
- **Social media shares** tracking
- **LinkedIn adds** monitoring
- Referral tracking
- Recipient interaction analysis

### Verification Analytics
- Number of times each credential was **verified**
- **Clicks breakdown** on verification page
- Verification source tracking

### Reporting
- **Monthly performance reports** on issued certificates
- **Marketing Insights** dashboard
- Exportable account data (one-click export)

---

## 10. Integrations & API

### Native Integrations
- **Google Sheets**: Real-time monitoring; auto-issues certificates when new rows appear
- **Zapier**: 5,000+ app connections
- **Make (Integromat)**: Workflow automation
- **Pipedream**: Event-driven automation

### Automation Triggers (via integrations)
- Course completion
- Webinar/event conclusion
- Survey submission (e.g., SurveySparrow)
- Form submission (Google Forms)
- Any spreadsheet row addition

### API
- **Open API** for programmatic credential management
- Credential verification endpoint
- Credential issuance endpoint (implied)
- Technical support team available for API integration
- Webhook support for event-driven workflows

### LinkedIn Integration
- Direct credential embedding on LinkedIn profiles
- One-click "Add to LinkedIn" from recipient wallet

---

## 11. Branding & White-Label

### Certificate Branding
- Custom logos, colors, fonts, backgrounds
- Full control over certificate visual identity

### Email Branding
- Custom sender name and email address
- Custom email domain
- Branded email template (logo, colors, text)

### Wallet/Portal Branding
- Custom brand colors and logo on recipient wallet
- Customizable footer text
- Custom domain hosting (e.g., `credentials.yourdomain.com`)
- Remove Certifier footer entirely

### Issuer Verification Badge
- KYC-verified issuer identity
- Adds trust signals to all issued credentials

---

## 12. Pricing & Plan Gating

### Free Plan
- **250 credentials per year**
- Full access to design tools
- Email delivery
- Verification features
- Social sharing
- Template library access

### Plan-Gated Features

| Feature | Required Plan |
|---------|---------------|
| QR codes on certificates | Professional+ |
| Custom attributes | Professional+ |
| Custom font upload | Advanced+ |
| Custom email domain | Advanced+ |
| Custom wallet domain | Enterprise |
| Remove Certifier branding | Enterprise |
| White-label credentials | Enterprise |
| Custom SLAs | Enterprise |
| Dedicated security review | Enterprise |
| Custom dev hours | Enterprise |

---

## 13. Key Takeaways for GEM India Conference App

### What to Replicate (High Priority)

1. **Drag-and-drop Design Builder** with background upload, logo placement, text styling, and layer management. This is the core UX pattern that makes certificate creation accessible to non-designers.

2. **Dynamic Attribute System** using bracket notation (`[recipient.name]`, `[event.name]`, etc.). The concept of default attributes (auto-populated from system) + custom attributes (user-defined) is elegant and extensible.

3. **CSV Upload -> Column Mapping -> Preview -> Publish** workflow. This four-step bulk generation flow is the proven UX pattern. Smart auto-mapping reduces friction; preview step catches errors before mass issuance.

4. **Branded Email Delivery** with visual email builder, custom sender details, and CTA button linking to credential page. Recipients should never see the platform -- only the conference brand.

5. **QR Code Verification** with UUID-based system. Each certificate gets a unique QR that links to a verification page. Critical for conference credibility.

6. **Post-Issuance Editing** -- the ability to fix typos and update certificates after they have been issued (live updates) is a major quality-of-life feature that reduces support burden.

### What to Adapt for Conference Context

1. **Attributes should be conference-specific by default:**
   - `[attendee.name]` (not recipient)
   - `[event.name]` (GEM India Conference 2026)
   - `[session.title]` (specific session attended)
   - `[session.date]`
   - `[certificate.type]` (Attendance, Speaker, Organizer, etc.)
   - `[certificate.id]`
   - `[qr.verification_url]`

2. **Batch types by role:** Conference needs certificates for Attendees, Speakers, Workshop Leaders, Organizers, Volunteers -- each with different templates. Certifier's "Group" concept maps well to this.

3. **Google Sheets automation** is less relevant for a conference app (data comes from registration system, not spreadsheets). Replace with direct database integration.

4. **Recipient wallet** can be simplified to a certificate verification page within the conference app itself rather than a standalone portal.

5. **Multi-language support** is relevant for an India conference (Hindi, English at minimum).

### What to Skip

1. **OpenBadge 3.0 compliance** -- overkill for a conference certificate; adds complexity without proportional value.
2. **Issuer KYC process** -- the conference IS the issuer; no third-party trust verification needed.
3. **Zapier/Make/Pipedream integrations** -- not needed for a self-contained conference app.
4. **LinkedIn "Add to Profile"** -- nice-to-have, not MVP.
5. **Expiration dates on certificates** -- conference attendance certificates do not expire.

### Architecture Insights

- Certifier separates **Design** (template), **Group** (batch/credential set), and **Recipient** (individual credential) as distinct entities. This three-layer model is clean and worth adopting.
- The attribute system is essentially a **template variable engine** -- straightforward to implement with any templating library.
- QR codes are generated at **issuance time** (not design time) -- each one is unique. The QR encodes a URL pointing to the verification endpoint.
- Verification is a simple **UUID lookup** against a central database -- no blockchain or complex cryptography needed.
- Email delivery uses a separate **email template** from the certificate template -- two distinct design surfaces.

---

## 14. Sources

### Primary Sources (Fetched)
- [Certifier.io Homepage](https://certifier.io)
- [Certifier Features Page](https://certifier.io/features)
- [Certifier Template Gallery](https://certifier.io/certificate-templates)
- [Certifier QR Code Feature Page](https://certifier.io/features/design/create-certificate-with-qr-code)
- [Certifier Verification Features](https://certifier.io/features/verifiable-credentials)

### Help & Documentation (Fetched)
- [How to Create a Certificate Template Using Certifier Design Builder](https://support.certifier.io/en/articles/10770704-how-to-create-a-certificate-template-using-certifier-design-builder)
- [Guide to Attributes -- Using Dynamic and Custom Fields in Designs](https://support.certifier.io/en/articles/10770697-guide-to-attributes-using-dynamic-and-custom-fields-in-designs)
- [Default Sender and Email Template for Certificates](https://support.certifier.io/en/articles/10770732-default-sender-and-email-template-for-certificates-in-certifier)

### Blog Posts (Fetched)
- [How to Use Certifier Bulk Certificate Generator](https://certifier.io/blog/how-to-create-and-issue-certificates-in-bulk-using-certifier)
- [How to Use Dynamic Attributes to Create and Send Certificates in Bulk](https://certifier.io/blog/how-to-use-dynamic-attributes-to-create-and-send-certificates-in-bulk)
- [How to Send Certificates Through Email in Bulk -- 3 Ways](https://certifier.io/blog/how-to-send-an-email-with-certificates-to-multiple-recipients-3-ways-to-do-it)
- [How to Create a Certificate with a QR Code](https://certifier.io/blog/how-to-create-a-certificate-with-a-qr-code)

### Search Queries Used
- "Certifier.io template editor walkthrough drag and drop design"
- "Certifier.io bulk certificate generation CSV upload column mapping"
- "Certifier.io certificate delivery email customization download link"
- "Certifier.io dynamic attributes placeholders custom fields certificate"
- "Certifier.io QR code verification certificate credential validation"
