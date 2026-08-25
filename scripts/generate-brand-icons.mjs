/**
 * Regenerate square brand mark PNGs (OG image, favicons, apple-touch-icon).
 * Favicons use a pure #000 background; the header/profile avatar uses transparency.
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
  { out: 'public/logo-icon-avatar.png', size: 192, transparent: true },
];

/** AV triangles only — same paths as ReaveLogoMark / qrCode.ts (no R or E bars). */
function buildAvMarkSvg(size, { transparent = false } = {}) {
  const pad = size * 0.22;
  const markW = size - pad * 2;
  const markH = markW * (100 / 137);
  const ox = (size - markW) / 2;
  const oy = (size - markH) / 2;
  const sx = markW / 137;
  const sy = markH / 100;

  const background = transparent
    ? ''
    : `<rect width="${size}" height="${size}" fill="#000000"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${background}
  <defs>
    <linearGradient id="brand" gradientUnits="userSpaceOnUse" x1="${ox}" y1="${oy + markH}" x2="${ox + markW}" y2="${oy}">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e4e4e7"/>
    </linearGradient>
  </defs>
  <g transform="translate(${ox - 241 * sx}, ${oy - 214 * sy}) scale(${sx}, ${sy})">
    <path fill="url(#brand)" d="M241.2,313.4l42.1-99.3,42.6,99.3"/>
    <path fill="url(#brand)" d="M298.5,214.1h79.7l-40.3,99.3"/>
  </g>
</svg>`;
}

for (const { out, size, transparent = false } of OUTPUTS) {
  const svg = buildAvMarkSvg(size, { transparent });
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`Wrote ${out} (${size}×${size}${transparent ? ', transparent' : ''})`);
}
