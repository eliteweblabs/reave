/**
 * Create one UptimeRobot monitor — CAPCO Fire test.
 * Usage: railway run -s reave -e production -- npx tsx scripts/uptime-capco-test.ts
 */
const TARGET_URL = 'https://capcofire.com';
const FRIENDLY = 'CAPCO Fire / capco';
const EMAIL = 'uptime@reave.app';

async function urPost(path: string, fields: Record<string, string>) {
  const key = process.env.UPTIMEROBOT_API_KEY?.trim();
  if (!key) throw new Error('UPTIMEROBOT_API_KEY missing');

  const body = new URLSearchParams({ api_key: key, format: 'json', ...fields });
  const res = await fetch(`https://api.uptimerobot.com/v2/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('=== alert contacts ===');
  const contactsRes = await urPost('getAlertContacts', {});
  if (contactsRes.data.stat !== 'ok') {
    console.error(JSON.stringify(contactsRes.data, null, 2));
    process.exit(1);
  }

  const contacts = (contactsRes.data.alert_contacts ?? []).map(
    (c: { id: string | number; type: string | number; status: string | number; value?: string; friendly_name?: string }) => ({
      id: Number(c.id),
      type: Number(c.type),
      status: Number(c.status),
      value: String(c.value ?? ''),
      name: String(c.friendly_name ?? ''),
    }),
  );

  for (const c of contacts) {
    console.log(`  id=${c.id} type=${c.type} status=${c.status} value=${c.value} name=${c.name}`);
  }

  let emailId = contacts.find((c) => c.type === 2 && c.value.toLowerCase() === EMAIL.toLowerCase())?.id;
  if (!emailId) {
    emailId = contacts.find((c) => c.type === 2 && c.value.toLowerCase().includes('reave.app'))?.id;
  }

  if (!emailId) {
    console.log(`\nNo alert contact for ${EMAIL} — creating one...`);
    const created = await urPost('newAlertContact', {
      friendly_name: 'Reave uptime',
      type: '2',
      value: EMAIL,
    });
    console.log(JSON.stringify(created.data, null, 2));
    if (created.data.stat !== 'ok') process.exit(1);
    emailId = Number(created.data.alertcontact?.id);
  }

  console.log(`\nUsing email contact id=${emailId} (${EMAIL})`);

  const variants = [
    { label: 'bare', fields: { type: '1', url: TARGET_URL, friendly_name: FRIENDLY } },
    {
      label: 'email-only',
      fields: { type: '1', url: TARGET_URL, friendly_name: FRIENDLY, alert_contacts: `${emailId}_0_0` },
    },
    {
      label: 'email+interval300',
      fields: {
        type: '1',
        url: TARGET_URL,
        friendly_name: FRIENDLY,
        alert_contacts: `${emailId}_0_0`,
        interval: '300',
      },
    },
  ];

  for (const v of variants) {
    console.log(`\n=== newMonitor (${v.label}) ===`);
    const result = await urPost('newMonitor', v.fields);
    console.log('HTTP', result.status);
    console.log(JSON.stringify(result.data, null, 2));
    if (result.data.stat === 'ok') {
      console.log('\nSUCCESS monitor id=', result.data.monitor?.id);
      process.exit(0);
    }
    const msg = result.data.error?.message ?? '';
    if (/rate limit/i.test(msg)) {
      const wait = Number(msg.match(/retry in (\d+)/i)?.[1] ?? 10) + 2;
      console.log(`rate limited — waiting ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      const retry = await urPost('newMonitor', v.fields);
      console.log(JSON.stringify(retry.data, null, 2));
      if (retry.data.stat === 'ok') {
        console.log('\nSUCCESS monitor id=', retry.data.monitor?.id);
        process.exit(0);
      }
    }
    if (!/not allowed to use some settings/i.test(msg)) {
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 8000));
  }

  console.error('\nAll variants failed');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
