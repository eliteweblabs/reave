import 'piccolore';
import { q as decodeKey } from './chunks/astro/server_BF6nSxTQ.mjs';
import 'clsx';
import { N as NOOP_MIDDLEWARE_FN } from './chunks/astro-designed-error-pages_DEn5tJYU.mjs';
import 'es-module-lexer';

function sanitizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")];
      }
      return [key, value];
    })
  );
}
function getParameter(part, params) {
  if (part.spread) {
    return params[part.content.slice(3)] || "";
  }
  if (part.dynamic) {
    if (!params[part.content]) {
      throw new TypeError(`Missing parameter: ${part.content}`);
    }
    return params[part.content];
  }
  return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
}
function getSegment(segment, params) {
  const segmentPath = segment.map((part) => getParameter(part, params)).join("");
  return segmentPath ? "/" + segmentPath : "";
}
function getRouteGenerator(segments, addTrailingSlash) {
  return (params) => {
    const sanitizedParams = sanitizeParams(params);
    let trailing = "";
    if (addTrailingSlash === "always" && segments.length) {
      trailing = "/";
    }
    const path = segments.map((segment) => getSegment(segment, sanitizedParams)).join("") + trailing;
    return path || "/";
  };
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments,
    prerender: rawRouteData.prerender,
    redirect: rawRouteData.redirect,
    redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
    fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback) => {
      return deserializeRouteData(fallback);
    }),
    isIndex: rawRouteData.isIndex,
    origin: rawRouteData.origin
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  const componentMetadata = new Map(serializedManifest.componentMetadata);
  const inlinedScripts = new Map(serializedManifest.inlinedScripts);
  const clientDirectives = new Map(serializedManifest.clientDirectives);
  const serverIslandNameMap = new Map(serializedManifest.serverIslandNameMap);
  const key = decodeKey(serializedManifest.key);
  return {
    // in case user middleware exists, this no-op middleware will be reassigned (see plugin-ssr.ts)
    middleware() {
      return { onRequest: NOOP_MIDDLEWARE_FN };
    },
    ...serializedManifest,
    assets,
    componentMetadata,
    inlinedScripts,
    clientDirectives,
    routes,
    serverIslandNameMap,
    key
  };
}

