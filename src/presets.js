import { load, save } from './storage.js';
import { gridWidth, gridHeight } from './layout.js';
import { downloadText } from './util.js';

// Definisi kolom form ukuran label (dipakai untuk membangun form & validasi).
export const FIELDS = [
  { key: 'nama', label: 'Nama', type: 'text', group: 'Identitas' },
  { key: 'lebar', label: 'Lebar label', unit: 'mm', group: 'Label' },
  { key: 'tinggi', label: 'Tinggi label', unit: 'mm', group: 'Label' },
  { key: 'kolom', label: 'Jumlah kolom', int: true, group: 'Label' },
  { key: 'baris', label: 'Jumlah baris', int: true, group: 'Label' },
  { key: 'bulat', label: 'Label bulat', type: 'check', group: 'Label' },
  { key: 'kertasLebar', label: 'Lebar kertas', unit: 'mm', group: 'Kertas' },
  { key: 'kertasTinggi', label: 'Tinggi kertas', unit: 'mm', group: 'Kertas' },
  { key: 'marginAtas', label: 'Margin atas', unit: 'mm', group: 'Posisi' },
  { key: 'marginKiri', label: 'Margin kiri', unit: 'mm', group: 'Posisi' },
  { key: 'jarakH', label: 'Jarak horizontal', unit: 'mm', group: 'Posisi' },
  { key: 'jarakV', label: 'Jarak vertikal', unit: 'mm', group: 'Posisi' },
];

const NUM_KEYS = FIELDS.filter((f) => !f.type).map((f) => f.key);
const INT_KEYS = FIELDS.filter((f) => f.int).map((f) => f.key);

const round1 = (n) => Math.round(n * 10) / 10;

/** Atur margin kiri & atas supaya susunan label berada di tengah kertas. */
export function centerMargins(p) {
  return {
    ...p,
    marginKiri: round1((p.kertasLebar - gridWidth(p)) / 2),
    marginAtas: round1((p.kertasTinggi - gridHeight(p)) / 2),
  };
}

// Nomor label (101, 103, 121, …) di Indonesia berlaku lintas merek: Tom & Jerry, Koala,
// Fox, ABC, Flexy, VOS, Diamond, dll. memakai ukuran & susunan yang sama di lembar ±165 × 210 mm.
// Margin & jarak di bawah hanya PERKIRAAN awal (susunan di tengah kertas) — ukur lalu ubah di form.

const fmtMm = (n) => String(n).replace('.', ',');

function sheetPreset({ id, prefix, no, lebar, tinggi, kolom, baris, jarakH, jarakV, since, perkiraan, bulat }) {
  const n = kolom * baris;
  const size = bulat ? `Ø${fmtMm(lebar)} mm bulat` : `${fmtMm(lebar)}×${fmtMm(tinggi)} mm`;
  return centerMargins({
    id,
    nama: `${prefix} No. ${no} — ${size} (${n} label${perkiraan ? ', perkiraan' : ''})`,
    lebar, tinggi, kolom, baris,
    kertasLebar: 165, kertasTinggi: 210,
    marginAtas: 0, marginKiri: 0,
    jarakH, jarakV,
    bulat: !!bulat,
    since,
  });
}

/** Susunan tetap (jumlah kolom × baris diketahui). */
function tj(no, lebar, tinggi, kolom, baris, jarakH = 3, jarakV = 2, { since = 1, perkiraan = false } = {}) {
  return sheetPreset({ id: `tj-${no}`, prefix: 'T&J', no, lebar, tinggi, kolom, baris, jarakH, jarakV, since, perkiraan });
}

/**
 * Susunan dihitung otomatis: label sebanyak mungkin dengan jarak 2 mm (horizontal),
 * 1 mm (vertikal), dan sisa tepi minimal 2 mm. Rumus ini cocok dengan jumlah per lembar
 * yang tercantum untuk No. 104–113, 118, 120, 122, 123, 125, dan 129.
 */
function fitGrid(lebar, tinggi, jarakH, jarakV) {
  return {
    kolom: Math.max(1, Math.floor((165 - 4 + jarakH) / (lebar + jarakH))),
    baris: Math.max(1, Math.floor((210 - 4 + jarakV) / (tinggi + jarakV))),
  };
}

function tjFit(no, lebar, tinggi, { jarakH = 2, jarakV = 1, perkiraan = false, since = 2, bulat = false, id = `tj-${no}`, prefix = 'T&J' } = {}) {
  const { kolom, baris } = fitGrid(lebar, tinggi, jarakH, jarakV);
  return sheetPreset({ id, prefix, no, lebar, tinggi, kolom, baris, jarakH, jarakV, since, perkiraan, bulat });
}

/** Varian merek yang ukurannya sedikit berbeda dari nomor standar. */
const brand = (key, name, no, lebar, tinggi, opts = {}) =>
  tjFit(no, lebar, tinggi, { since: 3, id: `${key}-${no}`, prefix: name, ...opts });

