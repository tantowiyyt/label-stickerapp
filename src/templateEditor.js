import {
  ALIGNS, VALIGNS, ORIENTATIONS, DEFAULT_TEMPLATE, templateLines, syncLines, applyQuickStyle,
  unknownPlaceholders, loadTemplates, saveTemplates as storeTemplates, newTemplateId, groupKey, fillGroupColors, newDecalId, decalHeight,
  exportTemplatesFile, parseTemplatesFile, OVERFLOW_OPTIONS, overflowValue, newTextId, quickTexts, migrateLegacyLogo,
} from './template.js';
import { $, toast } from './util.js';
import { fontOptionsHtml, askCustomFont, cssFamily } from './fonts.js';
import { addPhotos, clearPhotos, photoCount, photoUrl } from './photos.js';
import { contentBox, labelGeometry } from './renderer.js';
import { syncLayout } from './layoutAdapt.js';
import { t as tr, lang } from './i18n.js'; // tr: nama t sudah dipakai untuk teks bebas
import { BARCODE_FORMATS, isBarcode } from './code.js';

/* ---------- Ikon (gaya tombol perataan seperti di Word) ---------- */

const rotatedA = (deg) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="2"/><text x="8" y="11.6" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" font-weight="700" fill="currentColor" stroke="none" transform="rotate(${deg} 8 8)">A</text></svg>`;

const svg = (body) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${body}</svg>`;

const ICONS = {
  left: svg('<path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/>'),
  center: svg('<path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/>'),
  right: svg('<path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/>'),
  top: svg('<path d="M2 2h12"/><path d="M5 5h6M5 8h6" stroke-width="2.2"/>'),
  middle: svg('<path d="M2 8h12" stroke-dasharray="1.5 1.5"/><path d="M5 5.5h6M5 10.5h6" stroke-width="2.2"/>'),
  bottom: svg('<path d="M2 14h12"/><path d="M5 8h6M5 11h6" stroke-width="2.2"/>'),
  // huruf "A" yang ikut berputar menunjukkan arah baca isi label
  o0: rotatedA(0),
  o90: rotatedA(90),
  o270: rotatedA(270),
};

const TITLES = {
  left: 'Rata kiri', center: 'Rata tengah', right: 'Rata kanan',
  top: 'Atas', middle: 'Tengah', bottom: 'Bawah',
  o0: 'Portrait (0°)', o90: 'Landscape (putar 90°)', o270: 'Landscape terbalik (putar 270°)',
};

function segButtons(values, iconKey = (v) => v) {
  return values
    .map((v) => `<button type="button" class="ibtn" data-value="${v}" title="${TITLES[iconKey(v)]}">${ICONS[iconKey(v)]}</button>`)
    .join('');
}

const setActive = (group, value) => {
  for (const b of group.querySelectorAll('[data-value]')) b.classList.toggle('active', b.dataset.value === String(value));
};

/* ---------- State ---------- */

let templates = loadTemplates();

/* ---------- Urungkan / Ulangi perubahan template ---------- */

// Setiap penyimpanan template dicatat. Perubahan beruntun yang rapat (mengetik, menggeser
// dengan panah) digabung menjadi satu langkah agar Urungkan tidak terasa "per huruf".
const HISTORY_LIMIT = 50;
const HISTORY_MERGE_MS = 700;
let past = [];
let future = [];
let lastState = null;
let lastChange = 0;
let restoring = false;

const snapshotState = () => JSON.stringify({ templates, currentId });

function saveTemplates(list) {
  storeTemplates(list);
  if (restoring) return;
  const state = snapshotState();
  if (lastState == null || state === lastState) {
    lastState = state;
    return;
  }
  const now = Date.now();
  if (now - lastChange > HISTORY_MERGE_MS || !past.length) {
    past.push(lastState);
    if (past.length > HISTORY_LIMIT) past.shift();
  }
  lastChange = now;
  future = [];
  lastState = state;
  emitHistory();
}

const emitHistory = () => document.dispatchEvent(new CustomEvent('templatehistory', { detail: { canUndo: past.length > 0, canRedo: future.length > 0 } }));
export const historyState = () => ({ canUndo: past.length > 0, canRedo: future.length > 0 });

function restoreState(json) {
  restoring = true;
  const s = JSON.parse(json);
  templates = s.templates;
  if (templates.some((t) => t.id === s.currentId)) currentId = s.currentId;
  storeTemplates(templates);
  restoring = false;
  lastState = json;
  lastChange = 0;
  const settings = ctx.getSettings();
  settings.templateId = currentId;
  ctx.saveSettings();
  selectLine(null);
  renderTemplateEditor();
  ctx.onChange(); // gambar ulang preview
  emitHistory();
}

/** Urungkan perubahan template terakhir; false bila tidak ada. */
export function undoTemplate() {
  if (!past.length) return false;
  future.push(lastState);
  restoreState(past.pop());
  return true;
}

/** Ulangi perubahan yang baru diurungkan; false bila tidak ada. */
export function redoTemplate() {
  if (!future.length) return false;
  past.push(lastState);
  restoreState(future.pop());
  return true;
}
let currentId;
let ctx; // { getColumns(), getSettings(), saveSettings(), onChange() }

export const currentTemplate = () => templates.find((t) => t.id === currentId) ?? templates[0];

/** Pakai sebuah kolom sebagai isi barcode/QR (dari generator kode). QR bila belum ada format. */
export function useCodeColumn(column) {
  const c = currentTemplate().code;
  c.source = 'column';
  c.column = column;
  if (c.type === 'none') c.type = 'qr';
  changed();
}

function changed({ lines = false, list = false } = {}) {
  saveTemplates(templates);
  if (list) renderPicker();
  if (lines) renderLines();
  renderWarnings();
  syncControls();
  ctx.onChange();
}

/* ---------- Render ---------- */

function renderPicker() {
  const cur = currentTemplate();
  $('#tpl-select').replaceChildren(...templates.map((t) => new Option(t.nama, t.id, false, t.id === cur.id)));
  $('#tpl-name').value = cur.nama;
  $('#meta-tpl').textContent = cur.nama;
}

export function renderColumns() {
  const cols = ctx.getColumns();
  const box = $('#tpl-columns');
  if (!cols.length) {
    box.innerHTML = '<span class="hint">Import data dulu untuk melihat daftar kolom.</span>';
  } else {
    const chip = (c, special = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (special ? ' chip--special' : '');
      b.dataset.col = c;
      b.textContent = c;
      b.title = special ? `Sisipkan {{${c}}} (${c === 'no' ? 'nomor urut baris' : 'tanggal hari ini'})` : `Sisipkan {{${c}}}`;
      return b;
    };
    const specials = ['no', 'tanggal'].filter((s) => !cols.some((c) => c.toLowerCase() === s));
    box.replaceChildren(...cols.map((c) => chip(c)), ...specials.map((s) => chip(s, true)));
  }
  renderWarnings();
  syncCodeControls(currentTemplate());
  renderGroups();
  renderPhotoControls();
}

function renderWarnings() {
  const cols = ctx.getColumns();
  const unknown = cols.length ? unknownPlaceholders(currentTemplate(), cols) : [];
  $('#tpl-warn').innerHTML = unknown.length
    ? `<div class="alert alert--warn">⚠️ Kolom tidak ditemukan di data: ${unknown.map((n) => `<code>{{${escapeHtml(n)}}}</code>`).join(', ')}. Bagian ini akan dicetak kosong.</div>`
    : '';
}

const mmText = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('id-ID', { maximumFractionDigits: 1 })}`;

