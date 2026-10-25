// Daftar font. Aplikasi berjalan offline, jadi yang dipakai adalah font yang
// terpasang di komputer (umumnya ada di Windows; sebagian ikut terpasang dengan MS Office).

import { t } from './i18n.js';
export const DEFAULT_FONT = 'Arial';

export const FONT_GROUPS = [
  {
    label: 'Sans-serif (bersih, mudah dibaca)',
    fonts: ['Arial', 'Calibri', 'Segoe UI', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Century Gothic', 'Candara', 'Franklin Gothic Medium'],
  },
  {
    label: 'Ramping (cocok untuk nama panjang)',
    fonts: ['Arial Narrow', 'Bahnschrift Condensed', 'Segoe UI Semibold', 'Leelawadee UI'],
  },
  {
    label: 'Serif (resmi)',
    fonts: ['Times New Roman', 'Cambria', 'Georgia', 'Garamond', 'Book Antiqua', 'Bookman Old Style', 'Palatino Linotype'],
  },
  {
    label: 'Tebal / judul',
    fonts: ['Arial Black', 'Impact', 'Bahnschrift', 'Segoe UI Black'],
  },
  {
    label: 'Dekoratif',
    fonts: ['Comic Sans MS', 'Segoe Print', 'Segoe Script', 'Monotype Corsiva', 'Lucida Handwriting'],
  },
  {
    label: 'Monospace (kode / nomor)',
    fonts: ['Consolas', 'Courier New', 'Lucida Console'],
  },
];

/** Bersihkan nama font dari karakter yang bisa merusak CSS. */
export function cleanFontName(name) {
  return String(name ?? '').replace(/["'`;{}<>\\]/g, '').trim().slice(0, 60);
}

/** Nilai CSS font-family dengan cadangan bila font tidak terpasang. */
export function cssFamily(name) {
  const n = cleanFontName(name) || DEFAULT_FONT;
  return `"${n}", Arial, Helvetica, sans-serif`;
}

let ctx;
const available = new Map();

/** Deteksi font terpasang: bandingkan lebar teks dengan font cadangan. */
export function isFontAvailable(name) {
  const n = cleanFontName(name);
  if (!n) return false;
  if (available.has(n)) return available.get(n);
  ctx ??= document.createElement('canvas').getContext('2d');
  const sample = 'mmmmmmmmmmlli1WQ@#Ag';
  const ok = ['monospace', 'serif', 'sans-serif'].some((base) => {
    ctx.font = `72px ${base}`;
    const w0 = ctx.measureText(sample).width;
    ctx.font = `72px "${n}", ${base}`;
    return ctx.measureText(sample).width !== w0;
  });
  available.set(n, ok);
  return ok;
}

const KNOWN = new Set(FONT_GROUPS.flatMap((g) => g.fonts));

/**
 * Isi <select> font. `current` yang tidak ada di daftar (font custom) ditambahkan.
 * inheritLabel: bila diisi, ada opsi pertama bernilai "" (ikut font global).
 */
export function fontOptionsHtml(current, inheritLabel) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const opt = (f) => {
    const ok = isFontAvailable(f);
    return `<option value="${esc(f)}" style="font-family:${esc(cssFamily(f))}"${f === current ? ' selected' : ''}>${esc(f)}${ok ? '' : ' (tidak terpasang)'}</option>`;
  };
  let html = inheritLabel ? `<option value=""${current ? '' : ' selected'}>${esc(inheritLabel)}</option>` : '';
  if (current && !KNOWN.has(current)) html += `<optgroup label="Custom">${opt(current)}</optgroup>`;
  for (const g of FONT_GROUPS) html += `<optgroup label="${esc(g.label)}">${g.fonts.map(opt).join('')}</optgroup>`;
  html += '<option value="__custom">Font lain (ketik nama)…</option>';
  return html;
}

/** Tanya nama font custom. Mengembalikan nama bersih atau null. */
export function askCustomFont() {
  const name = cleanFontName(prompt(t('Nama font yang terpasang di komputer (mis. "Poppins", "Montserrat"):')) ?? '');
  if (!name) return null;
  if (!isFontAvailable(name)) {
    alert(t(`Font "${name}" tidak terdeteksi di komputer ini. Label akan memakai Arial sampai font tersebut dipasang.`));
  }
  return name;
}
