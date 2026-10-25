import { contentBox } from './renderer.js';

// Tata letak per ukuran label. Isi template (teks, font, warna, kolom QR, …) sama untuk
// semua ukuran, tetapi tata letaknya (orientasi isi, padding, ukuran font, posisi baris,
// posisi/ukuran barcode/QR, foto, gambar & teks bebas) disimpan per ukuran label di
// tpl.layouts[presetId]. tpl.layoutFor = ukuran label yang tata letaknya sedang dipakai.
//
// Ukuran label yang belum punya tata letak: disesuaikan otomatis dari ukuran sebelumnya
// (orientasi mengikuti sisi panjang label, posisi & ukuran diskalakan).

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r1 = (n) => Math.round(n * 10) / 10;
const half = (n) => Math.round(n * 2) / 2;

/** Ambil tata letak template saat ini. */
export function takeLayout(tpl) {
  const c = tpl.code;
  return {
    orientation: tpl.orientation,
    padding: tpl.padding,
    lines: tpl.lines.map((l) => ({ size: l.size, dx: l.dx, dy: l.dy })),
    code: { position: c.position, size: c.size, free: c.free, x: c.x, y: c.y, w: c.w, h: c.h },
    photo: { position: tpl.photo.position, size: tpl.photo.size },
    decals: Object.fromEntries(tpl.decals.map((d) => [d.id, { x: d.x, y: d.y, width: d.width }])),
    texts: Object.fromEntries(tpl.texts.map((t) => [t.id, { x: t.x, y: t.y, size: t.size }])),
  };
}

/** Pasang tata letak tersimpan (nilai yang rusak/hilang diabaikan). */
function applyLayout(tpl, s) {
  if ([0, 90, 270].includes(s.orientation)) tpl.orientation = s.orientation;
  if (num(s.padding, -1) >= 0) tpl.padding = num(s.padding);
  (Array.isArray(s.lines) ? s.lines : []).forEach((x, i) => {
    const l = tpl.lines[i];
    if (!l || !x) return;
    if (num(x.size) > 0) l.size = num(x.size);
    l.dx = num(x.dx);
    l.dy = num(x.dy);
  });
  if (s.code) {
    const c = tpl.code;
    if (['bottom', 'top', 'left', 'right'].includes(s.code.position)) c.position = s.code.position;
    if (num(s.code.size) > 0) c.size = num(s.code.size);
    c.free = !!s.code.free;
    c.x = num(s.code.x);
    c.y = num(s.code.y);
    if (num(s.code.w) > 0) c.w = num(s.code.w);
    if (num(s.code.h) > 0) c.h = num(s.code.h);
  }
  if (s.photo) {
    if (['left', 'right', 'top', 'bottom'].includes(s.photo.position)) tpl.photo.position = s.photo.position;
    if (num(s.photo.size) > 0) tpl.photo.size = num(s.photo.size);
  }
  for (const d of tpl.decals) {
    const x = s.decals?.[d.id];
    if (!x) continue;
    d.x = num(x.x);
    d.y = num(x.y);
    if (num(x.width) > 0) d.width = num(x.width);
  }
  for (const t of tpl.texts) {
    const x = s.texts?.[t.id];
    if (!x) continue;
    t.x = num(x.x);
    t.y = num(x.y);
    if (num(x.size) > 0) t.size = num(x.size);
  }
}

/**
 * Orientasi isi untuk label baru: bentuk area isi (mendatar/tegak) dibuat sama dengan
 * sebelumnya, jadi tulisan tetap mengikuti sisi panjang label.
 */
function pickOrientation(oldBox, oldOrientation, p) {
  const ratio = Math.max(p.lebar, p.tinggi) / Math.min(p.lebar, p.tinggi);
  if (p.bulat || ratio < 1.15) return 0; // hampir persegi / bulat: tidak perlu diputar
  const wasWide = oldBox.w >= oldBox.h;
  const wideUnrotated = p.lebar >= p.tinggi;
  if (wasWide === wideUnrotated) return 0;
  return oldOrientation === 270 ? 270 : 90;
}

/** Sesuaikan tata letak dari ukuran `from` ke ukuran `to` (mengubah tpl). */
function adaptLayout(tpl, from, to) {
  const oldBox = contentBox(tpl, from);
  tpl.orientation = pickOrientation(oldBox, tpl.orientation, to);
  const rough = contentBox(tpl, to);
  // label lebih kecil: padding ikut mengecil (label lebih besar: padding tetap)
  if (tpl.padding > 0) tpl.padding = Math.max(0.5, half(tpl.padding * Math.min(1, rough.w / oldBox.w, rough.h / oldBox.h)));
  const box = contentBox(tpl, to);
  const sx = box.w / oldBox.w;
  const sy = box.h / oldBox.h;
  const s = Math.min(sx, sy);

  for (const l of tpl.lines) {
    // ukuran font = ukuran maksimum (auto-fit memperkecil bila perlu), jadi hanya ikut membesar
    if (s > 1) l.size = Math.min(72, half(l.size * s));
    l.dx = r1(l.dx * sx);
    l.dy = r1(l.dy * sy);
  }
  const c = tpl.code;
  const along = (pos) => (pos === 'top' || pos === 'bottom' ? sy : sx); // tebal area searah sumbunya
  c.size = Math.max(3, r1(c.size * (c.type === 'qr' ? s : along(c.position))));
  c.x = r1(c.x * sx);
  c.y = r1(c.y * sy);
  if (c.type === 'qr') c.w = c.h = Math.max(4, r1(c.w * s));
  else {
    c.w = Math.max(6, r1(c.w * sx));
    c.h = Math.max(3, r1(c.h * sy));
  }
  tpl.photo.size = Math.max(3, r1(tpl.photo.size * along(tpl.photo.position)));
  for (const d of tpl.decals) {
    d.x = r1(d.x * sx);
    d.y = r1(d.y * sy);
    d.width = Math.max(1, r1(d.width * s));
  }
  for (const t of tpl.texts) {
    t.x = r1(t.x * sx);
    t.y = r1(t.y * sy);
    t.size = Math.min(96, Math.max(5, half(t.size * s))); // teks bebas tidak di-auto-fit: ikut diskalakan
  }
}

/**
 * Pastikan template memakai tata letak untuk ukuran label `preset`.
 * Hasil: null (tidak berubah), 'restored' (tata letak tersimpan dipakai lagi), atau
 * 'adapted' (disesuaikan otomatis dari ukuran sebelumnya).
 */
export function syncLayout(tpl, preset, presets) {
  if (tpl.layoutFor === preset.id) return null;
  const from = presets.find((p) => p.id === tpl.layoutFor);
  tpl.layoutFor = preset.id;
  if (!from) return null; // template lama tanpa catatan ukuran: tata letaknya dianggap milik ukuran ini
  tpl.layouts[from.id] = takeLayout(tpl);
  const saved = tpl.layouts[preset.id];
  if (saved) {
    applyLayout(tpl, saved);
    return 'restored';
  }
  adaptLayout(tpl, from, preset);
  return 'adapted';
}