/** Keterangan geseran baris, mis. "X +2 · Y −1,5 mm", dengan tombol kembalikan. */
function offsetBadge(l) {
  if (!l.dx && !l.dy) return '';
  return `<span class="line-offset" title="Baris ini digeser di preview">↔ X ${mmText(l.dx)} · Y ${mmText(l.dy)} mm</span>
    <button type="button" class="link line-offset-reset" title="Kembalikan baris ini ke posisi otomatis">Kembalikan</button>`;
}

function renderLines() {
  const tpl = syncLines(currentTemplate());
  const texts = templateLines(tpl);
  $('#tpl-lines-reset').hidden = !tpl.lines.some((l) => l.dx || l.dy);
  $('#tpl-lines').innerHTML = tpl.lines.map((l, i) => `
    <div class="line-row${i === selectedLine ? ' is-selected' : ''}" data-i="${i}">
      <div class="line-head"><span class="line-no">${i + 1}</span><code class="line-text" translate="no">${escapeHtml(texts[i]) || '<i>(kosong)</i>'}</code>${offsetBadge(l)}</div>
      <div class="line-tools">
        <button type="button" class="tbtn${l.bold ? ' active' : ''}" data-prop="bold" title="Tebal"><b>B</b></button>
        <button type="button" class="tbtn${l.italic ? ' active' : ''}" data-prop="italic" title="Miring"><i>I</i></button>
        <button type="button" class="tbtn${l.upper ? ' active' : ''}" data-prop="upper" title="HURUF BESAR SEMUA">AA</button>
        <label class="size-input" title="Ukuran font maksimum (diperkecil otomatis bila tidak muat)">
          <input type="number" class="line-size" min="6" max="96" step="0.5" value="${l.size}"><span>pt</span>
        </label>
        <input type="color" class="line-color" value="${l.color}" title="Warna teks">
        <div class="seg seg--sm" title="Rata baris ini (klik lagi untuk ikut rata global)">
          ${ALIGNS.map((a) => `<button type="button" class="ibtn${l.align === a ? ' active' : ''}" data-align="${a}" title="${TITLES[a]} (baris ini)">${ICONS[a]}</button>`).join('')}
        </div>
        <select class="line-font" title="Font baris ini" style="font-family:${escapeHtml(cssFamily(l.font || tpl.font))}">
          ${fontOptionsHtml(l.font || '', `Font global (${tpl.font})`)}
        </select>
        <label class="line-overflow-wrap" title="Jika teks baris ini terlalu panjang untuk label">
          <span>Jika panjang</span>
          <select class="line-overflow">${overflowOptionsHtml(l)}</select>
        </label>
      </div>
    </div>`).join('');
}

function syncControls() {
  const tpl = currentTemplate();
  setActive($('#tpl-align'), tpl.align);
  setActive($('#tpl-valign'), tpl.valign);
  setActive($('#tpl-orient'), tpl.orientation);
  setActive($('#pv-orient'), tpl.orientation);
  syncCodeControls(tpl);
  renderPhotoControls();
  renderDecals();
  renderGroups();
  const fontSel = $('#tpl-font');
  fontSel.innerHTML = fontOptionsHtml(tpl.font);
  fontSel.style.fontFamily = cssFamily(tpl.font);
  $('#tpl-padding').value = tpl.padding;
  $('#tpl-uniform').checked = tpl.uniformFont;
  $('#tpl-hide-empty').checked = tpl.hideEmpty;
}

/* ---------- Warna per kelompok ---------- */

/** Nilai unik kolom pengelompokan (urut kemunculan) + jumlah baris. */
function groupValues(column) {
  const groups = new Map();
  if (!column) return groups;
  for (const row of ctx.getRows()) {
    const raw = String(row.values[column] ?? '').trim();
    const key = groupKey(raw);
    if (!key) continue;
    const g = groups.get(key) ?? { label: raw, count: 0 };
    g.count++;
    groups.set(key, g);
  }
  return groups;
}

