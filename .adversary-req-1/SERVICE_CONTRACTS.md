# GEM India — Service Contracts

**Status:** Canonical service-boundary reference
**Date:** 2026-04-07
**Primary sources:** `AGENTS.md`, `.planning/data-requirements.md`, `SCHEMA_DECISIONS.md`

---

## Purpose

These contracts define the stable backend interfaces that application modules should call.

Rules:
- Modules call services, not providers directly.
- Email and WhatsApp are abstracted behind provider adapters.
- All event-scoped operations take `eventId`.
- Sensitive files are exposed through signed access, not permanent public URLs.

---

## Shared Types

```ts
export type ActorContext = {
  type: "user" | "system";
  id: string;
};

export type Channel = "email" | "whatsapp";

export type NotificationTriggerType =
  | "registration.created"
  | "registration.cancelled"
  | "faculty.invitation"
  | "program.version_published"
  | "session.cancelled"
  | "travel.saved"
  | "travel.updated"
  | "travel.cancelled"
  | "accommodation.saved"
  | "accommodation.updated"
  | "accommodation.cancelled"
  | "transport.updated"
  | "certificate.generated";

export type RecipientRef = {
  personId: string;
  email?: string | null;
  phoneE164?: string | null;
  fullName?: string | null;
};

export type AttachmentDescriptor = {
  fileName: string;
  storageKey: string;
  contentType?: string;
};

export type TemplateRenderResult = {
  subject?: string | null;
  body: string;
  variables: Record<string, unknown>;
};
```

---

## 1. NotificationService

Application modules should depend on this service, not directly on provider adapters.

```ts
export type SendNotificationInput = {
  eventId: string;
  personId: string;
  channel: Channel;
  templateKey: string;
  triggerType: NotificationTriggerType;
  triggerEntityType?: string;
  triggerEntityId?: string;
  sendMode: "automatic" | "manual";
  initiatedByUserId?: string | null;
  idempotencyKey: string;
  variables: Record<string, unknown>;
  attachments?: AttachmentDescriptor[];
};

export type SendNotificationResult = {
  notificationLogId: string;
  provider: string;
  providerMessageId?: string | null;
  status:
    | "queued"
    | "sending"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "retrying";
};

export interface NotificationService {
  send(input: SendNotificationInput): Promise<SendNotificationResult>;
  resend(params: {
    eventId: string;
    notificationLogId: string;
    initiatedByUserId: string;
  }): Promise<SendNotificationResult>;
  retryFailed(params: {
    eventId: string;
    notificationLogId: string;
    initiatedByUserId: string;
  }): Promise<SendNotificationResult>;
}
```

**Contract rules**
- Must check idempotency before provider send.
- Must create `notification_log` rows for every attempt.
- Must render from the correct event override template when present.
- Must route through `EmailProvider` or `WhatsAppProvider`.
- Trigger names should match the canonical names in `CASCADE_EVENT_MAP.md`.

---

## 2. EmailProvider

```ts
export type SendEmailInput = {
  eventId: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  fromDisplayName?: string | null;
  attachments?: AttachmentDescriptor[];
  metadata?: Record<string, string>;
};

export type ProviderSendResult = {
  provider: string;
  providerMessageId?: string | null;
  providerConversationId?: string | null;
  accepted: boolean;
  rawStatus?: string | null;
};

export interface EmailProvider {
  send(input: SendEmailInput): Promise<ProviderSendResult>;
}
```

**Current implementation target**
- Resend adapter in `lib/notifications/email.ts`

---

## 3. WhatsAppProvider

```ts
export type SendWhatsAppInput = {
  eventId: string;
  toPhoneE164: string;
  body: string;
  mediaAttachments?: AttachmentDescriptor[];
  metadata?: Record<string, string>;
};

export interface WhatsAppProvider {
  sendText(input: SendWhatsAppInput): Promise<ProviderSendResult>;
}
```

**Current implementation target**
- Evolution API adapter in `lib/notifications/whatsapp.ts`

**Future compatibility**
- Preserve `providerConversationId` for official WABA path later.

---

## 4. TemplateRenderer

```ts
export type RenderTemplateInput = {
  eventId: string;
  channel: Channel;
  templateKey: string;
  variables: Record<string, unknown>;
};

export interface TemplateRenderer {
  render(input: RenderTemplateInput): Promise<TemplateRenderResult>;
}
```

**Contract rules**
- Resolve event override first, then global default.
- Validate `required_variables_json` before render.
- Reject unknown variables unless explicitly allowed by template config.

---

## 5. FileService

