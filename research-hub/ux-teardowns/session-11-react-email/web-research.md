# Session 11: React Email -- Web Research
**Module:** Email Communications (#6)
**Date:** 2026-04-05
**Sources:** react.email, react.email/templates, react.email/components, reactemailtemplates.com, postmarkapp.com

---

## 1. Platform Overview

React Email is an open-source library (by Resend) for building email templates using React components and TypeScript. Instead of writing raw HTML tables, you compose emails from semantic components (`<Button>`, `<Section>`, `<Container>`) that compile to cross-client compatible HTML at build time. It ships with production-quality recreations of emails from Stripe, Vercel, Notion, Linear, AWS, Apple, and Nike.

**Relevance to GEM India:** React Email defines the modern standard for transactional email layout patterns. By studying its template gallery, we extract the exact section ordering, personalization patterns, and responsive design conventions our email templates should follow -- whether we build with React Email directly or implement equivalent patterns in a drag-and-drop builder.

---

## 2. Component Library

### Layout Components
| Component | Purpose | Key Props |
|---|---|---|
| `<Html>` | Root wrapper, sets `lang` and `dir` | `lang="en"` |
| `<Head>` | Email `<head>` for meta/styles | Children: `<Font>`, `<style>` |
| `<Body>` | Email body wrapper | `style` for background color |
| `<Container>` | Centers content horizontally; **max-width 600px** recommended | `style={{ maxWidth: '600px' }}` |
| `<Section>` | Groups related content (like `<div>`) | `style` for padding/background |
| `<Row>` | Horizontal row layout | Used with `<Column>` children |
| `<Column>` | Column within a row | Width as percentage or fixed |

### Content Components
| Component | Purpose | Key Props |
|---|---|---|
| `<Text>` | Paragraph text | `style` for font/color/size |
| `<Heading>` | H1-H6 headings | `as="h1"` through `as="h6"` |
| `<Button>` | CTA button with link | `href`, `style` for color/padding |
| `<Link>` | Hyperlink | `href`, `style` |
| `<Img>` | Image with alt text | `src`, `alt`, `width`, `height` |
| `<Hr>` | Horizontal divider | `style` for color/thickness |
| `<Preview>` | Preview text (inbox snippet) | Children: preview string |

### Utility Components
| Component | Purpose |
|---|---|
| `<Font>` | Load web fonts via `<Head>` |
| `<Tailwind>` | Wrap email in Tailwind CSS support |
| `<CodeBlock>` | Syntax-highlighted code |
| `<CodeInline>` | Inline code snippet |
| `<Markdown>` | Render markdown as email HTML |

### Styling Approach
- **Inline styles:** Pass `style` objects to every component (most compatible)
- **Tailwind CSS:** Wrap entire email in `<Tailwind>` component; use `className` with Tailwind utilities. Compiled to inline styles at render time.
- **Custom CSS:** Add `<style>` in `<Head>` (less reliable across clients)

---

## 3. Standard Email Layout Pattern

Based on analysis of React Email's template gallery (Stripe, Vercel, Linear, Notion, AWS, Apple, Nike), the dominant layout pattern is:

```
+------------------------------------------+
|  Body (background: #f6f9fc)              |
|  +------------------------------------+  |
|  |  Container (max-width: 600px)      |  |
|  |  +------------------------------+  |  |
|  |  |  LOGO (centered or left)     |  |  |
|  |  +------------------------------+  |  |
|  |  |  Hr (divider)                |  |  |
|  |  +------------------------------+  |  |
|  |  |  GREETING                    |  |  |
|  |  |  "Hi {{name}},"             |  |  |
|  |  +------------------------------+  |  |
|  |  |  BODY TEXT                   |  |  |
|  |  |  1-3 short paragraphs       |  |  |
|  |  +------------------------------+  |  |
|  |  |  CTA BUTTON (centered)      |  |  |
|  |  |  [Primary Action]           |  |  |
|  |  +------------------------------+  |  |
|  |  |  SECONDARY INFO (optional)  |  |  |
|  |  |  Details table / list       |  |  |
|  |  +------------------------------+  |  |
|  |  |  Hr (divider)                |  |  |
|  |  +------------------------------+  |  |
|  |  |  FOOTER                     |  |  |
|  |  |  Company, address, unsub    |  |  |
|  |  +------------------------------+  |  |
|  +------------------------------------+  |
+------------------------------------------+
```

### Common Layout Constants
- **Email width:** 600px max (universal standard)
- **Body background:** Light gray (#f6f9fc or #ffffff)
- **Content padding:** 20-40px horizontal
- **Section spacing:** 16-32px vertical
- **Font:** System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- **Text color:** Dark gray (#333 or #484848)
- **Button style:** Solid background, white text, 12-16px padding, border-radius 4-8px

---

## 4. Template Categories & GEM India Matches

### 4A. Registration Confirmation (maps to: Welcome / Signup Confirmation)

**Source templates:** Vercel Welcome, Stripe Welcome, Postmark Welcome

**Layout Order:**
1. Logo (centered, ~40-50px height)
2. Horizontal rule
3. Greeting: "Hi {{username}}," or "Welcome to {{platform}}"
4. Confirmation message: 1-2 sentences confirming registration
5. Account details summary (optional): email, plan, date
6. Primary CTA button: "Verify Email" or "Get Started" or "View Dashboard"
7. Fallback link text: "If the button doesn't work, copy this URL: {{verification_url}}"
8. Horizontal rule
9. Footer: company name, address, unsubscribe link

**Personalization Variables:**
- `{{username}}` or `{{first_name}}`
- `{{email}}`
- `{{verification_url}}`
- `{{event_name}}` (for our use case)
- `{{registration_date}}`

**Tone:** Warm, concise, action-oriented. 50-100 words body copy.

**GEM India Adaptation:**
```
1. GEM India logo (event-specific)
2. Divider
3. "Hi {{delegate_name}},"
4. "Your registration for {{event_name}} is confirmed!"
5. Details table: Event date, venue, registration ID, role
6. CTA: "View Your Itinerary"
7. Fallback URL
8. Divider
9. Footer: GEM India, contact, unsubscribe
```

---

### 4B. Itinerary / Travel Booking (maps to: Booking Confirmation / Travel Details)

**Source templates:** Postmark Receipt, Stripe Invoice, Airbnb-style booking confirmations

**Layout Order:**
1. Logo
2. Greeting: "Hi {{name}},"
3. Confirmation headline: "Your booking is confirmed" or "Booking #{{booking_id}}"
4. **Details table/card** (key section):
   - Event/property name
   - Date range (check-in / check-out or event start/end)
   - Location with address
   - Booking reference number
5. **Line items** (if applicable): sessions, tickets, add-ons with pricing
6. **Total / summary row**
7. Primary CTA: "View Booking Details" or "Manage Reservation"
8. Secondary info: cancellation policy, contact support
9. Map image or venue directions (optional)
10. Footer

**Personalization Variables:**
- `{{name}}`
- `{{booking_id}}` / `{{registration_id}}`
- `{{event_name}}`
- `{{event_date}}`
- `{{venue_name}}`
- `{{venue_address}}`
- `{{session_list}}` (dynamic itinerary items)
- `{{total_amount}}`

**Tone:** Informational, structured, scannable. Uses tables/cards for data density.

**GEM India Adaptation:**
```
1. Event logo
2. "Hi {{delegate_name}},"
3. "Your schedule for {{event_name}} is ready"
4. Details card:
   - Conference: {{event_name}}
   - Dates: {{start_date}} - {{end_date}}
   - Venue: {{venue_name}}, {{venue_address}}
   - Role: {{role}}
   - ID: {{registration_id}}
5. Session table:
   | Time | Session | Room | Speaker |
6. CTA: "View Full Itinerary"
7. Note: "Schedule subject to change"
8. Footer
```

---

### 4C. Role Assignment / Invitation (maps to: User Invitation / Team Invite)

**Source templates:** Vercel Invite User, Linear Login Code, Notion Magic Link, Postmark User Invitation

**Layout Order:**
1. Logo
2. Greeting: "Hi {{name}}," or "Hello,"
3. Invitation message: "{{inviter_name}} has invited you to join {{team_name}}" or "You've been assigned the role of {{role}}"
4. Context block: team/project/event description (2-3 sentences)
5. **Primary CTA button:** "Accept Invitation" or "Join {{team_name}}"
6. Expiration notice: "This invitation expires in {{expiry_hours}} hours"
7. Fallback URL
8. Secondary note: "If you weren't expecting this, you can ignore this email"
9. Footer

**Personalization Variables:**
- `{{recipient_name}}`
- `{{inviter_name}}`
- `{{team_name}}` / `{{event_name}}`
- `{{role}}` (speaker, volunteer, organizer, judge)
- `{{invitation_url}}`
- `{{expiry_date}}`
- `{{responsibilities}}` (optional: what the role entails)

**Tone:** Professional, clear, with urgency (expiration). 60-80 words body.

**GEM India Adaptation:**
```
1. GEM India logo
2. "Hi {{name}},"
3. "You've been assigned as {{role}} for {{event_name}}"
4. Role details card:
   - Role: {{role}}
   - Event: {{event_name}}
   - Date: {{event_date}}
   - Responsibilities: {{role_description}}
5. CTA: "Accept & View Details"
6. "Please respond by {{deadline}}"
7. Fallback URL
8. Footer
```

---

### 4D. Certificate Delivery (maps to: Document Download / Attachment Notification)

**Source templates:** Postmark Receipt (adapted), Stripe Payment Confirmation with PDF, generic download notification patterns

**Layout Order:**
1. Logo
2. Greeting: "Hi {{name}},"
3. Congratulations message: "Your certificate is ready" or "Congratulations on completing {{event_name}}"
4. Certificate preview image (optional thumbnail)
5. Details summary:
   - Recipient name
   - Event/course name
   - Completion date
   - Certificate ID
6. **Primary CTA button:** "Download Certificate" (links to PDF or secure download URL)
7. Secondary link: "View in browser" or "Add to LinkedIn"
8. Validity note: "This link expires on {{expiry_date}}"
9. Footer

**Personalization Variables:**
- `{{recipient_name}}`
- `{{event_name}}`
- `{{completion_date}}`
- `{{certificate_id}}`
- `{{download_url}}`
- `{{certificate_type}}` (participation, achievement, speaker)
- `{{linkedin_add_url}}` (optional)

**Tone:** Celebratory but professional. 40-60 words body.

**Download Pattern:** Email clients block attachments inconsistently. Best practice is a **secure download link** (time-limited signed URL) rather than an inline attachment. The CTA button links to a download page or directly to the PDF.

**GEM India Adaptation:**
```
1. GEM India logo
2. "Hi {{delegate_name}},"
3. "Congratulations! Your certificate for {{event_name}} is ready."
4. Certificate thumbnail image
5. Details:
   - Name: {{delegate_name}}
   - Event: {{event_name}}
   - Date: {{event_date}}
   - Certificate: {{certificate_type}}
   - ID: {{certificate_id}}
6. CTA: "Download Certificate"
7. Link: "Add to LinkedIn"
8. "Download link valid until {{expiry_date}}"
9. Footer
```

---

## 5. Responsive Design Patterns

### React Email Approach
- **Container max-width 600px** is the universal standard; content fills 100% on mobile
- **Single-column layout** is default and most reliable across clients
- **Multi-column (Row/Column)** stacks vertically on mobile automatically
- **Images:** Always set `width` and `height` attributes; use `max-width: 100%` for responsiveness
- **Buttons:** Full-width on mobile via `width: 100%` media query or generous padding
- **Font sizes:** Minimum 14px body, 22-28px headings for mobile readability
- **Padding:** Reduce horizontal padding from 40px to 20px on mobile

### Cross-Client Testing
React Email templates are tested across:
- Gmail (web + mobile)
- Apple Mail (macOS + iOS)
- Outlook (Windows desktop + web)
- Yahoo Mail
- Samsung Mail
- Thunderbird

### Key Responsive Rules for GEM India
1. Always design for **single-column first**
2. Use **600px max-width container**
3. **System font stack** (no custom web fonts for reliability)
4. **Inline styles** for maximum compatibility
5. **Button minimum touch target:** 44px height on mobile
6. **Preview text** via `<Preview>` component -- controls inbox snippet (first 90 chars)

---

## 6. Integration Pattern: React Email + Email Provider

### Rendering Flow
```
React Component (.tsx)
    |
    v
render() function  -->  HTML string
    |
    v
Email Provider API (Resend, SendGrid, Postmark, AWS SES)
    |
    v
Delivered to recipient
```

### Variable Injection Pattern
```tsx
// Template accepts props
function RegistrationEmail({ name, eventName, itineraryUrl }) {
  return (
    <Html>
      <Body>
        <Container>
          <Text>Hi {name},</Text>
          <Text>Welcome to {eventName}!</Text>
          <Button href={itineraryUrl}>View Itinerary</Button>
        </Container>
      </Body>
    </Html>
  );
}

// Render with data at send time
const html = render(<RegistrationEmail
  name="Shailesh"
  eventName="GEM India 2026"
  itineraryUrl="https://gem.india/itinerary/abc123"
/>);

// Send via provider
await resend.emails.send({ html, to: "...", subject: "..." });
```

### GEM India Integration Options
| Option | Pros | Cons |
|---|---|---|
| **React Email + Resend** | Modern DX, type-safe templates, easy preview | Requires Node.js runtime |
| **React Email + SendGrid** | Established deliverability | More setup overhead |
| **Pre-rendered HTML + any ESP** | Render at build time, use with any provider | Lose dynamic rendering |
| **Stripo export + ESP** | No-code template creation | Less developer control |

---

## 7. Postmark Transactional Template Set (Reference Collection)

Postmark provides 10 production-ready templates via their open-source MailMason framework, all tested across major email clients. These serve as the canonical transactional email pattern set:

| Template | Use Case | Key Sections |
|---|---|---|
| **Welcome** | New user signup | Logo, greeting, feature highlights, CTA |
| **Password Reset** | Security flow | Logo, warning text, reset button, expiry |
| **Receipt** | Payment confirmation | Logo, line items table, total, support link |
| **Invoice** | Billing | Logo, invoice details, line items, payment CTA |
| **Trial Expiring** | Retention | Logo, urgency text, upgrade CTA, comparison |
| **Trial Expired** | Win-back | Logo, value prop, re-activate CTA |
| **User Invitation** | Team invite | Logo, inviter context, accept CTA, expiry |
| **Comment Notification** | Activity alert | Logo, quoted content, reply CTA |
| **Dunning** | Failed payment | Logo, payment issue, update CTA, urgency |
| **Confirmation** | Action verification | Logo, action summary, confirm CTA, ignore note |

### Layout Shared by All Postmark Templates
- **Reusable Layout wrapper:** Shared CSS, header (logo), and footer across all templates
- **Mustachio variables:** `{{name}}`, `{{action_url}}`, `{{company_name}}`, etc.
- **Single-column, 600px max-width**
- **Consistent CTA button style** across all templates

---

## 8. Key Takeaways for GEM India App

### Template Set We Need (Mapped from Research)

| GEM India Email | Pattern Source | Priority |
|---|---|---|
| Registration Confirmation | Welcome + Confirmation | P0 |
| Event Itinerary | Receipt/Invoice (table layout) | P0 |
| Role Assignment Notification | User Invitation | P0 |
| Certificate Delivery | Receipt + Download link | P1 |
| Schedule Change Alert | Comment Notification | P1 |
| Payment Receipt | Receipt/Invoice | P1 |
| Password Reset | Password Reset | P2 |
| Event Reminder | Trial Expiring (urgency pattern) | P2 |

### Universal Layout Rules
1. **600px max-width container** on light gray background
2. **Event logo** top-center, 40-50px height
3. **Personalized greeting** as first text element
4. **Primary CTA button** always present, centered, high contrast
5. **Fallback URL** below button for clients that block buttons
6. **Footer:** Event name, organizer, contact email, unsubscribe link
7. **Preview text** (inbox snippet) set deliberately for every email

### Personalization Variable Standard
Adopt a consistent naming convention across all templates:
```
{{delegate_name}}      -- Recipient's full name
{{delegate_email}}     -- Recipient's email
{{event_name}}         -- Conference/event title
{{event_date}}         -- Event date(s)
{{event_venue}}        -- Venue name and address
{{role}}               -- Assigned role
{{registration_id}}    -- Unique registration reference
{{itinerary_url}}      -- Link to personal schedule
{{certificate_url}}    -- Link to download certificate
{{dashboard_url}}      -- Link to attendee dashboard
{{unsubscribe_url}}    -- Unsubscribe link
```

### Technology Recommendation
For GEM India, a **hybrid approach** is recommended:
- **React Email** for defining template structure and components (developer-controlled, version-controlled, type-safe)
- **Stripo-inspired brand kit system** in the admin UI for non-technical organizers to swap logos, colors, and event details per conference
- **Resend or SendGrid** as the email delivery provider
- **Pre-render templates** at build time with variable slots, inject data at send time

---

## Sources
- [React Email - Main Site](https://react.email)
- [React Email Templates Gallery](https://react.email/templates)
- [React Email Components](https://react.email/components)
- [React Email Container Docs](https://react.email/docs/components/container)
- [React Email GitHub](https://github.com/resend/react-email)
- [Postmark Transactional Email Templates](https://postmarkapp.com/transactional-email-templates)
- [Postmark Layouts](https://postmarkapp.com/support/article/1172-using-postmark-layouts)
- [Free React Email Templates for SaaS](https://reactemailtemplates.com/blog/react-email-templates-examples)
- [LogRocket: Streamline Email Creation with React Email](https://blog.logrocket.com/streamline-email-creation-react-email/)
- [FreeCodeCamp: React Email + Resend in Next.js](https://www.freecodecamp.org/news/create-and-send-email-templates-using-react-email-and-resend-in-nextjs/)
