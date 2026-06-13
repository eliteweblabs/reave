import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/+esm';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
});

async function loadDiagram(url, outId, errId) {
  const out = document.getElementById(outId);
  const errEl = document.getElementById(errId);
  if (!out || !errEl) return;
  errEl.hidden = true;
  out.textContent = 'Loading…';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();
    const id = `m-${outId}-${Math.random().toString(36).slice(2, 10)}`;
    const { svg } = await mermaid.render(id, text);
    out.innerHTML = svg;
  } catch (e) {
    out.innerHTML = '';
    errEl.textContent = e instanceof Error ? e.message : String(e);
    errEl.hidden = false;
  }
}

void loadDiagram('/dev/os-architecture.mmd', 'arch-out', 'arch-err');
void loadDiagram('/dev/telegram-knowledge.mmd', 'tg-out', 'tg-err');
