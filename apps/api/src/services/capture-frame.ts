/**
 * Decoration of a finished capture: device frame, rounded corners, padding
 * and a background colour.
 *
 * The capture is embedded as a `data:` URI in a document built here from
 * constants, numbers and a validated colour, then rendered offline (no
 * network, no script): nothing of the captured page takes part in it but its
 * pixels.
 */
import type { Deadline } from '../lib/deadline.js';
import { AppError } from '../lib/errors.js';
import { readImageHeader } from '../lib/image-header.js';
import type { Renderer } from './renderer.js';

export type FrameKind = 'none' | 'browser' | 'phone';

export interface Decoration {
  readonly frame: FrameKind;
  /** Corner radius of the capture, in pixels. */
  readonly radius: number;
  /** Space around the capture, in pixels. */
  readonly padding: number;
  /** Validated CSS colour (`#rrggbb` or `#rrggbbaa`) behind the capture. */
  readonly background: string;
}

/** Largest capture that can be decorated: composing re-rasterises the whole image. */
export const DECORATION_MAX_PIXELS = 2560 * 2600;
const BAR_HEIGHT = 40;
const BEZEL = 14;

export function hasDecoration(decoration: Decoration): boolean {
  return decoration.frame !== 'none' || decoration.radius > 0 || decoration.padding > 0;
}

/**
 * Composes `image` with its decoration and returns the new image.
 *
 * @throws {AppError} `EINVALIDPARAMS` when the capture is too large to decorate.
 */
export async function decorateCapture(
  renderer: Renderer,
  image: Buffer,
  format: 'png' | 'jpeg',
  quality: number,
  decoration: Decoration,
  deadline: Deadline,
): Promise<Buffer> {
  const header = readImageHeader(image);
  if (header === null) throw AppError.browser('The capture could not be read back');
  if (header.width * header.height > DECORATION_MAX_PIXELS) {
    throw AppError.invalidParams('frame, radius and padding are not available for a capture this large');
  }
  const { frame, radius, padding, background } = decoration;
  const { width, height } = header;
  const bar = frame === 'browser' ? BAR_HEIGHT : 0;
  const bezel = frame === 'phone' ? BEZEL : 0;
  // The frame needs a little room to show its shadow.
  const outer = Math.max(padding, frame === 'none' ? 0 : 24);
  const totalWidth = width + bezel * 2 + outer * 2;
  const totalHeight = height + bar + bezel * 2 + outer * 2;
  const outerRadius = frame === 'phone' ? Math.max(radius, 28) + bezel : Math.max(radius, frame === 'browser' ? 10 : 0);
  const innerRadius = frame === 'phone' ? Math.max(radius, 28) : frame === 'browser' ? 0 : radius;
  const transparent = background.length === 9 && background.endsWith('00');

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:${transparent ? 'transparent' : background};}
body{width:${totalWidth}px;height:${totalHeight}px;display:flex;align-items:center;justify-content:center;}
.shell{box-sizing:border-box;overflow:hidden;border-radius:${outerRadius}px;${
    frame === 'phone'
      ? `padding:${bezel}px;background:#111418;box-shadow:0 18px 48px rgba(0,0,0,.28),inset 0 0 0 2px #2b3038;`
      : frame === 'browser'
        ? 'background:#fff;box-shadow:0 18px 48px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.08);'
        : ''
  }}
.bar{height:${BAR_HEIGHT}px;background:#e9ebee;display:flex;align-items:center;gap:8px;padding:0 14px;box-sizing:border-box;}
.dot{width:12px;height:12px;border-radius:50%;background:#c4c8ce;}
.field{flex:1;height:22px;margin-left:10px;border-radius:11px;background:#fff;}
img{display:block;width:${width}px;height:${height}px;border-radius:${innerRadius}px;}
</style></head><body><div class="shell">${
    frame === 'browser' ? '<div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><i class="field"></i></div>' : ''
  }<img alt="" src="data:image/${format};base64,${image.toString('base64')}"></div></body></html>`;

  return renderer.renderLocal(
    html,
    { viewport: { width: totalWidth, height: totalHeight }, deadline },
    (page) =>
      page.screenshot({
        type: format,
        ...(format === 'jpeg' && { quality }),
        omitBackground: transparent && format === 'png',
        clip: { x: 0, y: 0, width: totalWidth, height: totalHeight },
      }),
  );
}
