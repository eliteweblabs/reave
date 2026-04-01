import { e as createComponent, m as maybeRenderHead, r as renderTemplate, f as createAstro, h as addAttribute, p as renderHead, n as renderSlot, k as renderComponent } from './astro/server_0A75Za_f.mjs';
import 'piccolore';
import 'clsx';
/* empty css                         */

const $$Header = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<header class="header" data-astro-cid-3ef6ksr2> <div class="header-logo-mask" data-astro-cid-3ef6ksr2> <div class="header-gradient-layer" data-astro-cid-3ef6ksr2></div> </div> </header> `;
}, "/Users/4rgd/Astro/reave-1/src/components/Header.astro", void 0);

const $$Astro = createAstro();
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Layout;
  const currentPath = Astro2.url.pathname;
  const isIndexPage = currentPath === "/" || currentPath === "/index.html";
  return renderTemplate`<html lang="en"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet"><meta name="generator"${addAttribute(Astro2.generator, "content")}><title>/\\V</title><meta name="description" content="/\V">${renderHead()}</head> <body> ${!isIndexPage && renderTemplate`${renderComponent($$result, "Header", $$Header, {})}`} ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "/Users/4rgd/Astro/reave-1/src/layouts/Layout.astro", void 0);

export { $$Layout as $ };
