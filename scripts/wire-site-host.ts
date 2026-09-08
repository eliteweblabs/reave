/**
 * Wire Plausible + GSC + sitemap for one apex host (owner fleet tooling).
 * Run: railway run … -- npx tsx scripts/wire-site-host.ts drpawscalls.com
 */
import { plausibleCreateSite } from '../src/lib/plausibleClient.ts';
import {
  gscAddSite,
  gscPropertyCandidates,
  gscSubmitSitemap,
} from '../src/lib/googleSearchConsoleClient.ts';
import { agencySubject } from '../src/lib/integrationTokens.ts';

async function main() {
  const host = (process.argv[2] || '').trim().toLowerCase().replace(/^www\./, '');
  if (!host) {
    console.error('Usage: wire-site-host.ts <apex-domain>');
    process.exit(1);
  }

  console.log(`Wiring ${host}…`);

  const plausible = await plausibleCreateSite(host);
  console.log('Plausible:', plausible);

  const propertyUrl = gscPropertyCandidates(host).find((c) => c.startsWith('sc-domain:')) || '';
  if (!propertyUrl) {
    console.warn('No GSC domain property candidate');
    return;
  }

  try {
    await gscAddSite(propertyUrl, agencySubject());
    console.log('GSC property added:', propertyUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/already exists|duplicate|permission/i.test(message)) {
      console.log('GSC property already present:', propertyUrl);
    } else {
      console.error('GSC add failed:', message);
    }
  }

  const feedpath = `https://${host}/sitemap.xml`;
  try {
    await gscSubmitSitemap(propertyUrl, feedpath, agencySubject());
    console.log('Sitemap submitted:', feedpath);
  } catch (e) {
    console.error('Sitemap submit failed:', e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
