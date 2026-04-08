-- Prevent ambiguous webhook correlation across providers.
-- This must be applied in the target database before relying on
-- provider_message_id-based webhook status updates in production.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_log_provider_msg
ON notification_log (provider, provider_message_id)
WHERE provider_message_id IS NOT NULL;
