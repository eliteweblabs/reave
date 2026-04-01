import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_0A75Za_f.mjs';
import 'piccolore';
import { $ as $$Layout } from '../chunks/Layout_BzEqfKvt.mjs';
/* empty css                                    */
export { renderers } from '../renderers.mjs';

const $$Schedule = createComponent(async ($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "data-astro-cid-xjqxvez7": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="schedule-page" data-astro-cid-xjqxvez7> <div class="conversation" id="conversation" data-astro-cid-xjqxvez7> <!-- Messages will be injected here --> </div> <div class="input-area" id="inputArea" style="display:none;" data-astro-cid-xjqxvez7> <input type="text" id="userInput" placeholder="Type your answer..." autocomplete="off" data-astro-cid-xjqxvez7> <button id="sendBtn" aria-label="Send" data-astro-cid-xjqxvez7> <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-xjqxvez7><line x1="22" y1="2" x2="11" y2="13" data-astro-cid-xjqxvez7></line><polygon points="22 2 15 22 11 13 2 9 22 2" data-astro-cid-xjqxvez7></polygon></svg> </button> </div> </div> ` })}  ${renderScript($$result, "/Users/4rgd/Astro/reave-1/src/pages/schedule.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/4rgd/Astro/reave-1/src/pages/schedule.astro", void 0);

const $$file = "/Users/4rgd/Astro/reave-1/src/pages/schedule.astro";
const $$url = "/schedule";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Schedule,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
