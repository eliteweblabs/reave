/**
 * One-time upload of company site images into the media library with stable slugs.
 * Binaries are no longer in git — this script is a no-op once slugs exist.
 *
 *   npm run seed:site-media
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

type SeedItem = {
  slug: string;
  file: string;
  alt: string;
  /** Replace the existing library row when the file changed. */
  replace?: boolean;
};

const SEED: SeedItem[] = [
  { slug: 'about-office', file: 'public/images/about-office.png', alt: 'Studio office' },
  { slug: 'hero-field-checkin', file: 'public/images/hero-demo/field-checkin.png', alt: 'Field check-in' },
  { slug: 'hero-nda-signing', file: 'public/images/hero-demo/nda-signing.png', alt: 'NDA signing' },
  { slug: 'hero-henderson-billing', file: 'public/images/hero-demo/henderson-billing.png', alt: 'Henderson billing' },
  { slug: 'hero-inventory-channels', file: 'public/images/hero-demo/inventory-channels.png', alt: 'Inventory channels' },
  { slug: 'hero-materials-paint-pricing', file: 'public/images/hero-demo/materials-paint-pricing.png', alt: 'Materials pricing' },
  { slug: 'client-porsche', file: 'public/logos/clients/porsche.svg', alt: 'Porsche' },
  { slug: 'client-newyorktimes', file: 'public/logos/clients/newyorktimes.svg', alt: 'The New York Times' },
  { slug: 'client-redbull', file: 'public/logos/clients/redbull.svg', alt: 'Red Bull' },
  { slug: 'client-chase', file: 'public/logos/clients/chase.svg', alt: 'Chase Bank' },
  { slug: 'client-acura', file: 'public/logos/clients/acura.svg', alt: 'Acura' },
  { slug: 'client-bombay-sapphire', file: 'public/logos/clients/bombay-sapphire.png', alt: 'Bombay Sapphire' },
  { slug: 'client-live-nation', file: 'public/logos/clients/live-nation.svg', alt: 'Live Nation' },
  { slug: 'client-johnnie-walker', file: 'public/logos/clients/johnnie-walker.svg', alt: 'Johnnie Walker' },
  { slug: 'client-wpi', file: 'public/logos/clients/wpi.svg', alt: 'Worcester Polytechnic Institute' },
  { slug: 'client-kingdom-trails', file: 'public/logos/clients/kingdom-trails.png', alt: 'Kingdom Trails' },
  { slug: 'client-uc-law-sf', file: 'public/logos/clients/uc-law-sf.svg', alt: 'UC Law San Francisco', replace: true },
  { slug: 'client-mohegan-sun', file: 'public/logos/clients/mohegan-sun.svg', alt: 'Mohegan Sun' },
  { slug: 'client-sharpie', file: 'public/logos/clients/sharpie.svg', alt: 'Sharpie' },
  { slug: 'client-overlook', file: 'public/logos/clients/overlook.png', alt: 'The Overlook' },
  { slug: 'client-coinbase', file: 'public/logos/clients/coinbase.svg', alt: 'Coinbase' },
  { slug: 'portfolio-mdot-world-featured', file: 'src/assets/images/portfolio/mdot-world-featured.webp', alt: 'MDOT.world' },
  { slug: 'portfolio-mohegan-sun-featured', file: 'src/assets/images/portfolio/mohegan-sun-featured.webp', alt: 'Mohegan Sun' },
  { slug: 'portfolio-porsche-miami-art-week-featured', file: 'src/assets/images/portfolio/porsche-miami-art-week-featured.webp', alt: 'Miami Art Week' },
  { slug: 'portfolio-vip-perks-marker-security-featured', file: 'src/assets/images/portfolio/vip-perks-marker-security-featured.webp', alt: 'Marker Protection' },
  { slug: 'portfolio-luxe-meds-featured', file: 'src/assets/images/portfolio/luxe-meds-featured.webp', alt: 'LUXEMEDS' },
  { slug: 'portfolio-creed-featured', file: 'src/assets/images/portfolio/creed-featured.webp', alt: 'Creed Lounge' },
  { slug: 'portfolio-ar-featured', file: 'src/assets/images/portfolio/ar-featured.webp', alt: 'Air Race 21' },
  { slug: 'portfolio-kingdom-featured', file: 'src/assets/images/portfolio/kingdom-featured.webp', alt: 'Kingdom Trails' },
  { slug: 'portfolio-featured-sfh', file: 'src/assets/images/portfolio/featured-sfh.webp', alt: 'Students for Haiti' },
  { slug: 'portfolio-vasodyn-featured', file: 'src/assets/images/portfolio/vasodyn-featured.webp', alt: 'Vasodyn' },
  { slug: 'portfolio-blackwater-featured', file: 'src/assets/images/portfolio/blackwater-featured.webp', alt: 'blackWater' },
  { slug: 'portfolio-lotus-glass-featured', file: 'src/assets/images/featured/lotus-glass-featured.jpg', alt: 'Lotus Glass' },
  { slug: 'portfolio-angler-fish-aquatics-featured', file: 'src/assets/images/portfolio/angler-fish-aquatics-featured.webp', alt: 'Anglerfish Aquatics' },
  { slug: 'portfolio-paradigm-landscape', file: 'src/assets/images/portfolio/paradigm-landscape.webp', alt: 'Paradigm Landscape' },
  { slug: 'portfolio-uc-hastings-science-tech-logo', file: 'src/assets/images/portfolio/uc-hastings-science-tech-logo.webp', alt: 'UC Hastings Science & Tech' },
  { slug: 'portfolio-elite-web-labs-stickers', file: 'src/assets/images/portfolio/elite-web-labs-stickers.webp', alt: 'Elite Web Labs' },
  { slug: 'portfolio-dpm-construction-featured', file: 'src/assets/images/portfolio/dpm-construction-featured.webp', alt: 'DPM Construction' },
  { slug: 'portfolio-care-plus-mark', file: 'src/assets/images/portfolio/care-plus-mark.webp', alt: 'Care Plus Mark' },
  { slug: 'portfolio-levines-law-featured', file: 'src/assets/images/portfolio/levines-law-featured.webp', alt: 'Barry Levine, Esq.' },
  { slug: 'portfolio-capco-fire-featured', file: 'src/assets/images/portfolio/capco-fire-featured.webp', alt: 'CAPCO Design Group' },
  { slug: 'stack-telnyx', file: 'public/logos/stack/telnyx.svg', alt: 'Telnyx' },
  { slug: 'stack-uptimerobot', file: 'public/logos/stack/uptimerobot.svg', alt: 'UptimeRobot' },
  { slug: 'replaced-gmail', file: 'public/logos/replaced-apps/01-gmail.svg', alt: 'Gmail' },
  { slug: 'replaced-outlook', file: 'public/logos/replaced-apps/02-outlook.svg', alt: 'Outlook' },
  { slug: 'replaced-google-calendar', file: 'public/logos/replaced-apps/03-google-calendar.svg', alt: 'Google Calendar' },
  { slug: 'replaced-chatgpt', file: 'public/logos/replaced-apps/04-chatgpt.svg', alt: 'ChatGPT' },
  { slug: 'replaced-quickbooks', file: 'public/logos/replaced-apps/05-quickbooks.svg', alt: 'QuickBooks' },
  { slug: 'replaced-slack', file: 'public/logos/replaced-apps/06-slack.svg', alt: 'Slack' },
  { slug: 'replaced-notion', file: 'public/logos/replaced-apps/09-notion.svg', alt: 'Notion' },
  { slug: 'replaced-trello', file: 'public/logos/replaced-apps/10-trello.svg', alt: 'Trello' },
  { slug: 'replaced-asana', file: 'public/logos/replaced-apps/11-asana.svg', alt: 'Asana' },
  { slug: 'replaced-monday', file: 'public/logos/replaced-apps/12-monday.svg', alt: 'Monday.com' },
  { slug: 'replaced-hubspot', file: 'public/logos/replaced-apps/13-hubspot.svg', alt: 'HubSpot' },
  { slug: 'replaced-salesforce', file: 'public/logos/replaced-apps/14-salesforce.svg', alt: 'Salesforce' },
  { slug: 'replaced-stripe', file: 'public/logos/replaced-apps/15-stripe.svg', alt: 'Stripe' },
  { slug: 'replaced-calendly', file: 'public/logos/replaced-apps/16-calendly.svg', alt: 'Calendly' },
  { slug: 'replaced-docusign', file: 'public/logos/replaced-apps/17-docusign.svg', alt: 'DocuSign' },
  { slug: 'replaced-mailchimp', file: 'public/logos/replaced-apps/18-mailchimp.svg', alt: 'Mailchimp' },
  { slug: 'replaced-dropbox', file: 'public/logos/replaced-apps/19-dropbox.svg', alt: 'Dropbox' },
  { slug: 'replaced-google-drive', file: 'public/logos/replaced-apps/20-google-drive.svg', alt: 'Google Drive' },
  { slug: 'replaced-airtable', file: 'public/logos/replaced-apps/21-airtable.svg', alt: 'Airtable' },
  { slug: 'replaced-clickup', file: 'public/logos/replaced-apps/22-clickup.svg', alt: 'ClickUp' },
  { slug: 'replaced-xero', file: 'public/logos/replaced-apps/23-xero.svg', alt: 'Xero' },
  { slug: 'replaced-typeform', file: 'public/logos/replaced-apps/24-typeform.svg', alt: 'Typeform' },
  { slug: 'replaced-intercom', file: 'public/logos/replaced-apps/25-intercom.svg', alt: 'Intercom' },
  { slug: 'replaced-zendesk', file: 'public/logos/replaced-apps/26-zendesk.svg', alt: 'Zendesk' },
  { slug: 'replaced-zapier', file: 'public/logos/replaced-apps/27-zapier.svg', alt: 'Zapier' },
  { slug: 'replaced-zoho', file: 'public/logos/replaced-apps/28-zoho.svg', alt: 'Zoho' },
  { slug: 'replaced-square', file: 'public/logos/replaced-apps/29-square.svg', alt: 'Square' },
  { slug: 'replaced-paypal', file: 'public/logos/replaced-apps/30-paypal.svg', alt: 'PayPal' },
  { slug: 'replaced-google-analytics', file: 'public/logos/replaced-apps/31-google-analytics.svg', alt: 'Google Analytics' },
  { slug: 'replaced-buffer', file: 'public/logos/replaced-apps/32-buffer.svg', alt: 'Buffer' },
  { slug: 'replaced-hootsuite', file: 'public/logos/replaced-apps/33-hootsuite.svg', alt: 'Hootsuite' },
  { slug: 'replaced-wordpress', file: 'public/logos/replaced-apps/34-wordpress.svg', alt: 'WordPress' },
  { slug: 'replaced-basecamp', file: 'public/logos/replaced-apps/35-basecamp.svg', alt: 'Basecamp' },
  { slug: 'replaced-make', file: 'public/logos/replaced-apps/36-make.svg', alt: 'Make' },
  { slug: 'tony-og-image', file: 'public/sites/tonybarlettajr/og-image.jpg', alt: 'Tony Barletta Jr. OG image' },
  { slug: 'tony-headshot', file: 'public/sites/tonybarlettajr/headshot.png', alt: 'Tony Barletta Jr.' },
  { slug: 'tony-hero', file: 'public/sites/tonybarlettajr/hero.jpg', alt: 'Tony Barletta Jr. hero' },
  { slug: 'tony-property-p1', file: 'public/sites/tonybarlettajr/properties/p1.jpg', alt: 'Property 1' },
  { slug: 'tony-property-p2', file: 'public/sites/tonybarlettajr/properties/p2.jpg', alt: 'Property 2' },
  { slug: 'tony-property-p3', file: 'public/sites/tonybarlettajr/properties/p3.jpg', alt: 'Property 3' },
  { slug: 'tony-property-p4', file: 'public/sites/tonybarlettajr/properties/p4.jpg', alt: 'Property 4' },
  { slug: 'tony-property-p5', file: 'public/sites/tonybarlettajr/properties/p5.jpg', alt: 'Property 5' },
  { slug: 'tony-property-p6', file: 'public/sites/tonybarlettajr/properties/p6.jpg', alt: 'Property 6' },
  { slug: 'tony-property-p7', file: 'public/sites/tonybarlettajr/properties/p7.jpg', alt: 'Property 7' },
  { slug: 'tony-property-p8', file: 'public/sites/tonybarlettajr/properties/p8.jpg', alt: 'Property 8' },
];

