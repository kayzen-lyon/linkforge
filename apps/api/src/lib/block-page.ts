/**
 * Detection of block pages (pure, no I/O).
 *
 * Anti-bot layers often answer `200 OK` with an interstitial ("Just a
 * moment…"), a CAPTCHA or an access-denied notice. Taken at face value, that
 * page would be extracted and cached as if it were the target's content.
 *
 * Three families of signals, from the most to the least specific:
 *
 * 1. **Strong markers**: artefacts only a challenge platform emits (script
 *    paths, element ids, cookie names). Trusted on a page of any size.
 * 2. **Generic phrases** ("access denied", "verify you are human"): real
 *    articles can contain them, so they only count on a small page.
 * 3. **Structural emptiness**: next to no text, and what little markup there
 *    is exists to run a challenge (CAPTCHA widget, instant self-refresh).
 */
import { load } from 'cheerio';

export interface BlockVerdict {
  readonly blocked: boolean;
  /** Short machine-friendly reason, e.g. `challenge:cloudflare`; `null` when not blocked. */
  readonly reason: string | null;
}

/** Artefacts of challenge platforms, matched against the raw markup. */
const STRONG_MARKERS: ReadonlyArray<readonly [reason: string, pattern: RegExp]> = [
  ['challenge:cloudflare', /\/cdn-cgi\/challenge-platform\/|_cf_chl_opt|cf-chl-bypass|id=["']challenge-(?:form|error-text|running)["']|cf-turnstile-response/i],
  ['challenge:cloudflare', /<title>\s*(?:Just a moment|Attention Required!)[^<]*<\/title>[\s\S]{0,4000}cloudflare/i],
  ['challenge:datadome', /captcha-delivery\.com|geo\.captcha-delivery|dd=\{['"]?rt['"]?:/i],
  ['challenge:perimeterx', /px-captcha|_pxAppId|\/_px\/|captcha\.px-cdn\.net/i],
  ['challenge:imperva', /_Incapsula_Resource|Incapsula incident ID|\/_Incapsula_/i],
  ['challenge:akamai', /errors\.edgesuite\.net|Reference&#32;&#35;[\d.a-f]+|ak_bmsc[\s\S]{0,200}challenge|\/akam\/\d+\/pixel/i],
  ['challenge:aws-waf', /awswaf\.com\/[^"']*challenge|AwsWafIntegration|aws-waf-token/i],
  ['challenge:kasada', /\/ips\.js\?[^"']*KP_UIDz|x-kpsdk-/i],
  ['challenge:sucuri', /sucuri_cloudproxy_js|Sucuri WebSite Firewall - Access Denied/i],
  ['challenge:shape', /window\._sdp_bot|\/TSPD\/[0-9a-f]{8,}/i],
];

/** Wording of block pages. Only meaningful when the page says little else. */
const GENERIC_PHRASES: ReadonlyArray<readonly [reason: string, pattern: RegExp]> = [
  ['access-denied', /\baccess (?:is |has been |to this (?:page|site|resource) (?:is|has been) )?denied\b/i],
  ['access-denied', /\b(?:you have been|you are|your (?:ip|access|request) (?:address )?(?:has been|is|was)) (?:temporarily )?blocked\b/i],
  ['access-denied', /\b403 forbidden\b|\brequest (?:was )?blocked\b|\bnot allowed to access\b/i],
  ['human-check', /\bverify(?:ing)? (?:that )?you(?:'re| are) (?:a |not a )?(?:human|robot|bot)\b/i],
  ['human-check', /\b(?:are you|you are) (?:a )?(?:human|robot)\b|\bprove you(?:'re| are) (?:a )?human\b/i],
  ['human-check', /\bchecking (?:your browser|if the site connection is secure)\b/i],
  ['human-check', /\b(?:complete|solve) the (?:security check|captcha)\b|\bpress (?:and|&) hold\b/i],
  ['human-check', /\bunusual (?:traffic|activity)\b|\bautomated (?:access|queries|requests)\b/i],
  ['human-check', /\bpardon our interruption\b|\bone more step\b/i],
  ['needs-javascript', /\b(?:enable|turn on) javascript and cookies to continue\b/i],
  ['human-check', /\bvérifi(?:ez|cation) que vous (?:êtes|n'êtes pas) (?:un )?(?:humain|robot)\b|\baccès refusé\b/i],
];

/** Visible text above which generic phrases are assumed to belong to real content. */
const SMALL_PAGE_CHARS = 1500;
/** Visible text below which a page is structurally empty. */
const EMPTY_PAGE_CHARS = 80;

/**
 * Tells whether a document is a block page rather than the target's content.
 *
 * @param html - Raw or rendered markup of an answer with a success status.
 */
export function detectBlockPage(html: string): BlockVerdict {
  for (const [reason, pattern] of STRONG_MARKERS) {
    if (pattern.test(html)) return { blocked: true, reason };
  }

  const $ = load(html);
  const refresh = $('meta[http-equiv="refresh" i]').attr('content') ?? '';
  const captchaWidget =
    $(
      'iframe[src*="captcha" i], script[src*="captcha" i], script[src*="challenge" i], ' +
        '.g-recaptcha, .h-captcha, [id*="captcha" i]',
    ).length > 0;
  const title = $('title').first().text();
  $('script, style, noscript, template').remove();
  const text = `${title} ${$('body').text()}`.replace(/\s+/g, ' ').trim();

  if (text.length <= SMALL_PAGE_CHARS) {
    for (const [reason, pattern] of GENERIC_PHRASES) {
      if (pattern.test(text)) return { blocked: true, reason };
    }
    // A CAPTCHA on a page with nothing else to read is the page's whole purpose.
    if (captchaWidget && text.length < 400) return { blocked: true, reason: 'captcha' };
  }

  if (text.length < EMPTY_PAGE_CHARS && /^\s*\d+\s*(?:;|$)/.test(refresh) && captchaWidget) {
    return { blocked: true, reason: 'challenge:refresh' };
  }
  return { blocked: false, reason: null };
}
