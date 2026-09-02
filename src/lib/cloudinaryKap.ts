/**
 * Kap → Cloudinary uploads (server-side; credentials stay on Railway).
 * Mirrors resource_type rules from urre/kap-cloudinary.
 */

import { v2 as cloudinary } from 'cloudinary';
import { serverEnv } from './serverEnv';

export function isCloudinaryKapConfigured(): boolean {
  return Boolean(
    serverEnv('CLOUDINARY_CLOUD_NAME')?.trim() &&
      serverEnv('CLOUDINARY_API_KEY')?.trim() &&
      serverEnv('CLOUDINARY_API_SECRET')?.trim(),
  );
}

function configureCloudinary(): void {
  cloudinary.config({
    cloud_name: serverEnv('CLOUDINARY_CLOUD_NAME')!.trim(),
    api_key: serverEnv('CLOUDINARY_API_KEY')!.trim(),
    api_secret: serverEnv('CLOUDINARY_API_SECRET')!.trim(),
    secure: true,
  });
}

export function cloudinaryResourceType(mediaType: string): 'image' | 'video' {
  const type = mediaType.trim().toLowerCase();
  if (type === 'image/gif' || type === 'image/apng') return 'image';
  if (type === 'video/webm' || type === 'video/mp4') return 'video';
  return 'video';
}

export async function uploadKapBufferToCloudinary(input: {
  buffer: Buffer;
  mediaType: string;
  filename?: string;
}): Promise<{ ok: true; url: string; publicId: string } | { ok: false; error: string }> {
  if (!isCloudinaryKapConfigured()) {
    return { ok: false, error: 'Cloudinary is not configured on this service' };
  }

  configureCloudinary();

  const resourceType = cloudinaryResourceType(input.mediaType);
  const folder = serverEnv('CLOUDINARY_KAP_FOLDER')?.trim() || 'kap';

  try {
    const result = await new Promise<cloudinary.UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          folder,
          ...(input.filename?.trim() ? { public_id: undefined, use_filename: true, unique_filename: true } : {}),
        },
        (error, uploadResult) => {
          if (error || !uploadResult) reject(error ?? new Error('Cloudinary upload failed'));
          else resolve(uploadResult);
        },
      );
      stream.end(input.buffer);
    });

    const url = result.secure_url?.trim();
    const publicId = result.public_id?.trim();
    if (!url || !publicId) {
      return { ok: false, error: 'Cloudinary upload returned an incomplete response' };
    }

    return { ok: true, url, publicId };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Cloudinary upload failed';
    return { ok: false, error: message };
  }
}
