/**
 * WebDAV view of the media library — mount /webdav as a folder on Mac / iPhone.
 * PUT adds or replaces a library item; PROPFIND lists current files.
 */
import { randomUUID } from 'crypto';
import {
  inferMediaLibraryType,
  MEDIA_LIBRARY_MAX_BYTES,
  projectFileResponseHeaders,
  storeAddMedia,
  storeDeleteMedia,
  storeGetMedia,
  storeListMedia,
  storeUpdateMedia,
  type MediaLibrarySummary,
} from '../mediaLibrary';
import { requestOrigin, siteBaseUrl } from '../requestOrigin';
import {
  davDiscoveryHeaders,
  MEDIA_WEBDAV_PREFIX,
  type MediaWebdavAuth,
} from './auth';
import {
  decodePathSegment,
  findItemByWebdavName,
  isIgnoredWebdavName,
  sanitizeWebdavFilename,
  webdavNameForItem,
} from './names';
import {
  collectionType,
  emptyResourceType,
  lockDiscoveryXml,
  multistatus,
  xmlResponse,
  type PropValue,
} from './xml';

const COLLECTION_NAME = 'Media';

function collectionHref(origin: string): string {
  return `${origin}${MEDIA_WEBDAV_PREFIX}/`;
}

function fileHref(origin: string, name: string): string {
  return `${origin}${MEDIA_WEBDAV_PREFIX}/${encodeURIComponent(name)}`;
}

function parseDepth(header: string | null): 0 | 1 {
  const v = (header ?? '0').trim().toLowerCase();
  if (v === '1' || v === 'infinity') return 1;
  return 0;
}

function propfindWantedProps(body: string): Set<string> | null {
  if (!body.trim()) return null;
  const props = new Set<string>();
  const re = /<(?:[\w-]+:)?([\w-]+)(?:\s|\/>|>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    if (tag === 'propfind' || tag === 'prop' || tag === 'allprop' || tag === 'include') continue;
    props.add(tag);
  }
  return props.size ? props : null;
}

function wantsProp(wanted: Set<string> | null, name: string): boolean {
  return !wanted || wanted.has(name.toLowerCase());
}

function httpDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function collectionProps(wanted: Set<string> | null, latestIso: string): PropValue[] {
  const props: PropValue[] = [];
  if (wantsProp(wanted, 'resourcetype')) props.push(collectionType());
  if (wantsProp(wanted, 'displayname')) {
    props.push({ kind: 'text', ns: 'D', tag: 'displayname', value: COLLECTION_NAME });
  }
  if (wantsProp(wanted, 'getlastmodified')) {
    props.push({ kind: 'text', ns: 'D', tag: 'getlastmodified', value: httpDate(latestIso) });
  }
  if (wantsProp(wanted, 'creationdate')) {
    props.push({ kind: 'text', ns: 'D', tag: 'creationdate', value: latestIso });
  }
  if (wantsProp(wanted, 'getetag')) {
    props.push({ kind: 'text', ns: 'D', tag: 'getetag', value: `"media:${latestIso}"` });
  }
  if (wantsProp(wanted, 'getcontenttype')) {
    props.push({ kind: 'text', ns: 'D', tag: 'getcontenttype', value: 'httpd/unix-directory' });
  }
  return props;
}

function fileProps(item: MediaLibrarySummary, name: string, wanted: Set<string> | null): PropValue[] {
  const props: PropValue[] = [];
  if (wantsProp(wanted, 'resourcetype')) props.push(emptyResourceType());
  if (wantsProp(wanted, 'displayname')) {
    props.push({ kind: 'text', ns: 'D', tag: 'displayname', value: name });
  }
  if (wantsProp(wanted, 'getcontentlength')) {
    props.push({ kind: 'text', ns: 'D', tag: 'getcontentlength', value: String(item.sizeBytes) });
  }
  if (wantsProp(wanted, 'getcontenttype')) {
    props.push({ kind: 'text', ns: 'D', tag: 'getcontenttype', value: item.mediaType });
  }
  if (wantsProp(wanted, 'getlastmodified')) {
    props.push({ kind: 'text', ns: 'D', tag: 'getlastmodified', value: httpDate(item.createdAt) });
  }
  if (wantsProp(wanted, 'creationdate')) {
    props.push({ kind: 'text', ns: 'D', tag: 'creationdate', value: item.createdAt });
  }
  if (wantsProp(wanted, 'getetag')) {
    props.push({
      kind: 'text',
      ns: 'D',
      tag: 'getetag',
      value: `"${item.id}:${item.sizeBytes}"`,
    });
  }
  return props;
}

