#!/usr/bin/env npx tsx
/**
 * Reconnect every Railway `reave` service to eliteweblabs/rekko@main and
 * patch REAVE_HUB_URL when it still points at reave.app.
 *
 *   npx tsx scripts/reconnect-railway-rekko.ts           # report
 *   npx tsx scripts/reconnect-railway-rekko.ts --apply   # connect + set hub URL
 */
import { execSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const HUB = 'https://rekko.studio';
const REPO = 'eliteweblabs/rekko';

type RailwayProject = { id: string; name: string };

function railwayJson<T>(args: string): T {
  const out = execSync(`railway ${args} --json`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return JSON.parse(out) as T;
}

function listProjects(): RailwayProject[] {
  return railwayJson<RailwayProject[]>('list');
}

function serviceId(projectId: string, serviceName: string): string | null {
  try {
    const env = railwayJson<{ services?: Array<{ id: string; name: string }> }>(
      `environment -p ${projectId} -e production`,
    );
    const hit = env.services?.find((s) => s.name === serviceName);
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

function readVar(projectId: string, serviceId: string, key: string): string {
  try {
    const line = execSync(
      `railway variable list -k -p ${projectId} -e production -s ${serviceId}`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1) : '';
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const projects = listProjects();
  const rows: Array<{ project: string; projectId: string; serviceId: string; hub: string }> = [];

  for (const p of projects) {
    const sid = serviceId(p.id, 'reave');
    if (!sid) continue;
    const hub = readVar(p.id, sid, 'REAVE_HUB_URL');
    rows.push({ project: p.name, projectId: p.id, serviceId: sid, hub });
  }

  if (!rows.length) {
    console.log('No Railway projects with a `reave` service found.');
    return;
  }

  console.log(`Found ${rows.length} reave service(s):\n`);
  for (const row of rows) {
    const hubNote =
      !row.hub ? '(unset)' : row.hub.includes('reave.app') ? `${row.hub} → needs ${HUB}` : row.hub;
    console.log(`• ${row.project} (${row.projectId}) — REAVE_HUB_URL ${hubNote}`);
  }

  if (!APPLY) {
    console.log('\nDry run. Pass --apply to connect GitHub repo and fix hub URLs.');
    return;
  }

  console.log('\nApplying…');
  for (const row of rows) {
    try {
      execSync(
        `railway service connect ${REPO} --branch main -p ${row.projectId} -e production -s ${row.serviceId}`,
        { stdio: 'inherit' },
      );
      console.log(`  ✓ connected ${row.project} → ${REPO}`);
    } catch (e) {
      console.warn(`  ! connect failed for ${row.project}:`, e instanceof Error ? e.message : e);
    }

    if (!row.hub || row.hub.includes('reave.app')) {
      try {
        execSync(
          `railway variable set REAVE_HUB_URL=${HUB} -p ${row.projectId} -e production -s ${row.serviceId}`,
          { stdio: 'inherit' },
        );
        console.log(`  ✓ REAVE_HUB_URL=${HUB} on ${row.project}`);
      } catch (e) {
        console.warn(`  ! hub URL failed for ${row.project}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
