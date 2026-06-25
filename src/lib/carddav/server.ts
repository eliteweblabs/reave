import {
  createContact,
  deleteContact,
  getContact,
  isContactApiConfigured,
  listContacts,
  updateContact,
  type ContactRecord,
} from '../contactApi';
import type { CardDavAuth } from './auth';
import { collectionCtag, contactEtag, contactToVCard, parseVCard } from './vcard';
import { addressDataProp, collectionType, multistatus, principalType, xmlResponse } from './xml';

const CARDDAV_PREFIX = '/carddav';

type CardDavPaths = {
  root: string;
  principals: string;
  principal: string;
  addressbooksHome: string;
  addressbook: string;
};

function cardDavPaths(username: string, origin: string): CardDavPaths {
  const base = `${origin}${CARDDAV_PREFIX}`;
  const enc = encodeURIComponent(username);
  return {
    root: `${base}/`,
    principals: `${base}/principals/`,
    principal: `${base}/principals/${enc}/`,
    addressbooksHome: `${base}/addressbooks/${enc}/`,
    addressbook: `${base}/addressbooks/${enc}/default/`,
  };
}

function contactHref(paths: CardDavPaths, uid: string): string {
  return `${paths.addressbook}${encodeURIComponent(uid)}.vcf`;
}

function normalizeHref(href: string, origin: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('/')) return `${origin}${href}`;
  return `${origin}/${href}`;
}

function parseDepth(header: string | null): 0 | 1 {
  const v = (header ?? '0').trim().toLowerCase();
  if (v === '1') return 1;
  return 0;
}

async function fetchAllContacts(): Promise<ContactRecord[]> {
  const all: ContactRecord[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const res = await listContacts({ limit, offset });
    if (!res.ok) throw new Error(res.error);
    const batch = res.data.contacts.filter((c) => !c.archived);
    all.push(...batch);
    if (all.length >= res.data.total || res.data.contacts.length < limit) break;
    offset += limit;
  }
  return all;
}

function uidFromPath(segments: string[], username: string): string | null {
  const prefix = ['addressbooks', username, 'default'];
  if (segments.length !== prefix.length + 1) return null;
  for (let i = 0; i < prefix.length; i++) {
    if (segments[i] !== prefix[i]) return null;
  }
  const file = segments[segments.length - 1] ?? '';
  if (!file.endsWith('.vcf')) return null;
  return decodeURIComponent(file.slice(0, -4));
}

function matchResource(
  segments: string[],
  username: string
): 'root' | 'principals' | 'principal' | 'addressbooksHome' | 'addressbook' | 'contact' | null {
  if (segments.length === 0) return 'root';
  if (segments.length === 1 && segments[0] === 'principals') return 'principals';
  if (segments.length === 2 && segments[0] === 'principals' && segments[1] === username) return 'principal';
  if (segments.length === 2 && segments[0] === 'addressbooks' && segments[1] === username) {
    return 'addressbooksHome';
  }
  if (
    segments.length === 3 &&
    segments[0] === 'addressbooks' &&
    segments[1] === username &&
    segments[2] === 'default'
  ) {
    return 'addressbook';
  }
  if (uidFromPath(segments, username)) return 'contact';
  return null;
}

