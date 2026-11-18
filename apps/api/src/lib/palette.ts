/**
 * Colour palette of an image by recursive splitting of the colour space (pure).
 *
 * The box of colours with the widest spread is cut in two at the middle of its
 * widest channel, until there are as many boxes as colours wanted; each box
 * is then averaged. Cutting at the middle of the *range* (rather than at the
 * median pixel, as classic median cut does) keeps a small but distinct colour
 * — a red badge on a blue cover — from being averaged into its neighbour.
 *
 * Works on a small sample of pixels: a palette does not need more, and it
 * keeps the cost flat whatever the image size.
 */
import { toHex } from './colors.js';

export interface PaletteColor {
  readonly hex: string;
  readonly rgb: readonly [number, number, number];
  /** Share of the sampled pixels this colour stands for (0–1). */
  readonly population: number;
}

/** Pixels sampled at most, spread evenly over the image. */
const MAX_SAMPLES = 20_000;

/**
 * @param pixels - Raw pixels, `channels` bytes each (RGB or RGBA).
 * @param count - Number of colours wanted (the result may hold fewer for a flat image).
 */
export function extractPalette(pixels: Buffer, channels: 3 | 4, count: number): PaletteColor[] {
  const total = Math.floor(pixels.length / channels);
  const step = Math.max(1, Math.floor(total / MAX_SAMPLES));
  const samples: Array<[number, number, number]> = [];
  for (let i = 0; i < total; i += step) {
    const offset = i * channels;
    // Mostly transparent pixels say nothing about what the image looks like.
    if (channels === 4 && (pixels[offset + 3] ?? 255) < 128) continue;
    samples.push([pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0]);
  }
  if (samples.length === 0) return [];

  let boxes: Array<Array<[number, number, number]>> = [samples];
  while (boxes.length < count) {
    let widest = -1;
    let widestRange = 0;
    let widestChannel: 0 | 1 | 2 = 0;
    let cut = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (const channel of [0, 1, 2] as const) {
        let min = 255;
        let max = 0;
        for (const pixel of box) {
          if (pixel[channel] < min) min = pixel[channel];
          if (pixel[channel] > max) max = pixel[channel];
        }
        // Weighting by size keeps large flat areas from being ignored in favour of small noisy ones.
        const range = (max - min) * Math.sqrt(box.length);
        if (range > widestRange) [widest, widestRange, widestChannel, cut] = [index, range, channel, (min + max) / 2];
      }
    });
    const box = boxes[widest];
    if (box === undefined || widestRange === 0) break;
    const low = box.filter((pixel) => pixel[widestChannel] <= cut);
    const high = box.filter((pixel) => pixel[widestChannel] > cut);
    boxes = [...boxes.slice(0, widest), low, high, ...boxes.slice(widest + 1)];
  }

  return boxes
    .map((box) => {
      const sum = box.reduce<[number, number, number]>((acc, pixel) => [acc[0] + pixel[0], acc[1] + pixel[1], acc[2] + pixel[2]], [0, 0, 0]);
      const rgb = [Math.round(sum[0] / box.length), Math.round(sum[1] / box.length), Math.round(sum[2] / box.length)] as const;
      return { hex: toHex(...rgb), rgb, population: Math.round((box.length / samples.length) * 1000) / 1000 };
    })
    .sort((a, b) => b.population - a.population)
    // Two boxes of a flat image average to the same colour: merge them.
    .reduce<PaletteColor[]>((merged, color) => {
      const same = merged.findIndex((other) => other.hex === color.hex);
      if (same === -1) return [...merged, color];
      const existing = merged[same] as PaletteColor;
      merged[same] = { ...existing, population: Math.round((existing.population + color.population) * 1000) / 1000 };
      return merged;
    }, []);
}
