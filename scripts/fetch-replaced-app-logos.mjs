/**
 * Regenerate baked brand SVGs for the "apps this platform replaces" wall.
 * Runtime pages read these from the media library (`replaced-*` slugs), not
 * from git — after generating, run `npm run seed:site-media` and do not
 * commit the files under public/logos/replaced-apps/.
 *
 * Each file is fetched from a pinned Simple Icons release
 * (https://simpleicons.org, CC0), then baked with the brand's fill color and
 * an accessible <title> so the icon is a self-contained SVG. A fresh
 * `node scripts/fetch-replaced-app-logos.mjs` plus seed is how you add or
 * refresh an icon.
 *
 * Some brands here (Outlook, Slack, Salesforce, DocuSign) were pulled from
 * later Simple Icons releases after trademark takedown requests from
 * Microsoft/Salesforce — see simple-icons/simple-icons#13503 and #11232. This
 * script pins to the last release that still shipped each one so the wall
 * keeps working instead of silently 404ing against the live CDN (which is
 * what the old inline-array + jsDelivr version of this page was doing).
 * Monday.com never had a Simple Icons entry, so it gets a small self-authored
 * monogram instead of vendoring an official logo file.
 * Video-conferencing brands (Zoom, Teams, Meet, etc.) are intentionally
 * omitted — this platform does not replace those tools.
 *
 * Prefix a filename with a two-digit number to control display order;
 * unprefixed files sort alphabetically after the numbered ones.
 *
 * Paper-white brand fills (`color: "#FFFFFF"`) stay white in the baked SVG so
 * they still read on dark. The homepage /features marquee tags those slugs
 * (PAPER_WHITE_REPLACED_APP_IMAGES) with `.blm-tile--invert` on light.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "logos", "replaced-apps");

/** Current release for icons Simple Icons still ships. */
const CURRENT = "16.27.1";
/** Last release before Microsoft-family icons (Outlook) and DocuSign were pulled. */
const PRE_MS_REMOVAL = "12.0.0";
/** Last release before the Salesforce-owned family (Slack, Salesforce, ...) and OpenAI were pulled. */
const PRE_SALESFORCE_REMOVAL = "13.19.0";

