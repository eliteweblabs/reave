/**
 * QR code generation for project portal links (admin, client portal, email).
 */
import QRCode from 'qrcode';

export async function qrCodeDataUrl(text: string, size = 160): Promise<string> {
  const url = text.trim();
  if (!url) return '';
  return QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    color: { dark: '#111111', light: '#ffffff' },
  });
}