function mimeFor(file: string): string | null {
  const name = file.toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.pdf')) return 'application/pdf';
  return null;
}

function readDotEnvFile(): Record<string, string> {
  const envPath = join(ROOT, '.env');
  const out: Record<string, string> = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function databaseUrl(): string {
  const fileEnv = readDotEnvFile();
  const candidates = [
    process.env.DATABASE_PUBLIC_URL,
    fileEnv.DATABASE_PUBLIC_URL,
    process.env.DATABASE_URL,
    fileEnv.DATABASE_URL,
  ];
  for (const raw of candidates) {
    const url = raw?.trim();
    if (url && !url.includes('.railway.internal')) return url;
  }
  throw new Error('Set DATABASE_PUBLIC_URL or a public DATABASE_URL (not *.railway.internal)');
}

async function main(): Promise<void> {
  const url = databaseUrl();
  const ssl = /sslmode=(require|verify-full|verify-ca)/i.test(url)
    ? { rejectUnauthorized: false }
    : undefined;
  const pool = new pg.Pool({ connectionString: url, ssl, max: 2 });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_library (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename      TEXT NOT NULL,
      media_type    TEXT NOT NULL,
      size_bytes    BIGINT NOT NULL,
      data_base64   TEXT NOT NULL,
      alt_text      TEXT,
      uploaded_by   TEXT,
      slug          TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE media_library ADD COLUMN IF NOT EXISTS slug TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS media_library_slug_uidx
      ON media_library (slug) WHERE slug IS NOT NULL AND btrim(slug) <> '';
  `);

  const { rows: existing } = await pool.query<{
    id: string;
    filename: string;
    slug: string | null;
  }>(`SELECT id, filename, slug FROM media_library`);
  const bySlug = new Map(
    existing.filter((r) => r.slug).map((r) => [r.slug as string, r]),
  );
  const byFilename = new Map(existing.map((r) => [r.filename.toLowerCase(), r]));

  let added = 0;
  let skipped = 0;
  let updated = 0;
  let failed = 0;

  for (const item of SEED) {
    if (bySlug.has(item.slug) && !item.replace) {
      skipped += 1;
      continue;
    }

    const abs = join(ROOT, item.file);
    if (!existsSync(abs)) {
      console.warn(`missing ${item.file}`);
      failed += 1;
      continue;
    }

    const filename = item.file.split('/').pop() || item.slug;
    const match = byFilename.get(filename.toLowerCase());
    if (match && !match.slug) {
      await pool.query(
        `UPDATE media_library SET slug = $2, alt_text = COALESCE(alt_text, $3) WHERE id = $1`,
        [match.id, item.slug, item.alt],
      );
      bySlug.set(item.slug, match);
      updated += 1;
      console.log(`slug ${item.slug} → ${match.id}`);
      continue;
    }

    const mediaType = mimeFor(filename);
    if (!mediaType) {
      console.warn(`unsupported type ${item.file}`);
      failed += 1;
      continue;
    }

    const buf = readFileSync(abs);
    const dataBase64 = buf.toString('base64');
    const existing = bySlug.get(item.slug);
    if (existing && item.replace) {
      try {
        await pool.query(
          `UPDATE media_library
           SET filename = $2, media_type = $3, size_bytes = $4, data_base64 = $5, alt_text = $6
           WHERE id = $1`,
          [existing.id, filename, mediaType, buf.length, dataBase64, item.alt],
        );
        updated += 1;
        console.log(`replaced ${item.slug}`);
      } catch (e) {
        console.error(`failed ${item.slug}:`, e instanceof Error ? e.message : e);
        failed += 1;
      }
      continue;
    }
    try {
      await pool.query(
        `INSERT INTO media_library (filename, media_type, size_bytes, data_base64, alt_text, uploaded_by, slug)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [filename, mediaType, buf.length, dataBase64, item.alt, 'seed-site-media', item.slug],
      );
      added += 1;
      console.log(`added ${item.slug}`);
    } catch (e) {
      console.error(`failed ${item.slug}:`, e instanceof Error ? e.message : e);
      failed += 1;
    }
  }

  await pool.end();
  console.log(`seed-site-media: added=${added} updated=${updated} skipped=${skipped} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