function renderGroups() {
  const tpl = currentTemplate();
  const rule = tpl.colorRule;
  const cols = ctx.getColumns();
  const options = cols.includes(rule.column) || !rule.column ? cols : [rule.column, ...cols];
  $('#grp-col').innerHTML = '<option value="">— tidak dipakai —</option>' +
    options.map((c) => `<option value="${escapeHtml(c)}"${c === rule.column ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');

  const active = !!rule.column;
  $('#grp-opts').hidden = !active;
  if (!active) return;
  setActive($('#grp-target'), rule.target);
  $('#grp-band').value = rule.band;
  $('#grp-band-wrap').hidden = $('#grp-band-label').hidden = rule.target !== 'band';

  const groups = groupValues(rule.column);
  const before = JSON.stringify(rule.colors);
  fillGroupColors(rule, [...groups.values()].map((g) => g.label));
  if (JSON.stringify(rule.colors) !== before) saveTemplates(templates);

  $('#grp-list').innerHTML = groups.size
    ? [...groups.entries()].map(([key, g]) => `
      <label class="grp-row">
        <input type="color" data-key="${escapeHtml(key)}" value="${rule.colors[key]}">
        <span class="grp-name" translate="no" title="${escapeHtml(g.label)}">${escapeHtml(g.label)}</span>
        <span class="grp-count">${g.count.toLocaleString('id-ID')}</span>
      </label>`).join('')
    : '<div class="grp-empty">Kolom ini kosong di data.</div>';
}

/* ---------- Baca file gambar (gambar bebas) ---------- */

const MAX_IMG_PX = 600; // cukup tajam untuk logo ukuran label; menjaga data tersimpan tetap kecil

/** Baca file gambar, perkecil bila perlu, hasil { src (data URL), w, h }. */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File tidak bisa dibaca.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const w0 = img.naturalWidth || 300;
        const h0 = img.naturalHeight || 300;
        const scale = Math.min(1, MAX_IMG_PX / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        // JPEG untuk foto (lebih kecil), PNG untuk logo (tetap transparan)
        const src = file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png');
        resolve({ src, w, h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Tata letak per ukuran label ---------- */

/**
 * Pakai tata letak template yang sesuai dengan ukuran label sekarang.
 * Hasil: null / 'restored' / 'adapted' (lihat layoutAdapt.js).
 */
export function syncTemplateLayout() {
  const result = syncLayout(currentTemplate(), ctx.getPreset(), ctx.getPresets());
  if (result) {
    saveTemplates(templates);
    renderLines();
    renderDecals();
    syncControls();
  } else if (!currentTemplate().layoutFor) {
    currentTemplate().layoutFor = ctx.getPreset().id;
    saveTemplates(templates);
  }
  renderLayoutInfo();
  return result;
}

function renderLayoutInfo() {
  const p = ctx.getPreset();
  $('#tpl-layout-info').innerHTML = `Tata letak (orientasi, ukuran font, posisi tulisan/QR/gambar) disimpan khusus untuk <b>${escapeHtml(p.nama.split(' — ')[0])}</b>. Ukuran label lain punya tata letak sendiri; yang belum pernah dipakai disesuaikan otomatis.`;
}

/* ---------- Teks bebas (di luar data, mis. "Kepada Yth.") ---------- */

let selectedFree = null;
export const getSelectedFree = () => selectedFree;

export function selectFree(id) {
  selectedFree = id;
  selectedLine = null;
  for (const el of document.querySelectorAll('.line-row, .label-line')) el.classList.remove('is-selected');
  for (const el of document.querySelectorAll('.label-free')) el.classList.toggle('is-selected', el.dataset.free === id);
  for (const el of document.querySelectorAll('.ft-item')) el.classList.toggle('is-selected', el.dataset.id === id);
  document.dispatchEvent(new CustomEvent('lineselect'));
}

export const getFreeText = (id) => currentTemplate().texts.find((t) => t.id === id) ?? null;

/** Ubah teks bebas (isi, posisi, gaya). */
export function updateFreeText(id, patch) {
  const t = getFreeText(id);
  if (!t) return;
  Object.assign(t, patch);
  for (const k of ['x', 'y']) if (k in patch) t[k] = r1(t[k]);
  saveTemplates(templates);
  syncFreeInputs(t);
  ctx.onChange();
}

/** Tambah teks bebas di pojok kiri atas area isi; hasilnya langsung terpilih. */
/** text kosong = "Teks baru" (langsung siap diketik di panel bila focusPanel). */
export function addFreeText(text = null, { focusPanel = true } = {}) {
  const blank = text == null;
  text ??= tr('Teks baru');
  const tpl = currentTemplate();
  const box = contentBox(tpl, ctx.getPreset());
  // teks berikutnya diletakkan sedikit di bawah teks sebelumnya agar tidak bertumpuk
  const y = r1(Math.min(box.h - 4, box.pad + tpl.texts.length * 4));
  const t = { id: newTextId(), text, x: r1(box.pad), y, size: 9, bold: false, italic: false, upper: false, color: '#000000', font: null, align: 'left' };
  tpl.texts.push(t);
  saveTemplates(templates);
  renderFreeTexts();
  ctx.onChange();
  selectFree(t.id);
  if (blank && focusPanel) {
    // langsung siap diketik
    const input = document.querySelector(`.ft-item[data-id="${t.id}"] .ft-text`);
    input?.focus();
    input?.select();
  }
  return t.id;
}

/** Salin teks bebas, digeser 2 mm; salinannya langsung terpilih. */
export function duplicateFreeText(id) {
  const t = getFreeText(id);
  if (!t) return;
  const copy = { ...t, id: newTextId(), x: r1(t.x + 2), y: r1(t.y + 2) };
  const tpl = currentTemplate();
  tpl.texts.splice(tpl.texts.indexOf(t) + 1, 0, copy);
  saveTemplates(templates);
  renderFreeTexts();
  ctx.onChange();
  selectFree(copy.id);
}

export function removeFreeText(id) {
  const tpl = currentTemplate();
  tpl.texts = tpl.texts.filter((t) => t.id !== id);
  if (selectedFree === id) selectFree(null);
  saveTemplates(templates);
  renderFreeTexts();
  ctx.onChange();
}

function syncFreeInputs(t) {
  const item = document.querySelector(`.ft-item[data-id="${t.id}"]`);
  if (!item) return renderFreeTexts();
  for (const [k, v] of [['text', t.text], ['x', r1(t.x)], ['y', r1(t.y)], ['size', t.size]]) {
    const input = item.querySelector(`[data-k="${k}"]`);
    if (document.activeElement !== input) input.value = v;
  }
}

function renderFreeTexts() {
  const list = currentTemplate().texts;
  $('#ft-list').innerHTML = list.length
    ? list.map((t) => `
      <div class="ft-item${t.id === selectedFree ? ' is-selected' : ''}" data-id="${t.id}">
        <input type="text" class="ft-text" data-k="text" value="${escapeHtml(t.text)}" placeholder="Ketik teks…" aria-label="Isi teks bebas">
        <div class="ft-grid">
          <label class="field"><span>X (mm)</span><input type="number" step="0.5" data-k="x" value="${r1(t.x)}"></label>
          <label class="field"><span>Y (mm)</span><input type="number" step="0.5" data-k="y" value="${r1(t.y)}"></label>
          <label class="field"><span>Ukuran (pt)</span><input type="number" step="0.5" min="4" max="96" data-k="size" value="${t.size}"></label>
          <button type="button" class="ghost danger ft-del" title="Hapus teks ini">Hapus</button>
        </div>
      </div>`).join('')
    : '<p class="hint">Belum ada teks bebas.</p>';
}

/* ---------- Jika teks terlalu panjang ---------- */

export const overflowOptionsHtml = (l) => OVERFLOW_OPTIONS
  .map((o) => `<option value="${o.value}" title="${o.title}"${o.value === overflowValue(l) ? ' selected' : ''}>${o.label}</option>`).join('');

/** Nilai menu → { overflow, maxRows } untuk gaya baris. */
export function overflowPatch(value) {
  const o = OVERFLOW_OPTIONS.find((x) => x.value === value) ?? OVERFLOW_OPTIONS[0];
  return { overflow: o.overflow, maxRows: o.maxRows };
}

/* ---------- Geser baris teks (di preview) ---------- */

let selectedLine = null;
export const getSelectedLine = () => selectedLine;

export function selectLine(i) {
  selectedLine = i;
  selectedFree = null; // satu pilihan teks dalam satu waktu (selectLine(null) = batal pilih semua)
  for (const el of document.querySelectorAll('.label-free, .ft-item')) el.classList.remove('is-selected');
  for (const el of document.querySelectorAll('.line-row')) el.classList.toggle('is-selected', Number(el.dataset.i) === i);
  for (const el of document.querySelectorAll('.label-line')) el.classList.toggle('is-selected', Number(el.dataset.line) === i);
  document.dispatchEvent(new CustomEvent('lineselect'));
}

/** Ubah gaya satu baris (font, ukuran, tebal, warna, rata, …), dipakai toolbar mini di preview. */
export function updateLineStyle(i, patch) {
  const l = currentTemplate().lines[i];
  if (!l) return;
  Object.assign(l, patch);
  changed({ lines: true });
}

/** Ubah geseran satu baris (mm); i = null → semua baris kembali ke posisi otomatis. */
export function updateLineOffset(i, patch) {
  const lines = currentTemplate().lines;
  for (const l of i == null ? lines : [lines[i]].filter(Boolean)) {
    l.dx = r1(patch.dx ?? l.dx);
    l.dy = r1(patch.dy ?? l.dy);
  }
  changed({ lines: true });
}

/* ---------- Barcode/QR posisi bebas ---------- */

/** Posisi bebas yang dimulai dari letak barcode/QR saat ini (agar tidak meloncat). */
export function freeCodeFromLayout(tpl) {
  const g = labelGeometry(tpl, ctx.getPreset()).code;
  if (!g) return { free: true };
  return { free: true, x: r1(g.u), y: r1(g.v), w: r1(g.w), h: r1(g.h) };
}

/** Ubah posisi/ukuran barcode/QR (dipakai saat digeser di preview). */
export function updateCode(patch) {
  const c = currentTemplate().code;
  for (const [k, v] of Object.entries(patch)) c[k] = typeof v === 'number' ? r1(v) : v;
  changed();
}

/* ---------- Gambar bebas (branding) ---------- */

let selectedDecal = null;
export const getSelectedDecal = () => selectedDecal;

export function selectDecal(id) {
  selectedDecal = id;
  for (const el of document.querySelectorAll('.dc-item')) el.classList.toggle('is-selected', el.dataset.id === id);
  for (const el of document.querySelectorAll('.label-decal')) el.classList.toggle('is-selected', el.dataset.decal === id);
  document.dispatchEvent(new CustomEvent('lineselect'));
}

export const getDecal = (id) => currentTemplate().decals.find((d) => d.id === id) ?? null;

export function removeDecal(id) {
  const tpl = currentTemplate();
  tpl.decals = tpl.decals.filter((d) => d.id !== id);
  if (selectedDecal === id) selectDecal(null);
  changed();
}

/** Salin gambar bebas, digeser 2 mm agar terlihat; salinannya langsung terpilih. */
export function duplicateDecal(id) {
  const d = getDecal(id);
  if (!d) return;
  const copy = { ...d, id: newDecalId(), x: r1(d.x + 2), y: r1(d.y + 2) };
  const tpl = currentTemplate();
  tpl.decals.splice(tpl.decals.indexOf(d) + 1, 0, copy);
  changed();
  selectDecal(copy.id);
}

/** Ubah gambar bebas (dipakai juga saat digeser di preview). */
export function updateDecal(id, patch) {
  const d = currentTemplate().decals.find((x) => x.id === id);
  if (!d) return;
  Object.assign(d, patch);
  saveTemplates(templates);
  syncDecalInputs(d);
  ctx.onChange();
}

const r1 = (n) => Math.round(n * 10) / 10;

function syncDecalInputs(d) {
  const item = document.querySelector(`.dc-item[data-id="${d.id}"]`);
  if (!item) return;
  for (const [k, v] of [['x', r1(d.x)], ['y', r1(d.y)], ['width', r1(d.width)]]) {
    const input = item.querySelector(`[data-k="${k}"]`);
    if (document.activeElement !== input) input.value = v;
  }
  item.querySelector('[data-k="opacity"]').value = Math.round(d.opacity * 100);
  item.querySelector('.dc-op').textContent = `${Math.round(d.opacity * 100)}%`;
  setActive(item.querySelector('.dc-layer'), d.layer);
  const avoid = item.querySelector('[data-k="avoid"]');
  avoid.checked = d.avoid;
  avoid.disabled = d.layer === 'back';
}

function renderDecals() {
  const list = currentTemplate().decals;
  $('#dc-list').innerHTML = list.length
    ? list.map((d, i) => `
      <div class="dc-item${d.id === selectedDecal ? ' is-selected' : ''}" data-id="${d.id}">
        <div class="dc-head">
          <span class="dc-thumb" style="background-image:url('${d.src}')"></span>
          <span class="dc-name">Gambar ${i + 1}</span>
          <button type="button" class="ghost dc-center" title="Letakkan di tengah label">Tengahkan</button>
          <button type="button" class="ghost danger dc-del" title="Hapus gambar ini">Hapus</button>
        </div>
        <div class="dc-grid">
          <label class="field"><span>X (mm)</span><input type="number" step="0.5" data-k="x" value="${r1(d.x)}"></label>
          <label class="field"><span>Y (mm)</span><input type="number" step="0.5" data-k="y" value="${r1(d.y)}"></label>
          <label class="field"><span>Lebar (mm)</span><input type="number" step="0.5" min="1" data-k="width" value="${r1(d.width)}"></label>
        </div>
        <div class="dc-row">
          <div class="seg seg--text dc-layer">
            <button type="button" class="ibtn${d.layer === 'front' ? ' active' : ''}" data-value="front" title="Di depan teks">Depan</button>
            <button type="button" class="ibtn${d.layer === 'back' ? ' active' : ''}" data-value="back" title="Di belakang teks (watermark)">Belakang</button>
          </div>
          <span class="hint" style="margin:0">Transparansi</span>
          <input type="range" min="5" max="100" step="5" data-k="opacity" value="${Math.round(d.opacity * 100)}" style="flex:1;min-width:80px">
          <span class="hint dc-op" style="margin:0;width:34px">${Math.round(d.opacity * 100)}%</span>
        </div>
        <label class="switch switch--inline dc-avoid" title="Seperti Wrap Text → Square di Word (hanya untuk gambar di depan teks)"><input type="checkbox" data-k="avoid"${d.avoid ? ' checked' : ''}${d.layer === 'back' ? ' disabled' : ''}><span class="switch-ui"></span>Teks di samping gambar (tidak tertimpa)</label>
      </div>`).join('')
    : '<p class="hint">Belum ada gambar bebas.</p>';
}

function centerDecal(d) {
  const box = contentBox(currentTemplate(), ctx.getPreset());
  return { x: r1((box.w - d.width) / 2), y: r1((box.h - decalHeight({ ...d })) / 2) };
}

/* ---------- Foto per orang ---------- */

export function renderPhotoControls() {
  const tpl = currentTemplate();
  const ph = tpl.photo;
  const cols = ctx.getColumns();
  const options = cols.includes(ph.column) || !ph.column ? cols : [ph.column, ...cols];
  $('#ph-col').innerHTML = '<option value="">— tidak dipakai —</option>' +
    options.map((c) => `<option value="${escapeHtml(c)}"${c === ph.column ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
  $('#ph-opts').hidden = !ph.column;
  setActive($('#ph-pos'), ph.position);
  setActive($('#ph-ratio'), ph.ratio);
  $('#ph-size').value = ph.size;
  $('#ph-size-label').textContent = ph.position === 'top' || ph.position === 'bottom' ? 'Tinggi area' : 'Lebar area';
  $('#ph-clear').hidden = !photoCount();

  const n = photoCount().toLocaleString('id-ID');
  if (!ph.column) {
    $('#ph-info').innerHTML = `<b>${n}</b> foto tersimpan. Pilih kolom pencocok untuk menampilkan foto di label.`;
    return;
  }
  const rows = ctx.getRows();
  const withPhoto = rows.filter((r) => photoUrl(r.values[ph.column])).length;
  $('#ph-info').innerHTML = `<b>${n}</b> foto tersimpan · <b>${withPhoto.toLocaleString('id-ID')}</b> dari ${rows.length.toLocaleString('id-ID')} baris punya foto`;
}

async function importPhotos(files) {
  if (!files.length) return;
  const info = $('#ph-info');
  try {
    const { added } = await addPhotos(files, (done, total) => {
      info.textContent = `Menyimpan foto ${done.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')}…`;
    });
    const tpl = currentTemplate();
    if (!tpl.photo.column) {
      // tebak kolom pencocok: kolom NIM/NIS/ID, atau kolom yang nilainya paling banyak punya foto
      const cols = ctx.getColumns();
      const rows = ctx.getRows();
      const score = (c) => rows.filter((r) => photoUrl(r.values[c])).length;
      const best = cols.map((c) => [c, score(c)]).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] > 0) tpl.photo.column = best[0];
    }
    toast(`${added.toLocaleString('id-ID')} foto disimpan.`);
    changed();
  } catch (err) {
    toast(`Gagal menyimpan foto: ${err.message}`, 'error');
    renderPhotoControls();
  }
}

