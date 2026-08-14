const NS = {
  D: 'DAV:',
};

function escXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function xmlResponse(body: string, status = 207, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

type PropValue =
  | { kind: 'raw'; xml: string }
  | { kind: 'text'; ns: 'D'; tag: string; value: string }
  | { kind: 'empty'; ns: 'D'; tag: string };

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
    `<D:multistatus xmlns:D="${NS.D}">` +
    chunks.join('') +
    `</D:multistatus>`
  );
}

export function collectionType(): PropValue {
  return { kind: 'raw', xml: '<D:resourcetype><D:collection/></D:resourcetype>' };
}

export function emptyResourceType(): PropValue {
  return { kind: 'raw', xml: '<D:resourcetype/>' };
}

export function lockDiscoveryXml(token: string, href: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:prop xmlns:D="${NS.D}">` +
    `<D:lockdiscovery><D:activelock>` +
    `<D:locktype><D:write/></D:locktype>` +
    `<D:lockscope><D:exclusive/></D:lockscope>` +
    `<D:depth>0</D:depth>` +
    `<D:timeout>Second-3600</D:timeout>` +
    `<D:locktoken><D:href>${escXml(token)}</D:href></D:locktoken>` +
    `<D:lockroot><D:href>${escXml(href)}</D:href></D:lockroot>` +
    `</D:activelock></D:lockdiscovery>` +
    `</D:prop>`
  );
}

export { NS, escXml };
export type { PropValue, ResponseEntry };
