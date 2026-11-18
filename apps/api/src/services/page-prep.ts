/**
 * Preparing a rendered page for a faithful capture (screenshot or PDF).
 *
 * Everything that runs **inside the page** lives here. These scripts are ours
 * and constant: the only client-controlled values that ever reach the page
 * are CSS selectors, passed as evaluation arguments (never as source code) and
 * applied one rule at a time through the CSSOM.
 */
import type { Page } from 'playwright-core';

/** Neutralises motion so the capture is deterministic and never mid-transition. */
const FREEZE_MOTION_SELECTOR = '*, *::before, *::after';
const FREEZE_MOTION_DECLARATIONS =
  'animation-duration: 0s !important; animation-delay: 0s !important; ' +
  'transition-duration: 0s !important; transition-delay: 0s !important; ' +
  'scroll-behavior: auto !important; caret-color: transparent !important;';

/**
 * Containers of cookie / consent notices, hidden before a capture.
 *
 * Hand-written from the public markup of widespread consent tools and from
 * naming habits of home-made banners. Hiding is purely cosmetic: nothing is
 * clicked, no consent is given or refused on the visitor's behalf.
 */
export const CONSENT_BANNER_SELECTORS: readonly string[] = [
  // Consent management platforms
  '#onetrust-consent-sdk', '#onetrust-banner-sdk', '.onetrust-pc-dark-filter',
  '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay', '#cookiebanner',
  '#didomi-host', '#didomi-notice', '.didomi-popup-backdrop',
  '#usercentrics-root', '#usercentrics-cmp-ui', '#uc-banner-modal',
  '#qc-cmp2-container', '.qc-cmp2-container', '.qc-cmp-ui-container',
  '#truste-consent-track', '#trustarc-banner-overlay', '.truste_overlay', '.truste_box_overlay',
  '[id^="sp_message_container_"]', '.sp-message-open > [class^="sp_veil"]',
  '.fc-consent-root', '.fc-dialog-overlay',
  '#iubenda-cs-banner', '.iubenda-cs-container',
  '.osano-cm-window', '.osano-cm-dialog',
  '#axeptio_overlay', '.axeptio_widget', '.axeptio_mount',
  '#tarteaucitronRoot', '#tarteaucitronAlertBig',
  '#cmpbox', '#cmpbox2', '.cmpboxBG', '#cmpwrapper',
  '#klaro', '.klaro .cookie-modal', '.klaro .cookie-notice',
  '#cookiescript_injected', '#cookiescript_injected_wrapper',
  '#hs-eu-cookie-confirmation', '#hs-banner-parent',
  '.cky-consent-container', '.cky-overlay', '.cky-modal',
  '.cmplz-cookiebanner', '#cmplz-cookiebanner-container',
  '#moove_gdpr_cookie_info_bar', '#cookie-law-info-bar', '.cli-modal-backdrop',
  '.cc-window', '.cc-banner', '.cc-revoke', '#cc-main', '.cc_banner-wrapper',
  '#CookieConsent', '#cookieConsent', '#cookie-consent', '#cookieconsent',
  '.termly-styles-root', '#termly-code-snippet-support', '#ccc', '#ccc-overlay',
  '#consent_blackbar', '#gdpr-consent-tool-wrapper', '.evidon-banner', '#_evidon_banner',
  '#snigel-cmp-framework', '#pandectes-banner', '#shopify-pc__banner', '.borlabs-cookie',
  '#BorlabsCookieBox', '#cookie-notice', '#cookie-banner', '#cookieBanner', '#cookie-bar',
  '#cookiebar', '#cookie_notice', '#cookies-banner', '#gdpr-banner', '#gdpr-cookie-notice',
  // Naming habits of home-made banners
  '.cookie-banner', '.cookie-notice', '.cookie-consent', '.cookie-bar', '.cookie-popup',
  '.cookie-modal', '.cookies-banner', '.cookieBanner', '.cookieConsent', '.cookie-disclaimer',
  '.gdpr-banner', '.gdpr-consent', '.consent-banner', '.consent-popup', '.privacy-banner',
  '[aria-label="cookieconsent" i]', '[aria-label="cookie consent" i]',
  '[aria-label="cookie banner" i]', '[data-testid="cookie-banner"]', '[data-cookiebanner]',
  '[data-nosnippet][class*="cookie" i]',
];

