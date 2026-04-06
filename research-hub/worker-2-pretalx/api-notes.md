# pretalx REST API -- Comprehensive Research Notes

**Source**: https://docs.pretalx.org/api/ (pretalx v2026.1.0.dev0)
**OpenAPI Schema**: https://docs.pretalx.org/schema.yml
**Researched**: 2026-04-05

---

## 1. Authentication

- **Method**: Token-based auth via `Authorization` header.
- **Header format**: `Authorization: Token <your-token>`
- **Token management**: Created/disabled at `/orga/me` in the organiser frontend.
- **Token scoping**: Tokens are scoped to specific endpoints AND specific events. Pretalx recommends limiting tokens to only the endpoints/permissions actually needed.
- **Who can authenticate**: Only organisers and reviewers. There is no authenticated API access for regular attendees or speakers (by design -- permissions would be too complex).
- **Reviewer limitation**: Users with ONLY reviewer permissions cannot use the API while anonymised reviews are active (to prevent data leakage).
- **Public endpoints**: Some endpoints (schedule, submissions in public schedule, feedback creation) are accessible without authentication, but authenticated requests return additional data.
- **Legacy tokens**: Old API tokens (pre-v2025.1.0) continue working, scoped to the legacy API.
- **Token expiry**: Tokens with expiry date in the past are periodically deleted.

```http
GET /api/events/ HTTP/1.1
Host: pretalx.com
Authorization: Token e1l6gq2ye72thbwkacj7jbri7a7tvxe614ojv8ybureain92ocub46t5gab5966k
```

---

## 2. API Versioning

- **Mechanism**: Version is saved **the first time you use an API token**. All subsequent requests with that token use the same version.
- **Override**: Use `Pretalx-Version` header to temporarily override (e.g., `Pretalx-Version: v1`).
- **Development preview**: Send `Pretalx-Version: v-next` to opt into unstable upcoming changes.
- **Deprecation lifecycle**: When a new API version is released, the previous version is marked "deprecated" but continues working. Deprecated versions are removed in the next release (sometimes extended one more release).
- **Current versions**: v1 (released in pretalx v2025.1.0), v2 (unreleased/development preview).

### Non-breaking changes (no new version needed):
- Adding new fields to existing resources
- Changing field order within objects
- Adding new endpoints
- Making a field expandable
- Supporting new optional query parameters
- Changing search range of `?q=`
- Changing default ordering or pagination size
- Introducing or changing rate limits (expect HTTP 429)

---

## 3. Data Types and Request/Response Format

- **Format**: All responses in JSON.
- **Content-Type**: `application/json`

### Special types:
| Internal Type | JSON Representation | Example |
|---|---|---|
| datetime | ISO 8601 string with timezone | `"2017-12-27T10:00:00Z"`, `"2017-12-27T10:00:00+02:00"` |
| date | ISO 8601 string | `"2017-12-27"` |
| multi-language string | Object of locale keys | `{"en": "red", "de": "rot"}` |

### Multi-language strings:
- Default: returned as objects with locale keys.
- Add `?lang=en` query parameter to coerce all multi-language strings to a single language string, with fallback.

### List fields in PATCH updates:
- **Omit** the field to leave it unchanged.
- **Send `[]`** to clear all values.
- **Send a non-empty list** to replace entirely (NOT a merge).
- Sending `null` for a list field returns a 400 error.

---

## 4. Pagination

```json
{
    "count": 117,
    "next": "https://pretalx.example.org/api/v1/organisers/?page=2",
    "previous": null,
    "results": [...]
}
```

- **Default page size**: 50
- **Maximum page size**: 50 (configurable on self-hosted instances)
- **Decrease page size**: `?page_size=25`
- **Special**: `?page=last` to retrieve the last page
- **Fields**: `count` (total results), `next` (URL or null), `previous` (URL or null), `results` (array)

---

## 5. Resource Expansion

- Many responses return related objects by ID only by default.
- Use `?expand=<field>` to inline the full related object.
- **Multiple expansions**: `?expand=speakers,track,submission_type,slots.room`
- **Nested expansion**: `?expand=speakers.answers.question` (multiple levels deep)
- Available expansions are documented per endpoint (see below).
- **Warning**: Expansions on large endpoints (e.g. schedule) are expensive. Cache results and use responsibly.

