/**
 * GET /r/:token — serve a Kap screen recording (unguessable token; no expiry).
 */

import type { APIRoute } from 'astro';
import { getKapRecording, isValidKapRecordingToken } from '../../lib/kapRecordings';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const token = (params.token ?? '').trim();
  if (!token || !isValidKapRecordingToken(token)) {
    return new Response('Not found', { status: 404 });
  }

  const record = await getKapRecording(token);
  if (!record) return new Response('Not found', { status: 404 });

  const buffer = Buffer.from(record.dataBase64, 'base64');
  const inline = record.mediaType.startsWith('image/') || record.mediaType.startsWith('video/');
  const disposition = inline
    ? 'inline'
    : `inline; filename="${record.filename.replace(/"/g, '')}"`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': record.mediaType,
      'Content-Disposition': disposition,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(buffer.length),
    },
  });
};
