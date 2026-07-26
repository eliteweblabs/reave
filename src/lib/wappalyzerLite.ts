/**
 * Wappalyzer-lite: self-contained pattern database and matcher.
 * No external API — all detection is done locally via regex against
 * HTML source, HTTP headers, script src URLs, and meta tags.
 */

export interface TechPattern {
  name: string;
  category: string;
  icon?: string;
  patterns: {
    html?: RegExp[];
    scriptSrc?: RegExp[];
    meta?: Record<string, RegExp>;
    headers?: Record<string, RegExp>;
    cookies?: RegExp[];
    url?: RegExp[];
    implies?: string[];
  };
}

export const TECH_PATTERNS: TechPattern[] = [
  // ─── CMS ────────────────────────────────────────────────────────────────────
  {
    name: 'WordPress',
    category: 'CMS',
    patterns: {
      html: [/wp-content\//i, /wp-includes\//i, /wp-json\//i, /\/wp-login\.php/i],
      meta: { generator: /WordPress/i },
      scriptSrc: [/wp-content\//i, /wp-includes\//i],
      implies: ['PHP'],
    },
  },
  {
    name: 'Drupal',
    category: 'CMS',
    patterns: {
      html: [/Drupal\.settings/i, /drupal\.js/i, /sites\/default\/files/i],
      meta: { generator: /Drupal/i },
      headers: { 'x-generator': /Drupal/i },
      implies: ['PHP'],
    },
  },
  {
    name: 'Joomla',
    category: 'CMS',
    patterns: {
      html: [/\/components\/com_/i, /Joomla!/i],
      meta: { generator: /Joomla/i },
      implies: ['PHP'],
    },
  },
  {
    name: 'Squarespace',
    category: 'CMS',
    patterns: {
      html: [/squarespace\.com/i, /squarespace-cdn\.com/i, /static\.squarespace\.com/i],
      scriptSrc: [/squarespace\.com/i],
    },
  },
  {
    name: 'Wix',
    category: 'CMS',
    patterns: {
      html: [/wix\.com/i, /wixstatic\.com/i, /wixsite\.com/i],
      scriptSrc: [/wix\.com/i, /wixstatic\.com/i],
    },
  },
  {
    name: 'Webflow',
    category: 'CMS',
    patterns: {
      html: [/webflow\.com/i, /\.webflow\.io/i],
      scriptSrc: [/webflow\.com/i],
      meta: { generator: /Webflow/i },
    },
  },
  {
    name: 'Ghost',
    category: 'CMS',
    patterns: {
      html: [/ghost\.io/i, /content\/themes\//i],
      meta: { generator: /Ghost/i },
    },
  },
  {
    name: 'Shopify',
    category: 'E-commerce',
    patterns: {
      html: [/shopify\.com/i, /cdn\.shopify\.com/i, /Shopify\.theme/i],
      scriptSrc: [/cdn\.shopify\.com/i],
    },
  },
  {
    name: 'BigCommerce',
    category: 'E-commerce',
    patterns: {
      html: [/bigcommerce\.com/i, /cdn\.bigcommerce\.com/i],
      scriptSrc: [/bigcommerce\.com/i],
    },
  },
  {
    name: 'WooCommerce',
    category: 'E-commerce',
    patterns: {
      html: [/woocommerce/i, /wc-cart/i, /wc_add_to_cart/i],
      scriptSrc: [/woocommerce/i],
      implies: ['WordPress'],
    },
  },
  {
    name: 'Magento',
    category: 'E-commerce',
    patterns: {
      html: [/Magento/i, /mage\/cookies/i, /\/skin\/frontend\//i],
      meta: { generator: /Magento/i },
      implies: ['PHP'],
    },
  },

  // ─── Frameworks ─────────────────────────────────────────────────────────────
  {
    name: 'React',
    category: 'JavaScript Framework',
    patterns: {
      html: [/__reactFiber/i, /data-reactroot/i, /data-reactid/i, /_reactRootContainer/i],
      scriptSrc: [/react(?:\.min)?\.js/i, /react-dom/i],
    },
  },
  {
    name: 'Vue.js',
    category: 'JavaScript Framework',
    patterns: {
      html: [/data-v-[a-f0-9]{7,}/i, /vue-router/i, /__vue__/i],
      scriptSrc: [/vue(?:\.min)?\.js/i, /vue\.runtime/i],
    },
  },
  {
    name: 'Angular',
    category: 'JavaScript Framework',
    patterns: {
      html: [/ng-version/i, /ng-app/i, /ngController/i, /angular\.min\.js/i],
      scriptSrc: [/angular(?:\.min)?\.js/i],
    },
  },
  {
    name: 'Next.js',
    category: 'JavaScript Framework',
    patterns: {
      html: [/__NEXT_DATA__/i, /_next\/static/i, /_next\/chunks/i],
      scriptSrc: [/_next\/static/i],
      implies: ['React'],
    },
  },
  {
    name: 'Nuxt.js',
    category: 'JavaScript Framework',
    patterns: {
      html: [/__nuxt/i, /__NUXT__/i, /_nuxt\//i],
      scriptSrc: [/_nuxt\//i],
      implies: ['Vue.js'],
    },
  },
  {
    name: 'Gatsby',
    category: 'JavaScript Framework',
    patterns: {
      html: [/gatsby-/i, /___gatsby/i],
      scriptSrc: [/gatsby-/i],
      implies: ['React'],
    },
  },
  {
    name: 'Astro',
    category: 'JavaScript Framework',
    patterns: {
      html: [/astro-island/i, /astro:page-load/i],
      meta: { generator: /Astro/i },
    },
  },
  {
    name: 'Svelte',
    category: 'JavaScript Framework',
    patterns: {
      html: [/svelte-/i, /__svelte/i],
      scriptSrc: [/svelte/i],
    },
  },
  {
    name: 'Remix',
    category: 'JavaScript Framework',
    patterns: {
      html: [/__remixContext/i, /remix-island/i],
      implies: ['React'],
    },
  },
  {
    name: 'jQuery',
    category: 'JavaScript Library',
    patterns: {
      html: [/jquery/i],
      scriptSrc: [/jquery(?:\.min)?\.js/i, /jquery-\d/i],
    },
  },
  {
    name: 'Bootstrap',
    category: 'CSS Framework',
    patterns: {
      html: [/bootstrap\.min\.css/i, /bootstrap\.css/i, /class="[^"]*(?:container|navbar|btn btn-)/i],
      scriptSrc: [/bootstrap(?:\.min)?\.js/i],
    },
  },
  {
    name: 'Tailwind CSS',
    category: 'CSS Framework',
    patterns: {
      html: [/class="[^"]*(?:flex|grid|text-|bg-|p-\d|m-\d|w-\d|h-\d|rounded|shadow)[^"]*"/i],
      scriptSrc: [/tailwind/i],
    },
  },

  // ─── Analytics ──────────────────────────────────────────────────────────────
  {
    name: 'Google Analytics',
    category: 'Analytics',
    patterns: {
      html: [/google-analytics\.com\/analytics\.js/i, /gtag\(/i, /UA-\d{5,}-\d+/i, /G-[A-Z0-9]{10}/i],
      scriptSrc: [/google-analytics\.com/i, /googletagmanager\.com/i],
    },
  },
  {
    name: 'Google Tag Manager',
    category: 'Tag Manager',
    patterns: {
      html: [/googletagmanager\.com\/gtm\.js/i, /GTM-[A-Z0-9]{5,}/i],
      scriptSrc: [/googletagmanager\.com/i],
    },
  },
  {
    name: 'Plausible',
    category: 'Analytics',
    patterns: {
      scriptSrc: [/plausible\.io/i],
      html: [/plausible\.io\/js\//i],
    },
  },
  {
    name: 'Fathom Analytics',
    category: 'Analytics',
    patterns: {
      scriptSrc: [/usefathom\.com/i],
      html: [/usefathom\.com/i],
    },
  },
  {
    name: 'Hotjar',
    category: 'Analytics',
    patterns: {
      html: [/hotjar\.com/i, /hjid:/i, /hjsv:/i],
      scriptSrc: [/hotjar\.com/i],
    },
  },
  {
    name: 'Facebook Pixel',
    category: 'Advertising',
    patterns: {
      html: [/connect\.facebook\.net\/.*\/fbevents\.js/i, /fbq\(/i],
      scriptSrc: [/connect\.facebook\.net/i],
    },
  },

  // ─── Hosting / CDN ──────────────────────────────────────────────────────────
  {
    name: 'Cloudflare',
    category: 'CDN',
    patterns: {
      headers: {
        'cf-ray': /.+/,
        server: /cloudflare/i,
      },
      html: [/cloudflare/i],
    },
  },
  {
    name: 'Vercel',
    category: 'Hosting',
    patterns: {
      headers: { 'x-vercel-id': /.+/, server: /Vercel/i },
      html: [/vercel\.app/i],
      url: [/vercel\.app/i],
    },
  },
  {
    name: 'Netlify',
    category: 'Hosting',
    patterns: {
      headers: { server: /Netlify/i, 'x-nf-request-id': /.+/ },
      html: [/netlify\.com/i],
      url: [/netlify\.app/i],
    },
  },
  {
    name: 'AWS (S3/CloudFront)',
    category: 'Hosting',
    patterns: {
      headers: { server: /AmazonS3|CloudFront/i, 'x-amz-cf-id': /.+/ },
      html: [/s3\.amazonaws\.com/i, /cloudfront\.net/i],
    },
  },
  {
    name: 'GitHub Pages',
    category: 'Hosting',
    patterns: {
      headers: { server: /GitHub\.com/i },
      url: [/github\.io/i],
    },
  },
  {
    name: 'WP Engine',
    category: 'Hosting',
    patterns: {
      headers: { 'x-powered-by': /WP Engine/i },
    },
  },
  {
    name: 'Kinsta',
    category: 'Hosting',
    patterns: {
      headers: { 'x-kinsta-cache': /.+/ },
    },
  },
  {
    name: 'Flywheel',
    category: 'Hosting',
    patterns: {
      headers: { 'x-ah-environment': /.+/ },
      html: [/flywheelsites\.com/i],
    },
  },

  // ─── Server / Language ──────────────────────────────────────────────────────
  {
    name: 'PHP',
    category: 'Programming Language',
    patterns: {
      headers: { 'x-powered-by': /PHP/i },
      html: [/\.php(?:\?|")/i],
    },
  },
  {
    name: 'nginx',
    category: 'Web Server',
    patterns: {
      headers: { server: /nginx/i },
    },
  },
  {
    name: 'Apache',
    category: 'Web Server',
    patterns: {
      headers: { server: /Apache/i },
    },
  },
  {
    name: 'Node.js',
    category: 'Programming Language',
    patterns: {
      headers: { 'x-powered-by': /Express|Node/i },
    },
  },

  // ─── Chat / Support ─────────────────────────────────────────────────────────
  {
    name: 'Intercom',
    category: 'Live Chat',
    patterns: {
      html: [/intercomcdn\.com/i, /Intercom\(/i],
      scriptSrc: [/intercomcdn\.com/i, /widget\.intercom\.io/i],
    },
  },
  {
    name: 'Zendesk',
    category: 'Live Chat',
    patterns: {
      html: [/zendesk\.com/i, /zdassets\.com/i],
      scriptSrc: [/zdassets\.com/i, /static\.zdassets\.com/i],
    },
  },
  {
    name: 'Drift',
    category: 'Live Chat',
    patterns: {
      html: [/drift\.com/i, /js\.driftt\.com/i],
      scriptSrc: [/js\.driftt\.com/i],
    },
  },
  {
    name: 'Crisp',
    category: 'Live Chat',
    patterns: {
      html: [/crisp\.chat/i, /client\.crisp\.chat/i],
      scriptSrc: [/client\.crisp\.chat/i],
    },
  },

  // ─── Payment ────────────────────────────────────────────────────────────────
  {
    name: 'Stripe',
    category: 'Payment',
    patterns: {
      html: [/stripe\.com/i, /Stripe\(/i],
      scriptSrc: [/js\.stripe\.com/i],
    },
  },
  {
    name: 'PayPal',
    category: 'Payment',
    patterns: {
      html: [/paypal\.com/i, /paypalobjects\.com/i],
      scriptSrc: [/paypal\.com/i, /paypalobjects\.com/i],
    },
  },

  // ─── Marketing / Email ──────────────────────────────────────────────────────
  {
    name: 'Mailchimp',
    category: 'Email Marketing',
    patterns: {
      html: [/list-manage\.com/i, /mailchimp\.com/i, /mc\.js/i],
      scriptSrc: [/chimpstatic\.com/i, /mailchimp\.com/i],
    },
  },
  {
    name: 'HubSpot',
    category: 'CRM / Marketing',
    patterns: {
      html: [/hubspot\.com/i, /hs-scripts\.com/i, /hsforms\.com/i],
      scriptSrc: [/hs-scripts\.com/i, /hubspot\.com/i],
    },
  },
  {
    name: 'Klaviyo',
    category: 'Email Marketing',
    patterns: {
      html: [/klaviyo\.com/i, /static\.klaviyo\.com/i],
      scriptSrc: [/klaviyo\.com/i],
    },
  },

  // ─── Maps ───────────────────────────────────────────────────────────────────
  {
    name: 'Google Maps',
    category: 'Maps',
    patterns: {
      html: [/maps\.googleapis\.com/i, /maps\.google\.com/i],
      scriptSrc: [/maps\.googleapis\.com/i],
    },
  },
  {
    name: 'Mapbox',
    category: 'Maps',
    patterns: {
      html: [/mapbox\.com/i, /api\.mapbox\.com/i],
      scriptSrc: [/mapbox\.com/i],
    },
  },

  // ─── Font / Media ───────────────────────────────────────────────────────────
  {
    name: 'Google Fonts',
    category: 'Fonts',
    patterns: {
      html: [/fonts\.googleapis\.com/i, /fonts\.gstatic\.com/i],
    },
  },
  {
    name: 'Font Awesome',
    category: 'Fonts / Icons',
    patterns: {
      html: [/fontawesome/i, /fa-[a-z]/i],
      scriptSrc: [/fontawesome/i, /kit\.fontawesome\.com/i],
    },
  },
  {
    name: 'Cloudinary',
    category: 'Media CDN',
    patterns: {
      html: [/cloudinary\.com/i, /res\.cloudinary\.com/i],
    },
  },
];

export interface MatchedTech {
  name: string;
  category: string;
  implies: string[];
}

export interface WappalyzerInput {
  html: string;
  headers: Record<string, string>;
  url: string;
}

export function runWappalyzer(input: WappalyzerInput): MatchedTech[] {
  const { html, headers, url } = input;
  const found = new Map<string, MatchedTech>();

  // Extract script src values from HTML
  const scriptSrcs: string[] = [];
  const scriptTagRe = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptTagRe.exec(html)) !== null) {
    scriptSrcs.push(m[1]);
  }

  // Extract meta generator
  const metaGeneratorRe = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i;
  const metaGenAlt = /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i;
  const generatorContent =
    (metaGeneratorRe.exec(html)?.[1] ?? metaGenAlt.exec(html)?.[1] ?? '');

  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    normalizedHeaders[k.toLowerCase()] = v;
  }

  function addMatch(tech: TechPattern) {
    if (!found.has(tech.name)) {
      found.set(tech.name, {
        name: tech.name,
        category: tech.category,
        implies: tech.patterns.implies ?? [],
      });
    }
  }

  for (const tech of TECH_PATTERNS) {
    let matched = false;

    // HTML patterns
    if (!matched && tech.patterns.html) {
      for (const re of tech.patterns.html) {
        if (re.test(html)) { matched = true; break; }
      }
    }

    // Script src patterns
    if (!matched && tech.patterns.scriptSrc) {
      for (const re of tech.patterns.scriptSrc) {
        if (scriptSrcs.some((s) => re.test(s))) { matched = true; break; }
      }
    }

    // Meta patterns
    if (!matched && tech.patterns.meta) {
      for (const [metaName, re] of Object.entries(tech.patterns.meta)) {
        if (metaName === 'generator' && re.test(generatorContent)) { matched = true; break; }
      }
    }

    // Header patterns
    if (!matched && tech.patterns.headers) {
      for (const [hdr, re] of Object.entries(tech.patterns.headers)) {
        const val = normalizedHeaders[hdr.toLowerCase()] ?? '';
        if (val && re.test(val)) { matched = true; break; }
      }
    }

    // URL patterns
    if (!matched && tech.patterns.url) {
      for (const re of tech.patterns.url) {
        if (re.test(url)) { matched = true; break; }
      }
    }

    if (matched) addMatch(tech);
  }

  // Resolve implies (one level deep)
  const impliedNames = new Set<string>();
  for (const match of found.values()) {
    for (const imp of match.implies) {
      if (!found.has(imp)) impliedNames.add(imp);
    }
  }
  for (const name of impliedNames) {
    const tech = TECH_PATTERNS.find((t) => t.name === name);
    if (tech) {
      found.set(tech.name, { name: tech.name, category: tech.category, implies: [] });
    }
  }

  return Array.from(found.values());
}