---

## 6. Searching and Filtering

- Most list endpoints support filtering via query parameters.
- Filters can be IDs (numeric or string) or booleans (`true`/`false` as strings).
- Full-text search via `?q=<search-term>` (case insensitive).
- Ordering via `?o=<field>`.

---

## 7. File Uploads

Two-step process:
1. Upload file to `/api/upload/` with raw body, `Content-Type` and `Content-Disposition` headers.
2. Use returned file ID in subsequent requests.

```http
POST /api/upload/ HTTP/1.1
Host: pretalx.com
Authorization: Token <token>
Content-Type: image/png
Content-Disposition: attachment; filename="logo.png"
Content-Length: 1234

<raw file content>
```

Response: `{"id": "<file-id>"}`

- File IDs valid for 24 hours.
- Can only be used by the uploader.

---

## 8. Error Handling

General errors:
```json
{"detail": "Method 'DELETE' not allowed."}
```

Field-specific validation errors:
```json
{
    "amount": ["Please submit a valid integer."],
    "description": ["This field may not be blank."]
}
```

HTTP status codes: standard 400-499 for client errors, 500 for server errors.

---

## 9. Rate Limiting

- **Not formally specified** -- pretalx reserves the right to introduce or change rate limits without notice.
- Clients must be prepared to handle HTTP `429 Too Many Requests` with a `Retry-After` header.
- Heavy use of expansion on large endpoints (e.g., fully expanded schedule) is particularly sensitive.
- Best practice: apply time-outs between API calls, cache data, keep requests simple.

---

## 10. All API Endpoints

### 10.1 Root

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/` | Returns API root with pretalx and API version info, plus links |

**Root response fields**: `name`, `version`, `api_version`, `urls.events`

---

### 10.2 Events

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/api/events/` | List all events | No (public events) |
| GET | `/api/events/{event}/` | Show single event | No (if public) |

**Events are currently READ-ONLY** (no create/update/delete via API).

**Event fields** (detail view):
- `name` (multi-language string)
- `slug` (string, used as event identifier in URLs)
- `is_public` (boolean)
- `date_from` (date)
- `date_to` (date)
- `timezone` (string, e.g. "Europe/Berlin")
- `email` (organiser email)
- `primary_color` (hex color, nullable)
- `custom_domain` (URI, nullable)
- `logo` (file URL)
- `header_image` (file URL)
- `og_image` (file URL)
- `locale` (default language)
- `locales` (array of active event locales, read-only)
- `content_locales` (array of active content locales, read-only)

**Event list fields** (subset): `name`, `slug`, `is_public`, `date_from`, `date_to`, `timezone`

**Filters**: `is_public` (boolean)
**Search** (`?q=`): searches in `name`
**Ordering**: `?o=<field>`

---

### 10.3 Submissions (Proposals/Talks)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/submissions/` | List submissions | Partial (public sees only scheduled) |
| POST | `/api/events/{event}/submissions/` | Create submission | Yes |
| GET | `/api/events/{event}/submissions/{code}/` | Show submission | Partial |
| PUT | `/api/events/{event}/submissions/{code}/` | Update submission | Yes |
| PATCH | `/api/events/{event}/submissions/{code}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/submissions/{code}/` | Delete submission | Yes |

**Action endpoints** (all POST, auth required):
| Path | Description |
|------|-------------|
| `.../{code}/accept/` | Accept a submission |
| `.../{code}/reject/` | Reject a submission |
| `.../{code}/confirm/` | Confirm a submission |
| `.../{code}/cancel/` | Cancel a submission |
| `.../{code}/make-submitted/` | Reset to submitted state |
| `.../{code}/add-speaker/` | Add a speaker |
| `.../{code}/remove-speaker/` | Remove a speaker |

**Sub-resources**:
| Method | Path | Description |
|--------|------|-------------|
| POST | `.../{code}/resources/` | Upload a resource |
| DELETE | `.../{code}/resources/{resource_id}/` | Delete a resource |
| POST | `.../{code}/invitations/` | Create speaker invitation |
| DELETE | `.../{code}/invitations/{invitation_id}/` | Delete invitation |
| GET | `.../{code}/log/` | View object changelog |

