/**
 * Dimensions of an image read from the first bytes of the file (pure, no I/O,
 * no pixel decoding): PNG, JPEG, GIF, WebP and ICO.
 */
export interface ImageHeader {
  readonly format: 'png' | 'jpeg' | 'gif' | 'webp' | 'ico';
  readonly width: number;
  readonly height: number;
}

/** @returns `null` when the format is not recognised or the header is incomplete. */
export function readImageHeader(bytes: Buffer): ImageHeader | null {
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString('latin1', 12, 16) === 'IHDR') {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 10 && bytes.toString('latin1', 0, 4) === 'GIF8') {
    return { format: 'gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (bytes.length >= 30 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('latin1', 12, 16);
    if (chunk === 'VP8X') {
      return { format: 'webp', width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') {
      return { format: 'webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  // ICO: a directory of images; the largest entry is the icon's best size (0 stands for 256).
  if (bytes.length >= 22 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1) {
    const count = bytes.readUInt16LE(4);
    if (count === 0 || count > 64) return null;
    let width = 0;
    let height = 0;
    for (let i = 0; i < count && 6 + (i + 1) * 16 <= bytes.length; i += 1) {
      const w = bytes[6 + i * 16] || 256;
      const h = bytes[7 + i * 16] || 256;
      if (w * h > width * height) [width, height] = [w, h];
    }
    return width === 0 ? null : { format: 'ico', width, height };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // Walk the segments up to the first start-of-frame marker.
    let offset = 2;
    while (offset + 9 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { format: 'jpeg', height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  return null;
}
