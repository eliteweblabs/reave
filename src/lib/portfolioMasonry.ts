function syncBrickUnit(root: HTMLElement) {
  const styles = getComputedStyle(root);
  const cols = Number.parseInt(styles.getPropertyValue("--masonry-cols"), 10) || 6;
  const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
  const padX =
    (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
  const col = (root.clientWidth - padX - gap * Math.max(cols - 1, 0)) / cols;
  if (!Number.isFinite(col) || col <= 0) return;
  const aspectW = Number.parseFloat(styles.getPropertyValue("--tile-aspect-w")) || 16;
  const aspectH = Number.parseFloat(styles.getPropertyValue("--tile-aspect-h")) || 9;
  const ratio =
    Number.parseFloat(styles.getPropertyValue("--brick-ratio")) || (2 * aspectH) / aspectW;
  root.style.setProperty("--brick-unit", `${Math.round(col * ratio)}px`);
}

function initCards(root: HTMLElement) {
  const cards = root.querySelectorAll<HTMLButtonElement>("[data-masonry-card]");

  const closeAll = (except?: HTMLButtonElement) => {
    cards.forEach((card) => {
      if (card !== except) card.classList.remove("is-active");
    });
  };

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const isActive = card.classList.contains("is-active");
      closeAll();
      if (!isActive) card.classList.add("is-active");
    });
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target as Node)) closeAll();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll();
  });
}

export function bootPortfolioMasonry(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>("[data-portfolio-masonry]").forEach((root) => {
    if (root.dataset.masonryReady === "1") return;
    root.dataset.masonryReady = "1";
    syncBrickUnit(root);
    const resize = new ResizeObserver(() => syncBrickUnit(root));
    resize.observe(root);
    initCards(root);
  });
}
