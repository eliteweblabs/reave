/**
 * Playwright UX/UI Audit Client
 *
 * Runs a real headless Chromium browser against any public URL and checks for:
 *  - Navigation functionality (hamburger open/close, all nav links resolve)
 *  - JavaScript console errors
 *  - Off-screen / overflow elements
 *  - Sticky header / scroll behavior
 *  - CTA button clickability
 *  - Contact form presence and basic usability
 *  - Tap target sizing (mobile)
 *  - Issue-state screenshots when a check fails (empty hamburger nav, overflow, …)
 *  - Optional full-page / nav-state context shots (not used as issue evidence)
 *
 * Results are returned for both desktop (1440×900) and mobile (375×812) viewports.
 * Failed-check PNGs are stashed for create_work / update_work to file on the project.
 */

import {
  classifyFormNoSubmit,
  classifyHamburgerIssue,
  classifyOverflow,
  classifySmallTapTargets,
  classifyUnclickableCtas,
  issueShotFilename,
  type PlaywrightIssueKind,
} from './playwrightIssueDetect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NavLink = {
  text: string;
  href: string;
  resolves: boolean;
  status?: number;
  error?: string;
};

export type TapTarget = {
  text: string;
  tag: string;
  width: number;
  height: number;
  tooSmall: boolean;
};

export type FormField = {
  type: string;
  name: string;
  label?: string;
  visible: boolean;
};

export type ViewportResult = {
  viewport: 'desktop' | 'mobile';
  width: number;
  height: number;
  /** Whether the hamburger/nav toggle was found and clicked open */
  hamburgerFound: boolean;
  hamburgerOpens: boolean;
  /** Visible nav links after the hamburger tap (0 = empty / did not open) */
  hamburgerLinkCount: number;
  navLinks: NavLink[];
  jsErrors: string[];
  overflowElements: number;
  stickyHeaders: number;
  ctaButtons: { text: string; clickable: boolean }[];
  forms: { fieldCount: number; hasSubmit: boolean; fields: FormField[] }[];
  smallTapTargets: TapTarget[];
  /** Full-page screenshot as base64 PNG (may be empty string if capture failed) */
  screenshotFullPage: string;
  /** Nav open/closed state screenshot as base64 PNG */
  screenshotNav: string;
  /** Viewport shots taken at the moment a check failed */
  issueScreenshots: PlaywrightIssueScreenshot[];
  /** Any non-JS warnings or notes collected during the session */
  notes: string[];
};

export type PlaywrightIssueScreenshot = {
  id: string;
  kind: PlaywrightIssueKind;
  viewport: 'desktop' | 'mobile';
  title: string;
  detail: string;
  filename: string;
  pngBase64: string;
};

export type PlaywrightAuditResponse =
  | {
      ok: true;
      url: string;
      audited_at: string;
      results: ViewportResult[];
      issue_screenshots: PlaywrightIssueScreenshot[];
      summary: {
        totalNavLinks: number;
        brokenNavLinks: number;
        totalJsErrors: number;
        totalOverflowElements: number;
        smallTapTargets: number;
        formsFound: number;
        ctaButtons: number;
      };
    }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Detect whether Playwright is available in this runtime. */
function isPlaywrightAvailable(): boolean {
  try {
    // Dynamic require check — will throw if not installed
    // We use createRequire so this works in ESM
    const { createRequire } = await_createRequire();
    const req = createRequire(import.meta.url);
    req.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}

// Top-level await helper shim for sync detection
function await_createRequire() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRequire } = require('module') as typeof import('module');
  return { createRequire };
}

async function loadPlaywright() {
  // Dynamic import so the module doesn't hard-fail at startup when playwright
  // is not yet installed (i.e. before first deploy with the updated Dockerfile).
  const pw = await import('playwright');
  return pw;
}

const MAX_ISSUE_SHOTS = 6;

