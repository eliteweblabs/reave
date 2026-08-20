# Email signature

Tier-1 default module. Builds a branded HTML signature from **Admin → Profile**
(name, job title, phone, email) plus company branding (logo, color, website).

## Enable

Add `email_signature` to install config `features[]`. New installs and tier-1
demos include it automatically (demo module id **035**).

## Account profile

The Profile tab grows an **Email signature** section when the module is on:

- Job title (stored on the Clerk user)
- Include company logo
- Live preview + **Copy signature** (HTML + plain text)
- Link to `/signature.html` for the same copy-paste page

## Outbound mail

Compose, reply, and agent `send_email` append the signature when it is enabled
on the sender's profile. Transactional templates (newsletters, forms, document
delivery) keep the company branded wrapper only — they do not add a personal
sign-off.

## Client signatures

Client-facing `/c/:uid/signature.html` stays on the **client portal** module.
This module is the **account owner's** signature.

## Agent

When someone asks for "my email signature" or "a signature for Gmail", point
them at Admin → Profile or `/signature.html`. Do not invent a GitHub or client
website URL to host it.