/** Label A4 generik (ukuran umum seperti Avery/Koala A4), susunan di tengah kertas. */
function a4(id, lebar, tinggi, kolom, baris, jarakH, jarakV, since = 2) {
  return centerMargins({
    id: `a4-${id}`,
    nama: `A4 — ${fmtMm(lebar)}×${fmtMm(tinggi)} mm (${kolom * baris} label, ${kolom}×${baris})`,
    lebar, tinggi, kolom, baris,
    kertasLebar: 210, kertasTinggi: 297,
    marginAtas: 0, marginKiri: 0,
    jarakH, jarakV,
    bulat: false,
    since,
  });
}

const round = (no, d, opts = {}) => tjFit(no, d, d, { since: 3, bulat: true, perkiraan: true, ...opts });

export const DEFAULT_PRESETS = [
  tjFit(100, 38, 95, { since: 3, perkiraan: true }),
  tj(101, 50, 100, 3, 2),
  tj(102, 50, 50, 3, 4),
  tj(103, 64, 32, 2, 6),
  tj(104, 75, 24, 2, 8),
  tjFit(105, 24, 37, { since: 1 }), // 30 (6 × 5)
  tjFit(106, 25, 25), // 42 (6 × 7)
  tjFit(107, 50, 18), // 30 (3 × 10)
  tjFit(108, 38, 18), // 40 (4 × 10)
  tjFit(109, 13, 38, { jarakH: 1.5 }), // 55 (11 × 5)
  tjFit(110, 16, 22), // 81 (9 × 9)
  tjFit(111, 12, 18), // 110 (11 × 10)
  tjFit(112, 8, 20), // 144 (16 × 9)
  tjFit(113, 9, 12), // 210 (14 × 15)
  round(114, 13),
  round(115, 17),
  round(116, 19),
  round(117, 22),
  round(118, 32, { perkiraan: false }), // 24 (4 × 6)
  tjFit(120, 78, 118, { jarakH: 3 }), // 2
  tj(121, 75, 38, 2, 5),
  tjFit(122, 17, 85, { since: 1 }), // 16 (8 × 2)
  tjFit(123, 11, 30), // 72 (12 × 6)
  tjFit(124, 57, 40, { since: 1, perkiraan: true }),
  tjFit(125, 16, 31), // 54 (9 × 6)
  tj(126, 50, 10, 3, 16, 2, 2, { since: 2 }), // 48
  tj(127, 70, 35, 2, 5),
  tjFit(128, 51, 11, { perkiraan: true }),
  tjFit(129, 17, 58), // 24 (8 × 3)

  // Varian merek
  brand('koala', 'Koala', 121, 76, 38),
  brand('fox', 'Fox', 100, 38, 100, { perkiraan: true }),
  brand('abc', 'ABC', 100, 38, 95, { perkiraan: true }),
  brand('abc', 'ABC', 101, 50, 95),
  brand('abc', 'ABC', 102, 47, 47),
  brand('abc', 'ABC', 103, 63, 33),
  brand('abc', 'ABC', 121, 75, 37),

  {
    id: 'a4-21',
    nama: 'A4 generik — 63,5×38,1 mm (21 label)',
    lebar: 63.5, tinggi: 38.1, kolom: 3, baris: 7,
    kertasLebar: 210, kertasTinggi: 297,
    marginAtas: 15.1, marginKiri: 7.2,
    jarakH: 2.5, jarakV: 0,
    bulat: false,
    since: 1,
  },
  a4('1', 199.6, 289.1, 1, 1, 0, 0),
  a4('8', 99.1, 67.7, 2, 4, 2.5, 0),
  a4('10', 99.1, 57, 2, 5, 2.5, 0),
  a4('14', 99.1, 38.1, 2, 7, 2.5, 0),
  a4('24', 63.5, 33.9, 3, 8, 2.5, 0),
  a4('40', 48.5, 25.4, 4, 10, 0, 0),
  a4('65', 38.1, 21.2, 5, 13, 2.5, 0),
];

// Naikkan bila preset bawaan bertambah/berubah. Preset dengan `since` > versi tersimpan
// otomatis ditambahkan ke daftar pengguna lama.
const PRESETS_VERSION = 3;

// Nilai bawaan versi sebelumnya. Bila preset tersimpan masih persis sama dengan salah satunya
// (belum pernah diedit), preset itu diperbarui ke nilai bawaan terbaru.
const legacyTj = (no, lebar, tinggi, kolom, baris) => ({ id: `tj-${no}`, lebar, tinggi, kolom, baris, jarakH: 3, jarakV: 2 });
const legacyFit = (no, lebar, tinggi, jarakH = 2, jarakV = 1) => ({ id: `tj-${no}`, lebar, tinggi, ...fitGrid(lebar, tinggi, jarakH, jarakV), jarakH, jarakV });
const LEGACY = [
  legacyTj(105, 37, 24, 4, 8),
  legacyTj(122, 85, 17, 1, 10),
  legacyTj(124, 57, 40, 2, 4),
  legacyFit(111, 18, 12),
  legacyFit(113, 12, 9),
  legacyFit(120, 78, 118, 3, 1),
  legacyFit(123, 30, 11),
  legacyFit(125, 31, 16),
  legacyFit(126, 50, 10, 2, 0.5),
  legacyFit(129, 58, 17),
  legacyFit(106, 25, 25),
].map((l) => centerMargins({ ...l, kertasLebar: 165, kertasTinggi: 210 }));

