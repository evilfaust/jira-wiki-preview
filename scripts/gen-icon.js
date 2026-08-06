// Рисует иконку расширения (media/icons/icon.png, 128×128) без внешних зависимостей.
// Дизайн повторяет media/icons/extension-icon.svg: слева исходник разметки,
// справа отрисованный результат.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 128;
/** Кратность суперсэмплинга — даёт сглаживание при уменьшении. */
const SS = 4;
const W = SIZE * SS;

const canvas = new Float64Array(W * W * 4); // RGBA, значения 0..255

function blend(x, y, [r, g, b], alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= W || y >= W) return;
  const i = (y * W + x) * 4;
  const dstA = canvas[i + 3] / 255;
  const outA = alpha + dstA * (1 - alpha);
  if (outA === 0) return;
  for (let c = 0; c < 3; c++) {
    canvas[i + c] = ([r, g, b][c] * alpha + canvas[i + c] * dstA * (1 - alpha)) / outA;
  }
  canvas[i + 3] = outA * 255;
}

function hex(value) {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Точка внутри прямоугольника со скруглением? Координаты в пространстве 128. */
function insideRoundRect(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function roundRect(x, y, w, h, r, color, alpha = 1, gradient = null) {
  const rgb = color ? hex(color) : null;
  const x0 = Math.max(0, Math.floor(x * SS));
  const y0 = Math.max(0, Math.floor(y * SS));
  const x1 = Math.min(W, Math.ceil((x + w) * SS));
  const y1 = Math.min(W, Math.ceil((y + h) * SS));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const u = (px + 0.5) / SS;
      const v = (py + 0.5) / SS;
      if (!insideRoundRect(u, v, x, y, w, h, r)) continue;
      blend(px, py, gradient ? gradient(u, v) : rgb, alpha);
    }
  }
}

function circle(cx, cy, radius, color, alpha = 1) {
  const rgb = hex(color);
  const x0 = Math.max(0, Math.floor((cx - radius) * SS));
  const y0 = Math.max(0, Math.floor((cy - radius) * SS));
  const x1 = Math.min(W, Math.ceil((cx + radius) * SS));
  const y1 = Math.min(W, Math.ceil((cy + radius) * SS));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const u = (px + 0.5) / SS;
      const v = (py + 0.5) / SS;
      if ((u - cx) ** 2 + (v - cy) ** 2 > radius * radius) continue;
      blend(px, py, rgb, alpha);
    }
  }
}

// --- Сам рисунок --------------------------------------------------------
const from = hex('#2684FF');
const to = hex('#0052CC');
roundRect(0, 0, 128, 128, 26, null, 1, (u, v) => {
  const t = Math.min(1, Math.max(0, (u / 128 + v / 128) / 2));
  return [0, 1, 2].map((c) => from[c] + (to[c] - from[c]) * t);
});

// Левая панель: исходник
roundRect(20, 26, 40, 76, 5, '#0747A6', 0.45);
const source = [
  [27, 36, 10, 1],
  [40, 36, 14, 0.6],
  [27, 49, 6, 1],
  [36, 49, 18, 0.6],
  [27, 62, 6, 1],
  [36, 62, 14, 0.6],
  [27, 75, 27, 0.6],
  [27, 88, 20, 0.6],
];
for (const [x, y, w, alpha] of source) roundRect(x, y, w, 5, 2.5, '#DEEBFF', alpha);

// Правая панель: результат
roundRect(68, 26, 40, 76, 5, '#FFFFFF');
roundRect(75, 36, 26, 7, 3.5, '#0052CC');
roundRect(75, 50, 26, 4, 2, '#5E6C84');
roundRect(75, 59, 20, 4, 2, '#5E6C84');
circle(77, 73, 2.5, '#0052CC', 0.55);
circle(77, 83, 2.5, '#0052CC', 0.55);
roundRect(84, 71, 17, 4, 2, '#5E6C84');
roundRect(84, 81, 13, 4, 2, '#5E6C84');
roundRect(75, 91, 26, 4, 2, '#36B37E');

// --- Уменьшение и кодирование PNG ---------------------------------------
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0, 0];
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * W + (x * SS + dx)) * 4;
        const a = canvas[i + 3] / 255;
        acc[0] += canvas[i] * a;
        acc[1] += canvas[i + 1] * a;
        acc[2] += canvas[i + 2] * a;
        acc[3] += a;
      }
    }
    const total = SS * SS;
    const alpha = acc[3] / total;
    const o = (y * SIZE + x) * 4;
    // Возврат из premultiplied alpha
    pixels[o] = alpha > 0 ? Math.round(acc[0] / acc[3]) : 0;
    pixels[o + 1] = alpha > 0 ? Math.round(acc[1] / acc[3]) : 0;
    pixels[o + 2] = alpha > 0 ? Math.round(acc[2] / acc[3]) : 0;
    pixels[o + 3] = Math.round(alpha * 255);
  }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // бит на канал
ihdr[9] = 6; // RGBA
// 10..12 — сжатие, фильтрация, чересстрочность: по нулям

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // фильтр строки: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'media', 'icons', 'icon.png');
fs.writeFileSync(out, png);
console.log('written', out, png.length, 'bytes');
