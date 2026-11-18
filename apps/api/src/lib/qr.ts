/**
 * QR Code encoder (ISO/IEC 18004, model 2), byte mode, versions 1–40.
 *
 * Written for this project from the standard: no dependency for what is
 * a page of arithmetic. Input is UTF-8 text (a URL); output is the
 * matrix of dark modules. The two tables below are the standard's own
 * constants (error-correction codewords per block, number of blocks).
 */

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
  readonly version: number;
  readonly ecc: QrEcc;
  /** Modules per side (21 for version 1, 177 for version 40). */
  readonly size: number;
  /** `size * size` cells, row by row: 1 is a dark module. */
  readonly modules: Uint8Array;
}

/** Thrown when the text does not fit the largest symbol at the requested level. */
export class QrCapacityError extends Error {
  override readonly name = 'QrCapacityError';
}

const ECC_INDEX: Readonly<Record<QrEcc, number>> = { L: 0, M: 1, Q: 2, H: 3 };
/** Two-bit level indicator placed in the format information. */
const ECC_FORMAT_BITS: Readonly<Record<QrEcc, number>> = { L: 1, M: 0, Q: 3, H: 2 };

// Indexed [level][version]; index 0 is unused.
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** Modules available for data and error correction, function patterns excluded. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2;
    result -= (25 * alignments - 10) * alignments - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data codewords (8-bit) a symbol holds at a given level. */
export function dataCodewords(version: number, ecc: QrEcc): number {
  const level = ECC_INDEX[ecc];
  return (
    Math.floor(rawDataModules(version) / 8) -
    (ECC_CODEWORDS_PER_BLOCK[level]?.[version] ?? 0) * (ERROR_CORRECTION_BLOCKS[level]?.[version] ?? 0)
  );
}

/** Centres of the alignment patterns along one axis. */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const size = version * 4 + 17;
  const positions = [6];
  for (let position = size - 7; positions.length < count; position -= step) positions.splice(1, 0, position);
  return positions;
}

// --- Reed-Solomon over GF(2^8), reducing polynomial x^8 + x^4 + x^3 + x^2 + 1 ---

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Coefficients of the generator polynomial of the given degree, highest power dropped. */
function rsDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j] ?? 0, root);
      if (j + 1 < degree) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ (result[0] ?? 0);
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i += 1) result[i] = (result[i] ?? 0) ^ gfMultiply(divisor[i] ?? 0, factor);
  }
  return result;
}

/** Splits the data into blocks, appends error correction, and interleaves the blocks. */
function addErrorCorrection(data: Uint8Array, version: number, ecc: QrEcc): Uint8Array {
  const level = ECC_INDEX[ecc];
  const blocks = ERROR_CORRECTION_BLOCKS[level]?.[version] ?? 1;
  const eccLength = ECC_CODEWORDS_PER_BLOCK[level]?.[version] ?? 0;
  const total = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (total % blocks);
  const shortLength = Math.floor(total / blocks);
  const divisor = rsDivisor(eccLength);

  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  for (let i = 0, offset = 0; i < blocks; i += 1) {
    const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
    const block = data.subarray(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    eccBlocks.push(rsRemainder(block, divisor));
  }

  const result = new Uint8Array(total);
  let index = 0;
  for (let i = 0; i <= shortLength - eccLength; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) result[index++] = block[i] ?? 0;
    }
  }
  for (let i = 0; i < eccLength; i += 1) {
    for (const block of eccBlocks) result[index++] = block[i] ?? 0;
  }
  return result;
}

/** A symbol under construction: the modules and which of them are function patterns. */
class Matrix {
  readonly modules: Uint8Array;
  readonly reserved: Uint8Array;

  constructor(readonly size: number) {
    this.modules = new Uint8Array(size * size);
    this.reserved = new Uint8Array(size * size);
  }

  get(x: number, y: number): number {
    return this.modules[y * this.size + x] ?? 0;
  }

  setFunction(x: number, y: number, dark: boolean): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.modules[y * this.size + x] = dark ? 1 : 0;
    this.reserved[y * this.size + x] = 1;
  }
}

function drawFunctionPatterns(matrix: Matrix, version: number): void {
  const { size } = matrix;
  for (let i = 0; i < size; i += 1) {
    matrix.setFunction(6, i, i % 2 === 0);
    matrix.setFunction(i, 6, i % 2 === 0);
  }
  // Finder patterns with their separators, in three corners.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        matrix.setFunction(cx + dx, cy + dy, distance !== 2 && distance !== 4);
      }
    }
  }
  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  positions.forEach((cx, i) => {
    positions.forEach((cy, j) => {
      // The three corners holding a finder pattern have no alignment pattern.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          matrix.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });
  drawFormatBits(matrix, 'L', 0); // Reserves the area; real bits come with the chosen mask.
  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (version << 12) | remainder;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      matrix.setFunction(a, b, dark);
      matrix.setFunction(b, a, dark);
    }
  }
}

function drawFormatBits(matrix: Matrix, ecc: QrEcc, mask: number): void {
  const { size } = matrix;
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i += 1) matrix.setFunction(8, i, bit(i));
  matrix.setFunction(8, 7, bit(6));
  matrix.setFunction(8, 8, bit(7));
  matrix.setFunction(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) matrix.setFunction(14 - i, 8, bit(i));

  for (let i = 0; i < 8; i += 1) matrix.setFunction(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) matrix.setFunction(8, size - 15 + i, bit(i));
  matrix.setFunction(8, size - 8, true); // The module that is always dark.
}

