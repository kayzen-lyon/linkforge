/**
 * Animated capture: a short scroll-through of a page as an animated PNG.
 *
 * No video encoder and no image library: Chromium encodes each frame as a
 * PNG, and the frames are stitched into an APNG by re-wrapping their
 * compressed data (`lib/png.ts`). Bounded in frames, in viewport size and in
 * bytes, so it fits a 60 s function and a capped response.
 */
import type { AppConfig } from '../config.js';
import { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import { assembleApng } from '../lib/png.js';
import type { TargetHeaders } from '../lib/target-headers.js';
import { parseTargetUrl } from '../security/ssrf.js';
import { cacheKey, SingleFlight, type Cache } from './cache/index.js';
import { CONSENT_BANNER_SELECTORS, freezeMotion, hideElements, waitForFonts, waitForImages } from './page-prep.js';
import type { Renderer } from './renderer.js';

export interface AnimationRequest {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** Frames wanted; fewer are produced when the page is short or the byte budget is reached. */
  readonly frames: number;
  /** Display time of each frame, in milliseconds. */
  readonly delayMs: number;
  readonly hideBanners: boolean;
  readonly blockAds: boolean;
  readonly headers?: TargetHeaders | null;
  readonly force: boolean;
  readonly ttlSeconds: number | null;
}

export interface AnimationResult {
  readonly image: Buffer;
  /** Frames actually in the animation. */
  readonly frames: number;
  readonly cached: boolean;
  readonly ttlSeconds: number;
}

export const ANIMATION_LIMITS = { maxFrames: 10, maxWidth: 1280, maxHeight: 800 } as const;
/** Distance scrolled at most, whatever the page's height. */
const MAX_SCROLL = 12_000;
/** Time kept per frame (scroll, paint, encode) when sizing the navigation. */
const FRAME_RESERVE_MS = 900;

export class AnimationService {
  private readonly flights = new SingleFlight();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: Cache,
    private readonly renderer: Renderer,
  ) {}

  /**
   * Captures a scroll-through of a page.
   *
   * @throws {AppError} `ETOOLARGE` when even two frames exceed the byte
   *   budget, plus the usual URL, network and browser errors.
   */
  async capture(request: AnimationRequest): Promise<AnimationResult> {
    const deadline = new Deadline(this.config.requestDeadlineMs);
    const target = parseTargetUrl(request.url, this.config.ssrf);
    const ttlSeconds = request.ttlSeconds ?? this.config.cache.screenshotTtlSeconds;
    const { url: _url, force: _force, ttlSeconds: _ttl, headers, ...shape } = request;
    const key = cacheKey('animation', { url: target.href, ...shape, ...(headers != null && { headers }) });
    if (!request.force) {
      const hit = await this.cache.get(key);
      // The frame count is not stored apart: it is read back from the file's animation header.
      if (hit !== null) return { image: hit, frames: frameCount(hit), cached: true, ttlSeconds };
    }
    const image = await this.flights.run(key, async () => {
      const fresh = await this.render(target, request, deadline);
      await this.cache.set(key, fresh, ttlSeconds);
      return fresh;
    });
    return { image, frames: frameCount(image), cached: false, ttlSeconds };
  }

  private render(target: URL, request: AnimationRequest, deadline: Deadline): Promise<Buffer> {
    const maxBytes = this.config.animationMaxBytes;
    return this.renderer.render(
      target,
      {
        waitUntil: 'load',
        settleMs: 2000,
        deadline,
        reserveMs: 3000 + request.frames * FRAME_RESERVE_MS,
        requestHeaders: request.headers ?? null,
        guard: { blockAds: request.blockAds },
        contextOptions: { viewport: { width: request.width, height: request.height }, deviceScaleFactor: 1 },
      },
      async ({ page, response }) => {
        const status = response?.status() ?? 200;
        if (status >= 400) throw AppError.targetStatus(status);
        await freezeMotion(page);
        await waitForFonts(page, 1500);
        if (request.hideBanners) await hideElements(page, CONSENT_BANNER_SELECTORS);

        const scrollHeight = (await page.evaluate('document.documentElement.scrollHeight').catch(() => request.height)) as number;
        const distance = Math.max(0, Math.min(Number(scrollHeight) || 0, MAX_SCROLL) - request.height);
        // A page that does not scroll is one frame; otherwise evenly spaced stops, top to bottom.
        const stops = distance === 0 ? 1 : request.frames;
        const frames: Buffer[] = [];
        let bytes = 0;
        for (let i = 0; i < stops; i += 1) {
          if (deadline.remaining() < FRAME_RESERVE_MS + 1500) break;
          const y = stops === 1 ? 0 : Math.round((distance * i) / (stops - 1));
          // The position is a number computed here, passed as an argument: never source code.
          await page.evaluate((top) => (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, top), y).catch(() => undefined);
          await waitForImages(page, y + request.height, deadline.budget(400, 1500));
          const frame = await page.screenshot({ type: 'png', animations: 'disabled' });
          if (bytes + frame.byteLength > maxBytes) break;
          bytes += frame.byteLength;
          frames.push(frame);
        }
        if (frames.length === 0 || (frames.length < 2 && stops > 1)) {
          throw AppError.tooLarge(
            `The frames of this page exceed the ${maxBytes}-byte limit; retry with a smaller width and height`,
          );
        }
        try {
          return assembleApng(frames, request.delayMs);
        } catch (error) {
          throw AppError.browser('The frames could not be assembled', error);
        }
      },
    );
  }
}

/** Reads `num_frames` from the `acTL` chunk, which directly follows `IHDR`. */
function frameCount(apng: Buffer): number {
  return apng.length >= 45 && apng.toString('latin1', 37, 41) === 'acTL' ? apng.readUInt32BE(41) : 1;
}