function davHeaders(): Record<string, string> {
  return {
    DAV: '1, 2, 3, addressbook, access-control',
    Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, REPORT',
    'Cache-Control': 'no-store',
  };
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

async function propfindResponse(
  request: Request,
  auth: CardDavAuth,
  segments: string[],
  origin: string
): Promise<Response> {
  const paths = cardDavPaths(auth.username, origin);
  const depth = parseDepth(request.headers.get('Depth'));
  const body = await request.text();
  const wanted = propfindWantedProps(body);
  const resource = matchResource(segments, auth.username);

  const responses: Parameters<typeof multistatus>[0] = [];

  const add = (href: string, props: Parameters<typeof multistatus>[0][0]['props']) => {
    responses.push({ href, props });
  };

  const principalProps = () => {
    const props: Parameters<typeof multistatus>[0][0]['props'] = [];
    if (wantsProp(wanted, 'resourcetype')) props.push(principalType());
    if (wantsProp(wanted, 'displayname')) {
      props.push({ kind: 'text', ns: 'D', tag: 'displayname', value: auth.username });
    }
    if (wantsProp(wanted, 'current-user-principal')) {
      props.push({
        kind: 'raw',
        xml: `<D:current-user-principal><D:href>${paths.principal}</D:href></D:current-user-principal>`,
      });
    }
    if (wantsProp(wanted, 'principal-URL')) {
      props.push({
        kind: 'raw',
        xml: `<D:principal-URL><D:href>${paths.principal}</D:href></D:principal-URL>`,
      });
    }
    if (wantsProp(wanted, 'addressbook-home-set')) {
      props.push({
        kind: 'raw',
        xml: `<C:addressbook-home-set><D:href>${paths.addressbooksHome}</D:href></C:addressbook-home-set>`,
      });
    }
    return props;
  };

  const collectionProps = (displayName: string, addressbook: boolean, ctag?: string) => {
    const props: Parameters<typeof multistatus>[0][0]['props'] = [];
    if (wantsProp(wanted, 'resourcetype')) props.push(collectionType(addressbook));
    if (wantsProp(wanted, 'displayname')) {
      props.push({ kind: 'text', ns: 'D', tag: 'displayname', value: displayName });
    }
    if (ctag != null && wantsProp(wanted, 'getctag')) {
      props.push({ kind: 'text', ns: 'CS', tag: 'getctag', value: ctag });
    }
    if (wantsProp(wanted, 'supported-report-set')) {
      props.push({
        kind: 'raw',
        xml:
          '<D:supported-report-set>' +
          '<D:supported-report><D:report><C:addressbook-query/></D:report></D:supported-report>' +
          '<D:supported-report><D:report><C:addressbook-multiget/></D:report></D:supported-report>' +
          '<D:supported-report><D:report><D:sync-collection/></D:report></D:supported-report>' +
          '</D:supported-report-set>',
      });
    }
    return props;
  };

  if (resource === 'root' || resource === 'principals') {
    add(paths.root, principalProps());
    if (depth === 1 && resource === 'root') {
      add(paths.principals, collectionProps('Principals', false));
      add(paths.principal, principalProps());
    }
    return xmlResponse(multistatus(responses));
  }

  if (resource === 'principal') {
    add(paths.principal, principalProps());
    if (depth === 1) add(paths.addressbooksHome, collectionProps('Address Books', false));
    return xmlResponse(multistatus(responses));
  }

  if (resource === 'addressbooksHome') {
    add(paths.addressbooksHome, collectionProps('Address Books', false));
    if (depth === 1) {
      const contacts = await fetchAllContacts();
      add(paths.addressbook, collectionProps('Reave Contacts', true, collectionCtag(contacts)));
    }
    return xmlResponse(multistatus(responses));
  }

  if (resource === 'addressbook') {
    const contacts = await fetchAllContacts();
    add(paths.addressbook, collectionProps('Reave Contacts', true, collectionCtag(contacts)));
    if (depth === 1) {
      for (const c of contacts) {
        const props: Parameters<typeof multistatus>[0][0]['props'] = [];
        if (wantsProp(wanted, 'getetag')) {
          props.push({ kind: 'text', ns: 'D', tag: 'getetag', value: contactEtag(c) });
        }
        if (wantsProp(wanted, 'getcontenttype')) {
          props.push({
            kind: 'text',
            ns: 'D',
            tag: 'getcontenttype',
            value: 'text/vcard; charset=utf-8',
          });
        }
        if (wantsProp(wanted, 'displayname')) {
          props.push({ kind: 'text', ns: 'D', tag: 'displayname', value: c.name || c.uid });
        }
        add(contactHref(paths, c.uid), props);
      }
    }
    return xmlResponse(multistatus(responses));
  }

  if (resource === 'contact') {
    const uid = uidFromPath(segments, auth.username)!;
    const res = await getContact(uid);
    if (!res.ok || res.data.archived) {
      return new Response('Not Found', { status: 404, headers: davHeaders() });
    }
    const props: Parameters<typeof multistatus>[0][0]['props'] = [];
    if (wantsProp(wanted, 'getetag')) {
      props.push({ kind: 'text', ns: 'D', tag: 'getetag', value: contactEtag(res.data) });
    }
    if (wantsProp(wanted, 'getcontenttype')) {
      props.push({
        kind: 'text',
        ns: 'D',
        tag: 'getcontenttype',
        value: 'text/vcard; charset=utf-8',
      });
    }
    add(contactHref(paths, uid), props);
    return xmlResponse(multistatus(responses));
  }

  return new Response('Not Found', { status: 404, headers: davHeaders() });
}

function reportType(body: string): string | null {
  if (/<(?:[\w-]+:)?addressbook-query/i.test(body)) return 'addressbook-query';
  if (/<(?:[\w-]+:)?addressbook-multiget/i.test(body)) return 'addressbook-multiget';
  if (/<(?:[\w-]+:)?sync-collection/i.test(body)) return 'sync-collection';
  return null;
}

function hrefsFromReport(body: string, origin: string): string[] {
  const hrefs: string[] = [];
  const re = /<(?:[\w-]+:)?href[^>]*>([^<]+)<\/(?:[\w-]+:)?href>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) hrefs.push(normalizeHref(m[1].trim(), origin));
  return hrefs;
}