function syncCodeControls(tpl) {
  const c = tpl.code;
  const barcode = isBarcode(c.type);
  setActive($('#tpl-code-type'), barcode ? 'barcode' : c.type);
  setActive($('#tpl-code-pos'), c.free ? 'free' : c.position);
  setActive($('#tpl-code-src'), c.source);
  $('#tpl-code-opts').hidden = c.type === 'none';
  $('#tpl-code-format').hidden = $('#tpl-code-format-label').hidden = !barcode;
  $('#tpl-code-format').innerHTML = Object.entries(BARCODE_FORMATS)
    .map(([k, f]) => `<option value="${k}"${k === c.type ? ' selected' : ''}>${f.label}</option>`).join('');
  const fromText = c.source === 'text';
  $('#tpl-code-col').hidden = $('#tpl-code-col-label').hidden = fromText;
  $('#tpl-code-tpl').hidden = $('#tpl-code-tpl-label').hidden = !fromText;
  if (document.activeElement !== $('#tpl-code-tpl')) $('#tpl-code-tpl').value = c.text;
  $('#tpl-code-hint').textContent = c.type === 'none' ? ''
    : (barcode ? `${BARCODE_FORMATS[c.type].label}: ${BARCODE_FORMATS[c.type].hint}. ` : 'QR code: teks apa saja, termasuk URL. ')
      + (fromText ? 'Teks boleh berisi placeholder, mis. {{nim}}.' : '');
  $('#tpl-code-size').value = c.free ? r1(c.type === 'qr' ? c.w : c.h) : c.size;
  $('#tpl-code-text').checked = c.showText;
  $('#tpl-code-avoid').checked = c.avoid;
  $('#tpl-code-avoid-row').hidden = !c.free;
  $('#tpl-code-text-row').hidden = !barcode;
  const vertical = c.position === 'top' || c.position === 'bottom';
  $('#tpl-code-size-label').textContent = c.type === 'qr' ? 'Ukuran (sisi)' : vertical || c.free ? 'Tinggi' : 'Lebar';

  const cols = ctx.getColumns();
  const options = cols.includes(c.column) || !c.column ? cols : [c.column, ...cols];
  $('#tpl-code-col').innerHTML = '<option value="">— pilih kolom —</option>' +
    options.map((col) => `<option value="${escapeHtml(col)}"${col === c.column ? ' selected' : ''}>${escapeHtml(col)}${cols.includes(col) ? '' : ' (tidak ada di data)'}</option>`).join('');
}

