/**
 * Social sharing images (`/og`): a 1200×630 card rendered by Chromium from an
 * HTML string built here.
 *
 * The document has no remote resource (system fonts, inline CSS) and is
 * rendered offline with scripts disabled; every client text is escaped and
 * length-bounded, colours are validated hexadecimal. The client never
 * supplies markup, CSS or a URL to load.
 */
import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { escapeHtml } from '../lib/html-escape.js';
import { cacheKey, SingleFlight, type Cache } from './cache/index.js';
import type { Renderer } from './renderer.js';

export type OgTemplate = 'classic' | 'gradient' | 'split';
export const OG_TEMPLATES: readonly OgTemplate[] = ['classic', 'gradient', 'split'];
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_LIMITS = { title: 160, description: 300, site: 60, author: 60, label: 30 } as const;

export interface OgRequest {
  readonly title: string;
  readonly description: string | null;
  /** Site or brand name, bottom left. */
  readonly site: string | null;
  readonly author: string | null;
  /** Small pill above the title ("Guide", "New"). */
  readonly label: string | null;
  readonly template: OgTemplate;
  readonly theme: 'light' | 'dark';
  /** Validated `#rrggbb` accent colour. */
  readonly accent: string;
  readonly format: 'png' | 'jpeg';
  readonly force: boolean;
  readonly ttlSeconds: number | null;
}

export interface OgResult {
  readonly image: Buffer;
  readonly contentType: 'image/png' | 'image/jpeg';
  readonly cached: boolean;
  readonly ttlSeconds: number;
}

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans','Open Sans','Liberation Sans',Arial,sans-serif";

/** Title size by length, so a short title is bold and a long one still fits in three lines. */
function titleSize(title: string): number {
  const length = [...title].length;
  return length <= 30 ? 84 : length <= 60 ? 68 : length <= 100 ? 56 : 46;
}

/** Builds the card. Exported for tests: the output must contain no client markup. */
export function buildOgHtml(request: OgRequest): string {
  const dark = request.theme === 'dark';
  const ink = dark ? '#f5f6f8' : '#0f1419';
  const muted = dark ? '#aab2bf' : '#55606e';
  const paper = dark ? '#0f1419' : '#ffffff';
  const { accent, template } = request;
  const text = (value: string | null, max: number): string => (value === null ? '' : escapeHtml([...value].slice(0, max).join('')));

  const title = text(request.title, OG_LIMITS.title);
  const description = text(request.description, OG_LIMITS.description);
  const site = text(request.site, OG_LIMITS.site);
  const author = text(request.author, OG_LIMITS.author);
  const label = text(request.label, OG_LIMITS.label);

  const background =
    template === 'gradient'
      ? `background:linear-gradient(135deg,${accent} 0%,${dark ? '#0f1419' : '#111827'} 100%);`
      : template === 'split'
        ? `background:linear-gradient(90deg,${accent} 0,${accent} 28px,${paper} 28px);`
        : `background:${paper};`;
  const onAccent = template === 'gradient';
  const mainInk = onAccent ? '#ffffff' : ink;
  const mainMuted = onAccent ? 'rgba(255,255,255,.82)' : muted;

  return `<!doctype html><html lang="und"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:${OG_SIZE.width}px;height:${OG_SIZE.height}px;overflow:hidden;}
body{${background}font-family:${FONT};color:${mainInk};display:flex;flex-direction:column;justify-content:space-between;padding:${template === 'split' ? '64px 72px 56px 100px' : '64px 72px 56px'};}
.label{display:inline-block;align-self:flex-start;font-size:24px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:8px 18px;border-radius:999px;margin-bottom:28px;${
    onAccent ? 'background:rgba(255,255,255,.18);color:#fff;' : `background:${accent};color:#fff;`
  }}
h1{font-size:${titleSize(request.title)}px;line-height:1.08;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;}
p{margin-top:24px;font-size:30px;line-height:1.35;color:${mainMuted};overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
footer{display:flex;align-items:center;justify-content:space-between;font-size:26px;font-weight:600;color:${mainMuted};}
.site{display:flex;align-items:center;gap:14px;color:${mainInk};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:700px;}
.mark{flex:none;width:22px;height:22px;border-radius:6px;background:${onAccent ? '#fff' : accent};}
.author{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;}
${template === 'classic' ? `body{border-top:14px solid ${accent};}` : ''}
</style></head><body><main>${label === '' ? '' : `<span class="label">${label}</span>`}<h1>${title}</h1>${
    description === '' ? '' : `<p>${description}</p>`
  }</main><footer><span class="site">${site === '' ? '' : `<i class="mark"></i>${site}`}</span><span class="author">${author}</span></footer></body></html>`;
}

export class OgService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Renders the card.
   *
   * @throws {AppError} `EBUSY`, `ETIMEOUT`, `EBROWSER`.
   */
  async render(request: OgRequest): Promise<OgResult> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const contentType = request.format === 'png' ? 'image/png' : 'image/jpeg';
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.screenshotTtlSeconds;
    const { force: _force, ttlSeconds: _ttl, ...design } = request;
    const key = cacheKey('og', { ...design, shape: 1 });
    if (!request.force) {
      const hit = await this.cache.get(key);
      if (hit !== null) return { image: hit, contentType, cached: true, ttlSeconds };
    }
    const image = await this.flights.run(key, async () => {
      const fresh = await this.renderer.renderLocal(buildOgHtml(request), { viewport: OG_SIZE, deadline }, (page) =>
        page.screenshot({
          type: request.format,
          ...(request.format === 'jpeg' && { quality: 88 }),
          clip: { x: 0, y: 0, ...OG_SIZE },
        }),
      );
      await this.cache.set(key, fresh, ttlSeconds);
      return fresh;
    });
    return { image, contentType, cached: false, ttlSeconds };
  }
}