function wantsAddressData(body: string): boolean {
  return /<(?:[\w-]+:)?address-data/i.test(body);
}

function wantsEtag(body: string): boolean {
  return /<(?:[\w-]+:)?getetag/i.test(body);
}

async function reportResponse(
  request: Request,
  auth: CardDavAuth,
  segments: string[],
  origin: string
): Promise<Response> {
  const resource = matchResource(segments, auth.username);
  if (resource !== 'addressbook' && resource !== 'contact') {
    return new Response('Report not supported on this resource', { status: 403, headers: davHeaders() });
  }

  const body = await request.text();
  const kind = reportType(body);
  const paths = cardDavPaths(auth.username, origin);
  const includeData = wantsAddressData(body);
  const includeEtag = wantsEtag(body) || !body.trim();

  const responses: Parameters<typeof multistatus>[0] = [];

  const appendContact = (c: ContactRecord) => {
    const props: Parameters<typeof multistatus>[0][0]['props'] = [];
    if (includeEtag) {
      props.push({ kind: 'text', ns: 'D', tag: 'getetag', value: contactEtag(c) });
    }
    if (includeData) {
      props.push(addressDataProp(contactToVCard(c, { includeNotes: true }), 'text/vcard; version=3.0'));
    }
    responses.push({ href: contactHref(paths, c.uid), props });
  };

  if (kind === 'addressbook-multiget') {
    const hrefs = hrefsFromReport(body, origin);
    for (const href of hrefs) {
      const url = new URL(href);
      const rel = url.pathname.startsWith(CARDDAV_PREFIX)
        ? url.pathname.slice(CARDDAV_PREFIX.length).replace(/^\//, '').split('/')
        : [];
      const uid = uidFromPath(rel, auth.username);
      if (!uid) continue;
      const res = await getContact(uid);
      if (res.ok && !res.data.archived) appendContact(res.data);
    }
    return xmlResponse(multistatus(responses));
  }

  // addressbook-query and sync-collection: return all contacts in the book.
  const contacts = await fetchAllContacts();
  for (const c of contacts) appendContact(c);
  return xmlResponse(multistatus(responses));
}

async function getContactResource(
  auth: CardDavAuth,
  segments: string[],
  _origin: string
): Promise<Response> {
  if (matchResource(segments, auth.username) !== 'contact') {
    return new Response('Not Found', { status: 404, headers: davHeaders() });
  }

  const uid = uidFromPath(segments, auth.username);
  if (!uid) return new Response('Not Found', { status: 404, headers: davHeaders() });

  const res = await getContact(uid);
  if (!res.ok || res.data.archived) {
    return new Response('Not Found', { status: 404, headers: davHeaders() });
  }

  const body = contactToVCard(res.data, { includeNotes: true });
  return new Response(body, {
    status: 200,
    headers: {
      ...davHeaders(),
      'Content-Type': 'text/vcard; charset=utf-8',
      ETag: contactEtag(res.data),
    },
  });
}

async function putContactResource(
  request: Request,
  auth: CardDavAuth,
  segments: string[],
  origin: string
): Promise<Response> {
  if (matchResource(segments, auth.username) !== 'contact') {
    return new Response('Not Found', { status: 404, headers: davHeaders() });
  }

  const uid = uidFromPath(segments, auth.username);
  if (!uid) return new Response('Not Found', { status: 404, headers: davHeaders() });

  const raw = await request.text();
  const parsed = parseVCard(raw);
  if (!parsed) return new Response('Invalid vCard', { status: 400, headers: davHeaders() });

  const paths = cardDavPaths(auth.username, origin);

  const existing = await getContact(uid);
  let contact: ContactRecord;

  if (existing.ok && !existing.data.archived) {
    const patch: Parameters<typeof updateContact>[1] = {};
    if (parsed.name) patch.name = parsed.name;
    if (parsed.email !== undefined) patch.email = parsed.email;
    if (parsed.phone !== undefined) patch.phone = parsed.phone;
    if (parsed.company !== undefined) patch.company = parsed.company;
    if (parsed.notes !== undefined) patch.notes = parsed.notes;
    const updated = await updateContact(uid, patch);
    if (!updated.ok) {
      return new Response(updated.error, { status: updated.status ?? 502, headers: davHeaders() });
    }
    contact = updated.data;
  } else {
    if (!parsed.name?.trim()) {
      return new Response('FN or N required for new contact', { status: 400, headers: davHeaders() });
    }
    const created = await createContact({
      name: parsed.name.trim(),
      email: parsed.email,
      phone: parsed.phone,
      company: parsed.company,
      notes: parsed.notes,
    });
    if (!created.ok) {
      return new Response(created.error, { status: created.status ?? 502, headers: davHeaders() });
    }
    contact = created.data;
    // iOS may PUT to a client-chosen href before we assign uid — use created uid in Location.
  }

  const finalUid = contact.uid;
  const finalHref = contactHref(paths, finalUid);

  return new Response(null, {
    status: existing.ok ? 204 : 201,
    headers: {
      ...davHeaders(),
      ETag: contactEtag(contact),
      Location: finalHref,
    },
  });
}

async function deleteContactResource(
  auth: CardDavAuth,
  segments: string[]
): Promise<Response> {
  if (matchResource(segments, auth.username) !== 'contact') {
    return new Response('Not Found', { status: 404, headers: davHeaders() });
  }

  const uid = uidFromPath(segments, auth.username);
  if (!uid) return new Response('Not Found', { status: 404, headers: davHeaders() });

  const res = await deleteContact(uid);
  if (!res.ok) {
    return new Response(res.error, { status: res.status ?? 502, headers: davHeaders() });
  }
  return new Response(null, { status: 204, headers: davHeaders() });
}

export async function handleCardDav(
  request: Request,
  pathSegments: string[] | undefined,
  auth: CardDavAuth
): Promise<Response> {
  if (!isContactApiConfigured()) {
    return new Response('Contact API is not configured', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const segments = (pathSegments ?? []).filter(Boolean);
  const method = request.method.toUpperCase();

  switch (method) {
    case 'OPTIONS':
      return new Response(null, { status: 204, headers: davHeaders() });
    case 'PROPFIND':
      return propfindResponse(request, auth, segments, origin);
    case 'REPORT':
      return reportResponse(request, auth, segments, origin);
    case 'GET':
    case 'HEAD':
      return getContactResource(auth, segments, origin);
    case 'PUT':
      return putContactResource(request, auth, segments, origin);
    case 'DELETE':
      return deleteContactResource(auth, segments);
    default:
      return new Response('Method Not Allowed', { status: 405, headers: davHeaders() });
  }
}

/** Redirect target for /.well-known/carddav (RFC 6764). */
export function wellKnownCardDavLocation(origin: string): string {
  return `${origin}${CARDDAV_PREFIX}/`;
}

export { CARDDAV_PREFIX };
