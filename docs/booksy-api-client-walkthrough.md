# Booksy access walkthrough (send this to the shop)

Use this as a client email or text. It is written for a Booksy Biz owner — a barber, salon, spa, or similar shop. There is **no API key button** in Booksy. Official access is issued by Booksy after the owner asks support.

Do **not** ask the client for their Booksy login password. That is not an API key and it is not safe to share.

---

## Email you can forward

**Subject:** Need your help requesting Booksy API access (about 10 minutes)

Hi [Client first name],

To connect your Booksy calendar (appointments, staff, clients) to the tools we are building, Booksy has to issue official API credentials. Those are not in Settings. You request them from Booksy Support as the account owner.

Please do the three short steps below and send us whatever Booksy replies with. About 10 minutes on your side; Booksy’s reply can take a few days.

**Please do not send us your Booksy password.** We do not need it.

Thanks,  
[Your name]

---

## What to expect

Booksy’s public API is partner-only. Shop owners cannot generate a key in the Booksy Biz app or at [biz.booksy.com](https://biz.booksy.com/). Booksy Support (or their partnerships team) has to register access and send credentials.

If they approve, you will usually receive some mix of:

- a **partner UUID** (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
- a **partner name**
- an **RSA private key** (a block of text starting with `-----BEGIN` — often one for sandbox and one for production)
- login details for the API docs at [docs.booksy.com](https://docs.booksy.com/)
- a **business / venue ID**, if they mention one

Forward that entire reply. We will store it securely and use it only for your shop.

If they decline, that is useful to know. We can still use your public booking link in the meantime.

---

## Step 1 — Copy your public Booksy profile link (2 minutes)

We can start wiring the public booking page with this today, even before API access arrives.

### On your phone (Booksy Biz app)

1. Open **Booksy Biz**.
2. Tap **Profile**.
3. Tap **Share**.
4. Copy the link (it will look like `https://booksy.com/en-us/...`).

### On a computer ([biz.booksy.com](https://biz.booksy.com/))

1. Sign in as the **owner**.
2. Open your public profile / share option and copy the same booking URL.

Send that link to us now. Also tell us:

- Legal business name as it appears in Booksy
- Country (for example United States)
- The email on the Booksy owner account

---

## Step 2 — Ask Booksy Support for API / partner access (5 minutes)

In-app chat is fastest. Booksy documents 24/7 live chat here: [How do I contact support?](https://support.booksy.com/hc/en-us/articles/16540029346962-How-do-I-contact-support)

### On a computer or tablet (recommended)

1. Go to [biz.booksy.com](https://biz.booksy.com/) and sign in as the **owner**.
2. Click the **question mark** (Help) icon.
3. Choose **Support** to open live chat.

### On your phone

1. Open the **Booksy Biz** app.
2. Tap **Profile → Settings → Help Center**.
3. Open **Help Chat** (or the chat icon).

### If chat is unavailable

Email **info.us@booksy.com** (United States). Other regions: see [Booksy Biz Contact](https://biz.booksy.com/contact).

---

## Step 3 — Paste this message

Copy everything between the lines into chat or email.

---

Hello Booksy Support — I am the owner of **[Business name]** on Booksy.

I work with a development partner who needs official access to the **Booksy Public API** so we can read and manage this business’s appointments, staff/resources, services, customers, and reviews, and receive appointment webhooks (created / modified / cancelled).

Please register API / partner access for this business and send:

1. Partner UUID
2. Partner name
3. RSA private keys for sandbox and production
4. Access to https://docs.booksy.com/ (if that uses a separate username and password)
5. Our business / venue ID
6. How to set the appointment webhook URL
7. The country API base we should use (for example `https://us.booksy.com/public-api/us/`)

This is for **[Business name]** only. We are not asking for marketplace-wide access.

Owner email on the account: **[owner@email.com]**  
Public Booksy profile: **[paste the Profile → Share link]**  
Developer contact (CC them on the reply if possible): **[developer@email.com]**

Thank you.

---

Ask Booksy to **email the credentials to you** and to CC **[developer@email.com]**. If they will only send them to the owner, forward the full reply to us.

---

## What to send us

### Send today

- [ ] Public Booksy profile / booking URL (`Profile → Share`)
- [ ] Business name as shown in Booksy
- [ ] Country
- [ ] Owner email on the Booksy account
- [ ] Screenshot or confirmation that you submitted the Support request (optional, helpful)

### Send when Booksy replies

- [ ] The full email or chat transcript from Booksy
- [ ] Partner UUID
- [ ] Partner name
- [ ] RSA private key(s) — sandbox and production if they send both
- [ ] Docs username/password for `docs.booksy.com`, if any
- [ ] Business / venue ID
- [ ] Webhook instructions, if any

**Do not send:** your Booksy Biz password, PIN, or card-reader codes.

---

## How to send credentials safely

1. Forward Booksy’s email as-is to **[developer@email.com]**, or
2. Put the keys in a note or password manager and share that link, or
3. Paste them in a private email thread — do not post them in a group text or social DM.

If a key is a long `-----BEGIN ... PRIVATE KEY-----` block, send the whole block, including the BEGIN and END lines.

---

## If Booksy says no

Reply to us with their exact wording. Common outcomes:

| Booksy says | What we do next |
| --- | --- |
| Approved, credentials attached | We install them and connect appointments |
| “We only issue this to technology partners” | We apply as the partner; you stay listed as the business owner |
| “Not available for individual shops” | We use your public booking link and skip live calendar sync |
| No reply after 5 business days | Send the same message once more in chat, or email info.us@booksy.com |

---

## Official Booksy links

- Booksy Biz (web): https://biz.booksy.com/
- How to contact support: https://support.booksy.com/hc/en-us/articles/16540029346962-How-do-I-contact-support
- Help Center: https://support.booksy.com/hc/en-us
- Regional emails: https://biz.booksy.com/contact
- US support email: info.us@booksy.com
- Find your public profile link: in the app, **Profile → Share**
