# Product Backlog

Features and improvements in rough priority order.

- [ ] SMS inbound: route messages to Claude tool loop (same as Telegram bot) instead of simple auto-reply
- [ ] Persist Telegram chat history to Postgres (replace in-memory map — survives restarts)
- [ ] Client portal: add file upload tab (hosting credentials, contracts, assets)
- [ ] Client portal: email/SMS notification when operator adds new data
- [ ] Telegram /document command: send a DocuSign or PDF signing link to a contact
- [ ] Build a Vapi webhook listener to log voice transcripts from the homepage widget
- [ ] Add a /broadcast <message> Telegram command to SMS all contacts at once
- [ ] Crater: recurring invoices dashboard + Telegram alerts for upcoming due dates
- [ ] Contacts dashboard: add search, filter by tag/status, bulk export CSV
- [ ] Add Clerk auth to the client portal (currently open by URL — intentional, but worth revisiting)
- [ ] Supabase: migrate contact-api Postgres to Supabase for MCP access from Cursor
