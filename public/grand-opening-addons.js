/**
 * Grand opening add-on toggles — syncs selected labels into #go-selected-addons.
 */
(function initGrandOpeningAddons() {
  const root = document.getElementById('go-addons-root');
  if (!root) return;

  /** @type {{ feature: string; label: string; blurb: string; priceLabel: string }[]} */
  let addons = [];
  try {
    addons = JSON.parse(root.dataset.addons || '[]');
  } catch {
    addons = [];
  }
  if (!addons.length) {
    root.innerHTML = '<p class="go-addons-empty">Add-on options will appear here soon.</p>';
    return;
  }

  const hidden = document.getElementById('go-selected-addons');
  /** @type {Set<string>} */
  const selected = new Set();

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function syncHidden() {
    if (!hidden) return;
    const labels = addons.filter((m) => selected.has(m.feature)).map((m) => m.label);
    hidden.value = labels.length ? labels.join(', ') : '';
  }

  function render() {
    root.innerHTML =
      `<div class="go-addons-grid">` +
      addons
        .map((m) => {
          const on = selected.has(m.feature);
          return (
            `<article class="go-addon-tile${on ? ' go-addon-tile--on' : ''}" data-feature="${esc(m.feature)}">` +
            `<div class="go-addon-tile__head">` +
            `<h3 class="go-addon-tile__label">${esc(m.label)}</h3>` +
            `<button type="button" class="go-addon-switch" role="switch" ` +
            `aria-checked="${on ? 'true' : 'false'}" ` +
            `aria-label="Interested in ${esc(m.label)}"></button>` +
            `</div>` +
            (m.blurb ? `<p class="go-addon-tile__blurb">${esc(m.blurb)}</p>` : '') +
            (m.priceLabel ? `<span class="go-addon-tile__price">${esc(m.priceLabel)}</span>` : '') +
            `</article>`
          );
        })
        .join('') +
      `</div>`;
  }

  root.addEventListener('click', (event) => {
    const btn = event.target.closest('.go-addon-switch');
    if (!btn) return;
    const tile = btn.closest('[data-feature]');
    const feature = tile?.getAttribute('data-feature');
    if (!feature) return;
    const on = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    tile.classList.toggle('go-addon-tile--on', on);
    if (on) selected.add(feature);
    else selected.delete(feature);
    syncHidden();
  });

  render();
})();
