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
 *  - Issue-state screenshots when something is visually broken (empty nav,
 *    white-on-white text, sideways overscroll, clipped text, broken images, …)
 *  - Optional full-page / nav-state context shots (not used as issue evidence)
 *
 * Results are returned for both desktop (1440×900) and mobile (375×812) viewports.
 * Failed-check PNGs are stashed for create_work / update_work to file on the project.
 */

import {
  classifyBrokenImages,
  classifyClippedText,
  classifyFormNoSubmit,
  classifyHamburgerIssue,
  classifyLowContrast,
  classifyOverflow,
  classifyOverscroll,
  classifySmallTapTargets,
  classifyUnclickableCtas,
  issueShotFilename,
  VISUAL_CONTRAST_MIN,
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
  /** Extra horizontal pixels the document can scroll (0 = no sideways slide). */
  overscrollPx: number;
  lowContrast: number;
  brokenImages: number;
  clippedText: number;
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
        overscrollPx: number;
        lowContrast: number;
        brokenImages: number;
        clippedText: number;
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

const MAX_ISSUE_SHOTS = 8;

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

async function markAndCapture(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  viewport: 'desktop' | 'mobile',
  issues: PlaywrightIssueScreenshot[],
  meta: { kind: PlaywrightIssueKind; title: string; detail: string },
  mark: () => Promise<void>,
): Promise<void> {
  if (issues.length >= MAX_ISSUE_SHOTS) return;
  await mark().catch(() => undefined);
  await page.waitForTimeout(200);
  await captureIssueShot(page, viewport, issues, meta);
  await clearIssueOutlines(page);
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

  if (hamburgerFound) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(250);
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
  const layout = await page.evaluate((vw: number) => {
    let overflowElements = 0;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > vw + 20) overflowElements += 1;
    }
    const overscrollPx = Math.max(
      0,
      Math.round(document.documentElement.scrollWidth - vw),
    );
    return { overflowElements, overscrollPx };
  }, width);
  const overflowElements = layout.overflowElements;
  const overscrollPx = layout.overscrollPx;

  const overscrollIssue = classifyOverscroll(overscrollPx);
  const overflowIssue = overscrollIssue ? null : classifyOverflow(overflowElements);
  if (overscrollIssue) {
    await markAndCapture(page, viewport, issueScreenshots, overscrollIssue, async () => {
      await page.evaluate((vw: number) => {
        let marked = 0;
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.right > vw + 20) {
            el.setAttribute('data-pw-issue', 'overscroll');
            (el as HTMLElement).style.outline = '3px solid #e11';
            marked += 1;
            if (marked >= 8) break;
          }
        }
        const extra = Math.max(0, document.documentElement.scrollWidth - vw);
        window.scrollTo(Math.min(extra, 96), 0);
      }, width);
    });
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  } else if (overflowIssue) {
    await markAndCapture(page, viewport, issueScreenshots, overflowIssue, async () => {
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
      }, width);
    });
  }

  // -------------------------------------------------------------------------
  // Visual breakage: unreadable contrast, broken images, clipped text
  // -------------------------------------------------------------------------
  const visual = await page.evaluate((minContrast: number) => {
    const parseRgb = (input: string) => {
      const m = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
    };
    const luminance = (r: number, g: number, b: number) => {
      const lin = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const ratio = (
      fg: { r: number; g: number; b: number },
      bg: { r: number; g: number; b: number },
    ) => {
      const L1 = luminance(fg.r, fg.g, fg.b);
      const L2 = luminance(bg.r, bg.g, bg.b);
      const lighter = Math.max(L1, L2);
      const darker = Math.min(L1, L2);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const effectiveBg = (el: Element) => {
      let node: Element | null = el;
      while (node) {
        const bg = parseRgb(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0.6) return bg;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };

    let lowContrast = 0;
    let worstRatio = 21;
    const textSels =
      'p, h1, h2, h3, h4, h5, h6, a, button, li, label, td, th, span, figcaption, blockquote, small';
    for (const el of Array.from(document.querySelectorAll(textSels)).slice(0, 250)) {
      const text = (el.textContent || '').trim();
      if (text.length < 2) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      const fg = parseRgb(style.color);
      if (!fg || fg.a < 0.4) continue;
      const bg = effectiveBg(el);
      const c = ratio(fg, bg);
      if (c < minContrast) {
        lowContrast += 1;
        if (c < worstRatio) worstRatio = c;
      }
    }

    let brokenImages = 0;
    for (const img of Array.from(document.images)) {
      const rect = img.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src)) {
        brokenImages += 1;
      }
    }

    let clippedText = 0;
    for (const el of Array.from(document.querySelectorAll(textSels)).slice(0, 250)) {
      const style = getComputedStyle(el);
      const hiddenX = style.overflowX === 'hidden' || style.overflow === 'hidden';
      if (!hiddenX) continue;
      const text = (el.textContent || '').trim();
      if (text.length < 3) continue;
      if (el.scrollWidth > el.clientWidth + 8) clippedText += 1;
    }

    return {
      lowContrast,
      worstRatio: lowContrast ? worstRatio : 21,
      brokenImages,
      clippedText,
    };
  }, VISUAL_CONTRAST_MIN);

  const lowContrast = visual.lowContrast;
  const brokenImages = visual.brokenImages;
  const clippedText = visual.clippedText;

  const contrastIssue = classifyLowContrast(lowContrast, visual.worstRatio);
  if (contrastIssue) {
    await markAndCapture(page, viewport, issueScreenshots, contrastIssue, async () => {
      await page.evaluate((minContrast: number) => {
        const parseRgb = (input: string) => {
          const m = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (!m) return null;
          return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
        };
        const luminance = (r: number, g: number, b: number) => {
          const lin = [r, g, b].map((c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
        };
        const ratio = (
          fg: { r: number; g: number; b: number },
          bg: { r: number; g: number; b: number },
        ) => {
          const L1 = luminance(fg.r, fg.g, fg.b);
          const L2 = luminance(bg.r, bg.g, bg.b);
          return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        };
        const effectiveBg = (el: Element) => {
          let node: Element | null = el;
          while (node) {
            const bg = parseRgb(getComputedStyle(node).backgroundColor);
            if (bg && bg.a > 0.6) return bg;
            node = node.parentElement;
          }
          return { r: 255, g: 255, b: 255, a: 1 };
        };
        let marked = 0;
        const textSels =
          'p, h1, h2, h3, h4, h5, h6, a, button, li, label, td, th, span, figcaption, blockquote, small';
        for (const el of Array.from(document.querySelectorAll(textSels))) {
          const text = (el.textContent || '').trim();
          if (text.length < 2) continue;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) continue;
          const fg = parseRgb(style.color);
          if (!fg || fg.a < 0.4) continue;
          if (ratio(fg, effectiveBg(el)) >= minContrast) continue;
          if (marked === 0) el.scrollIntoView({ block: 'center', inline: 'nearest' });
          el.setAttribute('data-pw-issue', 'contrast');
          (el as HTMLElement).style.outline = '3px solid #e11';
          marked += 1;
          if (marked >= 8) break;
        }
      }, VISUAL_CONTRAST_MIN);
    });
  }

  const brokenIssue = classifyBrokenImages(brokenImages);
  if (brokenIssue) {
    await markAndCapture(page, viewport, issueScreenshots, brokenIssue, async () => {
      await page.evaluate(() => {
        let marked = 0;
        for (const img of Array.from(document.images)) {
          const rect = img.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) continue;
          if (!(img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src))) continue;
          if (marked === 0) img.scrollIntoView({ block: 'center', inline: 'nearest' });
          img.setAttribute('data-pw-issue', 'image');
          img.style.outline = '3px solid #e11';
          marked += 1;
          if (marked >= 6) break;
        }
      });
    });
  }

  const clippedIssue = classifyClippedText(clippedText);
  if (clippedIssue) {
    await markAndCapture(page, viewport, issueScreenshots, clippedIssue, async () => {
      await page.evaluate(() => {
        let marked = 0;
        const textSels =
          'p, h1, h2, h3, h4, h5, h6, a, button, li, label, td, th, span, figcaption, blockquote, small';
        for (const el of Array.from(document.querySelectorAll(textSels))) {
          const style = getComputedStyle(el);
          const hiddenX = style.overflowX === 'hidden' || style.overflow === 'hidden';
          if (!hiddenX) continue;
          const text = (el.textContent || '').trim();
          if (text.length < 3) continue;
          if (el.scrollWidth <= el.clientWidth + 8) continue;
          if (marked === 0) el.scrollIntoView({ block: 'center', inline: 'nearest' });
          el.setAttribute('data-pw-issue', 'clip');
          (el as HTMLElement).style.outline = '3px solid #e11';
          marked += 1;
          if (marked >= 8) break;
        }
      });
    });
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
    overscrollPx,
    lowContrast,
    brokenImages,
    clippedText,
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
    overscrollPx: 0,
    lowContrast: 0,
    brokenImages: 0,
    clippedText: 0,
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
      overscrollPx: Math.max(0, ...results.map((r) => r.overscrollPx)),
      lowContrast: results.reduce((s, r) => s + r.lowContrast, 0),
      brokenImages: results.reduce((s, r) => s + r.brokenImages, 0),
      clippedText: results.reduce((s, r) => s + r.clippedText, 0),
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
    `  Sideways overscroll: ${s.overscrollPx}px`,
    `  Low-contrast text: ${s.lowContrast}`,
    `  Broken images: ${s.brokenImages}`,
    `  Clipped text: ${s.clippedText}`,
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

    if (r.overscrollPx > 8) {
      lines.push(`  Sideways overscroll: ${r.overscrollPx}px (page can be dragged left/right)`);
    } else if (r.overflowElements > 0) {
      lines.push(`  Overflow/off-screen elements: ${r.overflowElements}`);
    }
    if (r.lowContrast > 0) {
      lines.push(`  Unreadable / low-contrast text: ${r.lowContrast}`);
    }
    if (r.brokenImages > 0) {
      lines.push(`  Broken images: ${r.brokenImages}`);
    }
    if (r.clippedText > 0) {
      lines.push(`  Clipped text blocks: ${r.clippedText}`);
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
