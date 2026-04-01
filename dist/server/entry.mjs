import { renderers } from './renderers.mjs';
import { c as createExports, s as serverEntrypointModule } from './chunks/_@astrojs-ssr-adapter_DY4RAP5Q.mjs';
import { manifest } from './manifest_DKBJ96hB.mjs';

const serverIslandMap = new Map();;

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/api/booking/availability.astro.mjs');
const _page2 = () => import('./pages/api/booking/create.astro.mjs');
const _page3 = () => import('./pages/api/sms.astro.mjs');
const _page4 = () => import('./pages/api/vapi/webhook.astro.mjs');
const _page5 = () => import('./pages/schedule.astro.mjs');
const _page6 = () => import('./pages/index.astro.mjs');
const pageMap = new Map([
    ["node_modules/astro/dist/assets/endpoint/node.js", _page0],
    ["src/pages/api/booking/availability.ts", _page1],
    ["src/pages/api/booking/create.ts", _page2],
    ["src/pages/api/sms.ts", _page3],
    ["src/pages/api/vapi/webhook.ts", _page4],
    ["src/pages/schedule.astro", _page5],
    ["src/pages/index.astro", _page6]
]);

const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    actions: () => import('./noop-entrypoint.mjs'),
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "mode": "standalone",
    "client": "file:///Users/4rgd/Astro/reave-1/dist/client/",
    "server": "file:///Users/4rgd/Astro/reave-1/dist/server/",
    "host": false,
    "port": 4321,
    "assets": "_astro",
    "experimentalStaticHeaders": false
};
const _exports = createExports(_manifest, _args);
const handler = _exports['handler'];
const startServer = _exports['startServer'];
const options = _exports['options'];
const _start = 'start';
if (Object.prototype.hasOwnProperty.call(serverEntrypointModule, _start)) {
	serverEntrypointModule[_start](_manifest, _args);
}

export { handler, options, pageMap, startServer };