export function renderTemplateEditor() {
  renderPicker();
  $('#tpl-text').value = currentTemplate().text;
  renderColumns();
  renderLines();
  renderFreeTexts();
  syncControls();
}

function selectTemplate(id) {
  currentId = id;
  const s = ctx.getSettings();
  s.templateId = id;
  ctx.saveSettings();
  syncTemplateLayout();
  renderTemplateEditor();
  ctx.onChange();
}

/* ---------- Event ---------- */

export function mountTemplateEditor(context) {
  ctx = context;
  currentId = ctx.getSettings().templateId ?? DEFAULT_TEMPLATE.id;
  if (!templates.some((t) => t.id === currentId)) currentId = templates[0].id;
  // logo dari fitur lama "Logo / gambar" → gambar bebas di sisi yang sama
  const migrated = templates.filter((t) => migrateLegacyLogo(t, contentBox(t, ctx.getPreset()))).length;
  if (migrated) {
    saveTemplates(templates);
    setTimeout(() => toast('Logo dipindahkan ke "Gambar bebas" (bisa digeser & diubah ukurannya di preview).'), 300);
  }
  syncTemplateLayout();
  lastState = snapshotState(); // titik awal riwayat Urungkan

  $('#tpl-align').innerHTML = segButtons(ALIGNS);
  $('#tpl-valign').innerHTML = segButtons(VALIGNS);
  $('#tpl-orient').innerHTML = segButtons(ORIENTATIONS, (v) => `o${v}`);
  $('#pv-orient').innerHTML = segButtons(ORIENTATIONS, (v) => `o${v}`); // salinan di toolbar preview

  $('#tpl-select').addEventListener('change', (e) => selectTemplate(e.target.value));

  $('#tpl-name').addEventListener('input', (e) => {
    currentTemplate().nama = e.target.value;
    $('#tpl-select').selectedOptions[0].textContent = e.target.value || '(tanpa nama)';
    $('#meta-tpl').textContent = e.target.value;
    saveTemplates(templates);
  });

  $('#tpl-save-as').addEventListener('click', () => {
    const src = currentTemplate();
    const nama = prompt(tr('Nama template baru:'), `${src.nama} (salinan)`);
    if (nama == null) return;
    const tpl = { ...structuredClone(src), id: newTemplateId(), nama: nama.trim() || 'Template' };
    templates.push(tpl);
    saveTemplates(templates);
    selectTemplate(tpl.id);
    toast('Template disimpan.');
  });

  $('#tpl-del').addEventListener('click', () => {
    if (templates.length <= 1) return toast('Minimal harus ada satu template.', 'error');
    const tpl = currentTemplate();
    if (!confirm(tr(`Hapus template "${tpl.nama}"?`))) return;
    templates = templates.filter((t) => t !== tpl);
    saveTemplates(templates);
    selectTemplate(templates[0].id);
  });

  $('#tpl-columns').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const ta = $('#tpl-text');
    ta.focus();
    ta.setRangeText(`{{${chip.dataset.col}}}`, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  });

  $('#tpl-text').addEventListener('input', (e) => {
    currentTemplate().text = e.target.value;
    changed({ lines: true });
  });

  for (const btn of document.querySelectorAll('[data-quick]')) {
    btn.addEventListener('click', () => {
      applyQuickStyle(currentTemplate(), btn.dataset.quick);
      changed({ lines: true });
    });
  }

  const lines = $('#tpl-lines');
  const renderQuick = () => {
    $('#ft-quick').innerHTML = quickTexts(lang).map((q) => `<button type="button" class="chip chip--text" data-text="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
  };
  renderQuick();
  document.addEventListener('langchange', renderQuick);
  $('#ft-add').addEventListener('click', () => addFreeText());
  $('#ft-quick').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-text]');
    if (chip) addFreeText(chip.dataset.text);
  });
  const ftList = $('#ft-list');
  ftList.addEventListener('click', (e) => {
    const item = e.target.closest('.ft-item');
    if (!item) return;
    if (e.target.closest('.ft-del')) return removeFreeText(item.dataset.id);
    if (selectedFree !== item.dataset.id) selectFree(item.dataset.id);
  });
  ftList.addEventListener('input', (e) => {
    const item = e.target.closest('.ft-item');
    const k = e.target.dataset.k;
    if (!item || !k) return;
    if (k === 'text') return updateFreeText(item.dataset.id, { text: e.target.value });
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (!Number.isFinite(v)) return;
    if (k === 'size') {
      if (v >= 4 && v <= 96) updateFreeText(item.dataset.id, { size: v });
    } else updateFreeText(item.dataset.id, { [k]: v });
  });

  $('#tpl-lines-reset').addEventListener('click', () => {
    updateLineOffset(null, { dx: 0, dy: 0 });
    toast('Semua baris kembali ke posisi otomatis.');
  });
  lines.addEventListener('click', (e) => {
    const row = e.target.closest('.line-row');
    const btn = e.target.closest('button');
    if (!row || !btn) return;
    if (btn.matches('.line-offset-reset')) return updateLineOffset(Number(row.dataset.i), { dx: 0, dy: 0 });
    const l = currentTemplate().lines[row.dataset.i];
    if (btn.dataset.prop) l[btn.dataset.prop] = !l[btn.dataset.prop];
    else if (btn.dataset.align) l.align = l.align === btn.dataset.align ? null : btn.dataset.align;
    changed({ lines: true });
  });
  lines.addEventListener('change', (e) => {
    if (e.target.matches('.line-overflow')) {
      updateLineStyle(Number(e.target.closest('.line-row').dataset.i), overflowPatch(e.target.value));
      return;
    }
    if (!e.target.matches('.line-font')) return;
    const l = currentTemplate().lines[e.target.closest('.line-row').dataset.i];
    let font = e.target.value;
    if (font === '__custom') font = askCustomFont() ?? l.font ?? '';
    l.font = font || null;
    changed({ lines: true });
  });
  lines.addEventListener('input', (e) => {
    const row = e.target.closest('.line-row');
    if (!row) return;
    const l = currentTemplate().lines[row.dataset.i];
    if (e.target.matches('.line-size')) {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v) || v < 1) return;
      l.size = v;
    } else if (e.target.matches('.line-color')) {
      l.color = e.target.value;
    } else return;
    changed();
  });

  const bindSeg = (id, apply) => $(id).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (!btn) return;
    apply(currentTemplate(), btn.dataset.value);
    changed();
  });
  bindSeg('#tpl-align', (t, v) => { t.align = v; });
  bindSeg('#tpl-valign', (t, v) => { t.valign = v; });
  bindSeg('#tpl-orient', (t, v) => { t.orientation = Number(v); });
  bindSeg('#pv-orient', (t, v) => { t.orientation = Number(v); });

  $('#tpl-font').addEventListener('change', (e) => {
    const tpl = currentTemplate();
    let font = e.target.value;
    if (font === '__custom') font = askCustomFont() ?? tpl.font;
    tpl.font = font;
    changed({ lines: true });
  });

  bindSeg('#tpl-code-type', (t, v) => {
    // "Barcode" memakai format barcode terakhir (default Code 128)
    t.code.type = v === 'barcode' ? (isBarcode(t.code.lastBarcode) ? t.code.lastBarcode : 'code128') : v;
    // pilih kolom otomatis: kolom yang namanya mirip kode/nim/id, atau kolom pertama
    if (v !== 'none' && !t.code.column) {
      const cols = ctx.getColumns();
      t.code.column = cols.find((c) => /kode|code|nim|nis|id|sku|barcode/i.test(c)) ?? cols[0] ?? '';
    }
    if (v === 'qr' && t.code.position !== 'left' && t.code.position !== 'right') t.code.position = 'right';
  });
  bindSeg('#tpl-code-pos', (t, v) => {
    if (v !== 'free') {
      t.code.position = v;
      t.code.free = false;
    } else if (!t.code.free) {
      Object.assign(t.code, freeCodeFromLayout(t));
    }
  });
  bindSeg('#tpl-code-src', (t, v) => { t.code.source = v; });
  $('#tpl-code-format').addEventListener('change', (e) => {
    const c = currentTemplate().code;
    c.type = e.target.value;
    c.lastBarcode = e.target.value;
    changed();
  });
  $('#tpl-code-tpl').addEventListener('input', (e) => {
    currentTemplate().code.text = e.target.value;
    changed();
  });
  $('#tpl-code-col').addEventListener('change', (e) => {
    currentTemplate().code.column = e.target.value;
    changed();
  });
  $('#tpl-code-size').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v) || v < 1) return;
    const c = currentTemplate().code;
    if (!c.free) c.size = v;
    else if (c.type === 'qr') c.w = c.h = v;
    else c.h = v;
    changed();
  });
  $('#tpl-code-avoid').addEventListener('change', (e) => {
    currentTemplate().code.avoid = e.target.checked;
    changed();
  });
  $('#tpl-code-text').addEventListener('change', (e) => {
    currentTemplate().code.showText = e.target.checked;
    changed();
  });

  $('#dc-add').addEventListener('click', () => $('#dc-file').click());
  $('#dc-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { src, w, h } = await loadImageFile(file);
      const box = contentBox(currentTemplate(), ctx.getPreset());
      const width = r1(Math.max(5, Math.min(20, box.w * 0.35)));
      const d = { id: newDecalId(), src, w, h, width, opacity: 1, layer: 'front', x: 0, y: 0 };
      Object.assign(d, centerDecal(d));
      currentTemplate().decals.push(d);
      selectedDecal = d.id;
      changed();
      toast('Gambar ditambahkan. Geser langsung di preview untuk memindahkannya.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  const dcList = $('#dc-list');
  dcList.addEventListener('click', (e) => {
    const item = e.target.closest('.dc-item');
    if (!item) return;
    const id = item.dataset.id;
    const tpl = currentTemplate();
    const d = tpl.decals.find((x) => x.id === id);
    if (e.target.closest('.dc-del')) return removeDecal(id);
    if (e.target.closest('.dc-center')) return updateDecal(id, centerDecal(d));
    const layerBtn = e.target.closest('.dc-layer [data-value]');
    if (layerBtn) return updateDecal(id, { layer: layerBtn.dataset.value });
    selectDecal(id);
  });
  dcList.addEventListener('change', (e) => {
    const item = e.target.closest('.dc-item');
    if (item && e.target.dataset.k === 'avoid') updateDecal(item.dataset.id, { avoid: e.target.checked });
  });
  dcList.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    const item = e.target.closest('.dc-item');
    if (!k || k === 'avoid' || !item) return;
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    if (k === 'opacity') updateDecal(item.dataset.id, { opacity: v / 100 });
    else if (k === 'width') { if (v >= 1) updateDecal(item.dataset.id, { width: v }); }
    else updateDecal(item.dataset.id, { [k]: v });
  });

  $('#ph-col').addEventListener('change', (e) => {
    currentTemplate().photo.column = e.target.value;
    changed();
  });
  $('#ph-add').addEventListener('click', () => $('#ph-files').click());
  $('#ph-folder').addEventListener('click', () => $('#ph-dir').click());
  for (const id of ['#ph-files', '#ph-dir']) {
    $(id).addEventListener('change', (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      importPhotos(files);
    });
  }
  $('#ph-clear').addEventListener('click', async () => {
    if (!confirm(tr(`Hapus semua ${photoCount()} foto yang tersimpan di browser ini?`))) return;
    await clearPhotos();
    toast('Semua foto dihapus.');
    changed();
  });
  bindSeg('#ph-pos', (t, v) => { t.photo.position = v; });
  bindSeg('#ph-ratio', (t, v) => { t.photo.ratio = v; });
  $('#ph-size').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v) || v <= 0) return;
    currentTemplate().photo.size = v;
    changed();
  });

  $('#grp-col').addEventListener('change', (e) => {
    const rule = currentTemplate().colorRule;
    rule.column = e.target.value;
    if (rule.column && rule.target === 'none') rule.target = 'band';
    if (!rule.column) rule.target = 'none';
    changed();
  });
  bindSeg('#grp-target', (t, v) => { t.colorRule.target = v; });
  $('#grp-band').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v) || v <= 0) return;
    currentTemplate().colorRule.band = v;
    changed();
  });
  $('#grp-list').addEventListener('input', (e) => {
    if (!e.target.matches('input[type=color]')) return;
    currentTemplate().colorRule.colors[e.target.dataset.key] = e.target.value;
    saveTemplates(templates);
    ctx.onChange();
  });
  $('#grp-auto').addEventListener('click', () => {
    const rule = currentTemplate().colorRule;
    rule.colors = {};
    changed();
  });

  $('#tpl-padding').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v) || v < 0) return;
    currentTemplate().padding = v;
    changed();
  });
  $('#tpl-hide-empty').addEventListener('change', (e) => {
    currentTemplate().hideEmpty = e.target.checked;
    changed();
  });
  $('#tpl-uniform').addEventListener('change', (e) => {
    currentTemplate().uniformFont = e.target.checked;
    changed();
  });

  $('#tpl-export').addEventListener('click', () => exportTemplatesFile(templates));
  $('#tpl-import').addEventListener('click', () => $('#tpl-file').click());
  $('#tpl-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = parseTemplatesFile(await file.text());
      for (const t of incoming) migrateLegacyLogo(t, contentBox(t, ctx.getPreset()));
      const byId = new Map(templates.map((t) => [t.id, t]));
      for (const t of incoming) byId.set(t.id, t);
      templates = [...byId.values()];
      saveTemplates(templates);
      selectTemplate(incoming[0]?.id ?? currentId);
      toast(`${incoming.length} template berhasil diimport.`);
    } catch (err) {
      toast(`Import gagal: ${err.message}`, 'error');
    }
  });

  renderTemplateEditor();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
