/**
 * QR code generation for project portal links (admin, client portal, email).
 * Centers the Reave AV mark in black-and-white with high error correction.
 */
import QRCode from 'qrcode';
import sharp from 'sharp';

const QR_DARK = '#111111';
const QR_LIGHT = '#ffffff';

/** AV favicon mark only — 3rd + 4th glyphs from ReaveLogoMark (not R/E). */
const REAVE_AV_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="241 214 202 100">
  <rect x="241" y="214" width="202" height="100" fill="${QR_LIGHT}"/>
  <path fill="${QR_DARK}" d="M241.2,313.4l42.1-99.3,42.6,99.3"/>
  <path fill="${QR_DARK}" d="M298.5,214.1h79.7l-40.3,99.3"/>
  <polygon fill="${QR_DARK}" points="368.2 270.5 443.3 270.5 443.3 303.8 354.4 303.8 368.2 270.5"/>
  <polygon fill="${QR_DARK}" points="386.5 224.7 443.3 224.7 443.3 258 372.7 258 386.5 224.7"/>
</svg>`;

const AV_MARK_ASPECT = 202 / 100;

async function reaveAvMarkOverlay(size: number): Promise<{ input: Buffer; left: number; top: number }> {
  const markWidth = Math.max(18, Math.round(size * 0.22));
  const markHeight = Math.max(9, Math.round(markWidth / AV_MARK_ASPECT));
  const pad = Math.max(2, Math.round(markHeight * 0.12));
  const boxWidth = markWidth + pad * 2;
  const boxHeight = markHeight + pad * 2;

  const overlay = await sharp(Buffer.from(REAVE_AV_MARK_SVG))
    .resize(markWidth, markHeight, { fit: 'contain', background: QR_LIGHT })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: QR_LIGHT,
    })
    .png()
    .toBuffer();

  return {
    input: overlay,
    left: Math.round((size - boxWidth) / 2),
    top: Math.round((size - boxHeight) / 2),
  };
}

export async function qrCodeDataUrl(text: string, size = 160): Promise<string> {
  const url = text.trim();
  if (!url) return '';

  const qrBuffer = await QRCode.toBuffer(url, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: QR_DARK, light: QR_LIGHT },
    type: 'png',
  });

  const logo = await reaveAvMarkOverlay(size);
  const composed = await sharp(qrBuffer)
    .composite([logo])
    .png()
    .toBuffer();

  return `data:image/png;base64,${composed.toString('base64')}`;
}