function fileSegment(segments: string[]): string | null {
  if (segments.length !== 1) return null;
  return sanitizeWebdavFilename(decodePathSegment(segments[0] ?? ''));
}

async function handlePropfind(request: Request, segments: string[], origin: string): Promise<Response> {
  const depth = parseDepth(request.headers.get('Depth'));
  const body = await request.text();
  const wanted = propfindWantedProps(body);
  const items = await storeListMedia(500);
  const latestIso = items[0]?.createdAt || new Date().toISOString();
  const responses: Parameters<typeof multistatus>[0] = [];

  if (segments.length === 0) {
    responses.push({ href: collectionHref(origin), props: collectionProps(wanted, latestIso) });
    if (depth === 1) {
      for (const item of items) {
        const name = webdavNameForItem(item, items);
        responses.push({
          href: fileHref(origin, name),
          props: fileProps(item, name, wanted),
        });
      }
    }
    return xmlResponse(multistatus(responses), 207, davDiscoveryHeaders());
  }

  const name = fileSegment(segments);
  if (!name) {
    return new Response('Not found', { status: 404, headers: davDiscoveryHeaders() });
  }
  const item = findItemByWebdavName(name, items);
  if (!item) {
    return new Response('Not found', { status: 404, headers: davDiscoveryHeaders() });
  }
  const listed = webdavNameForItem(item, items);
  responses.push({
    href: fileHref(origin, listed),
    props: fileProps(item, listed, wanted),
  });
  return xmlResponse(multistatus(responses), 207, davDiscoveryHeaders());
}

async function handleGet(
  segments: string[],
  headOnly: boolean,
): Promise<Response> {
  const name = fileSegment(segments);
  if (!name) {
    return new Response('Media drop folder. Mount this URL as a WebDAV drive.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...davDiscoveryHeaders() },
    });
  }
  const items = await storeListMedia(500);
  const summary = findItemByWebdavName(name, items);
  if (!summary) return new Response('Not found', { status: 404, headers: davDiscoveryHeaders() });
  const record = await storeGetMedia(summary.id);
  if (!record) return new Response('Not found', { status: 404, headers: davDiscoveryHeaders() });

  const bytes = Buffer.from(record.dataBase64, 'base64');
  const headers = projectFileResponseHeaders(record.mediaType, record.filename, bytes.length);
  Object.assign(headers, davDiscoveryHeaders());
  headers.ETag = `"${record.id}:${record.sizeBytes}"`;
  headers['Last-Modified'] = httpDate(record.createdAt);
  if (headOnly) {
    return new Response(null, { status: 200, headers });
  }
  return new Response(new Uint8Array(bytes), { headers });
}

