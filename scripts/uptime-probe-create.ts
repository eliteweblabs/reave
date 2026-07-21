/**
 * Raw curl-style UptimeRobot newMonitor probes (one request each, pass variant index).
 *
 *   railway run -s reave -e production -- npx tsx scripts/uptime-probe-create.ts [url] [variant]
 *
 * Variants:
 *   0 bare (url + name only)
 *   1 + active email contact 143381_0_0
 *   2 + interval 300
 *   3 + email + interval 300
 */
const url = process.argv[2]?.trim() || 'https://firepumptestingco.com';
const variant = Number(process.argv[3] ?? 0);

async function probe() {
  const key = process.env.UPTIMEROBOT_API_KEY?.trim();
  if (!key) {
    console.error('UPTIMEROBOT_API_KEY missing');
    process.exit(1);
  }

  const body = new URLSearchParams({
    api_key: key,
    format: 'json',
    type: '1',
    url,
    friendly_name: `probe-${variant} firepumptesting`,
  });

  if (variant === 1 || variant === 3) body.set('alert_contacts', '143381_0_0');
  if (variant === 2 || variant === 3) body.set('interval', '300');

  console.log('variant', variant, 'body', Object.fromEntries([...body.entries()].map(([k, v]) => [k, k === 'api_key' ? '***' : v])));

  const res = await fetch('https://api.uptimerobot.com/v2/newMonitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  console.log('status', res.status, JSON.stringify(data, null, 2));

  if (data.stat === 'ok' && data.monitor?.id) {
    console.log('\nCreated — delete in dashboard or:');
    console.log(`curl -X POST https://api.uptimerobot.com/v2/deleteMonitor -d api_key=*** -d format=json -d id=${data.monitor.id}`);
  }
}

probe().catch((e) => {
  console.error(e);
  process.exit(1);
});
