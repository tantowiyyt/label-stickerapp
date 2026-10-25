import { load, save } from './storage.js';
import { downloadText } from './util.js';
import { DEFAULT_FONT, cleanFontName } from './fonts.js';
import { CODE_TYPES, CODE_POSITIONS } from './code.js';

/** Barcode/QR aktif: format dipilih dan isinya (kolom atau teks) sudah diisi. */
export const codeActive = (c) => !!c && c.type !== 'none' && (c.source === 'text' ? !!c.text.trim() : !!c.column);

// Template isi label. Teks berisi placeholder {{kolom}} dan markup inline
// **tebal** / *miring*. Setiap baris teks punya gaya sendiri di `lines[i]`.

export const ALIGNS = ['left', 'center', 'right'];
export const VALIGNS = ['top', 'middle', 'bottom'];
export const ORIENTATIONS = [0, 90, 270];

export const DEFAULT_LINE = {
  bold: false,
  italic: false,
  size: 11, // pt
  upper: false,
  color: '#000000',
  align: null, // null = ikut rata global
  font: null, // null = ikut font global
  dx: 0, // geseran baris (mm) dari posisi otomatisnya, digeser di preview
  dy: 0,
  overflow: 'shrink', // jika terlalu panjang: 'shrink' perkecil · 'wrap' turun baris · 'ellipsis' potong "…"
  maxRows: 0, // untuk 'wrap': maksimal jumlah baris (0 = bebas)
};

/** Pilihan "Jika terlalu panjang" (gabungan overflow + maxRows) untuk menu. */
export const OVERFLOW_OPTIONS = [
  { value: 'shrink', label: 'Perkecil font', overflow: 'shrink', maxRows: 0, title: 'Perkecil sampai muat 1 baris (min 6 pt), baru turun baris' },
  { value: 'wrap2', label: 'Maks. 2 baris', overflow: 'wrap', maxRows: 2, title: 'Turun ke baris kedua; diperkecil bila 2 baris belum cukup' },
  { value: 'wrap3', label: 'Maks. 3 baris', overflow: 'wrap', maxRows: 3, title: 'Turun baris sampai 3 baris; diperkecil bila belum cukup' },
  { value: 'wrap', label: 'Turun baris (bebas)', overflow: 'wrap', maxRows: 0, title: 'Ukuran tetap, turun baris sebanyak yang perlu' },
  { value: 'ellipsis', label: 'Potong …', overflow: 'ellipsis', maxRows: 0, title: 'Ukuran tetap 1 baris, kelebihannya dipotong dengan …' },
];

/** Nilai menu untuk sebuah gaya baris. */
export const overflowValue = (l) =>
  l.overflow === 'wrap' ? (l.maxRows === 2 ? 'wrap2' : l.maxRows === 3 ? 'wrap3' : 'wrap') : l.overflow === 'ellipsis' ? 'ellipsis' : 'shrink';

const line = (props = {}) => ({ ...DEFAULT_LINE, ...props });

export const DEFAULT_TEMPLATE = {
  id: 'tpl-default',
  nama: 'Kartu ujian (nama, NIM, kelas, kursi)',
  text: '**{{nama}}**\nNIM: {{nim}}\nKelas: {{kelas}}\nNo. Kursi: **{{no_kursi}}**',
  lines: [line({ size: 14 }), line(), line(), line({ size: 12 })],
  font: DEFAULT_FONT,
  align: 'center',
  valign: 'middle',
  orientation: 0,
  padding: 2, // mm
  uniformFont: false,
  hideEmpty: false, // sembunyikan baris yang semua placeholdernya kosong
  // barcode/QR: isi dari kolom (source 'column') atau dari teks berisi placeholder (source 'text'); size dalam mm.
  // free = posisi bebas (digeser di preview): x/y/w/h dalam mm, tidak mengurangi ruang teks
  code: {
    type: 'none', source: 'column', column: '', text: '', position: 'bottom', size: 12, showText: true,
    free: false, x: 0, y: 0, w: 12, h: 12,
    avoid: true, // posisi bebas: teks di samping barcode/QR (bukan tertimpa)
  },
  colorRule: { column: '', target: 'none', band: 4, colors: {} }, // warna per kelompok (mis. program studi)
  photo: { column: '', position: 'left', size: 18, ratio: '3x4' }, // foto per orang, dicocokkan lewat kolom
  decals: [], // gambar bebas: { id, src, w, h, x, y, width, opacity, layer, avoid } — x/y/width dalam mm
  // bentuk & garis: { id, kind: 'rect'|'ellipse'|'line', x, y, w, h (mm), stroke, strokeW (mm), fill ('' = tanpa isi),
  // radius (mm, kotak), dash, layer: 'front'|'back' }. Garis: mendatar bila w ≥ h, selain itu tegak.
  shapes: [],
  // teks bebas di luar data (mis. "Kepada Yth."): { id, text, x, y, size, bold, italic, upper, color, font, align }
  // x/y dalam mm (koordinat isi label), size dalam pt; teks boleh berisi {{kolom}}
  texts: [],
  layoutFor: '', // id ukuran label yang tata letaknya sedang dipakai (lihat layoutAdapt.js)
  layouts: {}, // tata letak tersimpan per id ukuran label
};

