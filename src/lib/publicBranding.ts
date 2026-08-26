/**
 * Optional per-install drop folder. Production serves company config at
 * /branding/logo.png — these files are a local/dev override only (gitignored).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { projectRoot } from './projectRoot';

export const PUBLIC_BRANDING_DIR = 'public/branding';

export type PublicBrandFile = 'logo.png' | 'icon.png' | 'logo.svg' | 'icon.svg';

const MEDIA: Record<PublicBrandFile, string> = {
  'logo.png': 'image/png',
  'icon.png': 'image/png',
  'logo.svg': 'image/svg+xml',
  'icon.svg': 'image/svg+xml',
};

export function readPublicBrandingFile(
  name: PublicBrandFile,
): { data: Buffer; mediaType: string } | null {
  const path = join(projectRoot(), PUBLIC_BRANDING_DIR, name);
  if (!existsSync(path)) return null;
  try {
    const data = readFileSync(path);
    if (!data.length) return null;
    return { data, mediaType: MEDIA[name] };
  } catch {
    return null;
  }
}
