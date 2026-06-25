const NS = {
  D: 'DAV:',
  C: 'urn:ietf:params:xml:ns:carddav',
  CS: 'http://calendarserver.org/ns/',
};

function escXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function xmlResponse(body: string, status = 207): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

type PropValue =
  | { kind: 'raw'; xml: string }
  | { kind: 'text'; ns: keyof typeof NS; tag: string; value: string }
  | { kind: 'empty'; ns: keyof typeof NS; tag: string };

type ResponseEntry = {
  href: string;
  props: PropValue[];
  notFound?: string[];
};

export function multistatus(responses: ResponseEntry[]): string {
  const chunks = responses.map((entry) => {
    const found = entry.props
      .map((p) => {
        if (p.kind === 'raw') return p.xml;
        if (p.kind === 'empty') return `<${p.ns}:${p.tag}/>`;
        return `<${p.ns}:${p.tag}>${escXml(p.value)}</${p.ns}:${p.tag}>`;
      })
      .join('');

    const missing = (entry.notFound ?? [])
      .map((tag) => `<D:prop><D:${tag}/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status>`)
      .join('');

    const propstat =
      found.length > 0
        ? `<D:propstat><D:prop>${found}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>`
        : '';

    return `<D:response><D:href>${escXml(entry.href)}</D:href>${propstat}${missing}</D:response>`;
  });

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:multistatus xmlns:D="${NS.D}" xmlns:C="${NS.C}" xmlns:CS="${NS.CS}">` +
    chunks.join('') +
    `</D:multistatus>`
  );
}

export function collectionType(addressbook = false): PropValue {
  const inner = addressbook
    ? '<D:collection/><C:addressbook/>'
    : '<D:collection/>';
  return { kind: 'raw', xml: `<D:resourcetype>${inner}</D:resourcetype>` };
}

export function principalType(): PropValue {
  return {
    kind: 'raw',
    xml: '<D:resourcetype><D:collection/><D:principal/></D:resourcetype>',
  };
}

export function addressDataProp(vcard: string, contentType?: string): PropValue {
  const ct = contentType ? ` content-type="${escXml(contentType)}"` : '';
  return {
    kind: 'raw',
    xml: `<C:address-data${ct}>${escXml(vcard)}</C:address-data>`,
  };
}

export { NS };