async function captureIssueShot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  viewport: 'desktop' | 'mobile',
  issues: PlaywrightIssueScreenshot[],
  meta: { kind: PlaywrightIssueKind; title: string; detail: string },
): Promise<void> {
  if (issues.length >= MAX_ISSUE_SHOTS) return;
  try {
    const buf: Buffer = await page.screenshot({ fullPage: false, type: 'png' });
    if (!buf.length) return;
    issues.push({
      id: `${viewport}-${meta.kind}`,
      kind: meta.kind,
      viewport,
      title: meta.title,
      detail: meta.detail,
      filename: issueShotFilename(viewport, meta.kind),
      pngBase64: buf.toString('base64'),
    });
  } catch {
    // Capture is best-effort — the structured finding still stands.
  }
}

async function clearIssueOutlines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
): Promise<void> {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('[data-pw-issue]'))) {
      el.removeAttribute('data-pw-issue');
      (el as HTMLElement).style.outline = '';
    }
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Per-viewport audit
// ---------------------------------------------------------------------------

async function auditViewport(
  url: string,
  viewport: 'desktop' | 'mobile',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browser: any,
): Promise<ViewportResult> {
  const isDesktop = viewport === 'desktop';
  const width = isDesktop ? 1440 : 375;
  const height = isDesktop ? 900 : 812;

  const jsErrors: string[] = [];
  const notes: string[] = [];
  const issueScreenshots: PlaywrightIssueScreenshot[] = [];

  const context = await browser.newContext({
    viewport: { width, height },
    userAgent: isDesktop
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: !isDesktop,
    hasTouch: !isDesktop,
  });

  const page = await context.newPage();

  // Capture JS console errors
  page.on('console', (msg: { type(): string; text(): string }) => {
    if (msg.type() === 'error') {
      jsErrors.push(msg.text().slice(0, 200));
    }
  });

  // Capture uncaught page errors
  page.on('pageerror', (err: Error) => {
    jsErrors.push(err.message.slice(0, 200));
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Timeout is recoverable — continue with whatever loaded
    if (!msg.includes('Timeout')) {
      await context.close();
      return buildEmptyResult(viewport, width, height, [`Navigation failed: ${msg}`]);
    }
    notes.push(`Page load timed out (30s) — partial results follow`);
  }

  // -------------------------------------------------------------------------
  // Hamburger / nav toggle (mobile only for hamburger, but check both)
  // -------------------------------------------------------------------------
  let hamburgerFound = false;
  let hamburgerOpens = false;
  let hamburgerLinkCount = 0;

  // Common hamburger selectors
  const hamSelectors = [
    '[aria-label*="menu" i]',
    '[aria-label*="nav" i]',
    '.hamburger',
    '.nav-toggle',
    '.menu-toggle',
    '.navbar-toggler',
    'button.menu',
    '[class*="hamburger"]',
    '[class*="burger"]',
    '[class*="nav-open"]',
    '[class*="menu-btn"]',
    // Duda builder
    '[data-anchor="main-nav-mobile"]',
    '.dmNav .dmToggle',
  ];

  for (const sel of hamSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        hamburgerFound = true;
        await el.click({ timeout: 5_000 });
        await page.waitForTimeout(600);
        const navState = await page.evaluate(() => {
          const listSels =
            'nav ul, [role="navigation"] ul, .nav-menu, .main-menu, [class*="nav-list"], [class*="drawer"], [class*="offcanvas"], [class*="mobile-nav"]';
          const lists = Array.from(document.querySelectorAll(listSels));
          const panelVisible = lists.some((node) => {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none'
            );
          });
          const linkSels =
            'nav a, [role="navigation"] a, [class*="nav-menu"] a, [class*="mobile-nav"] a, [class*="drawer"] a, [class*="offcanvas"] a';
          const visibleLinkCount = Array.from(document.querySelectorAll(linkSels)).filter((node) => {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            const text = (node.textContent || '').trim();
            return (
              !!text &&
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0'
            );
          }).length;
          return { panelVisible, visibleLinkCount };
        });
        hamburgerLinkCount = navState.visibleLinkCount;
        hamburgerOpens = navState.visibleLinkCount > 0;
        const hamIssue = classifyHamburgerIssue({
          found: true,
          panelVisible: navState.panelVisible,
          visibleLinkCount: navState.visibleLinkCount,
        });
        if (hamIssue) {
          await captureIssueShot(page, viewport, issueScreenshots, hamIssue);
        }
        break;
      }
    } catch {
      // Selector not found — try next
    }
  }

  // -------------------------------------------------------------------------
  // Nav links
  // -------------------------------------------------------------------------
  const navLinks: NavLink[] = await page.evaluate(() => {
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('nav a, [role="navigation"] a, header a'),
    );
    const seen = new Set<string>();
    return anchors
      .filter((a) => {
        const href = a.getAttribute('href') ?? '';
        const text = a.textContent?.trim() ?? '';
        if (!text || seen.has(href + text)) return false;
        seen.add(href + text);
        return true;
      })
      .slice(0, 30)
      .map((a) => ({
        text: (a.textContent?.trim() ?? '').slice(0, 60),
        href: a.getAttribute('href') ?? '',
        resolves: false,
        status: undefined as number | undefined,
        error: undefined as string | undefined,
      }));
  });

  // Probe each nav link (HEAD request, max 10 to stay fast)
  const linksToProbe = navLinks.filter(
    (l) => l.href && !l.href.startsWith('#') && !l.href.startsWith('mailto') && !l.href.startsWith('tel'),
  ).slice(0, 10);

  await Promise.all(
    linksToProbe.map(async (link) => {
      try {
        const absolute = new URL(link.href, url).toString();
        const res = await fetch(absolute, {
          method: 'HEAD',
          signal: AbortSignal.timeout(6_000),
          redirect: 'follow',
        });
        link.status = res.status;
        link.resolves = res.status < 400;
        link.error = res.status >= 400 ? `HTTP ${res.status}` : undefined;
      } catch (e) {
        link.resolves = false;
        link.error = e instanceof Error ? e.message.slice(0, 80) : 'fetch error';
      }
    }),
  );

  // Mark links with empty or # href as broken
  for (const link of navLinks) {
    if (!link.href || link.href === '#' || link.href === '') {
      link.resolves = false;
      link.error = 'Empty or # href — dead link';
    } else if (!linksToProbe.find((l) => l.href === link.href)) {
      // Anchor links, mailto, tel — mark as resolves=true
      link.resolves = true;
    }
  }

  // -------------------------------------------------------------------------
  // Overflow / off-screen elements
  // -------------------------------------------------------------------------
  const overflowElements: number = await page.evaluate((vw: number) => {
    const all = document.querySelectorAll('body *');
    let count = 0;
    for (const el of Array.from(all)) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > vw + 20) count++;
    }
    return count;
  }, width);

  const overflowIssue = classifyOverflow(overflowElements);
  if (overflowIssue) {
    await page.evaluate((vw: number) => {
      let marked = 0;
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > vw + 20) {
          if (marked === 0) el.scrollIntoView({ block: 'center', inline: 'nearest' });
          el.setAttribute('data-pw-issue', 'overflow');
          (el as HTMLElement).style.outline = '3px solid #e11';
          marked += 1;
          if (marked >= 8) break;
        }
      }
    }, width).catch(() => undefined);
    await page.waitForTimeout(200);
    await captureIssueShot(page, viewport, issueScreenshots, overflowIssue);
    await clearIssueOutlines(page);
  }

  // -------------------------------------------------------------------------
  // Sticky headers
  // -------------------------------------------------------------------------
  const stickyHeaders: number = await page.evaluate(() => {
    const all = document.querySelectorAll('header, nav, [class*="sticky"], [class*="fixed"]');
    let count = 0;
    for (const el of Array.from(all)) {
      const style = window.getComputedStyle(el);
      if (style.position === 'sticky' || style.position === 'fixed') count++;
    }
    return count;
  });

  // -------------------------------------------------------------------------
  // CTA Buttons
  // -------------------------------------------------------------------------
  const ctaButtons: { text: string; clickable: boolean }[] = await page.evaluate(() => {
    const selectors = [
      'a.btn', 'a.button', 'button', '.cta', '[class*="cta"]',
      'a[class*="btn"]', 'a[class*="button"]',
    ];
    const seen = new Set<string>();
    const results: { text: string; clickable: boolean }[] = [];
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const text = (el.textContent?.trim() ?? '').slice(0, 50);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        const rect = el.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        const hasHref = el.tagName === 'A' ? !!(el as HTMLAnchorElement).getAttribute('href') : true;
        results.push({ text, clickable: visible && hasHref });
        if (results.length >= 10) break;
      }
    }
    return results.slice(0, 10);
  });

  const unclickable = ctaButtons.filter((b) => !b.clickable);
  const ctaIssue = classifyUnclickableCtas(unclickable.map((b) => b.text));
  if (ctaIssue) {
    await captureIssueShot(page, viewport, issueScreenshots, ctaIssue);
  }

  // -------------------------------------------------------------------------
  // Forms
  // -------------------------------------------------------------------------
  const forms: ViewportResult['forms'] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('form')).slice(0, 5).map((form) => {
      const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
      const hasSubmit = !!form.querySelector('[type="submit"], button[type="submit"], button:not([type])');
      const fields = inputs.slice(0, 10).map((inp) => {
        const input = inp as HTMLInputElement;
        const id = input.id;
        const label = id ? document.querySelector(`label[for="${id}"]`)?.textContent?.trim() : undefined;
        const rect = input.getBoundingClientRect();
        return {
          type: input.type ?? input.tagName.toLowerCase(),
          name: input.name ?? input.id ?? '',
          label,
          visible: rect.width > 0 && rect.height > 0,
        };
      });
      return { fieldCount: inputs.length, hasSubmit, fields };
    });
  });

  const formsWithoutSubmit = forms.filter((f) => f.fieldCount > 0 && !f.hasSubmit).length;
  const formIssue = classifyFormNoSubmit(formsWithoutSubmit);
  if (formIssue) {
    await captureIssueShot(page, viewport, issueScreenshots, formIssue);
  }

  // -------------------------------------------------------------------------
  // Small tap targets (mobile only)
  // -------------------------------------------------------------------------
  const smallTapTargets: TapTarget[] = [];
  if (!isDesktop) {
    const targets: TapTarget[] = await page.evaluate(() => {
      const els = document.querySelectorAll('a, button, [role="button"], input, select');
      return Array.from(els).slice(0, 60).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent?.trim() ?? '').slice(0, 40),
          tag: el.tagName.toLowerCase(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          tooSmall: rect.width < 44 || rect.height < 44,
        };
      });
    });
    smallTapTargets.push(...targets.filter((t) => t.tooSmall).slice(0, 15));
    const tapIssue = classifySmallTapTargets(smallTapTargets.length);
    if (tapIssue) {
      await page.evaluate(() => {
        const els = document.querySelectorAll('a, button, [role="button"], input, select');
        let marked = 0;
        for (const el of Array.from(els)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && (rect.width < 44 || rect.height < 44)) {
            if (marked === 0) el.scrollIntoView({ block: 'center', inline: 'nearest' });
            el.setAttribute('data-pw-issue', 'tap');
            (el as HTMLElement).style.outline = '3px solid #e11';
            marked += 1;
            if (marked >= 8) break;
          }
        }
      }).catch(() => undefined);
      await page.waitForTimeout(200);
      await captureIssueShot(page, viewport, issueScreenshots, tapIssue);
      await clearIssueOutlines(page);
    }
  }

  // -------------------------------------------------------------------------
  // Screenshots
  // -------------------------------------------------------------------------
  let screenshotFullPage = '';
  let screenshotNav = '';

  try {
    const fullBuf: Buffer = await page.screenshot({ fullPage: true, type: 'png' });
    screenshotFullPage = fullBuf.toString('base64');
  } catch (e) {
    notes.push(`Full-page screenshot failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    // For nav screenshot: scroll to top, screenshot just the viewport
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const navBuf: Buffer = await page.screenshot({ fullPage: false, type: 'png' });
    screenshotNav = navBuf.toString('base64');
  } catch (e) {
    notes.push(`Nav screenshot failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await context.close();

  return {
    viewport,
    width,
    height,
    hamburgerFound,
    hamburgerOpens,
    hamburgerLinkCount,
    navLinks,
    jsErrors,
    overflowElements,
    stickyHeaders,
    ctaButtons,
    forms,
    smallTapTargets,
    screenshotFullPage,
    screenshotNav,
    issueScreenshots,
    notes,
  };
}

function buildEmptyResult(
  viewport: 'desktop' | 'mobile',
  width: number,
  height: number,
  notes: string[],
): ViewportResult {
  return {
    viewport,
    width,
    height,
    hamburgerFound: false,
    hamburgerOpens: false,
    hamburgerLinkCount: 0,
    navLinks: [],
    jsErrors: [],
    overflowElements: 0,
    stickyHeaders: 0,
    ctaButtons: [],
    forms: [],
    smallTapTargets: [],
    screenshotFullPage: '',
    screenshotNav: '',
    issueScreenshots: [],
    notes,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function playwrightAudit(opts: {
  url: string;
  viewports?: ('desktop' | 'mobile')[];
  includeScreenshots?: boolean;
}): Promise<PlaywrightAuditResponse> {
  const url = normalizeUrl(opts.url);
  if (!url) return { ok: false, error: 'Invalid URL — must be http or https' };

  const viewports = opts.viewports ?? ['desktop', 'mobile'];
  const includeScreenshots = opts.includeScreenshots ?? true;

  let pw: Awaited<ReturnType<typeof loadPlaywright>>;
  try {
    pw = await loadPlaywright();
  } catch {
    return {
      ok: false,
      error:
        'Playwright is not installed in this environment. Add playwright to package.json dependencies and rebuild.',
    };
  }

  const browser = await pw.chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
  });

  try {
    const results: ViewportResult[] = [];

    for (const viewport of viewports) {
      const result = await auditViewport(url, viewport, browser);
      if (!includeScreenshots) {
        result.screenshotFullPage = '';
        result.screenshotNav = '';
      }
      results.push(result);
    }

    const issue_screenshots = results.flatMap((r) => r.issueScreenshots);

    // Aggregate summary
    const allNavLinks = results.flatMap((r) => r.navLinks);
    const summary = {
      totalNavLinks: allNavLinks.length,
      brokenNavLinks: allNavLinks.filter((l) => !l.resolves).length,
      totalJsErrors: results.reduce((s, r) => s + r.jsErrors.length, 0),
      totalOverflowElements: results.reduce((s, r) => s + r.overflowElements, 0),
      smallTapTargets: results.reduce((s, r) => s + r.smallTapTargets.length, 0),
      formsFound: results.reduce((s, r) => s + r.forms.length, 0),
      ctaButtons: results.reduce((s, r) => s + r.ctaButtons.length, 0),
    };

    return {
      ok: true,
      url,
      audited_at: new Date().toISOString(),
      results,
      issue_screenshots,
      summary,
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Compact text formatter for agent output
// ---------------------------------------------------------------------------

export function formatPlaywrightResults(
  data: Extract<PlaywrightAuditResponse, { ok: true }>,
): string {
  const lines: string[] = [`Playwright UX/UI Audit: ${data.url}`, `Audited at: ${data.audited_at}`];

  const s = data.summary;
  lines.push(
    `\nSUMMARY`,
    `  Nav links: ${s.totalNavLinks} total, ${s.brokenNavLinks} broken`,
    `  JS errors: ${s.totalJsErrors}`,
    `  Overflow elements: ${s.totalOverflowElements}`,
    `  Small tap targets (mobile <44px): ${s.smallTapTargets}`,
    `  Forms found: ${s.formsFound}`,
    `  CTA buttons: ${s.ctaButtons}`,
  );

  for (const r of data.results) {
    lines.push(`\n${r.viewport.toUpperCase()} (${r.width}×${r.height})`);

    if (r.viewport === 'mobile') {
      lines.push(`  Hamburger found: ${r.hamburgerFound}`);
      if (r.hamburgerFound) {
        lines.push(`  Hamburger opens nav: ${r.hamburgerOpens}`);
        lines.push(`  Visible nav links after tap: ${r.hamburgerLinkCount}`);
      }
    }

    if (r.navLinks.length) {
      const broken = r.navLinks.filter((l) => !l.resolves);
      lines.push(`  Nav links: ${r.navLinks.length} (${broken.length} broken)`);
      for (const l of broken) {
        lines.push(`    ✗ "${l.text}" [${l.href}] — ${l.error ?? 'broken'}`);
      }
    }

    if (r.jsErrors.length) {
      lines.push(`  JS errors (${r.jsErrors.length}):`);
      for (const e of r.jsErrors.slice(0, 5)) {
        lines.push(`    • ${e}`);
      }
    }

    if (r.overflowElements > 0) {
      lines.push(`  Overflow/off-screen elements: ${r.overflowElements}`);
    }

    if (r.stickyHeaders > 0) {
      lines.push(`  Sticky/fixed headers: ${r.stickyHeaders}`);
    }

    const unclickable = r.ctaButtons.filter((b) => !b.clickable);
    if (unclickable.length) {
      lines.push(`  Unclickable CTAs: ${unclickable.map((b) => `"${b.text}"`).join(', ')}`);
    }

    if (r.forms.length) {
      lines.push(`  Forms: ${r.forms.length}`);
      for (const f of r.forms) {
        lines.push(
          `    • ${f.fieldCount} field(s), submit button: ${f.hasSubmit ? 'yes' : 'NO'}`,
        );
      }
    }

    if (r.smallTapTargets.length) {
      lines.push(`  Small tap targets (${r.smallTapTargets.length}):`);
      for (const t of r.smallTapTargets.slice(0, 5)) {
        lines.push(`    • <${t.tag}> "${t.text}" — ${t.width}×${t.height}px`);
      }
    }

    if (r.notes.length) {
      lines.push(`  Notes: ${r.notes.join('; ')}`);
    }

    if (r.issueScreenshots.length) {
      lines.push(`  ISSUE SCREENSHOTS (${r.issueScreenshots.length}) — captured at the failed state:`);
      for (const shot of r.issueScreenshots) {
        lines.push(`    • ${shot.title} [${shot.filename}] — ${shot.detail}`);
      }
    }

    if (r.screenshotFullPage) {
      lines.push(`  [Context full-page screenshot captured — ${Math.round(r.screenshotFullPage.length * 0.75 / 1024)}KB PNG; not issue evidence]`);
    }
    if (r.screenshotNav) {
      lines.push(`  [Context nav screenshot captured; not issue evidence]`);
    }
  }

  const allIssues = data.issue_screenshots ?? data.results.flatMap((r) => r.issueScreenshots);
  if (allIssues.length) {
    lines.push(
      `\nISSUE SCREENSHOTS will be filed on the project when create_work / update_work runs.`,
      `Cite them in UX & UI — do not invent a screenshot gallery if none are listed above.`,
    );
  }

  return lines.join('\n');
}