/* ---------- Teks & gaya baris ---------- */

export function templateLines(tpl) {
  return tpl.text.replace(/\r/g, '').split('\n');
}

/** Samakan jumlah gaya baris dengan jumlah baris teks. */
export function syncLines(tpl) {
  const n = templateLines(tpl).length;
  while (tpl.lines.length < n) {
    const last = tpl.lines[tpl.lines.length - 1];
    tpl.lines.push(last ? { ...last, bold: false, italic: false, upper: false, align: null, font: null, dx: 0, dy: 0 } : line());
  }
  tpl.lines.length = n;
  return tpl;
}

/** Pecah satu baris template menjadi potongan { text, bold, italic } dari markup ** dan *. */
export function parseMarkup(text) {
  const parts = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false, italic: false });
    if (m[1] != null) parts.push({ text: m[1], bold: true, italic: false });
    else parts.push({ text: m[2], bold: false, italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false, italic: false });
  return parts;
}

/* ---------- Placeholder ---------- */

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Nama kolom dinormalkan: "No Kursi" ≈ "no_kursi" ≈ "NO-KURSI". */
export const normColumn = (name) => String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

export function columnMap(columns) {
  return new Map(columns.map((c) => [normColumn(c), c]));
}

/**
 * Placeholder khusus (dipakai bila tidak ada kolom dengan nama yang sama):
 *   {{no}}      nomor urut baris di data (1, 2, 3, …)
 *   {{tanggal}} tanggal hari ini, mis. 16/10/2026
 */
export const SPECIAL_PLACEHOLDERS = ['no', 'tanggal'];

/* ---------- Format nilai: {{kolom|format}} ---------- */

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTH_INDEX = new Map([
  ...MONTHS.map((m, i) => [m.toLowerCase(), i]),
  ...MONTHS.map((m, i) => [m.slice(0, 3).toLowerCase(), i]),
  ...['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map((m, i) => [m, i]),
  ['agu', 7], ['agt', 7], ['okt', 9], ['des', 11], ['peb', 1], ['nop', 10],
]);

/**
 * Baca tanggal dari berbagai bentuk: 2005-01-12, 12/01/2005, 12-1-05, 12 Januari 2005,
 * atau nomor seri tanggal Excel (mis. 38364). Hasil { d, m (0–11), y } atau null.
 */
function parseDate(text) {
  const s = text.trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return valid(+m[3], +m[2] - 1, +m[1]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    const y = +m[3] < 100 ? 2000 + +m[3] - (+m[3] > 50 ? 100 : 0) : +m[3];
    return valid(+m[1], +m[2] - 1, y);
  }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/))) {
    const mi = MONTH_INDEX.get(m[2].toLowerCase());
    return mi == null ? null : valid(+m[1], mi, +m[3]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) { // nomor seri Excel: hari sejak 30 Des 1899
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    return { d: dt.getUTCDate(), m: dt.getUTCMonth(), y: dt.getUTCFullYear() };
  }
  return null;
}

