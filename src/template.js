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
};

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
  // barcode/QR: isi dari kolom (source 'column') atau dari teks berisi placeholder (source 'text'); size dalam mm
  code: { type: 'none', source: 'column', column: '', text: '', position: 'bottom', size: 12, showText: true },
  colorRule: { column: '', target: 'none', band: 4, colors: {} }, // warna per kelompok (mis. program studi)
  image: { src: '', w: 0, h: 0, position: 'left', size: 12 }, // logo; src = data URL, w/h = ukuran asli (px)
  photo: { column: '', position: 'left', size: 18, ratio: '3x4' }, // foto per orang, dicocokkan lewat kolom
  decals: [], // gambar bebas (branding): { id, src, w, h, x, y, width, opacity, layer } — x/y/width dalam mm
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
    tpl.lines.push(last ? { ...last, bold: false, italic: false, upper: false, align: null, font: null } : line());
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

/** Format: {{nama|upper}} HURUF BESAR, |lower huruf kecil, |title Kapital Tiap Kata. */
export const FILTERS = {
  upper: (t) => t.toLocaleUpperCase('id'),
  lower: (t) => t.toLocaleLowerCase('id'),
  title: (t) => t.toLocaleLowerCase('id').replace(/(^|[\s\-/(.'])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('id')),
};

function splitPlaceholder(raw) {
  const [name, ...filters] = raw.split('|').map((x) => x.trim());
  return { name, filters: filters.map((f) => f.toLowerCase()).filter(Boolean) };
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
    for (const f of filters) if (FILTERS[f]) value = FILTERS[f](value);
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
    else if (filters.some((f) => !FILTERS[f])) bad.push(m[1].trim());
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
  return {
    bold: !!raw.bold,
    italic: !!raw.italic,
    size: Number.isFinite(size) && size > 0 ? size : DEFAULT_LINE.size,
    upper: !!raw.upper,
    color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#000000',
    align: pick(raw.align, ALIGNS, null),
    font: cleanFontName(raw.font) || null,
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

function normalizeImage(raw = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const src = typeof raw.src === 'string' && raw.src.startsWith('data:image/') ? raw.src : '';
  return {
    src,
    w: num(raw.w, 0),
    h: num(raw.h, 0),
    position: pick(raw.position, IMAGE_POSITIONS, 'left'),
    size: num(raw.size, 12),
  };
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
  return {
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
    image: normalizeImage(raw.image),
    decals: Array.isArray(raw.decals) ? raw.decals.map(normalizeDecal).filter(Boolean) : [],
    photo: normalizePhoto(raw.photo),
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
