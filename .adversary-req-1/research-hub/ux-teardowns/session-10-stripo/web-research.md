# Session 10: Stripo.email -- Web Research
**Modules:** Branding & Letterheads (#14), Email Communications (#6)
**Date:** 2026-04-05
**Sources:** stripo.email, support.stripo.email, stripo.email/blog

---

## 1. Platform Overview

Stripo is an email design platform used by 65% of Fortune 100 companies and over 1.7 million users. It provides a dual editor (drag-and-drop + HTML/CSS code), 1,650+ free templates, 300+ pre-built modules, export to 90+ ESPs, and real-time team collaboration. Rated 4.8/5 on G2 and 4.9/5 on Capterra.

**Relevance to GEM India:** Stripo's brand kit + template + module system maps directly to our per-event branding and email communications modules. The ability to maintain multiple brand kits and swap them across templates is exactly the workflow we need for multi-event conference management.

---

## 2. Brand Kit / Brand Guidelines

### What the Brand Kit Contains
- **Design Standards Document (PDF):** Font families, sizes, weights; primary/secondary colors; paddings within containers; indents between containers; button styles (shape, color, radius); social media icon design
- **Template Assets:** Images and HTML/CSS code extracted from selected templates
- **Content Modules:** Reusable email components with preview images and code files
- **Brand Assets:** Logo files, favicon, custom uploaded files
- **Contact Information:** Social media links, website URL, company details

### Setup Process (3 Steps)
1. **Configure Kit Settings:** Select project, choose source templates to extract styles from, set primary color for the PDF document, toggle which additional assets to include
2. **Add Contact Information:** Company name, logo upload, social media links (configured in Brand Guidelines Settings)
3. **Download/Share:** Preview the generated kit, download as archive, or share directly with team

### Multiple Brand Kits
- Each Stripo **project** can have its own Brand Guidelines kit
- You generate a different kit per project -- so for GEM India, each event/conference could be a separate project with its own brand kit
- Teams can create unlimited projects on paid plans, each with distinct brand guidelines
- Brand kits can be shared with external designers/agencies without giving editor access

### Applying Brand Kit to Templates
- Brand guidelines extracted from existing templates serve as the "source of truth"
- New designers reference the PDF for exact font sizes, colors, paddings
- **Synchronized modules** propagate style changes globally -- edit once, update everywhere
- Bulk editing allows simultaneous updates across multiple templates (e.g., changing contact info in all footers at once)

### GEM India Application
| Stripo Concept | GEM India Mapping |
|---|---|
| Project = one brand kit | One project per conference/event |
| Brand Guidelines PDF | Style guide for event-specific emails |
| Synchronized modules | Shared header/footer across all event emails |
| Bulk edit | Update event branding across all templates at once |

---

## 3. Drag-and-Drop Editor

### Editor Hierarchy (Top to Bottom)
1. **Stripe** -- Top-level horizontal band spanning full email width. Contains structures.
2. **Structure** -- Layout row within a stripe. Can hold 1-11 containers (columns) side by side.
3. **Container** -- Individual column within a structure. Holds unlimited blocks stacked vertically.
4. **Block** -- Smallest unit. The actual content element.

### Available Block Types (13 Basic Blocks)
| Block | Description |
|---|---|
| **Text** | Rich text with formatting toolbar |
| **Image** | Upload or link; responsive sizing |
| **Button** | CTA with customizable shape, color, size, link |
| **Spacer** | Vertical spacing/divider |
| **Social** | Social media icon set with links |
| **Menu** | Navigation links (horizontal/vertical) |
| **HTML** | Custom HTML code block |
| **Banner** | Image-based banner with overlay text |
| **Video** | Embedded video thumbnail with play button |
| **Timer** | Countdown timer (dynamic) |
| **AMP Elements** | 3 interactive AMP blocks (carousel, accordion, form) |

### Editor UX Patterns
- **Left panel:** Content blocks, structures, modules library
- **Center:** Live canvas with inline editing
- **Right panel:** Settings for selected element (Appearance, Data, Conditions tabs)
- **Drag-and-drop:** Drag blocks from left panel into canvas; drag structures for layout
- **Inline editing:** Click any text to edit directly; double-click images to replace
- **Structure insertion:** "+" icon at bottom-left of stripes to add new structures
- **Mobile preview toggle:** Switch between desktop and mobile view

---

## 4. Merge Tags / Personalization

### How Merge Tags Work
Merge tags are placeholder codes (e.g., `{{first_name}}`) that get replaced with recipient-specific data when the email is sent through an ESP.

### Configuration Levels
- **Project level:** Tags apply to a single project
- **Group level:** Tags standardize across all projects in a group

### Tag Types
1. **Built-in ESP Tags:** Pre-configured for major ESPs (Mailchimp, GetResponse, eSputnik, etc.). Automatically replaced with ESP-specific syntax on export.
2. **Custom Tags:** User-defined tags created via Workspace > Personalization settings. Support custom display labels and preview values.

### Display Modes in Editor
| Mode | What You See |
|---|---|
| **Raw** | The actual tag code: `{{FirstName}}` |
| **Label** | A visual label: `[First Name]` |
| **Value** | A preview value: `John` |

### Special Links
- Frequently-used dynamic links (unsubscribe, preference center, etc.) can be saved as "Special Links"
- Applied via text highlight > chain icon > protocol selection > Personalization tab
- Support UTM parameter auto-appending after export

### GEM India Merge Tag Mapping
| Stripo Tag Pattern | GEM India Variable |
|---|---|
| `{{first_name}}` | Delegate name |
| `{{event_name}}` | Conference/event title |
| `{{role}}` | Assigned role (speaker, volunteer, delegate) |
| `{{schedule_link}}` | Personal itinerary URL |
| `{{certificate_link}}` | Certificate download URL |
| `{{venue_address}}` | Event venue details |

---

## 5. Template Management & Organization

### Saving Templates
- Save any email as a template for reuse
- Templates stored within their parent project
- Duplication: copy a template and modify for different events

### Module System (Reusable Components)
- **My Modules:** Custom-saved modules (header, footer, content blocks)
- **Template Modules:** Designer-created modules matching specific template styles
- **General Library:** 250+ pre-designed modules including smart/AMP elements

### Saving a Custom Module
1. Hover over element (container, structure, or stripe)
2. Click "Save as module"
3. Assign name, description, category
4. Add tags for organization/grouping
5. Toggle "Keep module styles" (preserves formatting)
6. Toggle "Synchronization" (changes propagate to all instances)

### Organization Features
- **Projects:** Top-level folders grouping related templates
- **Tags on modules:** Group modules by custom tags; filter in the Structures & Modules panel
- **Search:** Type-filtered search across module library
- **Synchronized modules:** Edit once, auto-update everywhere the module is used
- **Bulk editing:** Update contact info, links, or styles across all templates simultaneously

### Template Duplication Workflow (Per-Event Branding)
1. Create master template with brand kit A (e.g., GEM India 2026)
2. Duplicate template
3. Swap brand kit elements (logo, colors, header image)
4. Save as new template in different project
5. Synchronized modules (footer, social links) remain linked

---

## 6. Export & Preview

### Export Options
| Method | Description |
|---|---|
| **ESP Push** | One-click export to 90+ ESPs (Mailchimp, HubSpot, Klaviyo, etc.) |
| **HTML Download** | Clean HTML file for manual integration |
| **PDF Download** | PDF version of the email |
| **Image Download** | Screenshot/image of the email |
| **Zapier/Webhook** | Automated export via integration |

### Multi-Client Preview
- Built-in desktop/mobile preview toggle
- **Email on Acid integration:** Test rendering across 98+ email clients (Gmail, Outlook, Apple Mail, Yahoo, Samsung Mail, etc.)
- Customizable screenshot sets by client
- Test send to multiple email addresses (limit varies by plan)

### Key Export Behaviors
- Merge tags auto-convert to ESP-specific syntax on export
- Synchronized modules maintain linkage after push to ESP
- "Automatic replacement" feature: editing a trigger email in Stripo auto-updates the version already in your ESP workflow

---

## 7. Collaboration Features

### Team Roles
- **Designer:** Full edit access
- **Writer:** Content editing only
- **Proofreader:** Review and comment
- **Viewer:** Read-only access
- Custom role configuration available

### Collaboration UX
- Real-time co-editing (Google Docs style)
- Shareable web preview links for external review
- Approval workflows via shared links
- Brand guidelines sharing with external agencies

---

## 8. Additional Capabilities

| Feature | Description |
|---|---|
| **AI Assistant** | Generates email copy, suggests subject lines, plans campaign schedules |
| **Gamification** | Mini-games, quizzes, surveys embeddable without code |
| **Translation** | Google Translate built into editor; auto-export multi-language versions |
| **AMP Emails** | Interactive emails with carousels, accordions, forms |
| **Countdown Timers** | Dynamic timers that update in real-time |

---

## 9. Key Takeaways for GEM India App

### What to Adopt
1. **Project-per-event model** -- Each GEM conference = one Stripo project with its own brand kit. Our app should mirror this: event-level branding that cascades to all email templates.
2. **Synchronized modules** -- Shared header/footer components that auto-update across all emails for an event. Critical for consistency when updating venue info or social links.
3. **Merge tag architecture** -- ESP-agnostic placeholders with display modes. Our template system should support `{{variable}}` syntax with preview values.
4. **Module library** -- Reusable content blocks (agenda section, speaker card, map embed) saved and tagged for quick assembly.
5. **Bulk brand updates** -- Change logo/colors once, propagate everywhere. Essential for white-label event management.

### What to Simplify
1. Stripo's 4-level hierarchy (stripe > structure > container > block) may be overkill. Our app likely needs: **section > row > block** (3 levels).
2. 13 block types can be reduced to 6-8 for conference emails: text, image, button, spacer/divider, social links, custom HTML.
3. ESP export complexity unnecessary if we send directly via our own email service (e.g., Resend, SendGrid).

### Design Patterns to Reference
- Brand kit as downloadable PDF + live style enforcement
- Module synchronization toggle (opt-in per module)
- Drag-and-drop with inline editing on canvas
- Desktop/mobile preview toggle in editor
- Tag-based module organization

---

## Sources
- [Stripo.email - Main Site](https://stripo.email)
- [Stripo Template Gallery](https://stripo.email/templates/)
- [Brand Guidelines Blog Post](https://stripo.email/blog/template-kits-or-how-to-get-template-guidelines-and-brand-assets-in-one-place/)
- [Merge Tags / Personalization Help](https://support.stripo.email/en/articles/8560549-personalization-configuration-create-a-list-of-dynamic-tags)
- [Editor Structure Help (New Editor)](https://support.stripo.email/en/articles/6448082-new-editor-how-does-stripo-editor-work)
- [Structures & Containers Help](https://support.stripo.email/en/articles/6424840-new-editor-what-are-the-structures-and-containers-how-to-use-them)
- [Stripo Plugin](https://plugin.stripo.email/)