**Favourites**:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events/{event}/submissions/favourites/` | List favourite submissions |
| POST | `/api/events/{event}/submissions/{code}/favourite/` | Add to favourites |
| DELETE | `/api/events/{event}/submissions/{code}/favourite/` | Remove from favourites |

**Submission fields** (public):
- `code` (string, read-only, unique identifier like "ABCDEF")
- `title` (string, max 200)
- `speakers` (array of speaker codes, read-only)
- `submission_type` (integer ID)
- `track` (integer ID, nullable)
- `tags` (array of integer IDs)
- `state` (read-only enum: `submitted`, `accepted`, `confirmed`, `rejected`, `canceled`, `withdrawn`, `draft`)
- `abstract` (string, nullable)
- `description` (string, nullable)
- `duration` (integer, minutes)
- `slot_count` (integer, how many times session occurs)
- `content_locale` (string, language code)
- `do_not_record` (boolean)
- `image` (file URL)
- `resources` (array of IDs, read-only)
- `slots` (array of slot IDs, read-only)
- `answers` (array of answer IDs, read-only)

**Additional organiser-only fields** (SubmissionOrga):
- `pending_state` (enum, nullable)
- `is_featured` (boolean)
- `notes` (string, nullable -- organiser notes, not public)
- `internal_notes` (string, nullable)
- `invitation_token` (string)
- `access_code` (integer, nullable)
- `review_code` (string, nullable)
- `anonymised_data` (string, nullable)
- `reviews` (array of review IDs)
- `assigned_reviewers` (array of user strings)
- `is_anonymised` (boolean, read-only)
- `median_score` (float, nullable, read-only)
- `mean_score` (float, nullable, read-only)
- `created` (datetime, read-only)
- `updated` (datetime, read-only)
- `invitations` (array of IDs, read-only)

**Expandable fields**: `speakers`, `track`, `submission_type`, `tags`, `slots`, `slots.room`, `answers`, `answers.question`, `answers.options`, `reviews`

**Filters**: `state`, `content_locale`, `submission_type`, `track`, `tags`, `is_featured`, `q` (searches title)

---

### 10.4 Speakers

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/speakers/` | List speakers | Partial |
| GET | `/api/events/{event}/speakers/{code}/` | Show speaker | Partial |
| PUT | `/api/events/{event}/speakers/{code}/` | Update speaker | Yes |
| PATCH | `/api/events/{event}/speakers/{code}/` | Partial update | Yes |

**Speakers CANNOT be created or deleted via API** (they are tied to user objects).

**Speaker fields** (public):
- `code` (string, read-only)
- `name` (string)
- `biography` (string, nullable)
- `submissions` (array of submission codes, read-only)
- `avatar_url` (URI, read-only)
- `answers` (array of answer IDs, read-only)

**Additional organiser-only fields** (SpeakerOrga):
- `email` (email)
- `timezone` (string, read-only)
- `locale` (string, read-only)
- `has_arrived` (boolean)
- `availabilities` (array of Availability objects: `{id, start, end, allDay}`)
- `internal_notes` (string, nullable)

**Writable on update** (SpeakerUpdateRequest):
- `name`, `biography`, `email`, `has_arrived`, `availabilities`, `internal_notes`, `avatar` (file reference)

**Expandable fields**: `submissions`, `answers`, `answers.question`

---

