// Generates the PWA icons into public/icons/ so no binaries live in the repo.
// Pure zlib PNG writing, no image library needed.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [11, 15, 20];
const AMBER = [245, 158, 11];
const TEAL = [45, 212, 191];

function render(size, maskable) {
  const W = size;
  const H = size;
  const px = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = BG[0];
    px[i * 3 + 1] = BG[1];
    px[i * 3 + 2] = BG[2];
  }

  const cx = W / 2;
  const cy = H / 2;
  // A maskable icon must keep its art inside the safe circle.
  const R = (size * (maskable ? 0.62 : 0.78)) / 2;

  const blend = (i, c, a) => {
    if (a <= 0) return;
    const k = Math.min(1, a);
    for (let ch = 0; ch < 3; ch++) {
      px[i * 3 + ch] = Math.round(px[i * 3 + ch] * (1 - k) + c[ch] * k);
    }
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);

      const ring = 1 - Math.min(1, Math.abs(d - R) / Math.max(1, size * 0.035));
      if (ring > 0) blend(i, TEAL, ring * 1.6);

      const tw = R * 0.95;
      const tx = dx + R * 0.16;
      if (tx >= -tw * 0.62 && tx <= tw * 0.52) {
        const t = (tx + tw * 0.62) / (tw * 1.14);
        const half = tw * 0.62 * (1 - t);
        const edge = half - Math.abs(dy);
        blend(i, AMBER, Math.max(0, Math.min(1, edge / Math.max(1, size * 0.012))));
      }
    }
  }

  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // no filter
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }

  const chunk = (tag, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  writeFileSync(join(OUT, name), render(size, maskable));
  console.log(`wrote ${name}`);
}