/** Longest scroll pass, whatever the page's height. */
export const SCROLL_PASS_BUDGET_MS = 4000;
/** Longest wait for images to decode once the page is back in place. */
export const IMAGE_SETTLE_BUDGET_MS = 2500;

/**
 * Runs inside the page (serialised by Playwright, so it must be
 * self-contained). Applies `declarations` to each selector through a
 * constructed stylesheet: `insertRule` accepts exactly one rule, so a selector
 * can never smuggle in extra CSS, and an invalid one is skipped without
 * affecting the others. Unlike a `<style>` tag, this is not subject to the
 * page's Content-Security-Policy, which is left untouched.
 */
function applyRulesInPage(input: { selectors: string[]; declarations: string }): void {
  const scope = globalThis as unknown as {
    CSSStyleSheet: new () => { insertRule(rule: string): number };
    document: { adoptedStyleSheets: unknown[] };
  };
  const sheet = new scope.CSSStyleSheet();
  for (const selector of input.selectors) {
    try {
      sheet.insertRule(`${selector} { ${input.declarations} }`);
    } catch {
      // Not a selector this browser understands: nothing to apply.
    }
  }
  scope.document.adoptedStyleSheets = [...scope.document.adoptedStyleSheets, sheet];
}

/** Hides the elements matching `selectors` (`display: none`). Never throws. */
export async function hideElements(page: Page, selectors: readonly string[]): Promise<void> {
  if (selectors.length === 0) return;
  await page
    .evaluate(applyRulesInPage, {
      selectors: [...selectors],
      declarations: 'display: none !important;',
    })
    .catch(() => undefined);
}

/** Stops animations and transitions. Never throws. */
export async function freezeMotion(page: Page): Promise<void> {
  await page
    .evaluate(applyRulesInPage, {
      selectors: [FREEZE_MOTION_SELECTOR],
      declarations: FREEZE_MOTION_DECLARATIONS,
    })
    .catch(() => undefined);
}

/** Waits for web fonts so text is not captured in a fallback face. Never throws. */
export async function waitForFonts(page: Page, timeoutMs: number): Promise<void> {
  await page
    .evaluate(
      `Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ${Math.round(timeoutMs)}))]).then(() => undefined)`,
    )
    .catch(() => undefined);
}

/**
 * Scrolls through the page once, then back to the top, so content that loads
 * on scroll (lazy images, infinite sections) exists before a full-page
 * capture. Bounded in distance (`maxHeight`) and in time. Never throws.
 */
export async function scrollThrough(page: Page, maxHeight: number, budgetMs: number): Promise<void> {
  if (budgetMs < 200) return;
  const script = `(async () => {
    const limit = ${Math.round(maxHeight)};
    const budget = ${Math.round(budgetMs)};
    const started = performance.now();
    const step = Math.max(200, window.innerHeight);
    const height = () => Math.min(document.documentElement.scrollHeight, limit);
    let y = 0;
    while (y < height() && performance.now() - started < budget) {
      y = Math.min(y + step, height());
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    window.scrollTo(0, 0);
  })()`;
  await page.evaluate(script).catch(() => undefined);
}

/**
 * Waits until the images intersecting the first `captureHeight` pixels are
 * loaded and decoded (or failed), within `budgetMs`. Never throws.
 */
export async function waitForImages(
  page: Page,
  captureHeight: number,
  budgetMs: number,
): Promise<void> {
  if (budgetMs < 100) return;
  const script = `(async () => {
    const limit = ${Math.round(captureHeight)};
    const settled = (img) => {
      const loaded = img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
      return loaded.then(() => (img.naturalWidth > 0 ? img.decode() : undefined)).catch(() => undefined);
    };
    const visible = Array.from(document.images).filter((img) => {
      const box = img.getBoundingClientRect();
      const top = box.top + window.scrollY;
      return box.width > 0 && box.height > 0 && top < limit && (img.currentSrc || img.src);
    });
    await Promise.race([
      Promise.all(visible.map(settled)),
      new Promise((resolve) => setTimeout(resolve, ${Math.round(budgetMs)})),
    ]);
    // One frame, so what was just decoded is painted.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  })()`;
  await page.evaluate(script).catch(() => undefined);
}