### 10.5 Schedules

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/schedules/` | List schedule versions | Partial |
| GET | `/api/events/{event}/schedules/{id}/` | Show schedule version | Partial |
| GET | `/api/events/{event}/schedules/by-version/` | Redirect by version query | Partial |
| GET | `/api/events/{event}/schedules/{id}/exporters/{name}/` | Export schedule in format | Partial |
| POST | `/api/events/{event}/schedules/release/` | Release (publish) a new schedule version | Yes |

**Special ID shortcuts**: Use `latest` for current public schedule, `wip` for unpublished working copy (organiser only).

**by-version endpoint**: `?latest=1` to check for new releases via redirect (cheaper than fetching full schedule).

**Schedule fields**:
- `id` (integer, read-only)
- `version` (string -- version name/label)
- `published` (datetime, nullable)
- `comment` (multi-language string, nullable -- shown in public changelog/RSS)
- `slots` (array of slot IDs, read-only)

**Schedule list fields** (subset): `id`, `version`, `published`

**Schedule release request**: `{"version": "v1.0", "comment": "Initial release"}`

**Expandable on detail**: `slots`, `slots.room`, `slots.submission`, and deeper nesting

---

### 10.6 Talk Slots

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/slots/` | List all talk slots | Partial |
| GET | `/api/events/{event}/slots/{id}/` | Show talk slot | Partial |
| PUT | `/api/events/{event}/slots/{id}/` | Update slot | Yes |
| PATCH | `/api/events/{event}/slots/{id}/` | Partial update | Yes |
| GET | `/api/events/{event}/slots/{id}/ical/` | Export slot as iCal | Partial |

**Slots CANNOT be created or deleted via API** -- they are automatically created/removed when a submission's state changes.

**TalkSlot fields**:
- `id` (integer, read-only)
- `room` (integer ID, nullable)
- `start` (datetime, nullable)
- `end` (datetime)
- `submission` (submission code string, read-only)
- `schedule` (integer schedule ID, read-only)
- `description` (multi-language string, nullable)
- `duration` (integer minutes, read-only -- actual if scheduled, planned otherwise)

**Writable fields**: `room`, `start`, `end`, `description`

**Expandable**: `room`, `submission`, `submission.speakers`, `submission.track`, etc.

**Note**: Slots without a submission represent breaks or non-talk blocks.

---

### 10.7 Rooms

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/rooms/` | List rooms | Partial (public only after schedule is public) |
| POST | `/api/events/{event}/rooms/` | Create room | Yes |
| GET | `/api/events/{event}/rooms/{id}/` | Show room | Partial |
| PUT | `/api/events/{event}/rooms/{id}/` | Update room | Yes |
| PATCH | `/api/events/{event}/rooms/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/rooms/{id}/` | Delete room | Yes |
| GET | `/api/events/{event}/rooms/{id}/log/` | View changelog | Yes |

**Room fields**:
- `id` (integer, read-only)
- `name` (multi-language string)
- `description` (multi-language string, nullable)
- `uuid` (UUID, read-only -- stable identifier)
- `guid` (UUID, nullable -- external tool identifier)
- `capacity` (integer, nullable)
- `position` (integer, nullable -- display order)

**Additional organiser fields** (RoomOrga): same fields plus writable `availabilities`

---

### 10.8 Tracks

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/tracks/` | List tracks | Partial |
| POST | `/api/events/{event}/tracks/` | Create track | Yes |
| GET | `/api/events/{event}/tracks/{id}/` | Show track | Partial |
| PUT | `/api/events/{event}/tracks/{id}/` | Update track | Yes |
| PATCH | `/api/events/{event}/tracks/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/tracks/{id}/` | Delete track | Yes |
| GET | `/api/events/{event}/tracks/{id}/log/` | View changelog | Yes |

**Track fields**:
- `id` (integer, read-only)
- `name` (multi-language string)
- `description` (multi-language string)
- `color` (hex color string, e.g. "#00ff00")
- `position` (integer, nullable -- display order, lowest first)
- `requires_access_code` (boolean)

---

### 10.9 Tags

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/tags/` | List tags | Yes (always) |
| POST | `/api/events/{event}/tags/` | Create tag | Yes |
| GET | `/api/events/{event}/tags/{id}/` | Show tag | Yes |
| PUT | `/api/events/{event}/tags/{id}/` | Update tag | Yes |
| PATCH | `/api/events/{event}/tags/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/tags/{id}/` | Delete tag | Yes |
| GET | `/api/events/{event}/tags/{id}/log/` | View changelog | Yes |

**Tags are always auth-required** (currently only used in organiser backend, not public).

**Tag fields**:
- `id` (integer, read-only)
- `tag` (string, max 50)
- `description` (multi-language string)
- `color` (hex color string)
- `is_public` (boolean -- whether tag can be selected by submitters in CfP)

---

### 10.10 Submission Types

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/submission-types/` | List types | Partial |
| POST | `/api/events/{event}/submission-types/` | Create type | Yes |
| GET | `/api/events/{event}/submission-types/{id}/` | Show type | Partial |
| PUT | `/api/events/{event}/submission-types/{id}/` | Update type | Yes |
| PATCH | `/api/events/{event}/submission-types/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/submission-types/{id}/` | Delete type | Yes |
| GET | `/api/events/{event}/submission-types/{id}/log/` | View changelog | Yes |

