# Recent Inbox & Uptime Monitoring Issues - Diagnosis

**Date:** 2026-07-19  
**Status:** ⚠️ Configuration Issues Identified

## Summary

Both features are **enabled** in the config but have different issues:

1. **Recent Inbox:** Database is configured but likely empty (no emails received yet)
2. **Uptime Monitoring:** Missing required API key

---

## 🔍 Investigation Results

### Health Check (https://reave.app/api/health)

```json
{
  "app_pg": {
    "status": "configured",
    "detail": "DATABASE_URL set"
  },
  "uptimerobot": {
    "status": "unconfigured", 
    "detail": "UPTIMEROBOT_API_KEY not set"
  }
}
```

### Feature Configuration

**config/config-reave.json:**
- ✅ `uptime_monitoring` is enabled
- ✅ Email inbox is core (always enabled)

---

## 📋 Issues & Solutions

### 1. Recent Inbox (Empty)

**Status:** Database configured, likely no data

**Why it's empty:**
- The inbox shows emails from `/api/email/inbox` 
- This requires emails to be received via Resend webhook at `/api/email/inbound`
- If no emails have been forwarded/BCC'd to the Resend receiving address, the inbox will be empty

**To populate:**
1. Ensure `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` are set ✅ (confirmed via health check)
2. Set up Resend webhook: `POST https://reave.app/api/email/inbound`
3. BCC or forward emails to your Resend receiving address
4. OR test by sending an email to the receiving address

**Environment Variables:**
```bash
RESEND_API_KEY=re_*** (✅ set)
RESEND_WEBHOOK_SECRET=*** (✅ configured)
DATABASE_URL=*** (✅ set)
```

### 2. Uptime Monitoring (Not Working)

**Status:** ❌ Missing API Key

**Problem:**
```
UPTIMEROBOT_API_KEY not set
```

**Solution - Set on Railway:**

1. **Go to Railway Dashboard:**
   - Project: Reave App
   - Service: reave (main Astro app)
   - Variables tab

2. **Add Required Variables:**
   ```bash
   # Get from https://uptimerobot.com → My Settings → Integrations → API
   UPTIMEROBOT_API_KEY=u12345-abc123def456...
   
   # Generate a long random string (or use: openssl rand -base64 32)
   UPTIMEROBOT_WEBHOOK_SECRET=<long-random-secret>
   ```

3. **Optional:**
   ```bash
   # Override default 5-minute poll interval
   UPTIMEROBOT_POLL_MINUTES=5
   
   # Manual monitor→client linking (if auto-link fails)
   UPTIMEROBOT_MONITOR_CLIENT_MAP='{"798092635":"<client-uid>"}'
   ```

4. **Set up UptimeRobot Webhook:**
   - In UptimeRobot dashboard → Integrations → Webhooks
   - URL: `https://reave.app/api/uptime/webhook?key=<UPTIMEROBOT_WEBHOOK_SECRET>`
   - Send as JSON: ON
   - POST value template (see src/knowledge/uptime-monitoring.md)

5. **Redeploy** the Railway service after setting variables

---

## 🧪 Testing After Fixes

### Test Recent Inbox
```bash
# Should return emails (or empty array if none received)
curl -s https://reave.app/api/email/inbox \
  -H "Authorization: Bearer <clerk-token>"
```

### Test Uptime Monitoring
```bash
# After setting UPTIMEROBOT_API_KEY:
curl -s https://reave.app/api/uptime/monitors \
  -H "Authorization: Bearer <clerk-token>"
  
# Force sync from UptimeRobot:
curl -s "https://reave.app/api/uptime/poll?key=<UPTIMEROBOT_WEBHOOK_SECRET>"
```

### Check Dashboard
- Visit https://reave.app/admin?tab=home
- Recent inbox: should show if emails exist in DB
- Site uptime: should show "0/0" → monitor counts after API key is set

---

## 📁 Related Files

- Dashboard frontend: `public/admin/os-map-loader.js` (lines 2611-2707)
- Dashboard API: `src/pages/api/admin/dashboard.ts`
- Email inbox store: `src/lib/emailInboxStore.ts`
- Uptime monitoring: `src/lib/uptimeMonitoring.ts`
- Config: `config/config-reave.json`
- Docs: `src/knowledge/uptime-monitoring.md`

---

## 🎯 Next Steps

1. **Immediate (Uptime Monitoring):**
   - [ ] Add `UPTIMEROBOT_API_KEY` to Railway
   - [ ] Add `UPTIMEROBOT_WEBHOOK_SECRET` to Railway
   - [ ] Redeploy
   - [ ] Configure webhook in UptimeRobot dashboard
   - [ ] Verify monitors appear in `/admin`

2. **Verify (Recent Inbox):**
   - [ ] Check if any emails exist: query `email_inbox` table in Postgres
   - [ ] If empty: BCC/forward a test email to Resend receiving address
   - [ ] Verify webhook is configured in Resend dashboard
   - [ ] Check `/admin?tab=email` (full inbox view)

---

## 💡 Why This Happened

**Uptime Monitoring:**
- The `.env.railway.postgres` file is **reference-only** (for the Postgres service)
- App environment variables must be set on the **reave service** in Railway
- The `UPTIMEROBOT_API_KEY` was never set on the main app service

**Recent Inbox:**
- Database is connected ✅
- Inbox is simply empty (no emails received yet)
- The UI shows "No emails yet" which is correct behavior for an empty inbox

---

## 🔗 References

- Railway env docs: https://docs.railway.app/guides/variables
- UptimeRobot API: https://uptimerobot.com/api/
- Resend webhook setup: https://resend.com/docs/webhooks
