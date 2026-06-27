-- Pinned Telegram deploy-status message id per chat.
CREATE TABLE IF NOT EXISTS telegram_deploy_pin (
  chat_id     BIGINT PRIMARY KEY,
  message_id  BIGINT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
