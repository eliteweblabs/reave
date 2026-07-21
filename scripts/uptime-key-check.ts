/** Check UptimeRobot API key capabilities (no secrets printed). */
async function main() {
  const key = process.env.UPTIMEROBOT_API_KEY?.trim();
  if (!key) {
    console.error('UPTIMEROBOT_API_KEY missing');
    process.exit(1);
  }
  console.log('key prefix:', key.slice(0, 2), 'length:', key.length);

  const post = async (path: string, fields: Record<string, string> = {}) => {
    const body = new URLSearchParams({ api_key: key, format: 'json', ...fields });
    const res = await fetch(`https://api.uptimerobot.com/v2/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return { status: res.status, data: await res.json() };
  };

  const account = await post('getAccountDetails');
  console.log('\ngetAccountDetails:', account.status, account.data.stat, account.data.error?.message ?? 'ok');
  if (account.data.stat === 'ok') {
    const a = account.data.account;
    console.log('  monitors:', a?.up_monitors, 'up', a?.down_monitors, 'down', 'limit', a?.monitor_limit);
    console.log('  interval:', a?.monitor_interval);
  }

  const monitors = await post('getMonitors', { logs: '0' });
  console.log('\ngetMonitors:', monitors.status, monitors.data.stat, monitors.data.error?.message ?? `count=${monitors.data.monitors?.length}`);

  const create = await post('newMonitor', {
    type: '1',
    url: 'https://capcofire.com',
    friendly_name: 'CAPCO Fire test',
  });
  console.log('\nnewMonitor (bare):', create.status, create.data.stat, create.data.error?.message ?? 'ok');
  if (create.data.monitor?.id) {
    console.log('  created id', create.data.monitor.id, '— delete manually');
  }
}

main();
