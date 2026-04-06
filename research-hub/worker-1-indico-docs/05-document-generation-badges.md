# Indico — Document Generation (Badges, Certificates, Receipts)

**Source pages:**  
- https://indico.docs.cern.ch/document_templates/templates/ (Creating a Template)  
- https://indico.docs.cern.ch/document_templates/generating/ (Generating a Document)  
**Note:** The old "Badges and Posters" page (/conferences/badges_and_posters/) no longer exists. It has been replaced by the Document Generation system.

---

## Navigation Structure

Document Generation section in sidebar:
1. Introduction — /document_templates/about/
2. Creating a Template — /document_templates/templates/
3. Generating a Document — /document_templates/generating/

---

## 1. Creating a Template

### Overview
Indico lets you define templates for various document types including:
- **Receipts**
- **Certificates**
- **Badges** (via Print Badges action)
- Any custom document type

Templates use **HTML with Jinja2 templates** for layout, content, and dynamic data placeholders.  
Templates also use **CSS** for styling and **YAML** for custom field definitions.

### Security Note (indico.cern.ch)
On the CERN instance, end users cannot create their own templates for security reasons. Custom templates must be requested from administrators.

### Configuration
- Requires knowledge of HTML and CSS
- Restricted to Indico admins by default
- Additional trusted users can be granted template creation rights
- Managed in **Document Templates** section of Indico administration page

### Creating a Template

Templates can be created at two levels:
- **Event level** — available for that event only (Customisation tab in event management)
- **Category level** — available for all events in that category (Document Templates tab)

#### Template Creation Fields
| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Template name |
| **Default filename** | No | Filename pattern for generated documents |

#### Template Editor
- Code editor with three sections:
  - **HTML** — layout with Jinja2 template syntax for dynamic data
  - **CSS** — styling
  - **metadata.yaml** — custom field definitions

### Defining Custom Fields (metadata.yaml)

Custom fields appear as parameters when generating documents from the template.

#### Field Schema

```yaml
custom_fields:
  - type: <field_type>      # Required: checkbox, dropdown, input, textarea
    name: <identifier>       # Required: unique field identifier
    attributes:              # Required: properties of the element
      label: <string>        # Required: description of expected input
      value: <default>       # Optional: pre-filled value
      options: [<array>]     # Required for dropdown: array of options
      default: <index>       # Optional for dropdown: preselected option index
    validations:             # Optional
      required: <boolean>    # Optional: prevents submission until completed
```

#### Available Field Types

| Type | Description | Unique Attributes |
|------|-------------|-------------------|
| **textarea** | Multi-line text field | value (pre-filled text) |
| **input** | Single-line text field | value (pre-filled text) |
| **dropdown** | Dropdown menu | options (array), default (index) |
| **checkbox** | Checkbox | value (boolean, default false) |

---

## 2. Generating a Document

### Flow
1. Open **registrations list** for your event
2. **Select registrations** for which to generate documents
3. Click **Generate Documents** under **Actions** dropdown

### Actions Dropdown (from registration list)
The Actions dropdown on the registration list offers these document-related options:
- **E-mail** — send email to selected registrants
- **Print Badges** — generate badge documents
- **Print Tickets** — generate ticket documents
- **Generate Documents** — generate from any template (highlighted)
- **Download Documents (Single PDF)** — combined PDF
- **Download Documents (Separate PDFs)** — individual PDFs
- **Download Attachments** — download uploaded files
- **Edit Tags** — manage registration tags

### Generation Dialog Options

| Option | Description |
|--------|-------------|
| **Template selection** | Choose which template to use |
| **Template parameters** | Custom fields defined in the template's metadata.yaml |
| **Filename** | Custom filename (format: `<filename>-<timestamp>.pdf`, duplicates: `<filename>-<timestamp>-<n>.pdf`) |
| **Publish document** | If selected, visible to participant on their registration details page. Otherwise, only visible to event managers (can be published individually later). |
| **Notify registrants via e-mail** | If Publish is selected: sends email with link to registration details. Otherwise: sends document as email attachment. |

### Bulk Operations
- Documents generated in bulk for any number of registrations
- Download all as **ZIP archive** or **single PDF** containing all documents
- Documents accessible from each registration's details page

---

## Key Observations for G.I.C.A. Reference

### Template System Architecture
- **HTML/Jinja2-based** — full control over layout via code
- **Not drag-and-drop** — requires HTML/CSS knowledge (admin-only on CERN instance)
- **Dynamic data placeholders** — attendee names, event details, registration info via Jinja2 variables
- **Custom parameters** — YAML-defined fields (input, textarea, dropdown, checkbox)

### Badge/Certificate Workflow
1. Admin creates HTML/CSS template with Jinja2 placeholders
2. Manager selects registrations → Actions → Print Badges / Generate Documents
3. Template populated with each registrant's data
4. Output: PDF documents (individual or bulk)
5. Option to publish to registrant's profile or email directly

### Comparison to Old Badge System
The previous "Badges and Posters" system used a visual drag-and-drop editor. The new Document Generation system is code-based (HTML/Jinja2), offering more flexibility but requiring technical skills.
