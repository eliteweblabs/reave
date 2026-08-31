import { escHtml } from './shared.js?v=20260826c';

/** Sales page fields on Work → project tab when a proposal links to this slug. */
export async function mountProposalSalesFields(fieldsEl, workSlug) {
  if (!fieldsEl || !workSlug || workSlug === '__new__') return;

  const wrap = document.createElement('div');
  wrap.className = 'wk-proposal-sales';
  wrap.innerHTML = '<div class="de-label">Sales page</div><div class="de-empty">Checking…</div>';
  fieldsEl.appendChild(wrap);

  let data;
  try {
    const res = await fetch(`/api/admin/proposals/by-work/${encodeURIComponent(workSlug)}`, {
      cache: 'no-store',
    });
    data = await res.json();
  } catch {
    wrap.remove();
    return;
  }

  if (!data?.ok || !data.proposal) {
    wrap.remove();
    return;
  }

  const proposal = data.proposal;
  wrap.innerHTML =
    '<div class="de-label">Sales page</div>' +
    '<p class="wk-proposal-sales__hint">Public buy page for this demo. Paste your Crater invoice pay link when it is ready.</p>' +
    `<p class="wk-proposal-sales__url"><a href="${escHtml(data.publicUrl)}" target="_blank" rel="noopener">${escHtml(data.publicUrl)}</a></p>` +
    '<label class="de-field">' +
    '<span>Crater invoice URL</span>' +
    `<input class="de-input wk-proposal-invoice" type="url" placeholder="https://ap.reave.app/invoices/…" value="${escHtml(proposal.invoiceUrl || '')}" />` +
    '</label>' +
    '<label class="de-field">' +
    '<span>Demo URL</span>' +
    `<input class="de-input wk-proposal-demo" type="url" value="${escHtml(proposal.demoUrl || '')}" />` +
    '</label>' +
    '<label class="de-check wk-proposal-published">' +
    `<input type="checkbox"${proposal.published ? ' checked' : ''} />` +
    '<span>Published</span>' +
    '</label>' +
    '<div class="wk-proposal-sales__actions">' +
    '<button type="button" class="de-btn de-btn-primary wk-proposal-save">Save sales page</button>' +
    `<a class="de-btn de-btn-secondary" href="${escHtml(data.publicUrl)}" target="_blank" rel="noopener">Open page</a>` +
    '</div>' +
    '<p class="wk-proposal-sales__status" aria-live="polite"></p>';

  const invoiceInput = wrap.querySelector('.wk-proposal-invoice');
  const demoInput = wrap.querySelector('.wk-proposal-demo');
  const publishedInput = wrap.querySelector('.wk-proposal-published input');
  const saveBtn = wrap.querySelector('.wk-proposal-save');
  const statusEl = wrap.querySelector('.wk-proposal-sales__status');

  saveBtn?.addEventListener('click', async () => {
    statusEl.textContent = 'Saving…';
    saveBtn.disabled = true;
    try {
      const res = await fetch(`/api/admin/proposals/${encodeURIComponent(proposal.slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceUrl: invoiceInput.value.trim() || null,
          demoUrl: demoInput.value.trim(),
          published: !!publishedInput?.checked,
        }),
      });
      const out = await res.json();
      if (!res.ok || !out.ok) throw new Error(out.error || 'Save failed');
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = err?.message || 'Save failed.';
    } finally {
      saveBtn.disabled = false;
    }
  });
}
