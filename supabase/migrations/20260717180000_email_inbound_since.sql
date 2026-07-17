-- Ignore inbound mail sent before the triage system went live (see inboundEmailSince.ts).
alter table email_triage_config
  add column if not exists inbound_since timestamptz;