const LAYOUT_KEYS = ['lebar', 'tinggi', 'kolom', 'baris', 'kertasLebar', 'kertasTinggi', 'marginAtas', 'marginKiri', 'jarakH', 'jarakV'];
const sameLayout = (a, b) => LAYOUT_KEYS.every((k) => Math.abs(a[k] - b[k]) < 0.01);

const BUILTIN_IDS = new Set(DEFAULT_PRESETS.map((p) => p.id));

export function isBuiltin(p) {
  return BUILTIN_IDS.has(p.id);
}

export function newId() {
  return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function blankPreset() {
  return centerMargins({
    id: newId(),
    nama: 'Ukuran baru',
    lebar: 50, tinggi: 30, kolom: 2, baris: 5,
    kertasLebar: 165, kertasTinggi: 210,
    marginAtas: 0, marginKiri: 0,
    jarakH: 3, jarakV: 2,
  });
}

/** Validasi & rapikan satu preset (mis. dari file import). Melempar Error bila tidak valid. */
export function normalizePreset(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Data ukuran tidak valid.');
  const p = { id: String(raw.id || newId()), nama: String(raw.nama || 'Tanpa nama') };
  for (const key of NUM_KEYS) {
    const v = Number(raw[key]);
    if (!Number.isFinite(v)) throw new Error(`Nilai "${key}" pada ukuran "${p.nama}" tidak valid.`);
    p[key] = INT_KEYS.includes(key) ? Math.max(1, Math.round(v)) : v;
  }
  p.bulat = !!raw.bulat;
  return p;
}

export function loadPresets() {
  const list = load('presets', null);
  if (!Array.isArray(list) || !list.length) return structuredClone(DEFAULT_PRESETS).map(normalizePreset);
  const valid = [];
  for (const raw of list) {
    try {
      valid.push(normalizePreset(raw));
    } catch {
      // abaikan entri rusak
    }
  }
  if (!valid.length) return structuredClone(DEFAULT_PRESETS).map(normalizePreset);
  return addNewBuiltins(valid);
}

/** Tambahkan preset bawaan yang baru dirilis ke daftar tersimpan, lalu urutkan preset bawaan. */
function addNewBuiltins(list) {
  const version = Number(load('presetsVersion', 1)) || 1;
  if (version >= PRESETS_VERSION) return list;
  const have = new Set(list.map((p) => p.id));
  const added = DEFAULT_PRESETS.filter((p) => (p.since ?? 1) > version && !have.has(p.id)).map(normalizePreset);

  // preset bawaan yang belum pernah diedit → perbarui ke nilai bawaan terbaru
  let updated = 0;
  const refreshed = list.map((p) => {
    const def = DEFAULT_PRESETS.find((d) => d.id === p.id);
    if (!def || !LEGACY.some((l) => l.id === p.id && sameLayout(l, p))) return p;
    updated++;
    return normalizePreset(def);
  });

  save('presetsVersion', PRESETS_VERSION);
  if (!added.length && !updated) return list;
  const merged = sortPresets([...refreshed, ...added]);
  save('presets', merged);
  return merged;
}

const ORDER = new Map(DEFAULT_PRESETS.map((p, i) => [p.id, i]));

/** Preset bawaan sesuai urutan nomor, ukuran custom tetap di belakang (urutan aslinya). */
export function sortPresets(list) {
  return list
    .map((p, i) => [p, ORDER.get(p.id) ?? DEFAULT_PRESETS.length + i])
    .sort((a, b) => a[1] - b[1])
    .map(([p]) => p);
}

export function savePresets(list) {
  save('presets', list);
}

/** Kembalikan nilai preset bawaan; ukuran custom tetap dipertahankan. */
export function resetBuiltins(list) {
  const custom = list.filter((p) => !isBuiltin(p));
  return [...structuredClone(DEFAULT_PRESETS).map(normalizePreset), ...custom];
}

export function exportPresetsFile(list) {
  const data = { app: 'cetak-label', versi: 1, ukuran: list };
  downloadText('ukuran-label.json', JSON.stringify(data, null, 2), 'application/json');
}

export function parsePresetsFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File bukan JSON yang valid.');
  }
  const arr = Array.isArray(data) ? data : data?.ukuran;
  if (!Array.isArray(arr)) throw new Error('Format file tidak dikenali (tidak ada daftar "ukuran").');
  return arr.map(normalizePreset);
}

/** Gabungkan hasil import: id yang sama ditimpa, sisanya ditambahkan. */
export function mergePresets(list, incoming) {
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  return [...byId.values()];
}