const SIMPLE_ICONS_CDN = (slug, version) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@${version}/icons/${slug}.svg`;

/** slug = Simple Icons filename, name = label shown on the card, color = brand hex. */
const ICONS = [
  { slug: "gmail", version: CURRENT, file: "01-gmail.svg", name: "Gmail", color: "#EA4335" },
  { slug: "microsoftoutlook", version: PRE_MS_REMOVAL, file: "02-outlook.svg", name: "Outlook", color: "#0078D4" },
  { slug: "googlecalendar", version: CURRENT, file: "03-google-calendar.svg", name: "Google Calendar", color: "#4285F4" },
  { slug: "openai", version: PRE_SALESFORCE_REMOVAL, file: "04-chatgpt.svg", name: "ChatGPT", color: "#412991" },
  { slug: "quickbooks", version: CURRENT, file: "05-quickbooks.svg", name: "QuickBooks", color: "#2CA01C" },
  { slug: "slack", version: PRE_SALESFORCE_REMOVAL, file: "06-slack.svg", name: "Slack", color: "#4A154B" },
  // Paper-white fills: BrandLogoMarquee adds .blm-tile--invert on the light canvas.
  { slug: "notion", version: CURRENT, file: "09-notion.svg", name: "Notion", color: "#FFFFFF" },
  { slug: "trello", version: CURRENT, file: "10-trello.svg", name: "Trello", color: "#0052CC" },
  { slug: "asana", version: CURRENT, file: "11-asana.svg", name: "Asana", color: "#F06A6A" },
  { custom: "monogram", file: "12-monday.svg", name: "Monday.com", color: "#FF3D57" },
  { slug: "hubspot", version: CURRENT, file: "13-hubspot.svg", name: "HubSpot", color: "#FF7A59" },
  { slug: "salesforce", version: PRE_SALESFORCE_REMOVAL, file: "14-salesforce.svg", name: "Salesforce", color: "#00A1E0" },
  { slug: "stripe", version: CURRENT, file: "15-stripe.svg", name: "Stripe", color: "#635BFF" },
  { slug: "calendly", version: CURRENT, file: "16-calendly.svg", name: "Calendly", color: "#006BFF" },
  { slug: "docusign", version: PRE_MS_REMOVAL, file: "17-docusign.svg", name: "DocuSign", color: "#FFCC22" },
  { slug: "mailchimp", version: CURRENT, file: "18-mailchimp.svg", name: "Mailchimp", color: "#FFE01B" },
  { slug: "dropbox", version: CURRENT, file: "19-dropbox.svg", name: "Dropbox", color: "#0061FF" },
  { slug: "googledrive", version: CURRENT, file: "20-google-drive.svg", name: "Google Drive", color: "#4285F4" },
  { slug: "airtable", version: CURRENT, file: "21-airtable.svg", name: "Airtable", color: "#18BFFF" },
  { slug: "clickup", version: CURRENT, file: "22-clickup.svg", name: "ClickUp", color: "#7B68EE" },
  { slug: "xero", version: CURRENT, file: "23-xero.svg", name: "Xero", color: "#13B5EA" },
  { slug: "typeform", version: CURRENT, file: "24-typeform.svg", name: "Typeform", color: "#FFFFFF" },
  { slug: "intercom", version: CURRENT, file: "25-intercom.svg", name: "Intercom", color: "#6AFDEF" },
  { slug: "zendesk", version: CURRENT, file: "26-zendesk.svg", name: "Zendesk", color: "#FFFFFF" },
  { slug: "zapier", version: CURRENT, file: "27-zapier.svg", name: "Zapier", color: "#FF4F00" },
  { slug: "zoho", version: CURRENT, file: "28-zoho.svg", name: "Zoho", color: "#E42527" },
  { slug: "square", version: CURRENT, file: "29-square.svg", name: "Square", color: "#FFFFFF" },
  { slug: "paypal", version: CURRENT, file: "30-paypal.svg", name: "PayPal", color: "#009CDE" },
  { slug: "googleanalytics", version: CURRENT, file: "31-google-analytics.svg", name: "Google Analytics", color: "#E37400" },
  // Paper-white fill — see Notion note above.
  { slug: "buffer", version: CURRENT, file: "32-buffer.svg", name: "Buffer", color: "#FFFFFF" },
  { slug: "hootsuite", version: CURRENT, file: "33-hootsuite.svg", name: "Hootsuite", color: "#FF4C46" },
  { slug: "wordpress", version: CURRENT, file: "34-wordpress.svg", name: "WordPress", color: "#21759B" },
  { slug: "basecamp", version: CURRENT, file: "35-basecamp.svg", name: "Basecamp", color: "#1D2D35" },
  { slug: "make", version: CURRENT, file: "36-make.svg", name: "Make", color: "#6D00CC" },
];

function bakeIcon(rawSvg, { name, color }) {
  let svg = rawSvg.replace(/<title>.*?<\/title>/i, `<title>${name}</title>`);
  // `fill` on the root <svg> cascades to the path(s), which ship with no
  // fill of their own — this is what makes the file self-contained.
  svg = svg.replace(/<svg /, `<svg fill="${color}" `);
  return svg;
}

/** Self-authored monogram fallback for brands with no redistributable mark. */
function monogramSvg({ name, color }) {
  const letter = name.trim().charAt(0).toUpperCase();
  return `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="${color}"><title>${name}</title><rect width="24" height="24" rx="6"/><text x="12" y="17" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#0b0512">${letter}</text></svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const icon of ICONS) {
    if (icon.custom === "monogram") {
      await writeFile(join(OUT_DIR, icon.file), monogramSvg(icon), "utf8");
      console.log(`Wrote ${icon.file} (monogram fallback)`);
      continue;
    }

    const res = await fetch(SIMPLE_ICONS_CDN(icon.slug, icon.version));
    if (!res.ok) {
      console.error(`Failed to fetch ${icon.slug}@${icon.version}: ${res.status} ${res.statusText}`);
      continue;
    }
    const raw = await res.text();
    const baked = bakeIcon(raw, icon);
    await writeFile(join(OUT_DIR, icon.file), baked, "utf8");
    console.log(`Wrote ${icon.file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