const manifest = deserializeManifest({"hrefRoot":"file:///Users/4rgd/Astro/reave-1/","cacheDir":"file:///Users/4rgd/Astro/reave-1/node_modules/.astro/","outDir":"file:///Users/4rgd/Astro/reave-1/dist/","srcDir":"file:///Users/4rgd/Astro/reave-1/src/","publicDir":"file:///Users/4rgd/Astro/reave-1/public/","buildClientDir":"file:///Users/4rgd/Astro/reave-1/dist/client/","buildServerDir":"file:///Users/4rgd/Astro/reave-1/dist/server/","adapterName":"@astrojs/node","routes":[{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"page","component":"_server-islands.astro","params":["name"],"segments":[[{"content":"_server-islands","dynamic":false,"spread":false}],[{"content":"name","dynamic":true,"spread":false}]],"pattern":"^\\/_server-islands\\/([^/]+?)\\/?$","prerender":false,"isIndex":false,"fallbackRoutes":[],"route":"/_server-islands/[name]","origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"endpoint","isIndex":false,"route":"/_image","pattern":"^\\/_image\\/?$","segments":[[{"content":"_image","dynamic":false,"spread":false}]],"params":[],"component":"node_modules/astro/dist/assets/endpoint/node.js","pathname":"/_image","prerender":false,"fallbackRoutes":[],"origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/booking/availability","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/booking\\/availability\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"booking","dynamic":false,"spread":false}],[{"content":"availability","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/booking/availability.ts","pathname":"/api/booking/availability","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/booking/create","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/booking\\/create\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"booking","dynamic":false,"spread":false}],[{"content":"create","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/booking/create.ts","pathname":"/api/booking/create","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/sms","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/sms\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"sms","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/sms.ts","pathname":"/api/sms","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"route":"/api/vapi/webhook","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/vapi\\/webhook\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"vapi","dynamic":false,"spread":false}],[{"content":"webhook","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/vapi/webhook.ts","pathname":"/api/vapi/webhook","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"/_astro/schedule.BGw5KoxK.css"}],"routeData":{"route":"/schedule","isIndex":false,"type":"page","pattern":"^\\/schedule\\/?$","segments":[[{"content":"schedule","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/schedule.astro","pathname":"/schedule","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"styles":[{"type":"external","src":"/_astro/index.xO7gTm-e.css"}],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":false,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}}],"base":"/","trailingSlash":"ignore","compressHTML":true,"componentMetadata":[["/Users/4rgd/Astro/reave-1/src/pages/schedule.astro",{"propagation":"none","containsHead":true}],["/Users/4rgd/Astro/reave-1/src/pages/index.astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(n,t)=>{let i=async()=>{await(await n())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var n=(a,t)=>{let i=async()=>{await(await a())()};if(t.value){let e=matchMedia(t.value);e.matches?i():e.addEventListener(\"change\",i,{once:!0})}};(self.Astro||(self.Astro={})).media=n;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var a=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let l of e)if(l.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=a;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"\u0000noop-middleware":"_noop-middleware.mjs","\u0000virtual:astro:actions/noop-entrypoint":"noop-entrypoint.mjs","\u0000@astro-page:src/pages/api/booking/availability@_@ts":"pages/api/booking/availability.astro.mjs","\u0000@astro-page:src/pages/api/booking/create@_@ts":"pages/api/booking/create.astro.mjs","\u0000@astro-page:src/pages/api/sms@_@ts":"pages/api/sms.astro.mjs","\u0000@astro-page:src/pages/api/vapi/webhook@_@ts":"pages/api/vapi/webhook.astro.mjs","\u0000@astro-page:src/pages/schedule@_@astro":"pages/schedule.astro.mjs","\u0000@astro-page:src/pages/index@_@astro":"pages/index.astro.mjs","\u0000@astrojs-ssr-virtual-entry":"entry.mjs","\u0000@astro-renderers":"renderers.mjs","\u0000@astro-page:node_modules/astro/dist/assets/endpoint/node@_@js":"pages/_image.astro.mjs","\u0000@astrojs-ssr-adapter":"_@astrojs-ssr-adapter.mjs","\u0000@astrojs-manifest":"manifest_DOzmPhc8.mjs","/Users/4rgd/Astro/reave-1/node_modules/unstorage/drivers/fs-lite.mjs":"chunks/fs-lite_COtHaKzy.mjs","/Users/4rgd/Astro/reave-1/node_modules/astro/dist/assets/services/sharp.js":"chunks/sharp_BXOl10KK.mjs","/Users/4rgd/Astro/reave-1/src/pages/index.astro?astro&type=script&index=0&lang.ts":"_astro/index.astro_astro_type_script_index_0_lang.__nOKHYg.js","/Users/4rgd/Astro/reave-1/src/pages/schedule.astro?astro&type=script&index=0&lang.ts":"_astro/schedule.astro_astro_type_script_index_0_lang.BLn5boax.js","/Users/4rgd/Astro/reave-1/src/components/Transcript.astro?astro&type=script&index=0&lang.ts":"_astro/Transcript.astro_astro_type_script_index_0_lang.igwF4UAV.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[["/Users/4rgd/Astro/reave-1/src/pages/index.astro?astro&type=script&index=0&lang.ts","let i=null,r=!1,y=0,b=0,u=0,m=0,c=0,d=0,g,w;const q=()=>({width:window.innerWidth*.5,height:window.innerHeight*.5});function L(t,e){const{width:n,height:o}=q();let a=(t%n+n)%n,l=(e%o+o)%o;return{x:a,y:l}}let M=0,k=0,E=0;const T=15,X=1e3/T;let D=!0;document.addEventListener(\"visibilitychange\",()=>{D=!document.hidden});function h(t){if(!i||!D){requestAnimationFrame(h);return}const e=t-M;if(e<X){requestAnimationFrame(h);return}M=t-e%X,w===void 0&&(w=t);const a=t-w>=1e3;if(a&&!g&&(g=t,c=0,d=0),a&&g&&!r){const l=(t-g)/1e3,f=40,s=l%f/f,{width:p,height:C}=q(),S=s*Math.PI*2;c=Math.sin(S)*p*.4,d=Math.cos(S)*C*.4}if(a){const l=u+(r?0:c),f=m+(r?0:d),s=L(l,f);if(Math.abs(s.x-k)>.5||Math.abs(s.y-E)>.5){const p=`translate3d(${Math.round(s.x)}px, ${Math.round(s.y)}px, 0) scale(${v})`;i.style.transform=p,k=s.x,E=s.y}}requestAnimationFrame(h)}function Y(t){r=!0;const e=\"touches\"in t?t.touches[0]:t;if(y=e.clientX,b=e.clientY,i){i.classList.add(\"dragging\");const n=u+c,o=m+d,a=L(n,o);u=a.x,m=a.y,c=0,d=0}}function x(t){if(!r||!i)return;t.preventDefault();const e=\"touches\"in t?t.touches[0]:t,n=e.clientX-y,o=e.clientY-b;u+=n,m+=o;const a=L(u,m);i.style.transform=`translate3d(${a.x}px, ${a.y}px, 0) scale(${v})`,y=e.clientX,b=e.clientY}function A(){r=!1,i&&i.classList.remove(\"dragging\")}let F=0,$=1,v=1;window.addEventListener(\"audioLevel\",(t=>{t.detail&&typeof t.detail.level==\"number\"&&(F=t.detail.level,$=1+F*.4)}));function z(){if(!i)return;v+=($-v)*.1,requestAnimationFrame(z)}function I(){const t=document.querySelector(\".logo-mask\");if(!t)return;const e=window.getComputedStyle(t),n=e.maskPosition||e.webkitMaskPosition,o=e.transform;console.log(\"Animation Debug:\",{maskPosition:n,transform:o,maskSize:e.maskSize||e.webkitMaskSize})}function P(){if(i=document.getElementById(\"gradientLayer\"),!i){console.error(\"gradientLayer element not found\");return}if(i.style.transform=\"translate3d(0, 0, 0) scale(1)\",z(),window.location.search.includes(\"debug=animation\")){const t=document.querySelector(\".logo-mask\");if(t){new MutationObserver(()=>{I()}).observe(t,{attributes:!0,attributeFilter:[\"style\",\"class\"]});let n=0;const o=setInterval(()=>{I(),n++,n>100&&clearInterval(o)},100)}}document.addEventListener(\"mousedown\",Y),document.addEventListener(\"mousemove\",x),document.addEventListener(\"mouseup\",A),document.addEventListener(\"touchstart\",Y,{passive:!1}),document.addEventListener(\"touchmove\",x,{passive:!1}),document.addEventListener(\"touchend\",A),requestAnimationFrame(h)}document.readyState===\"loading\"?document.addEventListener(\"DOMContentLoaded\",P):P();"],["/Users/4rgd/Astro/reave-1/src/components/Transcript.astro?astro&type=script&index=0&lang.ts","const c=document.getElementById(\"transcript-content\");let e={assistant:null,user:null};function p(s,t,o=!1){if(!c){console.warn(\"transcriptContent not found\");return}if(!r){console.log(\"Transcript ignored - voice chat not active\",{text:a,type:t,isPartial:o}),fetch(\"http://127.0.0.1:7242/ingest/b70a058c-165e-4820-adda-384130e4a687\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({location:\"Transcript.astro:addTranscriptLine\",message:\"Transcript ignored - voice chat not active\",data:{text:a,type:t,isPartial:o,isVoiceChatActive:!1},timestamp:Date.now(),sessionId:\"debug-session\",runId:\"init\",hypothesisId:\"C\"})}).catch(()=>{});return}const a=s.trim().slice(0,100);if(!a)return;if(o&&e[t]){const n=e[t];if(n&&n.parentNode){n.textContent=a,console.log(\"Updated partial transcript line:\",a),fetch(\"http://127.0.0.1:7242/ingest/b70a058c-165e-4820-adda-384130e4a687\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({location:\"Transcript.astro:updatePartial\",message:\"Updated partial transcript\",data:{type:t,text:a,isPartial:!0},timestamp:Date.now(),sessionId:\"debug-session\",runId:\"init\",hypothesisId:\"A\"})}).catch(()=>{});return}}const i=document.createElement(\"div\");if(i.className=`transcript-line ${t}`,i.textContent=a,!o){let n=0;const l=setInterval(()=>{n<=a.length?(i.textContent=a.slice(0,n),n++):clearInterval(l)},30)}c.appendChild(i),console.log(\"Added transcript line:\",a,o?\"(partial)\":\"(final)\"),fetch(\"http://127.0.0.1:7242/ingest/b70a058c-165e-4820-adda-384130e4a687\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({location:\"Transcript.astro:addLine\",message:\"Added new transcript line\",data:{type:t,text:a,isPartial:o,hasActiveLine:!!e[t]},timestamp:Date.now(),sessionId:\"debug-session\",runId:\"init\",hypothesisId:\"B\"})}).catch(()=>{}),e[t]=i;const d=c.querySelectorAll(\".transcript-line\");if(d.length>3){const n=d[0];e.assistant===n&&(e.assistant=null),e.user===n&&(e.user=null),n.remove()}o||setTimeout(()=>{i.parentNode&&(i.style.opacity=\"0\",i.style.transform=\"translateY(-20px)\",setTimeout(()=>{e[t]===i&&(e[t]=null),i.remove()},500))},2500)}window.addEventListener(\"vapi-transcript\",(s=>{if(s.detail&&s.detail.text&&s.detail.type){const t=s.detail.isPartial===!0||s.detail.transcriptType===\"partial\";p(s.detail.text,s.detail.type,t)}}));let r=!1;window.addEventListener(\"vapi-call-start\",()=>{r=!0,console.log(\"Voice chat activated - transcripts enabled\"),fetch(\"http://127.0.0.1:7242/ingest/b70a058c-165e-4820-adda-384130e4a687\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({location:\"Transcript.astro:callStart\",message:\"Voice chat activated\",data:{isVoiceChatActive:!0},timestamp:Date.now(),sessionId:\"debug-session\",runId:\"init\",hypothesisId:\"A\"})}).catch(()=>{})});window.addEventListener(\"vapi-call-end\",()=>{r=!1,console.log(\"Voice chat ended - transcripts disabled\"),e.assistant=null,e.user=null,fetch(\"http://127.0.0.1:7242/ingest/b70a058c-165e-4820-adda-384130e4a687\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({location:\"Transcript.astro:callEnd\",message:\"Voice chat ended\",data:{isVoiceChatActive:!1},timestamp:Date.now(),sessionId:\"debug-session\",runId:\"init\",hypothesisId:\"B\"})}).catch(()=>{})});"]],"assets":["/_astro/index.xO7gTm-e.css","/_astro/schedule.BGw5KoxK.css","/favicon-1.png","/favicon-2.png","/favicon-3.png","/favicon.svg","/logo-mask-soft.svg","/logo-mask.svg","/_astro/schedule.astro_astro_type_script_index_0_lang.BLn5boax.js"],"buildFormat":"directory","checkOrigin":true,"allowedDomains":[],"actionBodySizeLimit":1048576,"serverIslandNameMap":[],"key":"H6OcM1EdLILXila6DhgOkiGXqJYc2G9w7W0SirHRQGs=","sessionConfig":{"driver":"fs-lite","options":{"base":"/Users/4rgd/Astro/reave-1/node_modules/.astro/sessions"}}});
if (manifest.sessionConfig) manifest.sessionConfig.driverModule = () => import('./chunks/fs-lite_COtHaKzy.mjs');

export { manifest };
