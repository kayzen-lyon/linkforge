/**
 * Minimal PNG tooling on top of `node:zlib`: an encoder for two-colour
 * images (QR codes), a decoder for the 8-bit PNGs Chromium produces
 * (palette extraction) and an APNG assembler (animated captures).
 *
 * No pixel library: PNG is a zlib stream between a few length-prefixed
 * chunks, which is all these three jobs need.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}

function header(width: number, height: number, bitDepth: number, colorType: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = bitDepth;
  data[9] = colorType;
  return data;
}

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * Encodes a two-colour image as a 1-bit indexed PNG.
 *
 * @param bit - Tells whether the pixel at (x, y) takes the foreground colour.
 */
export function encodeBilevelPng(
  width: number,
  height: number,
  bit: (x: number, y: number) => boolean,
  foreground: Rgba,
  background: Rgba,
): Buffer {
  const stride = Math.ceil(width / 8) + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride + 1; // Each scanline starts with its filter type (0: none).
    for (let x = 0; x < width; x += 1) {
      if (bit(x, y)) raw[row + (x >>> 3)] = (raw[row + (x >>> 3)] ?? 0) | (0x80 >>> (x & 7));
    }
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header(width, height, 1, 3)),
    chunk('PLTE', Buffer.from([background.r, background.g, background.b, foreground.r, foreground.g, foreground.b])),
    chunk('tRNS', Buffer.from([background.a, foreground.a])),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface PngChunk {
  readonly type: string;
  readonly data: Buffer;
}

/** Walks the chunks of a PNG. @throws {Error} When the file is not a well-formed PNG. */
function readChunks(png: Buffer): PngChunk[] {
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const chunks: PngChunk[] = [];
  for (let offset = 8; offset + 12 <= png.length; ) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error('truncated PNG');
    chunks.push({ type: png.toString('latin1', offset + 4, offset + 8), data: png.subarray(offset + 8, offset + 8 + length) });
    offset = end;
  }
  return chunks;
}

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** Bytes per pixel in `pixels`: 3 (RGB) or 4 (RGBA). */
  readonly channels: 3 | 4;
  readonly pixels: Buffer;
}

/**
 * Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what Chromium's
 * screenshots are).
 *
 * @param maxPixels - Refuses larger images before inflating anything.
 * @throws {Error} On any other kind of PNG, or one over the pixel budget.
 */
export function decodePng(png: Buffer, maxPixels: number): DecodedPng {
  const chunks = readChunks(png);
  const ihdr = chunks.find((entry) => entry.type === 'IHDR')?.data;
  if (ihdr === undefined || ihdr.length < 13) throw new Error('missing IHDR');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const colorType = ihdr[9];
  if (ihdr[8] !== 8 || (colorType !== 2 && colorType !== 6) || ihdr[12] !== 0) throw new Error('unsupported PNG variant');
  if (width === 0 || height === 0 || width * height > maxPixels) throw new Error('image over the pixel budget');
  const channels = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(chunks.filter((entry) => entry.type === 'IDAT').map((entry) => entry.data)), {
    maxOutputLength: (stride + 1) * height,
  });
  if (raw.length !== (stride + 1) * height) throw new Error('unexpected PNG data size');

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const input = y * (stride + 1) + 1;
    const output = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? (pixels[output + x - channels] ?? 0) : 0;
      const up = y > 0 ? (pixels[output + x - stride] ?? 0) : 0;
      const upLeft = y > 0 && x >= channels ? (pixels[output + x - stride - channels] ?? 0) : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >>> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dl = Math.abs(estimate - left);
        const du = Math.abs(estimate - up);
        const dul = Math.abs(estimate - upLeft);
        predicted = dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      }
      pixels[output + x] = ((raw[input + x] ?? 0) + predicted) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/**
 * Assembles same-sized PNG frames into an animated PNG, without decoding a
 * pixel: each frame's compressed data is re-wrapped as an animation frame.
 * A viewer without APNG support shows the first frame.
 *
 * @param delayMs - Display time of each frame.
 * @throws {Error} When the frames do not share one header (size, colour type).
 */
export function assembleApng(frames: readonly Buffer[], delayMs: number, loops = 0): Buffer {
  const first = frames[0];
  if (first === undefined) throw new Error('no frame');
  const parsed = frames.map(readChunks);
  const ihdr = parsed[0]?.find((entry) => entry.type === 'IHDR')?.data;
  if (ihdr === undefined) throw new Error('missing IHDR');
  for (const chunks of parsed) {
    if (chunks.find((entry) => entry.type === 'IHDR')?.data.equals(ihdr) !== true) {
      throw new Error('frames differ in size or colour type');
    }
  }
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(frames.length, 0);
  animation.writeUInt32BE(loops, 4);

  const out: Buffer[] = [SIGNATURE, chunk('IHDR', ihdr), chunk('acTL', animation)];
  // Ancillary chunks that must precede the image data (colour profile, palette).
  for (const entry of parsed[0] ?? []) {
    if (['sRGB', 'gAMA', 'cHRM', 'iCCP', 'PLTE', 'tRNS', 'pHYs'].includes(entry.type)) out.push(chunk(entry.type, entry.data));
  }
  let sequence = 0;
  parsed.forEach((chunks, index) => {
    const control = Buffer.alloc(26);
    control.writeUInt32BE(sequence++, 0);
    control.writeUInt32BE(ihdr.readUInt32BE(0), 4);
    control.writeUInt32BE(ihdr.readUInt32BE(4), 8);
    control.writeUInt16BE(Math.round(delayMs), 20);
    control.writeUInt16BE(1000, 22);
    out.push(chunk('fcTL', control));
    for (const entry of chunks) {
      if (entry.type !== 'IDAT') continue;
      if (index === 0) {
        out.push(chunk('IDAT', entry.data));
      } else {
        const numbered = Buffer.alloc(4 + entry.data.length);
        numbered.writeUInt32BE(sequence++, 0);
        entry.data.copy(numbered, 4);
        out.push(chunk('fdAT', numbered));
      }
    }
  });
  out.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(out);
}
