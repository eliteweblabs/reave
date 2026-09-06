/**
 * Grand opening checkout — add-on toggles and Crater invoice handoff.
 */
(function initGrandOpeningCheckout() {
  const root = document.getElementById('go-checkout-root');
  if (!root) return;

  const token = root.dataset.token || '';
  const billingConfigured = root.dataset.billing === '1';

  /** @type {{ feature: string; label: string; blurb: string; priceLabel: string; amount: number }[]} */
  let addons = [];
  try {
    addons = JSON.parse(root.dataset.addons || '[]');
  } catch {
    addons = [];
  }

  const baseAmount = Number(root.dataset.baseAmount || 500) || 500;
  const totalEl = document.getElementById('go-checkout-total');
  const addonsRoot = document.getElementById('go-checkout-addons');
  const submitBtn = document.getElementById('go-checkout-submit');
  const errorEl = document.getElementById('go-checkout-error');
  /** @type {Set<string>} */
  const selected = new Set();

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney(amount) {
    return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
  }

  function syncTotal() {
    let total = baseAmount;
    addons.forEach((m) => {
      if (selected.has(m.feature)) total += m.amount;
    });
    if (totalEl) totalEl.textContent = formatMoney(total);
  }

  function renderAddons() {
    if (!addonsRoot) return;
    if (!addons.length) {
      addonsRoot.innerHTML =
        '<p class="go-checkout-addons-empty">No priced add-ons right now — your hosting invoice includes the core offer.</p>';
      return;
    }
    addonsRoot.innerHTML =
      `<div class="go-checkout-addons-grid">` +
      addons
        .map((m) => {
          const on = selected.has(m.feature);
          return (
            `<article class="go-checkout-addon${on ? ' go-checkout-addon--on' : ''}" data-feature="${esc(m.feature)}">` +
            `<div class="go-checkout-addon__head">` +
            `<h3 class="go-checkout-addon__label">${esc(m.label)}</h3>` +
            `<button type="button" class="go-checkout-addon__switch" role="switch" ` +
            `aria-checked="${on ? 'true' : 'false'}" ` +
            `aria-label="Add ${esc(m.label)}"></button>` +
            `</div>` +
            (m.blurb ? `<p class="go-checkout-addon__blurb">${esc(m.blurb)}</p>` : '') +
            `<span class="go-checkout-addon__price">${esc(m.priceLabel)}</span>` +
            `</article>`
          );
        })
        .join('') +
      `</div>`;
  }

  addonsRoot?.addEventListener('click', (event) => {
    const btn = event.target.closest('.go-checkout-addon__switch');
    if (!btn) return;
    const tile = btn.closest('[data-feature]');
    const feature = tile?.getAttribute('data-feature');
    if (!feature) return;
    const on = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    tile.classList.toggle('go-checkout-addon--on', on);
    if (on) selected.add(feature);
    else selected.delete(feature);
    syncTotal();
  });

  submitBtn?.addEventListener('click', async () => {
    if (!token) return;
    errorEl?.classList.add('hidden');
    submitBtn.setAttribute('disabled', 'disabled');
    const label = submitBtn.textContent;
    submitBtn.textContent = 'Creating invoice…';

    try {
      const res = await fetch('/api/grand-opening/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, addons: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Could not create invoice');
      }
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      if (data.publicUrl) {
        window.location.href = data.publicUrl;
        return;
      }
      root.querySelector('#go-checkout-success')?.classList.remove('hidden');
      root.querySelector('#go-checkout-panel')?.classList.add('hidden');
    } catch (err) {
      if (errorEl) {
        errorEl.textContent =
          err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        errorEl.classList.remove('hidden');
      }
      submitBtn.removeAttribute('disabled');
      submitBtn.textContent = label || 'Continue to payment';
    }
  });

  if (!billingConfigured && submitBtn) {
    submitBtn.textContent = 'Request invoice';
  }

  renderAddons();
  syncTotal();
})();
