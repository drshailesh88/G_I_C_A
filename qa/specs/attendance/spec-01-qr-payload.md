# Spec 01: QR Payload Building & Parsing

## Source
- `src/lib/attendance/qr-utils.ts` — buildQrPayloadUrl, buildCompactQrPayload, parseQrPayload, isValidQrToken

## Checkpoints

### CP-01: buildQrPayloadUrl produces valid URL with correct params
- Input: baseUrl="https://gem.example.com", valid token, valid eventId
- Expected: URL with /checkin path, token and event search params

### CP-02: buildQrPayloadUrl rejects empty/whitespace inputs
- Input: empty or whitespace-only baseUrl, token, or eventId
- Expected: throws with field name in message

### CP-03: buildQrPayloadUrl rejects invalid token format
- Input: token that doesn't match 32-char alphanumeric
- Expected: throws "token format is invalid"

### CP-04: buildQrPayloadUrl rejects invalid eventId format
- Input: non-UUID eventId
- Expected: throws "eventId format is invalid"

### CP-05: buildQrPayloadUrl rejects non-http(s) protocol
- Input: baseUrl with ftp:// or javascript:
- Expected: throws "baseUrl must use http or https"

### CP-06: buildCompactQrPayload produces eventId:token format
- Input: valid token and eventId
- Expected: string matching {uuid}:{32-char-alphanum}

### CP-07: parseQrPayload handles both URL and compact formats
- Input: URL format and compact format payloads
- Expected: both parse to { valid: true, token, eventId }

### CP-08: parseQrPayload rejects malformed payloads
- Input: empty, null, garbage, wrong path, missing params
- Expected: { valid: false, error: "..." }

### CP-09: isValidQrToken validates 32-char alphanumeric
- Input: valid tokens, short tokens, special chars, empty, non-string
- Expected: true for valid, false for all others

### CP-10: Round-trip integrity — build then parse returns same values
- Input: build URL/compact, then parse result
- Expected: parsed token and eventId match originals

### CP-11: parseQrPayload handles whitespace around payload
- Input: "  {compact-payload}  "
- Expected: { valid: true, ... } (trims before parsing)

### CP-12: buildQrPayloadUrl normalizes trailing slash on baseUrl
- Input: baseUrl="https://gem.example.com/"
- Expected: no double slash in result URL
