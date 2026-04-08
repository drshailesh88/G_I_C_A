# Phase 4 Communications Production Checklist

Use this checklist before enabling production webhooks and relying on delivery states.

## 1. Apply Database Migration

Apply:

- `drizzle/migrations/0001_notification_log_provider_message_unique.sql`

Verify in the target database:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'notification_log'
  AND indexname = 'uq_notif_log_provider_msg';
```

Expected:

- one row present
- index covers `(provider, provider_message_id)`
- partial predicate includes `provider_message_id IS NOT NULL`

## 2. Set Production Environment Variables

Required for send flow and webhook processing:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_WEBHOOK_SECRET`
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_WEBHOOK_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## 3. Webhook Smoke Tests

Email webhook:

1. Send an invalid signature request to `/api/webhooks/email`
2. Expect `401`
3. Send a valid signed request
4. Expect `200`
5. Confirm the matching `notification_log` row updates

WhatsApp webhook:

1. Send an invalid `Authorization` header to `/api/webhooks/whatsapp`
2. Expect `401`
3. Send a valid authenticated request
4. Expect `200`
5. Confirm the matching `notification_log` row updates

## 4. DLQ Smoke Test

Force a webhook processing failure in staging and confirm:

1. provider still receives `200`
2. entry is pushed to Redis list `webhook:dlq`
3. `getDlqSize()` increases
4. the payload can be inspected and replayed later

## 5. Launch Criteria

Do not mark communications delivery tracking production-ready unless all of the following are true:

- webhook secrets are configured
- Upstash Redis is configured and reachable
- the unique webhook correlation index exists in the live database
- both webhook routes reject invalid auth
- both webhook routes process a valid callback end-to-end
