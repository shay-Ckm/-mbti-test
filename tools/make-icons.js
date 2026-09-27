/* ============================================================
   零依赖图标/OG 图生成器（Node 内置 zlib，手写 PNG）
   ------------------------------------------------------------
   生成：
   - assets/og-image.png          1200×630 社交分享卡（渐变 + 六边形 + MBTI 字样）
   - assets/icon-512.png          512×512 PWA 图标
   - assets/icon-192.png          192×192 PWA 图标
   - assets/apple-touch-icon.png  180×180 iOS 主屏图标
   用法：node tools/make-icons.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 1; // filter: Sub（水平差分，显著提升渐变图的压缩率）
    for (let i = 0; i < stride; i++) {
      const cur = rgb[y * stride + i];
      const left = i >= 3 ? rgb[y * stride + i - 3] : 0;
      raw[rowStart + 1 + i] = (cur - left) & 0xFF;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: truecolor
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 绘图工具 ---------- */
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function blend(buf, w, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= w) return;
  const o = (y * w + x) * 3;
  if (o + 2 >= buf.length) return;
  buf[o] = Math.round(buf[o] * (1 - a) + r * a);
  buf[o + 1] = Math.round(buf[o + 1] * (1 - a) + g * a);
  buf[o + 2] = Math.round(buf[o + 2] * (1 - a) + b * a);
}

/* 点到正六边形边框的有符号距离（用于画环） */
function hexDistance(px, py, cx, cy, r) {
  let min = Infinity;
  for (let i = 0; i < 6; i++) {
    const a1 = (Math.PI / 3) * i - Math.PI / 2;
    const a2 = (Math.PI / 3) * (i + 1) - Math.PI / 2;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const qx = x1 + t * dx, qy = y1 + t * dy;
    min = Math.min(min, Math.hypot(px - qx, py - qy));
  }
  return min;
}

/* 5×7 点阵字体（用于渲染 MBTI 四个字母） */
const FONT = {
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111']
};

function drawGlyph(buf, W, ch, x0, y0, scale, r, g, b, alpha) {
  const glyph = FONT[ch];
  if (!glyph) return;
  for (let row = 0; row < glyph.length; row++) {
    for (let col = 0; col < glyph[row].length; col++) {
      if (glyph[row][col] !== '1') continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          blend(buf, W, x0 + col * scale + dx, y0 + row * scale + dy, r, g, b, alpha);
        }
      }
    }
  }
}

/* ---------- 画面生成 ---------- */
function makeCanvas(w, h) {
  const buf = Buffer.alloc(w * h * 3);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 对角渐变：#6C63FF → #8B83FF → #00D2D3
      const t = Math.min(1, (x / w) * 0.55 + (y / h) * 0.65);
      let r, g, b;
      if (t < 0.55) {
        const k = t / 0.55;
        r = lerp(0x6C, 0x8B, k); g = lerp(0x63, 0x83, k); b = lerp(0xFF, 0xFF, k);
      } else {
        const k = (t - 0.55) / 0.45;
        r = lerp(0x8B, 0x00, k); g = lerp(0x83, 0xD2, k); b = lerp(0xFF, 0xD3, k);
      }
      // 中心柔光
      const d = Math.hypot(x - cx, y - cy) / Math.max(w, h);
      const glow = Math.max(0, 0.22 - d * 0.35);
      const o = (y * w + x) * 3;
      buf[o] = Math.min(255, Math.round(r + 255 * glow));
      buf[o + 1] = Math.min(255, Math.round(g + 255 * glow));
      buf[o + 2] = Math.min(255, Math.round(b + 255 * glow));
    }
  }
  return buf;
}

function drawHexRing(buf, w, h, radiusRatio, thicknessRatio, alpha) {
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * radiusRatio;
  const th = Math.min(w, h) * thicknessRatio;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs(hexDistance(x + 0.5, y + 0.5, cx, cy, R) - th / 2);
      if (d < th / 2) {
        const a = alpha * (1 - d / (th / 2)) ** 0.6;
        blend(buf, w, x, y, 255, 255, 255, a);
      }
    }
  }
}

function writeIcon(file, size) {
  const buf = makeCanvas(size, size);
  drawHexRing(buf, size, size, 0.40, 0.055, 0.95);
  drawHexRing(buf, size, size, 0.26, 0.02, 0.45);
  fs.writeFileSync(file, encodePNG(size, size, buf));
  return size;
}

function writeOgImage(file) {
  const w = 1200, h = 630;
  const buf = makeCanvas(w, h);
  drawHexRing(buf, w, h, 0.235, 0.016, 0.95);
  drawHexRing(buf, w, h, 0.155, 0.006, 0.4);

  // MBTI 字样（居中偏下）
  const scale = 26, gap = 18;
  const glyphW = 5 * scale, glyphH = 7 * scale;
  const totalW = 4 * glyphW + 3 * gap;
  let x0 = Math.round((w - totalW) / 2);
  const y0 = Math.round(h * 0.645);
  for (const ch of ['M', 'B', 'T', 'I']) {
    drawGlyph(buf, w, ch, x0, y0, scale, 255, 255, 255, 0.98);
    x0 += glyphW + gap;
  }
  fs.writeFileSync(file, encodePNG(w, h, buf));
  return { w, h, glyphH };
}

/* ---------- 执行 ---------- */
const outDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const og = writeOgImage(path.join(outDir, 'og-image.png'));
console.log('✓ assets/og-image.png        ' + og.w + '×' + og.h);
console.log('✓ assets/icon-512.png        ' + writeIcon(path.join(outDir, 'icon-512.png'), 512) + '×512');
console.log('✓ assets/icon-192.png        ' + writeIcon(path.join(outDir, 'icon-192.png'), 192) + '×192');
console.log('✓ assets/apple-touch-icon.png ' + writeIcon(path.join(outDir, 'apple-touch-icon.png'), 180) + '×180');
