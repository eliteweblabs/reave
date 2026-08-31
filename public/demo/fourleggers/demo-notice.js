/** Sticky demo banner — shared by index, login, portal. */
(function () {
  function mount() {
    if (document.querySelector(".demo-notice") || !document.body) return;
    const bar = document.createElement("aside");
    bar.className = "demo-notice";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<div class="wrap">' +
      "<p><strong>Demo site.</strong> Visual proposal only — scheduling and client login are not wired to a live install.</p>" +
      '<a class="demo-notice__btn" href="https://reave.app/proposal/fourleggers">Buy this site</a>' +
      "</div>";
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
