// Auto-fit ukuran font. Lebar teks diukur dengan canvas (bukan DOM), jadi bisa
// dihitung untuk label yang belum/tidak tampil di layar (mis. saat cetak).

import { cssFamily } from './fonts.js';

export const PT_TO_MM = 25.4 / 72;
export const LINE_HEIGHT = 1.15;
export const MIN_PT = 6;

// Sisakan sedikit ruang agar pembulatan browser/printer tidak memotong huruf terakhir.
const SAFETY = 0.97;

let ctx;
const cache = new Map();

/** Lebar teks dalam satuan em (lebar ÷ ukuran font). */
function emWidth(text, bold, italic, font) {
  if (!text) return 0;
  const key = `${font}|${bold ? 1 : 0}${italic ? 1 : 0}${text}`;
  let w = cache.get(key);
  if (w == null) {
    ctx ??= document.createElement('canvas').getContext('2d');
    ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}100px ${cssFamily(font)}`;
    w = ctx.measureText(text).width / 100;
    if (cache.size > 20000) cache.clear();
    cache.set(key, w);
  }
  return w;
}

/** Lebar satu baris (mm) per 1 pt ukuran font. */
function widthPerPt(segments) {
  return segments.reduce((sum, s) => sum + emWidth(s.text, s.bold, s.italic, s.font), 0) * PT_TO_MM;
}

/** Perkiraan jumlah baris bila teks di-wrap pada lebar availW (mm). */
function wrappedRows(segments, sizePt, availW) {
  const em = sizePt * PT_TO_MM;
  let rows = 1;
  let x = 0;
  for (const seg of segments) {
    for (const word of seg.text.split(/(\s+)/)) {
      if (!word) continue;
      const w = emWidth(word, seg.bold, seg.italic, seg.font) * em;
      if (/^\s+$/.test(word)) {
        x += w;
        continue;
      }
      if (x > 0 && x + w > availW) {
        rows++;
        x = 0;
      }
      if (w > availW) {
        rows += Math.floor(w / availW); // kata sangat panjang dipecah
        x = w % availW;
      } else {
        x += w;
      }
    }
  }
  return rows;
}

const floorQ = (n) => Math.floor(n * 4) / 4; // bulatkan ke bawah per 0,25 pt

/** Hitung wrap & tinggi untuk ukuran font yang sudah ditentukan. */
export function measureLines(lines, sizes, availW) {
  return lines.map((l, i) => {
    const size = sizes[i];
    const wrap = widthPerPt(l.segments) * size > availW * SAFETY;
    const rows = wrap ? wrappedRows(l.segments, size, availW * SAFETY) : 1;
    return { size, wrap, rows };
  });
}

const totalHeight = (fitted) =>
  fitted.reduce((h, f) => h + f.rows * f.size * PT_TO_MM * LINE_HEIGHT, 0);

/**
 * Auto-fit: lines = [{ size, segments: [{ text, bold, italic, font }] }].
 * 1. Baris yang lebih lebar dari area diperkecil sampai muat (min 6 pt).
 * 2. Baru jika di 6 pt masih tidak muat, baris itu di-wrap.
 * 3. Jika total tinggi melebihi area, semua baris diperkecil bersama (min 6 pt).
 * Hasil: [{ size, wrap, rows }]
 */
export function fitLines(lines, availW, availH) {
  let sizes = lines.map((l) => {
    const perPt = widthPerPt(l.segments);
    const maxSize = perPt > 0 ? (availW * SAFETY) / perPt : Infinity;
    return l.size > maxSize ? Math.max(MIN_PT, floorQ(maxSize)) : l.size;
  });
  let fitted = measureLines(lines, sizes, availW);

  for (let i = 0; i < 6; i++) {
    const h = totalHeight(fitted);
    if (h <= availH * SAFETY) break;
    const factor = (availH * SAFETY) / h;
    const next = sizes.map((s) => Math.max(MIN_PT, floorQ(s * factor)));
    if (next.every((s, j) => s === sizes[j])) break; // sudah minimal semua
    sizes = next;
    fitted = measureLines(lines, sizes, availW);
  }
  return fitted;
}
