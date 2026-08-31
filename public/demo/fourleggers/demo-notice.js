/** Sticky demo banner + iOS buy sheet — shared by index, login, portal. */
(function () {
  const PROPOSAL_SLUG = "fourleggers";
  const SHEET_ID = "demo-proposal-sheet";
  let proposalCache = null;

  function ensureStyles() {
    if (document.querySelector('link[data-demo-ios-sheet="1"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/ios-sheet.css";
    link.dataset.demoIosSheet = "1";
    document.head.appendChild(link);
  }

  function loadIosSheet() {
    if (window.IosSheet) return Promise.resolve();
    const existing = document.querySelector('script[data-demo-ios-sheet="1"]');
    if (existing) {
      return new Promise((resolve) => {
        existing.addEventListener("load", () => resolve(), { once: true });
      });
    }
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "/ios-sheet.js";
      script.defer = true;
      script.dataset.demoIosSheet = "1";
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }

  function mountSheet() {
    if (document.getElementById(SHEET_ID)) return;
    const backdrop = document.createElement("div");
    backdrop.id = SHEET_ID;
    backdrop.className = "ios-sheet-backdrop demo-proposal-sheet";
    backdrop.setAttribute("role", "presentation");
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.dataset.sheetDismiss = "true";
    backdrop.innerHTML =
      '<div class="ios-sheet" role="dialog" aria-modal="true" aria-labelledby="demo-proposal-sheet-title">' +
      '<div class="ios-sheet-grabber" aria-hidden="true"></div>' +
      '<header class="ios-sheet-header">' +
      '<button type="button" class="ios-sheet-close" data-ios-sheet-close aria-label="Close">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' +
      "</svg></button>" +
      '<h2 class="ios-sheet-title" id="demo-proposal-sheet-title">Demo site</h2>' +
      "</header>" +
      '<div class="ios-sheet-body demo-proposal-sheet__body">' +
      '<p class="demo-proposal-sheet__loading">Loading…</p>' +
      "</div></div>";
    document.body.appendChild(backdrop);
  }

  function esc(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSheetBody(data) {
    const body = document.querySelector(`#${SHEET_ID} .demo-proposal-sheet__body`);
    if (!body || !data?.ok) return;
    const p = data.proposal;
    const includes = Array.isArray(p.includes)
      ? p.includes.map((item) => `<li>${esc(item)}</li>`).join("")
      : "";
    const payBtn = p.invoiceUrl
      ? `<a class="demo-proposal-sheet__btn demo-proposal-sheet__btn--gold" href="${esc(p.invoiceUrl)}" target="_blank" rel="noopener noreferrer">Buy now — pay invoice</a>`
      : `<a class="demo-proposal-sheet__btn demo-proposal-sheet__btn--gold" href="https://reave.app/schedule">Book a call to buy</a>`;
    body.innerHTML =
      `<p class="demo-proposal-sheet__lede"><strong>Visual proposal only.</strong> Scheduling and client login are not wired to a live install yet.</p>` +
      (p.headline ? `<p class="demo-proposal-sheet__headline">${esc(p.headline)}</p>` : "") +
      (p.lede ? `<p class="demo-proposal-sheet__copy">${esc(p.lede)}</p>` : "") +
      (p.priceLabel
        ? `<p class="demo-proposal-sheet__price">${esc(p.priceLabel)}` +
          (p.priceNote ? `<span>${esc(p.priceNote)}</span>` : "") +
          `</p>`
        : "") +
      (includes ? `<ul class="demo-proposal-sheet__list">${includes}</ul>` : "") +
      (data.bodyHtml ? `<div class="demo-proposal-sheet__scope">${data.bodyHtml}</div>` : "") +
      `<div class="demo-proposal-sheet__actions">${payBtn}` +
      `<a class="demo-proposal-sheet__btn demo-proposal-sheet__btn--ghost" href="${esc(p.publicUrl)}">Full proposal page</a>` +
      `</div>`;
  }

  async function fetchProposal() {
    if (proposalCache) return proposalCache;
    const res = await fetch(`/api/proposal/${encodeURIComponent(PROPOSAL_SLUG)}`, {
      cache: "no-store",
    });
    proposalCache = await res.json();
    return proposalCache;
  }

  async function openProposalSheet() {
    ensureStyles();
    mountSheet();
    await loadIosSheet();
    const body = document.querySelector(`#${SHEET_ID} .demo-proposal-sheet__body`);
    if (body) body.innerHTML = '<p class="demo-proposal-sheet__loading">Loading…</p>';
    window.IosSheet?.open(SHEET_ID);
    try {
      const data = await fetchProposal();
      renderSheetBody(data);
    } catch {
      if (body) {
        body.innerHTML =
          '<p class="demo-proposal-sheet__copy">Could not load proposal details. <a href="https://reave.app/proposal/fourleggers">Open the sales page</a>.</p>';
      }
    }
  }

  function mountBanner() {
    if (document.querySelector(".demo-notice") || !document.body) return;
    const bar = document.createElement("aside");
    bar.className = "demo-notice";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<div class="wrap">' +
      "<p><strong>Demo site.</strong> Visual proposal only — scheduling and client login are not wired to a live install.</p>" +
      '<button type="button" class="demo-notice__btn">Buy this site</button>' +
      "</div>";
    bar.querySelector("button")?.addEventListener("click", () => {
      void openProposalSheet();
    });
    document.body.insertBefore(bar, document.body.firstChild);
    ensureStyles();
    mountSheet();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountBanner);
  } else {
    mountBanner();
  }
})();