**SubmissionType fields**:
- `id` (integer, read-only)
- `name` (multi-language string)
- `default_duration` (integer, minutes)
- `deadline` (datetime, nullable -- override global CfP deadline)
- `requires_access_code` (boolean)

---

### 10.11 Reviews

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/reviews/` | List reviews | Yes |
| POST | `/api/events/{event}/reviews/` | Create review | Yes |
| GET | `/api/events/{event}/reviews/{id}/` | Show review | Yes |
| PUT | `/api/events/{event}/reviews/{id}/` | Update review | Yes |
| PATCH | `/api/events/{event}/reviews/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/reviews/{id}/` | Delete review | Yes |
| GET | `/api/events/{event}/reviews/{id}/log/` | View changelog | Yes |

**Review fields**:
- `id` (integer, read-only)
- `submission` (submission code string)
- `text` (string, nullable)
- `score` (decimal, read-only, nullable -- computed aggregate)
- `scores` (array of ReviewScore objects)
- `answers` (array of Answer objects, read-only)
- `user` (string, nullable, read-only)

**ReviewScore**: `{id, category (int), value (decimal), label (string, nullable)}`

**Write request**: `{submission, text, scores: [int IDs], answers: [int IDs]}`

**Note**: Access depends on review phase and user permissions. Not available to reviewer-only tokens during anonymised reviews.

---

### 10.12 Questions (Custom Fields)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/questions/` | List questions | Partial |
| POST | `/api/events/{event}/questions/` | Create question | Yes |
| GET | `/api/events/{event}/questions/{id}/` | Show question | Partial |
| PUT | `/api/events/{event}/questions/{id}/` | Update question | Yes |
| PATCH | `/api/events/{event}/questions/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/questions/{id}/` | Delete question | Yes |
| GET | `/api/events/{event}/questions/{id}/icon/` | Get question icon | Partial |
| GET | `/api/events/{event}/questions/{id}/log/` | View changelog | Yes |

**Question fields**:
- `id` (integer, read-only)
- `identifier` (string)
- `question` (multi-language string -- the label text)
- `help_text` (multi-language string, nullable)
- `default_answer` (string, nullable)
- `variant` (enum: text, number, boolean, file, url, date, datetime, choice, multiple_choice, etc.)
- `target` (enum: `submission`, `speaker`, `reviewer`)
- `deadline` (datetime, nullable)
- `freeze_after` (datetime, nullable)
- `question_required` (enum)
- `position` (integer)
- `tracks` (array of track IDs -- limit question to specific tracks)
- `submission_types` (array of type IDs)
- `options` (array of option IDs)
- `min_length`, `max_length` (integers, nullable)
- `min_number`, `max_number` (decimals, nullable)
- `min_date`, `max_date` (dates, nullable)
- `min_datetime`, `max_datetime` (datetimes, nullable)
- `icon` (enum: `-`, `bsky`, `discord`, `github`, `instagram`, `linkedin`, `mastodon`, `twitter`, `web`, `youtube`, or null)

**Expandable**: `tracks`, `submission_types`, `options`

---

### 10.13 Question Options

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/question-options/` | List options | Partial |
| POST | `/api/events/{event}/question-options/` | Create option | Yes |
| GET | `/api/events/{event}/question-options/{id}/` | Show option | Partial |
| PUT | `/api/events/{event}/question-options/{id}/` | Update option | Yes |
| PATCH | `/api/events/{event}/question-options/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/question-options/{id}/` | Delete option | Yes |
| GET | `/api/events/{event}/question-options/{id}/log/` | View changelog | Yes |

**Expandable**: `question`, `question.submission_types`, `question.tracks`

---

### 10.14 Answers

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/answers/` | List answers | Yes |
| POST | `/api/events/{event}/answers/` | Create answer | Yes |
| GET | `/api/events/{event}/answers/{id}/` | Show answer | Yes |
| PUT | `/api/events/{event}/answers/{id}/` | Update answer | Yes |
| PATCH | `/api/events/{event}/answers/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/answers/{id}/` | Delete answer | Yes |
| GET | `/api/events/{event}/answers/{id}/log/` | View changelog | Yes |

