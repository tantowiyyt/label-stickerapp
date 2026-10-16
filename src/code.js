import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

// Barcode (Code 128/39, EAN, UPC, ITF) & QR code sebagai data modul, supaya bisa digambar
// sebagai vektor yang tajam di layar/cetak (SVG), di PDF (kotak-kotak jsPDF), dan di file PNG/SVG.

/** Format barcode 1D yang didukung (nama JsBarcode + petunjuk isi). */
export const BARCODE_FORMATS = {
  code128: { label: 'Code 128', js: 'CODE128', hint: 'semua huruf, angka & simbol (paling umum)' },
  code39: { label: 'Code 39', js: 'CODE39', hint: 'HURUF BESAR, angka, spasi dan - . $ / + %' },
  ean13: { label: 'EAN-13', js: 'EAN13', hint: '12 digit angka (digit ke-13 = checksum otomatis)' },
  ean8: { label: 'EAN-8', js: 'EAN8', hint: '7 digit angka (digit ke-8 = checksum otomatis)' },
  upc: { label: 'UPC-A', js: 'UPC', hint: '11 digit angka (digit ke-12 = checksum otomatis)' },
  itf: { label: 'ITF (2 of 5)', js: 'ITF', hint: 'angka saja, jumlah digit genap' },
};
export const isBarcode = (type) => Object.hasOwn(BARCODE_FORMATS, type);
export const CODE_TYPES = ['none', ...Object.keys(BARCODE_FORMATS), 'qr'];
export const CODE_POSITIONS = ['bottom', 'top', 'left', 'right'];

const cache = new Map();

/**
 * Hasil:
 *  - { type: 'code128' | 'ean13' | …, bars: '1101001...' }   (1 = garis hitam)
 *  - { type: 'qr', size: n, get(r, c) }
 *  - { error: 'pesan' } bila isi tidak bisa dijadikan kode
 *  - null bila isi kosong
 */
export function encode(type, value) {
  const text = String(value ?? '').trim();
  if (!text || type === 'none') return null;
  const key = `${type}|${text}`;
  if (cache.has(key)) return cache.get(key);
  let result;
  try {
    if (isBarcode(type)) {
      const obj = {};
      JsBarcode(obj, text, { format: BARCODE_FORMATS[type].js });
      result = { type, bars: obj.encodings.map((e) => e.data).join('') };
    } else {
      const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
      result = { type, size: modules.size, get: (r, c) => !!modules.get(r, c) };
    }
  } catch {
    result = { error: isBarcode(type) ? `Isi tidak valid untuk ${BARCODE_FORMATS[type].label}` : 'Isi terlalu panjang untuk QR' };
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, result);
  return result;
}

/** Kotak-kotak hitam (koordinat relatif 0..1) untuk digambar di SVG atau PDF. */
export function codeRects(enc) {
  const rects = [];
  if (enc.type !== 'qr') {
    const n = enc.bars.length;
    let i = 0;
    while (i < n) {
      if (enc.bars[i] === '1') {
        let j = i;
        while (j < n && enc.bars[j] === '1') j++;
        rects.push({ x: i / n, y: 0, w: (j - i) / n, h: 1 });
        i = j;
      } else i++;
    }
  } else {
    const n = enc.size;
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (enc.get(r, c)) {
          let d = c;
          while (d < n && enc.get(r, d)) d++;
          rects.push({ x: c / n, y: r / n, w: (d - c) / n, h: 1 / n });
          c = d;
        } else c++;
      }
    }
  }
  return rects;
}

/** SVG string dari kode, mengisi penuh kotak (viewBox 0..1000). */
export function codeSvg(enc) {
  const S = 1000;
  const path = codeRects(enc)
    .map((r) => `M${(r.x * S).toFixed(2)} ${(r.y * S).toFixed(2)}h${(r.w * S).toFixed(2)}v${(r.h * S).toFixed(2)}h${(-r.w * S).toFixed(2)}z`)
    .join('');
  return `<svg viewBox="0 0 ${S} ${S}" preserveAspectRatio="none" width="100%" height="100%" shape-rendering="crispEdges"><path d="${path}" fill="#000"/></svg>`;
}

/* ---------- File gambar (generator) ---------- */

const QUIET_QR = 4; // modul kosong di tepi QR
const QUIET_BAR = 10; // modul kosong di kiri-kanan barcode

/** Ukuran gambar dalam piksel. module = lebar 1 modul (px). */
function fileLayout(enc, module, caption) {
  if (enc.type === 'qr') {
    const side = (enc.size + QUIET_QR * 2) * module;
    return { w: side, h: side, ox: QUIET_QR * module, oy: QUIET_QR * module, cw: enc.size * module, ch: enc.size * module, text: 0 };
  }
  const n = enc.bars.length;
  const barH = module * 40;
  const text = caption ? module * 8 : 0;
  return { w: (n + QUIET_BAR * 2) * module, h: barH + text + module * 6, ox: QUIET_BAR * module, oy: module * 3, cw: n * module, ch: barH, text };
}

/** Gambar PNG (Blob) dari kode. */
export function codePngBlob(enc, value, { module = 6, caption = true } = {}) {
  const L = fileLayout(enc, module, caption && enc.type !== 'qr');
  const c = document.createElement('canvas');
  c.width = L.w;
  c.height = L.h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, L.w, L.h);
  g.fillStyle = '#000';
  for (const r of codeRects(enc)) g.fillRect(L.ox + r.x * L.cw, L.oy + r.y * L.ch, r.w * L.cw, r.h * L.ch);
  if (L.text) {
    g.font = `${Math.round(L.text * 0.85)}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(value, L.w / 2, L.oy + L.ch + module);
  }
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

/** File SVG (teks) dari kode, vektor sehingga tajam di ukuran berapa pun. */
export function codeSvgFile(enc, value, { module = 6, caption = true } = {}) {
  const L = fileLayout(enc, module, caption && enc.type !== 'qr');
  const path = codeRects(enc)
    .map((r) => `M${(L.ox + r.x * L.cw).toFixed(2)} ${(L.oy + r.y * L.ch).toFixed(2)}h${(r.w * L.cw).toFixed(2)}v${(r.h * L.ch).toFixed(2)}h${(-r.w * L.cw).toFixed(2)}z`)
    .join('');
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const text = L.text
    ? `<text x="${L.w / 2}" y="${L.oy + L.ch + module + L.text * 0.8}" font-family="Arial, sans-serif" font-size="${Math.round(L.text * 0.85)}" text-anchor="middle">${esc(value)}</text>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${L.w}" height="${L.h}" viewBox="0 0 ${L.w} ${L.h}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/>${text}</svg>`;
}