async function handlePut(
  request: Request,
  segments: string[],
  auth: MediaWebdavAuth,
): Promise<Response> {
  const name = fileSegment(segments);
  if (!name) {
    return new Response('PUT a file inside the Media folder', {
      status: 405,
      headers: davDiscoveryHeaders(),
    });
  }
  if (isIgnoredWebdavName(name)) {
    return new Response(null, { status: 204, headers: davDiscoveryHeaders() });
  }

  const declared = Number.parseInt(request.headers.get('Content-Length') || '', 10);
  if (Number.isFinite(declared) && declared > MEDIA_LIBRARY_MAX_BYTES) {
    return new Response(`File too large (max ${MEDIA_LIBRARY_MAX_BYTES / (1024 * 1024)} MB)`, {
      status: 413,
      headers: davDiscoveryHeaders(),
    });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length === 0) {
    return new Response(null, { status: 204, headers: davDiscoveryHeaders() });
  }
  if (buffer.length > MEDIA_LIBRARY_MAX_BYTES) {
    return new Response(`File too large (max ${MEDIA_LIBRARY_MAX_BYTES / (1024 * 1024)} MB)`, {
      status: 413,
      headers: davDiscoveryHeaders(),
    });
  }

  const mediaType = inferMediaLibraryType({
    type: request.headers.get('Content-Type') || '',
    name,
  });
  if (!mediaType) {
    return new Response('File must be an image (JPEG, PNG, GIF, WebP, SVG) or PDF', {
      status: 415,
      headers: davDiscoveryHeaders(),
    });
  }

  const items = await storeListMedia(500);
  const existing = findItemByWebdavName(name, items);
  const dataBase64 = buffer.toString('base64');
  const uploadedBy = `webdav:${auth.username}`;

  if (existing) {
    const result = await storeUpdateMedia(existing.id, {
      mediaType,
      dataBase64,
      filename: name,
    });
    if (!result.ok) {
      return new Response(result.error, { status: 400, headers: davDiscoveryHeaders() });
    }
    return new Response(null, {
      status: 204,
      headers: {
        ...davDiscoveryHeaders(),
        ETag: `"${result.item.id}:${result.item.sizeBytes}"`,
      },
    });
  }

  const result = await storeAddMedia({
    filename: name,
    mediaType,
    dataBase64,
    uploadedBy,
    slug: name.replace(/\.[a-z0-9]+$/i, ''),
  });
  if (!result.ok) {
    return new Response(result.error, { status: 400, headers: davDiscoveryHeaders() });
  }
  return new Response(null, {
    status: 201,
    headers: {
      ...davDiscoveryHeaders(),
      Location: `${MEDIA_WEBDAV_PREFIX}/${encodeURIComponent(name)}`,
      ETag: `"${result.item.id}:${result.item.sizeBytes}"`,
    },
  });
}

async function handleDelete(segments: string[]): Promise<Response> {
  const name = fileSegment(segments);
  if (!name) {
    return new Response('Cannot delete the Media folder', {
      status: 403,
      headers: davDiscoveryHeaders(),
    });
  }
  if (isIgnoredWebdavName(name)) {
    return new Response(null, { status: 204, headers: davDiscoveryHeaders() });
  }
  const items = await storeListMedia(500);
  const existing = findItemByWebdavName(name, items);
  if (!existing) return new Response('Not found', { status: 404, headers: davDiscoveryHeaders() });
  const ok = await storeDeleteMedia(existing.id);
  if (!ok) return new Response('Not found', { status: 404, headers: davDiscoveryHeaders() });
  return new Response(null, { status: 204, headers: davDiscoveryHeaders() });
}

function handleLock(segments: string[], origin: string): Response {
  const name = fileSegment(segments);
  const href = name ? fileHref(origin, name) : collectionHref(origin);
  const token = `opaquelocktoken:${randomUUID()}`;
  return xmlResponse(lockDiscoveryXml(token, href), 200, {
    ...davDiscoveryHeaders(),
    'Lock-Token': `<${token}>`,
  });
}

export async function handleMediaWebdav(
  request: Request,
  segments: string[],
  auth: MediaWebdavAuth,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const origin = requestOrigin(request);

  switch (method) {
    case 'OPTIONS':
      return new Response(null, { status: 200, headers: davDiscoveryHeaders() });
    case 'PROPFIND':
      return handlePropfind(request, segments, origin);
    case 'GET':
      return handleGet(segments, false);
    case 'HEAD':
      return handleGet(segments, true);
    case 'PUT':
      return handlePut(request, segments, auth);
    case 'DELETE':
      return handleDelete(segments);
    case 'LOCK':
      return handleLock(segments, origin);
    case 'UNLOCK':
      return new Response(null, { status: 204, headers: davDiscoveryHeaders() });
    case 'MKCOL':
      return new Response('The media drop folder is flat — no subfolders', {
        status: 403,
        headers: davDiscoveryHeaders(),
      });
    default:
      return new Response('Method Not Allowed', {
        status: 405,
        headers: davDiscoveryHeaders(),
      });
  }
}

export function wellKnownWebdavLocation(): string {
  return `${siteBaseUrl()}${MEDIA_WEBDAV_PREFIX}/`;
}

export { MEDIA_WEBDAV_PREFIX };
