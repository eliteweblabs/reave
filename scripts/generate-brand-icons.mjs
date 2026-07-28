/**
 * Regenerate square brand mark PNGs (OG image, favicons, apple-touch-icon).
 * Pure #000 background with the AV triangle mark in the brand gradient.
 *
 * Usage: node scripts/generate-brand-icons.mjs
 */
import sharp from 'sharp';

const OUTPUTS = [
  { out: 'public/logo-icon-og.png', size: 512 },
  { out: 'public/favicon-512.png', size: 512 },
  { out: 'public/favicon-192.png', size: 192 },
  { out: 'public/apple-touch-icon.png', size: 180 },
  { out: 'public/favicon-32x32.png', size: 32 },
  { out: 'public/favicon-16x16.png', size: 16 },
];

/** AV triangles only — same paths as ReaveLogoMark / qrCode.ts (no R or E bars). */
function buildAvMarkSvg(size) {
  const pad = size * 0.22;
  const markW = size - pad * 2;
  const markH = markW * (100 / 137);
  const ox = (size - markW) / 2;
  const oy = (size - markH) / 2;
  const sx = markW / 137;
  const sy = markH / 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#000000"/>
  <defs>
    <linearGradient id="brand" gradientUnits="userSpaceOnUse" x1="${ox}" y1="${oy + markH}" x2="${ox + markW}" y2="${oy}">
      <stop offset="0%" stop-color="#f472b6"/>
      <stop offset="52%" stop-color="#c026d3"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <g transform="translate(${ox - 241 * sx}, ${oy - 214 * sy}) scale(${sx}, ${sy})">
    <path fill="url(#brand)" d="M241.2,313.4l42.1-99.3,42.6,99.3"/>
    <path fill="url(#brand)" d="M298.5,214.1h79.7l-40.3,99.3"/>
  </g>
</svg>`;
}

for (const { out, size } of OUTPUTS) {
  const svg = buildAvMarkSvg(size);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`Wrote ${out} (${size}×${size})`);
}