function valid(d, m, y) {
  if (m < 0 || m > 11 || d < 1 || d > 31 || y < 1000) return null;
  return { d, m, y };
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Angka dari teks: "1.250.000", "1,250,000", "1250000,5", "Rp 1.250.000" → Number, atau null. */
function parseNumber(text) {
  let s = text.trim().replace(/^rp\.?\s*/i, '').replace(/\s/g, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // gaya Indonesia: 1.250,5
  else if (lastDot > lastComma && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, ''); // 1.250.000
  else if (lastDot > lastComma && /\.\d{3}$/.test(s) && lastComma === -1) s = s.replace(/\./g, ''); // 250.000
  else s = s.replace(/,/g, ''); // gaya Inggris: 1,250.5
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format nilai. {{kolom|format}}, boleh berantai: {{nama|title|atau:-}}.
 *   upper / lower / title      HURUF BESAR / huruf kecil / Kapital Tiap Kata
 *   tanggal (date)             12 Januari 2005
 *   tgl                        12/01/2005
 *   angka (number)             1.250.000
 *   rupiah                     Rp 1.250.000
 *   atau:teks (default:teks)   teks pengganti bila nilainya kosong, mis. {{gelar|atau:-}}
 * Nilai yang tidak bisa dibaca sebagai tanggal/angka dibiarkan apa adanya.
 */
export const FILTERS = {
  upper: (t) => t.toLocaleUpperCase('id'),
  lower: (t) => t.toLocaleLowerCase('id'),
  title: (t) => t.toLocaleLowerCase('id').replace(/(^|[\s\-/(.'])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('id')),
  tanggal: (t) => {
    const d = parseDate(t);
    return d ? `${d.d} ${MONTHS[d.m]} ${d.y}` : t;
  },
  tgl: (t) => {
    const d = parseDate(t);
    return d ? `${pad2(d.d)}/${pad2(d.m + 1)}/${d.y}` : t;
  },
  angka: (t) => {
    const n = parseNumber(t);
    return n == null ? t : n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  },
  rupiah: (t) => {
    const n = parseNumber(t);
    return n == null ? t : `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
  },
  atau: (t, arg = '') => (t.trim() ? t : arg),
};
const FILTER_ALIASES = { date: 'tanggal', number: 'angka', default: 'atau' };

/** "atau:Belum ada" → { fn, arg }; nama format tidak peka huruf besar/kecil, argumennya tetap. */
function parseFilter(raw) {
  const i = raw.indexOf(':');
  const name = (i < 0 ? raw : raw.slice(0, i)).trim().toLowerCase();
  const arg = i < 0 ? undefined : raw.slice(i + 1);
  const key = FILTER_ALIASES[name] ?? name;
  return { name: key, fn: FILTERS[key], arg };
}

function splitPlaceholder(raw) {
  const [name, ...filters] = raw.split('|');
  return { name: name.trim(), filters: filters.map((f) => f.trim()).filter(Boolean).map(parseFilter) };
}

/**
 * Isi placeholder. extra = { no, tanggal } untuk placeholder khusus.
 * stats (opsional) menghitung jumlah placeholder & yang terisi (untuk "sembunyikan baris kosong").
 */
export function fillPlaceholders(text, values, colMap, extra = {}, stats = null) {
  return text.replace(PLACEHOLDER, (_, raw) => {
    const { name, filters } = splitPlaceholder(raw);
    const key = normColumn(name);
    const col = colMap.get(key);
    let value = col != null ? String(values[col] ?? '') : SPECIAL_PLACEHOLDERS.includes(key) ? String(extra[key] ?? '') : '';
    for (const f of filters) if (f.fn) value = f.fn(value, f.arg);
    if (stats) {
      stats.count++;
      if (value.trim()) stats.filled++;
    }
    return value;
  });
}

/** Kolom data yang dipakai template (tanpa placeholder khusus). */
export function usedColumns(tpl, columns) {
  const map = columnMap(columns);
  const cols = [...tpl.text.matchAll(PLACEHOLDER)].map((m) => map.get(normColumn(splitPlaceholder(m[1]).name))).filter(Boolean);
  return [...new Set(cols)];
}

/** Placeholder di template yang tidak ada kolomnya di data (atau format yang tidak dikenal). */
export function unknownPlaceholders(tpl, columns) {
  const map = columnMap(columns);
  const bad = [];
  for (const m of tpl.text.matchAll(PLACEHOLDER)) {
    const { name, filters } = splitPlaceholder(m[1]);
    const key = normColumn(name);
    if (!map.has(key) && !SPECIAL_PLACEHOLDERS.includes(key)) bad.push(m[1].trim());
    else if (filters.some((f) => !f.fn)) bad.push(m[1].trim());
  }
  return [...new Set(bad)];
}

/* ---------- Gaya cepat ---------- */

export function applyQuickStyle(tpl, kind) {
  syncLines(tpl);
  const others = tpl.lines.slice(1).map((l) => l.size);
  const base = others.length ? Math.min(...others) : DEFAULT_LINE.size;
  tpl.lines.forEach((l, i) => {
    if (kind === 'judul') {
      l.bold = i === 0;
      l.size = i === 0 ? base + 3 : base;
    } else if (kind === 'tebal') {
      l.bold = true;
    } else if (kind === 'normal') {
      l.bold = false;
      l.italic = false;
    }
  });
}

/* ---------- Validasi & penyimpanan ---------- */

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

function normalizeLine(raw = {}) {
  const size = Number(raw.size);
  const mm = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : 0);
  return {
    bold: !!raw.bold,
    italic: !!raw.italic,
    size: Number.isFinite(size) && size > 0 ? size : DEFAULT_LINE.size,
    upper: !!raw.upper,
    color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#000000',
    align: pick(raw.align, ALIGNS, null),
    font: cleanFontName(raw.font) || null,
    dx: mm(raw.dx),
    dy: mm(raw.dy),
    overflow: pick(raw.overflow, ['shrink', 'wrap', 'ellipsis'], 'shrink'),
    maxRows: [2, 3].includes(Number(raw.maxRows)) ? Number(raw.maxRows) : 0,
  };
}

/* ---------- Warna per kelompok (mis. program studi) ---------- */

export const COLOR_TARGETS = ['none', 'text', 'background', 'band'];

// Warna yang jelas berbeda satu sama lain dan tetap bagus saat dicetak.
export const PALETTE = [
  '#1d4ed8', '#dc2626', '#15803d', '#ea580c', '#7c3aed', '#0891b2',
  '#be185d', '#a16207', '#4d7c0f', '#0f766e', '#9333ea', '#b91c1c',
  '#1e3a8a', '#c2410c', '#475569', '#db2777',
];

/** Kunci kelompok: tidak peka spasi & huruf besar/kecil ("Teknik Informatika " = "teknik informatika"). */
export const groupKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Isi warna otomatis untuk nilai yang belum punya warna (urut sesuai kemunculan di data). */
export function fillGroupColors(rule, values) {
  const used = new Set(Object.values(rule.colors));
  let i = 0;
  for (const v of values) {
    const key = groupKey(v);
    if (!key || rule.colors[key]) continue;
    while (i < PALETTE.length && used.has(PALETTE[i])) i++;
    const color = PALETTE[i % PALETTE.length] ?? PALETTE[Object.keys(rule.colors).length % PALETTE.length];
    rule.colors[key] = color;
    used.add(color);
    i++;
  }
}

function normalizeColorRule(raw = {}) {
  const band = Number(raw.band);
  const colors = {};
  for (const [k, v] of Object.entries(raw.colors ?? {})) {
    if (/^#[0-9a-f]{6}$/i.test(v)) colors[groupKey(k)] = v;
  }
  return {
    column: String(raw.column ?? ''),
    target: pick(raw.target, COLOR_TARGETS, 'none'),
    band: Number.isFinite(band) && band > 0 ? band : 4,
    colors,
  };
}

export const IMAGE_POSITIONS = ['left', 'right', 'top', 'bottom'];

/**
 * Fitur lama "Logo / gambar" (area sendiri di sisi label) sudah diganti gambar bebas.
 * Logo lama dibaca di sini lalu diubah menjadi gambar bebas oleh migrateLegacyLogo().
 */
function readLegacyImage(raw) {
  if (!raw || typeof raw.src !== 'string' || !raw.src.startsWith('data:image/')) return null;
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    src: raw.src,
    w: num(raw.w, 100),
    h: num(raw.h, 100),
    position: pick(raw.position, IMAGE_POSITIONS, 'left'),
    size: num(raw.size, 12),
  };
}

/**
 * Jadikan logo lama sebagai gambar bebas di sisi yang sama (box = contentBox ukuran label
 * yang sedang dipilih). Mengembalikan true bila ada yang diubah.
 */
export function migrateLegacyLogo(tpl, box) {
  const im = tpl.legacyImage;
  delete tpl.legacyImage;
  if (!im) return false;
  const ratio = im.w / im.h; // lebar ÷ tinggi gambar asli
  const innerW = Math.max(2, box.w - 2 * box.pad);
  const innerH = Math.max(2, box.h - 2 * box.pad);
  const side = im.position === 'left' || im.position === 'right';
  // ukuran setara dengan area logo lama (object-fit: contain)
  let width = side ? Math.min(im.size, innerH * ratio) : Math.min(innerW, Math.min(im.size, innerH) * ratio);
  width = Math.max(2, Math.min(width, innerW));
  const height = width / ratio;
  const r1 = (n) => Math.round(n * 10) / 10;
  const x = im.position === 'left' ? box.pad : im.position === 'right' ? box.w - box.pad - width : (box.w - width) / 2;
  const y = im.position === 'top' ? box.pad : im.position === 'bottom' ? box.h - box.pad - height : (box.h - height) / 2;
  tpl.decals.unshift({
    id: newDecalId(), src: im.src, w: im.w, h: im.h, x: r1(x), y: r1(y), width: r1(width), opacity: 1, layer: 'front',
    avoid: true, // seperti logo lama: teks tetap di sampingnya
  });
  return true;
}

export const PHOTO_RATIOS = { '3x4': 3 / 4, '4x6': 4 / 6, '2x3': 2 / 3, '1x1': 1 };

/* ---------- Gambar bebas (branding) ---------- */

export const newDecalId = () => 'd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function normalizeDecal(raw) {
  if (!raw || typeof raw.src !== 'string' || !raw.src.startsWith('data:image/')) return null;
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const opacity = num(raw.opacity, 1);
  return {
    id: String(raw.id || newDecalId()),
    src: raw.src,
    w: Math.max(1, num(raw.w, 100)),
    h: Math.max(1, num(raw.h, 100)),
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: Math.max(1, num(raw.width, 15)),
    opacity: Math.min(1, Math.max(0.05, opacity)),
    layer: raw.layer === 'back' ? 'back' : 'front',
    avoid: !!raw.avoid, // teks di samping gambar (seperti Wrap Text → Square), bukan tertimpa
    rot: normRot(raw.rot),
  };
}

/* ---------- Bentuk & garis ---------- */

/** Sudut putar objek (derajat, searah jarum jam) dirapikan ke rentang -180..180. */
export const normRot = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const r = ((((n + 180) % 360) + 360) % 360) - 180;
  return Math.round(r * 10) / 10;
};

export const newShapeId = () => 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const SHAPE_KINDS = ['rect', 'ellipse', 'line'];
const isColor = (c) => /^#[0-9a-f]{6}$/i.test(c);

function normalizeShape(raw) {
  if (!raw || !SHAPE_KINDS.includes(raw.kind)) return null;
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    id: String(raw.id || newShapeId()),
    kind: raw.kind,
    x: num(raw.x, 2),
    y: num(raw.y, 2),
    w: Math.max(0.2, num(raw.w, 20)),
    h: Math.max(0.2, num(raw.h, 10)),
    stroke: isColor(raw.stroke) ? raw.stroke : '#000000',
    strokeW: Math.min(5, Math.max(0, num(raw.strokeW, 0.3))),
    fill: isColor(raw.fill) ? raw.fill : '',
    radius: Math.max(0, num(raw.radius, 0)),
    dash: !!raw.dash,
    layer: raw.layer === 'front' ? 'front' : 'back',
    rot: normRot(raw.rot),
  };
}

/* ---------- Teks bebas (di luar data) ---------- */

export const newTextId = () => 't-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Teks cepat yang sering dipakai di label surat/undangan, sesuai bahasa antarmuka. */
const QUICK_TEXTS = {
  id: ['Kepada Yth.', 'Yth.', 'Bapak/Ibu', 'Sdr/i.', 'Di Tempat', 'Hormat kami,', 'Terima kasih'],
  en: ['To:', 'Dear', 'Mr./Ms.', 'Attn:', 'c/o', 'Regards,', 'Thank you'],
};
export const quickTexts = (lang) => QUICK_TEXTS[lang] ?? QUICK_TEXTS.id;

function normalizeFreeText(raw) {
  if (!raw || typeof raw.text !== 'string') return null;
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    id: String(raw.id || newTextId()),
    text: raw.text,
    x: num(raw.x, 2),
    y: num(raw.y, 2),
    size: Math.min(96, Math.max(4, num(raw.size, 9))),
    bold: !!raw.bold,
    italic: !!raw.italic,
    upper: !!raw.upper,
    color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#000000',
    font: cleanFontName(raw.font) || null,
    align: pick(raw.align, ALIGNS, 'left'),
    rot: normRot(raw.rot),
  };
}

/** Tinggi gambar (mm) mengikuti rasio aslinya. */
export const decalHeight = (d) => (d.width * d.h) / d.w;

function normalizePhoto(raw = {}) {
  const size = Number(raw.size);
  return {
    column: String(raw.column ?? ''),
    position: pick(raw.position, IMAGE_POSITIONS, 'left'),
    size: Number.isFinite(size) && size > 0 ? size : 18,
    ratio: Object.hasOwn(PHOTO_RATIOS, raw.ratio) ? raw.ratio : '3x4',
  };
}

function normalizeCode(raw = {}) {
  const size = Number(raw.size);
  const num = (v, d, min = -Infinity) => (Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : d);
  return {
    free: !!raw.free,
    avoid: raw.avoid !== false,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: num(raw.w, 12, 2),
    h: num(raw.h, 12, 2),
    type: pick(raw.type, CODE_TYPES, 'none'),
    source: raw.source === 'text' ? 'text' : 'column',
    text: String(raw.text ?? ''),
    column: String(raw.column ?? ''),
    position: pick(raw.position, CODE_POSITIONS, 'bottom'),
    size: Number.isFinite(size) && size > 0 ? size : 12,
    showText: raw.showText !== false,
  };
}

export function normalizeTemplate(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.text !== 'string') {
    throw new Error('Data template tidak valid.');
  }
  const padding = Number(raw.padding);
  const tpl = {
    id: String(raw.id || newTemplateId()),
    nama: String(raw.nama || 'Template'),
    text: raw.text,
    lines: Array.isArray(raw.lines) ? raw.lines.map(normalizeLine) : [],
    font: cleanFontName(raw.font) || DEFAULT_FONT,
    align: pick(raw.align, ALIGNS, 'center'),
    valign: pick(raw.valign, VALIGNS, 'middle'),
    orientation: pick(Number(raw.orientation), ORIENTATIONS, 0),
    padding: Number.isFinite(padding) && padding >= 0 ? padding : 2,
    uniformFont: !!raw.uniformFont,
    hideEmpty: !!raw.hideEmpty,
    code: normalizeCode(raw.code),
    colorRule: normalizeColorRule(raw.colorRule),
    legacyImage: readLegacyImage(raw.image), // dipindah ke gambar bebas saat aplikasi dibuka
    decals: Array.isArray(raw.decals) ? raw.decals.map(normalizeDecal).filter(Boolean) : [],
    photo: normalizePhoto(raw.photo),
    texts: Array.isArray(raw.texts) ? raw.texts.map(normalizeFreeText).filter(Boolean) : [],
    shapes: Array.isArray(raw.shapes) ? raw.shapes.map(normalizeShape).filter(Boolean) : [],
    layoutFor: String(raw.layoutFor ?? ''),
    layouts: raw.layouts && typeof raw.layouts === 'object' && !Array.isArray(raw.layouts) ? raw.layouts : {},
  };
  return syncLines(tpl);
}

export function newTemplateId() {
  return 'tpl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function loadTemplates() {
  const list = load('templates', null);
  const valid = [];
  for (const raw of Array.isArray(list) ? list : []) {
    try {
      valid.push(normalizeTemplate(raw));
    } catch {
      // abaikan entri rusak
    }
  }
  return valid.length ? valid : [structuredClone(DEFAULT_TEMPLATE)];
}

export function saveTemplates(list) {
  save('templates', list);
}

export function exportTemplatesFile(list) {
  const data = { app: 'cetak-label', versi: 1, template: list };
  downloadText('template-label.json', JSON.stringify(data, null, 2), 'application/json');
}

export function parseTemplatesFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File bukan JSON yang valid.');
  }
  const arr = Array.isArray(data) ? data : data?.template;
  if (!Array.isArray(arr)) throw new Error('Format file tidak dikenali (tidak ada daftar "template").');
  return arr.map(normalizeTemplate);
}
