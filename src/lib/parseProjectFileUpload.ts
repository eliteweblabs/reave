import {
  PROJECT_FILE_MAX_BYTES,
  PROJECT_UPLOAD_MEDIA_TYPES,
} from './projectFiles';
import { jsonResponse } from './apiResponse';

export type ParsedProjectFileUpload =
  | { ok: true; filename: string; mediaType: string; buffer: Buffer }
  | { ok: false; response: Response };

function projectFileUploadError(message: string, status = 400): ParsedProjectFileUpload {
  return { ok: false, response: jsonResponse({ ok: false, error: message }, status) };
}

/** Parse and validate a multipart project file upload (field name: `file`). */
export async function parseProjectFileUpload(request: Request): Promise<ParsedProjectFileUpload> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return projectFileUploadError('Expected multipart form data');
  }

  const file = form.get('file');
  if (!(file instanceof File) || !file.size) {
    return projectFileUploadError('Missing file');
  }

  const mediaType = file.type.trim().toLowerCase();
  if (!PROJECT_UPLOAD_MEDIA_TYPES.has(mediaType)) {
    return projectFileUploadError('File must be an image (JPEG, PNG, GIF, WebP) or PDF');
  }
  if (file.size > PROJECT_FILE_MAX_BYTES) {
    return projectFileUploadError(
      `File too large (max ${PROJECT_FILE_MAX_BYTES / (1024 * 1024)} MB)`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    ok: true,
    filename: file.name.trim() || 'upload',
    mediaType,
    buffer,
  };
}