/** Lays the codewords in the two-column zigzag, bottom-right upwards. */
function drawCodewords(matrix: Matrix, codewords: Uint8Array): void {
  const { size } = matrix;
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // The vertical timing pattern is skipped.
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (matrix.reserved[y * size + x] === 1 || bitIndex >= codewords.length * 8) continue;
        matrix.modules[y * size + x] = ((codewords[bitIndex >>> 3] ?? 0) >>> (7 - (bitIndex & 7))) & 1;
        bitIndex += 1;
      }
    }
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** XORs a mask over the data modules; applying it twice restores them. */
function applyMask(matrix: Matrix, mask: number): void {
  const invert = MASKS[mask];
  if (invert === undefined) return;
  const { size } = matrix;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (matrix.reserved[index] === 0 && invert(x, y)) matrix.modules[index] = (matrix.modules[index] ?? 0) ^ 1;
    }
  }
}

/** The standard's four penalty rules; the mask with the lowest score is kept. */
function penalty(matrix: Matrix): number {
  const { size } = matrix;
  let score = 0;
  let dark = 0;

  for (let axis = 0; axis < 2; axis += 1) {
    for (let a = 0; a < size; a += 1) {
      let run = 0;
      let colour = -1;
      let history = 0; // Last 11 modules as bits, to spot finder-like 1:1:3:1:1 sequences.
      for (let b = 0; b < size; b += 1) {
        const module = axis === 0 ? matrix.get(b, a) : matrix.get(a, b);
        if (module === colour) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          colour = module;
          run = 1;
        }
        history = ((history << 1) | module) & 0x7ff;
        if (b >= 10 && (history === 0b10111010000 || history === 0b00001011101)) score += 40;
        if (axis === 0) dark += module;
      }
    }
  }
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const colour = matrix.get(x, y);
      if (colour === matrix.get(x + 1, y) && colour === matrix.get(x, y + 1) && colour === matrix.get(x + 1, y + 1)) {
        score += 3;
      }
    }
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * Encodes `text` (as UTF-8 bytes) into the smallest symbol that holds it at
 * the requested error-correction level.
 *
 * @throws {QrCapacityError} When the text is too long for a version-40 symbol.
 */
export function encodeQr(text: string, ecc: QrEcc): QrCode {
  const bytes = Buffer.from(text, 'utf8');
  let version = 1;
  for (; ; version += 1) {
    if (version > 40) throw new QrCapacityError('The text is too long for a QR code at this error-correction level');
    const headerBits = 4 + (version < 10 ? 8 : 16);
    if (headerBits + bytes.length * 8 <= dataCodewords(version, ecc) * 8) break;
  }

  const capacity = dataCodewords(version, ecc);
  const data = new Uint8Array(capacity);
  let bitLength = 0;
  const append = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i -= 1, bitLength += 1) {
      data[bitLength >>> 3] = (data[bitLength >>> 3] ?? 0) | (((value >>> i) & 1) << (7 - (bitLength & 7)));
    }
  };
  append(0b0100, 4); // Byte mode.
  append(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) append(byte, 8);
  append(0, Math.min(4, capacity * 8 - bitLength)); // Terminator.
  bitLength = Math.ceil(bitLength / 8) * 8;
  for (let pad = 0xec; bitLength < capacity * 8; pad ^= 0xec ^ 0x11) append(pad, 8);

  const size = version * 4 + 17;
  const matrix = new Matrix(size);
  drawFunctionPatterns(matrix, version);
  drawCodewords(matrix, addErrorCorrection(data, version, ecc));

  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(matrix, mask);
    drawFormatBits(matrix, ecc, mask);
    const score = penalty(matrix);
    if (score < bestScore) {
      best = mask;
      bestScore = score;
    }
    applyMask(matrix, mask);
  }
  applyMask(matrix, best);
  drawFormatBits(matrix, ecc, best);
  return { version, ecc, size, modules: matrix.modules };
}

/**
 * The symbol as an SVG document: one path of horizontal runs, a `viewBox` in
 * modules and crisp edges, so it scales to any size without blur.
 *
 * @param colors - Already validated colours (never interpolate raw client text here).
 */
export function qrToSvg(
  qr: QrCode,
  options: { readonly size: number; readonly margin: number; readonly color: string; readonly background: string | null },
): string {
  const { size, modules } = qr;
  const span = size + options.margin * 2;
  let path = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y * size + x] !== 1) continue;
      let run = 1;
      while (x + run < size && modules[y * size + x + run] === 1) run += 1;
      path += `M${x + options.margin} ${y + options.margin}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.size}" height="${options.size}" ` +
    `viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    (options.background === null ? '' : `<rect width="${span}" height="${span}" fill="${options.background}"/>`) +
    `<path fill="${options.color}" d="${path}"/></svg>`
  );
}
