# Contact Import & Bidirectional CardDAV Sync

## Overview

Contacts can now flow both directions between REΛVE and external devices. This enables:

1. **Manual import** from CSV/vCard files (iPhone exports, Mac Contacts, etc.)
2. **Bidirectional CardDAV sync** (contacts created on iPhone automatically sync to REΛVE)
3. **Bulk import** from exported contact databases

## Manual Import

### Access

Navigate to **Admin → Clients**, then click **Import Contacts** (or visit `/admin/import-contacts` directly).

### Supported Formats

#### CSV Format

```csv
name,email,phone,company,notes
John Doe,john@example.com,555-1234,Acme Inc,Important client
Jane Smith,jane@example.com,555-5678,Tech Corp,Designer contact
```

- First row can be a header (auto-detected if it contains "name" or "email")
- Fields: `name`, `email`, `phone`, `company`, `notes`
- At least one of `name`, `email`, or `phone` is required per row

#### vCard Format (.vcf)

- Standard vCard 3.0 or 4.0
- Single or multiple contacts per file
- Supported fields: `FN` (name), `EMAIL`, `TEL` (phone), `ORG` (company), `NOTE` (notes)

### Export from iPhone/iPad

1. **Single Contact**:
   - Open Contacts app → Select contact → Share Contact → Export vCard
   - AirDrop or email the `.vcf` file to yourself

2. **All Contacts**:
   - Go to [iCloud.com](https://icloud.com) → Contacts
   - Select all contacts (⌘A on Mac, Ctrl+A on Windows)
   - Click the gear icon → Export vCard
   - Download the file and upload it to `/admin/import-contacts`

### Import Options

- **Update Existing Contacts**: When enabled, contacts with matching email/phone will be updated instead of creating duplicates. *(Currently creates new contacts; future enhancement will match and update)*

## Bidirectional CardDAV Sync

### How It Works

CardDAV sync is **already bidirectional** at the protocol level:

- **Outbound** (REΛVE → iPhone): New/updated contacts in REΛVE sync to your device
- **Inbound** (iPhone → REΛVE): New/updated contacts on your device sync to REΛVE

### Setup

1. Configure CardDAV on your iPhone (see `/knowledge/carddav.md`)
2. Any contact you create or edit on your iPhone will automatically sync to REΛVE
3. Changes made in REΛVE will sync back to your iPhone

### Known Limitations

The CardDAV implementation has a few technical constraints:

1. **UID Mismatch on Create**: When a client (iPhone) creates a contact with its own UID, the server assigns a new UID from the contact-api. The client will discover the canonical UID via the `Location` header and update its local copy on the next sync.

2. **Full Sync Only**: The current sync is a full dump (no incremental `sync-collection` tokens). On each sync, all contacts are re-fetched. This works well for typical contact list sizes (< 1000 contacts).

3. **No Conflict Resolution**: No `If-Match` / ETag conflict handling on PUT. Last write wins.

### Improvements Made

The CardDAV `PUT` handler now:

- Clearly distinguishes between create and update operations
- Returns proper 201 (Created) vs 204 (No Content) status codes
- Logs warnings when vCard UID differs from path UID
- Always returns `Location` header pointing to the canonical contact URL

## API Endpoint

### `POST /api/contacts/import`

Upload a CSV or vCard file to bulk-import contacts.

**Authentication**: Requires `X-Dashboard-Key` header (same as other dashboard APIs).

**Form Data**:
- `file`: The CSV or vCard file
- `updateExisting`: `"true"` or `"false"` (optional, default `false`)

**Response**:

```json
{
  "ok": true,
  "results": {
    "total": 25,
    "created": 23,
    "updated": 0,
    "skipped": 2,
    "errors": [
      "Contact Name: error message here"
    ]
  }
}
```

## Use Cases

### Onboarding New Workspace

1. Export all contacts from your existing system (iPhone, Gmail, Outlook)
2. Upload the exported file via `/admin/import-contacts`
3. Bulk-import all contacts in seconds

### Client Handoff

1. Freelancer exports contacts to `.vcf`
2. Agency uploads the file to their REΛVE workspace
3. All client contacts are instantly available to the team

### iPhone → REΛVE Migration

**Option A: CardDAV Sync** (automatic, ongoing)
- Set up CardDAV on iPhone
- Any new contact on iPhone syncs to REΛVE automatically

**Option B: One-Time Import** (bulk, manual)
- Export vCard from iCloud.com
- Upload to `/admin/import-contacts`
- All contacts imported at once

## Future Enhancements

1. **Smart Duplicate Detection**: Match by email/phone and update existing contacts instead of creating duplicates
2. **Incremental Sync**: Implement `sync-collection` tokens for more efficient CardDAV syncs
3. **Conflict Resolution**: Add `If-Match` ETag handling for concurrent update detection
4. **UID Preservation**: Pass client-chosen UIDs to contact-api (requires upstream API change)
5. **Import History**: Track import jobs and show detailed logs per import

## Technical Details

### CardDAV PUT Flow

```
1. Client (iPhone) creates contact "Greg Property Management"
2. iPhone PUTs vCard to /carddav/addressbooks/{user}/default/{client-uid}.vcf
3. Server parses vCard, extracts name/email/phone/company/notes
4. Server checks if {client-uid} exists in contact-api
5. If not found → POST /api/contacts (create new)
6. contact-api returns new UID (may differ from {client-uid})
7. Server returns 201 Created + Location header with canonical URL
8. iPhone follows Location and updates its local UID
9. Next sync: iPhone uses canonical UID
```

### Import Flow

```
1. User uploads .vcf or .csv via /admin/import-contacts
2. Server parses file → array of contacts
3. For each contact:
   - Validate required fields (name or email or phone)
   - POST /api/contacts (create new)
   - Track success/error
4. Return results summary
```

## Troubleshooting

### Import fails with "Unauthorized"

- Ensure you're signed in to the admin dashboard
- The `X-Dashboard-Key` cookie must be present
- Try refreshing the page and importing again

### Contacts appear twice after import

- Manual import always creates new contacts (no duplicate detection yet)
- Use CardDAV sync for ongoing sync instead
- Or manually delete duplicates in admin dashboard

### CardDAV sync not working

- Check CardDAV configuration (username, password, server URL)
- Verify `carddav` feature is enabled in `config/config-{slug}.json`
- Check server logs for PUT request errors
- See `/knowledge/carddav.md` for full setup guide

## Related

- `/knowledge/carddav.md` — CardDAV server setup and iOS configuration
- `/api/contacts` — Contact CRUD API
- `/src/lib/carddav/` — CardDAV implementation
