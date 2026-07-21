/**
 * One-off UptimeRobot create test — lists alert contacts, then tries newMonitor once.
 *
 * Usage (local, needs UPTIMEROBOT_API_KEY in env):
 *   npx tsx scripts/uptime-test-one.ts [url] [friendlyName]
 *
 * Usage (production creds via Railway):
 *   railway run -s reave -e production -- npx tsx scripts/uptime-test-one.ts https://example.com "Test site"
 */
import {
  urGetAlertContacts,
  urGetMonitors,
  urNewMonitor,
  urResolveCreateContext,
  UPTIME_ALERT_CONTACT_ACTIVE,
  UPTIME_ALERT_CONTACT_EMAIL,
} from '../src/lib/uptimerobotClient';

const url = process.argv[2]?.trim() || 'https://reave.app';
const friendlyName = process.argv[3]?.trim() || 'UR test — reave.app';

async function main() {
  if (!process.env.UPTIMEROBOT_API_KEY?.trim()) {
    console.error('UPTIMEROBOT_API_KEY is not set');
    process.exit(1);
  }

  console.log('=== getAlertContacts ===');
  const contacts = await urGetAlertContacts();
  if (!contacts.ok) {
    console.error('getAlertContacts failed:', contacts.error);
    process.exit(1);
  }
  for (const c of contacts.contacts) {
    const kind = c.type === UPTIME_ALERT_CONTACT_EMAIL ? 'email' : `type-${c.type}`;
    const status =
      c.status === UPTIME_ALERT_CONTACT_ACTIVE
        ? 'active'
        : c.status === 1
          ? 'paused'
          : c.status === 0
            ? 'not-activated'
            : `status-${c.status}`;
    console.log(`  id=${c.id} ${kind} ${status} — ${c.friendly_name}`);
  }

  console.log('\n=== existing monitors (with alert_contacts) ===');
  const listed = await urGetMonitors({ limit: 5, includeAlertContacts: true, customUptimeRatios: '7-30' });
  if (listed.ok) {
    for (const m of listed.monitors.slice(0, 3)) {
      const ac = (m.alert_contacts ?? []).map((x) => x.id).join(',') || '(none)';
      console.log(`  #${m.id} ${m.friendly_name} contacts=${ac}`);
    }
  } else {
    console.warn('  list failed:', listed.error);
  }

  console.log('\n=== create context ===');
  const ctx = await urResolveCreateContext({ monitors: listed.ok ? listed.monitors : [] });
  console.log('  emailContacts:', ctx.emailContacts ?? '(none)');
  console.log('  clonedAlertContacts:', ctx.clonedAlertContacts ?? '(none)');
  console.log('  alertContactTypes:', ctx.alertContactTypes ?? []);

  if (!ctx.emailContacts && !ctx.clonedAlertContacts) {
    console.error('\nNo usable email alert contact — activate an email contact in UptimeRobot first.');
    process.exit(1);
  }

  console.log(`\n=== newMonitor: ${url} ===`);
  const result = await urNewMonitor({ url, friendlyName, createContext: ctx });
  if (result.ok) {
    console.log('SUCCESS monitorId=', result.monitorId);
    console.log('knownStrategy=', ctx.knownStrategy?.name, ctx.knownStrategy?.alertContacts);
    process.exit(0);
  }

  console.error('FAILED:', result.error);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
