import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

// Barcode (Code128) & QR code sebagai data modul, supaya bisa digambar sebagai
// vektor yang tajam baik di layar/cetak (SVG) maupun di PDF (kotak-kotak jsPDF).

export const CODE_TYPES = ['none', 'code128', 'qr'];
export const CODE_POSITIONS = ['bottom', 'top', 'left', 'right'];

const cache = new Map();

/**
 * Hasil:
 *  - { type: 'code128', bars: '1101001...' }   (1 = garis hitam)
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
    if (type === 'code128') {
      const obj = {};
      JsBarcode(obj, text, { format: 'CODE128' });
      result = { type, bars: obj.encodings.map((e) => e.data).join('') };
    } else {
      const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
      result = { type, size: modules.size, get: (r, c) => !!modules.get(r, c) };
    }
  } catch {
    result = { error: type === 'code128' ? 'Isi tidak bisa dijadikan barcode' : 'Isi terlalu panjang untuk QR' };
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, result);
  return result;
}

/** Kotak-kotak hitam (koordinat relatif 0..1) untuk digambar di SVG atau PDF. */
export function codeRects(enc) {
  const rects = [];
  if (enc.type === 'code128') {
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