**Answer fields**:
- `id` (integer, read-only)
- `question` (integer, read-only on update)
- `answer` (string)
- `answer_file` (file reference)
- `submission` (string, read-only on update)
- `review` (integer, read-only on update)
- `person` (string, read-only on update)
- `options` (array of integer IDs)

**Note**: Cannot change related objects (question, submission, review, speaker) when updating.

**Filters**: `question`, `submission`, `speaker`, `review`
**Search** (`?q=`): searches in `answer`
**Expandable**: `options`, `question`, `question.submission_types`, `question.tracks`

---

### 10.15 Feedback

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/feedback/` | List feedback | Yes |
| POST | `/api/events/{event}/feedback/` | Create feedback | **No** (public) |
| GET | `/api/events/{event}/feedback/{id}/` | Show feedback | Yes |
| DELETE | `/api/events/{event}/feedback/{id}/` | Delete feedback | Yes |

**Feedback is the only write endpoint accessible without authentication** (for session feedback from attendees).

**Feedback fields**:
- `id` (integer, read-only)
- `submission` (string -- submission code)
- `speaker` (string, nullable)
- `rating` (integer, nullable)
- `review` (string -- the feedback text)

**Expandable**: `speaker`, `submission`
**Filters**: `submission`
**Search** (`?q=`): searches in `submission.title`

---

### 10.16 Mail Templates

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/mail-templates/` | List templates | Yes |
| POST | `/api/events/{event}/mail-templates/` | Create template | Yes |
| GET | `/api/events/{event}/mail-templates/{id}/` | Show template | Yes |
| PUT | `/api/events/{event}/mail-templates/{id}/` | Update template | Yes |
| PATCH | `/api/events/{event}/mail-templates/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/mail-templates/{id}/` | Delete template | Yes |
| GET | `/api/events/{event}/mail-templates/{id}/log/` | View changelog | Yes |

**Note**: The `role` attribute cannot be changed after creation.

---

### 10.17 Speaker Information

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/speaker-information/` | List | Yes |
| POST | `/api/events/{event}/speaker-information/` | Create | Yes |
| GET | `/api/events/{event}/speaker-information/{id}/` | Show | Yes |
| PUT | `/api/events/{event}/speaker-information/{id}/` | Update | Yes |
| PATCH | `/api/events/{event}/speaker-information/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/speaker-information/{id}/` | Delete | Yes |
| GET | `/api/events/{event}/speaker-information/{id}/log/` | View changelog | Yes |

**SpeakerInformation fields**:
- `id` (integer, read-only)
- `target_group` (enum: `submitters`, `accepted`, `confirmed`)
- `title` (multi-language string)
- `text` (multi-language string, markdown)
- `resource` (file URL)
- `limit_tracks` (array of track IDs)
- `limit_types` (array of type IDs)

---

### 10.18 Access Codes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/events/{event}/access-codes/` | List | Yes |
| POST | `/api/events/{event}/access-codes/` | Create | Yes |
| GET | `/api/events/{event}/access-codes/{id}/` | Show | Yes |
| PUT | `/api/events/{event}/access-codes/{id}/` | Update | Yes |
| PATCH | `/api/events/{event}/access-codes/{id}/` | Partial update | Yes |
| DELETE | `/api/events/{event}/access-codes/{id}/` | Delete | Yes |

**Expandable**: `submission_type`, `submission_types`, `track`, `tracks`

---

### 10.19 Teams (Organiser-level)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/organisers/{organiser}/teams/` | List teams | Yes |
| POST | `/api/organisers/{organiser}/teams/` | Create team | Yes |
| GET | `/api/organisers/{organiser}/teams/{id}/` | Show team | Yes |
| PUT | `/api/organisers/{organiser}/teams/{id}/` | Update team | Yes |
| PATCH | `/api/organisers/{organiser}/teams/{id}/` | Partial update | Yes |
| DELETE | `/api/organisers/{organiser}/teams/{id}/` | Delete team | Yes |
| POST | `.../{id}/invite/` | Invite member to team | Yes |
| DELETE | `.../{id}/invites/{invite_id}/` | Delete invitation | Yes |
| POST | `.../{id}/remove_member/` | Remove member from team | Yes |