```ts
export type PutPrivateFileInput = {
  storageKey: string;
  contentType: string;
  body: Buffer | Uint8Array | ReadableStream;
  maxBytes?: number;
};

export type PutPrivateFileResult = {
  storageKey: string;
  byteSize: number;
  checksumSha256?: string | null;
};

export interface FileService {
  putPrivate(input: PutPrivateFileInput): Promise<PutPrivateFileResult>;
  createSignedReadUrl(params: {
    storageKey: string;
    expiresInSeconds: number;
  }): Promise<string>;
  head(params: { storageKey: string }): Promise<{
    exists: boolean;
    byteSize?: number;
    contentType?: string;
  }>;
  deleteSoft?(params: {
    storageKey: string;
    actor: ActorContext;
  }): Promise<void>;
}
```

**Contract rules**
- Use signed reads for sensitive artifacts.
- Enforce 20MB upload maximum for user-uploaded files.
- Certificate files and ticket/booking attachments are private by default.

---

## 6. CertificateService

```ts
export type GenerateCertificateInput = {
  eventId: string;
  personId: string;
  templateId: string;
  eligibilityBasisType:
    | "registration"
    | "attendance"
    | "session_assignment"
    | "event_role"
    | "manual";
  eligibilityBasisId?: string | null;
  issuedBy: string;
  reasonNote?: string | null;
};

export type GenerateCertificateResult = {
  issuedCertificateId: string;
  certificateNumber: string;
  storageKey: string;
};

export interface CertificateService {
  generate(input: GenerateCertificateInput): Promise<GenerateCertificateResult>;
  regenerate(params: {
    eventId: string;
    issuedCertificateId: string;
    issuedBy: string;
    reasonNote?: string | null;
  }): Promise<GenerateCertificateResult>;
  revoke(params: {
    eventId: string;
    issuedCertificateId: string;
    revokedBy: string;
    revokeReason: string;
  }): Promise<void>;
}
```

**Contract rules**
- Regenerate by superseding, never overwriting.
- Use distributed lock for bulk generation.
- Emit `conference/certificate.generated` after successful issuance.

---

## 7. QrVerificationService

```ts
export interface QrVerificationService {
  verifyCertificate(params: {
    verificationToken: string;
  }): Promise<{
    valid: boolean;
    eventId?: string;
    issuedCertificateId?: string;
    certificateNumber?: string;
    personName?: string;
    certificateType?: string;
    revoked?: boolean;
  }>;
}
```

**Contract rules**
- Verification is public-read only.
- Never expose private storage keys.
- Verification page should reflect `revoked` and `superseded` states correctly.

---

## 8. EventAutomationService

```ts
export interface EventAutomationService {
  handleDomainEvent(params: {
    eventId: string;
    triggerEventType: string;
    triggerEntityType?: string;
    triggerEntityId?: string;
    actor: ActorContext;
    payload: Record<string, unknown>;
  }): Promise<void>;
}
```

**Contract rules**
- Resolve active automation triggers for the event.
- Enforce guard conditions.
- Dispatch one notification action per trigger row.
- Respect feature flags and idempotency.

---

## 9. Provider WebhookIngestService

```ts
export interface ProviderWebhookIngestService {
  ingestEmailStatus(params: {
    provider: "resend";
    rawPayload: unknown;
  }): Promise<void>;
  ingestWhatsAppStatus(params: {
    provider: "evolution_api" | "waba";
    rawPayload: unknown;
  }): Promise<void>;
}
```

**Contract rules**
- Persist raw payload to `notification_delivery_events`.
- Update matching `notification_log` row state safely.
- Ignore duplicate callbacks idempotently.

---

## Dependency Direction

Application modules should follow this direction:

```text
route / action
  -> domain service
    -> repository + event emitter + service contracts
      -> provider adapters / storage adapters
```

Never:
- call Resend directly from routes
- call Evolution API directly from routes
- build signed R2 URLs ad hoc in feature modules
- mutate notification log outside NotificationService

---

## File Mapping

Recommended implementation paths:
- `src/lib/notifications/send.ts` -> `NotificationService`
- `src/lib/notifications/email.ts` -> `EmailProvider`
- `src/lib/notifications/whatsapp.ts` -> `WhatsAppProvider`
- `src/lib/files/service.ts` -> `FileService`
- `src/lib/certificates/service.ts` -> `CertificateService`
- `src/lib/qr/verification.ts` -> `QrVerificationService`
- `src/lib/cascade/automation.ts` -> `EventAutomationService`

---

## Review Checklist

Before backend implementation is considered aligned:
- modules depend on service contracts, not providers
- event-scoped methods take `eventId`
- notifications pass through NotificationService
- file reads use signed access
- certificate regeneration supersedes instead of overwrite
- webhook handling is idempotent