**Note**: This is the only endpoint that does NOT use the event setting on the access token (teams exist outside event structure).

**Team fields**:
- `id` (integer, read-only)
- `name` (string)
- `members` (array of user strings)
- `invites` (array of invite IDs)
- `all_events` (boolean)
- `limit_events` (array of event slugs)

---

### 10.20 File Upload

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/upload/` | Upload a file | Yes |

Returns: `{"id": "<file-id>"}` -- use this ID in other resource fields that accept files.

---

## 11. Example JSON Structures

### Schedule with expanded slots and rooms:
```
GET /api/events/myconf/schedules/latest/?expand=slots.room,slots.submission
```

```json
{
    "id": 42,
    "version": "v2.0",
    "published": "2025-06-15T10:00:00Z",
    "comment": {"en": "Added lightning talks"},
    "slots": [
        {
            "id": 101,
            "room": {
                "id": 1,
                "name": {"en": "Main Hall"},
                "description": null,
                "uuid": "a1b2c3d4-...",
                "guid": null,
                "capacity": 500,
                "position": 0
            },
            "start": "2025-07-01T09:00:00+02:00",
            "end": "2025-07-01T09:45:00+02:00",
            "submission": {
                "code": "ABCDEF",
                "title": "Intro to pretalx",
                "speakers": ["SPKR01"],
                "submission_type": 1,
                "track": 2,
                "tags": [1, 3],
                "state": "confirmed",
                "abstract": "An overview of the pretalx system.",
                "description": null,
                "duration": 45,
                "slot_count": 1,
                "content_locale": "en",
                "do_not_record": false,
                "image": null,
                "resources": [],
                "slots": [101],
                "answers": [5, 6]
            },
            "schedule": 42,
            "description": null,
            "duration": 45
        }
    ]
}
```

### Submission (organiser view):
```json
{
    "code": "ABCDEF",
    "title": "Building Conference Tools",
    "speakers": ["SPKR01", "SPKR02"],
    "submission_type": 1,
    "track": 2,
    "tags": [1],
    "state": "confirmed",
    "pending_state": null,
    "abstract": "How to build great conference tools.",
    "description": "A deep dive into...",
    "duration": 30,
    "slot_count": 1,
    "content_locale": "en",
    "do_not_record": false,
    "image": null,
    "resources": [10],
    "slots": [101],
    "answers": [5, 6, 7],
    "is_featured": true,
    "notes": "Great speaker, prioritize",
    "internal_notes": null,
    "reviews": [20, 21],
    "assigned_reviewers": ["reviewer@example.com"],
    "is_anonymised": false,
    "median_score": 4.5,
    "mean_score": 4.3,
    "created": "2025-01-15T08:00:00Z",
    "updated": "2025-03-20T14:30:00Z"
}
```

### Speaker (organiser view):
```json
{
    "code": "SPKR01",
    "name": "Jane Doe",
    "biography": "Software engineer and conference organizer.",
    "submissions": ["ABCDEF", "GHIJKL"],
    "avatar_url": "https://pretalx.example.org/media/avatars/jane.png",
    "answers": [5, 8],
    "email": "jane@example.com",
    "timezone": "Europe/Berlin",
    "locale": "en",
    "has_arrived": false,
    "availabilities": [
        {"id": 1, "start": "2025-07-01T08:00:00+02:00", "end": "2025-07-01T18:00:00+02:00", "allDay": false}
    ],
    "internal_notes": null
}
```

### Paginated list response:
```json
{
    "count": 42,
    "next": "https://pretalx.example.org/api/events/myconf/submissions/?page=2",
    "previous": null,
    "results": [
        {"code": "ABCDEF", "title": "Talk 1", "...": "..."},
        {"code": "GHIJKL", "title": "Talk 2", "...": "..."}
    ]
}
```

---

## 12. Read vs. Write Summary

| Resource | Read (GET) | Create (POST) | Update (PUT/PATCH) | Delete | Notes |
|----------|-----------|----------------|---------------------|--------|-------|
| Events | Yes | **No** | **No** | **No** | Read-only |
| Submissions | Yes | Yes | Yes | Yes | State changes via action endpoints |
| Speakers | Yes | **No** | Yes | **No** | Can update, not create/delete |
| Schedules | Yes | **No** | **No** | **No** | Can only release (POST /release/) |
| Slots | Yes | **No** | Yes | **No** | Auto-created; can update room/time |
| Rooms | Yes | Yes | Yes | Yes | Full CRUD |
| Tracks | Yes | Yes | Yes | Yes | Full CRUD |
| Tags | Yes | Yes | Yes | Yes | Full CRUD (auth required always) |
| Submission Types | Yes | Yes | Yes | Yes | Full CRUD |
| Reviews | Yes | Yes | Yes | Yes | Full CRUD (permission dependent) |
| Questions | Yes | Yes | Yes | Yes | Full CRUD |
| Question Options | Yes | Yes | Yes | Yes | Full CRUD |
| Answers | Yes | Yes | Yes | Yes | Full CRUD (can't change related objects) |
| Feedback | Yes | Yes (public!) | **No** | Yes | Public create, no update |
| Mail Templates | Yes | Yes | Yes | Yes | Full CRUD |
| Speaker Information | Yes | Yes | Yes | Yes | Full CRUD |
| Access Codes | Yes | Yes | Yes | Yes | Full CRUD |
| Teams | Yes | Yes | Yes | Yes | Full CRUD + invite/remove member |
| File Upload | N/A | Yes | N/A | N/A | Upload only, used in other resources |

---

## 13. Webhooks / Event Notifications

**pretalx does NOT have a webhook or event notification system in its API.** There is no documented mechanism for push notifications, webhooks, or real-time event streaming.

To detect changes, consumers must poll the API. Strategies:
- Use `schedules/by-version/?latest=1` redirect to cheaply check for schedule releases.
- Poll list endpoints and compare `count` or object timestamps.
- Use the changelog/log sub-endpoints on individual objects to see what changed.

---

## 14. API Changelog Summary

### v2 (unreleased -- development preview via `Pretalx-Version: v-next`)
- Access codes now support multiple tracks and session types (previously returned a single ID).
- In v1, access code returns only the **first** associated track/session type (incomplete if multiple).

### v1 (released pretalx v2025.1.0)
- Major rewrite from previous undocumented read-only API.
- Introduced new auth tokens with scoping.
- Introduced writable API for organisers.
- Related objects now returned by ID (previously by name).
- Added resource expansion (`?expand=`).
- Added multi-language string coercion (`?lang=`).
- Added API versioning.
- Schedule endpoint completely rewritten (breaking change from legacy).
- New pagination: page-based with `count`/`next`/`previous`/`results` (legacy used offset-based, still works with old tokens).
- Page size limited to 50 (previously unlimited).

---

## 15. Key Design Observations (for comparison with our API)

1. **Event-scoped URLs**: Nearly all endpoints are nested under `/api/events/{event}/` using the event slug.
2. **ID patterns**: Submissions and speakers use short alphanumeric codes (e.g., "ABCDEF"), most other resources use integer IDs.
3. **Two serializer tiers**: Many resources have a public serializer and an "Orga" serializer with additional fields for authenticated organisers.
4. **State machine via action endpoints**: Submission state cannot be directly set via PATCH -- you must use specific action endpoints (`/accept/`, `/reject/`, `/confirm/`, `/cancel/`, `/make-submitted/`).
5. **Speaker management via submission actions**: Adding/removing speakers is done through submission action endpoints, not the speakers endpoint.
6. **Expansion is opt-in**: Related resources are IDs by default; explicit `?expand=` needed for inline objects.
7. **Multi-language by default**: String fields are multi-language objects unless `?lang=` is used.
8. **Changelog/audit log**: Most writable resources have a `/log/` sub-endpoint for change history.
9. **No real-time/push**: No webhooks, SSE, or WebSockets -- purely request/response REST.
10. **Conservative permissions**: Only organisers/reviewers get authenticated access; no speaker or attendee API access.
