import './style.css';
import {
  FIELDS, loadPresets, savePresets, blankPreset, newId, centerMargins,
  exportPresetsFile, parsePresetsFile, mergePresets, resetBuiltins, isBuiltin, DEFAULT_PRESETS, normalizePreset,
} from './presets.js';
import { loadSettings, saveSettings } from './settings.js';
import { checkFit, labelsPerSheet, gridWidth, gridHeight, paginate, MM_TO_PX } from './layout.js';
import { buildTestSheet, buildDataSheets, placeLabel } from './sheet.js';
import { exportPdf } from './pdf.js';
import { MEDIA_MODES, DEFAULT_MEDIA, normalizeMedia, pageLayout, pageSizeName } from './media.js';
import { loadTable, saveTable, expandRows, addRow, addColumn, makeRow } from './data.js';
import { renderGallery, galleryTemplate, galleryData } from './gallery.js';
import { templateLink, templateFromHash, clearShareHash, canShareLink, fetchSheetCsv, sheetCsvUrl } from './share.js';
import {
  parseTable, parseWorkbook, isExcelFile, readTextFile, downloadSampleCsv, downloadSampleXlsx, exportTableCsv, exportTableXlsx,
} from './importer.js';
import { mountDataTable, renderDataTable } from './dataTable.js';
import { createLabelRenderer, contentBox, labelGeometry, barcodeCaption, shapeSvg } from './renderer.js';
import { mountLineToolbar, syncLineToolbar, focusToolbarText } from './lineToolbar.js';
import {
  mountTemplateEditor, renderColumns, renderPhotoControls, currentTemplate, updateDecal, selectDecal, getSelectedDecal,
  selectLine, getSelectedLine, updateLineOffset, updateCode, updateLineStyle, syncTemplateLayout,
  selectFree, getSelectedFree, getFreeText, updateFreeText, removeFreeText, addFreeText,
  undoTemplate, redoTemplate, historyState,
  getDecal, removeDecal, duplicateDecal, duplicateFreeText, addTemplate,
  selectShape, getSelectedShape, getShape, addShape, updateShape, removeShape, duplicateShape,
  useCodeColumn,
} from './templateEditor.js';
import { loadPhotos, clearPhotos, photoCount, photoUrl, exportPhotos, importPhotos } from './photos.js';
import { mountGenerator, openGenerator } from './generator.js';
import { usedColumns, normColumn, quickTexts, decalHeight, normRot, normalizeTemplate, newTemplateId } from './template.js';
import { initI18n, setLang, t, lang, unit } from './i18n.js';
import { load, save, remove, rawEntries, setRaw, flush } from './storage.js';
import { printSheets, showPrintGuide } from './print.js';
import { $, fmt, toast, downloadText } from './util.js';

const state = {
  presets: loadPresets(),
  settings: loadSettings(),
  table: loadTable(),
  previewMode: 'data', // 'data' | 'test'
  tab: 'preview', // 'preview' | 'data'
  dataFilter: '',
  dataPredicate: null, // { label, fn } dari peringatan data ('tampilkan')
  undo: [], // riwayat data untuk Urungkan
  search: { q: '', hits: [], idx: 0 }, // cari teks di preview
  page: 0,
  zoom: 'fit',
};

const currentPreset = () =>
  state.presets.find((p) => p.id === state.settings.presetId) ?? state.presets[0];

const calibration = () => ({
  offsetX: Number(state.settings.offsetX) || 0,
  offsetY: Number(state.settings.offsetY) || 0,
});

/* Kertas di printer (disimpan per ukuran label) */
const mediaFor = (p) => normalizeMedia(state.settings.media?.[p.id] ?? DEFAULT_MEDIA);
const pageFor = (p) => pageLayout(p, mediaFor(p));

/**
 * Kertas landscape: seluruh halaman preview diputar 90° searah jarum jam (isi label
 * ikut berputar). Cetak & PDF tidak berubah: kertas tetap masuk printer seperti biasa.
 */
const isLandscape = () => mediaFor(currentPreset()).orientation === 'landscape';

/** Putaran total isi label di layar (derajat searah jarum jam): orientasi isi + putaran preview. */
const screenRotation = () => (currentTemplate().orientation + (isLandscape() ? 90 : 0)) % 360;

/** Ukuran halaman cetak + offset total (kalibrasi + posisi lembar label di kertas printer). */
function placement(p) {
  const page = pageFor(p);
  const cal = calibration();
  return { page, cal: { offsetX: cal.offsetX + page.dx, offsetY: cal.offsetY + page.dy } };
}

/** Label yang akan dicetak: baris dicentang × kolom jumlah × salinan per label. */
function printItems() {
  const copies = Math.max(1, Math.round(Number(state.settings.copies)) || 1);
  let rows = expandRows(state.table);
  const col = groupColumn();
  if (col && state.settings.groupOnly) rows = rows.filter((r) => groupName(r, col) === state.settings.groupOnly);
  return copies === 1 ? rows : rows.flatMap((r) => Array(copies).fill(r));
}

/* ---------------- Cetak per kelompok (mis. per kelas / ruang ujian) ---------------- */

/** Kolom pengelompokan yang masih ada di data, atau null. */
const groupColumn = () => (state.settings.groupBy && state.table.columns.includes(state.settings.groupBy) ? state.settings.groupBy : null);
const groupName = (row, col) => String(row.values[col] ?? '').trim();
// urutan alami: "Ruang 2" sebelum "Ruang 10"
const naturalCompare = (a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' });

/** Kelompok berurutan alami: [{ name, items }], urutan baris di dalam kelompok tetap. */
function groupItems(items, col) {
  const map = new Map();
  for (const it of items) {
    const name = groupName(it, col);
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(it);
  }
  return [...map].sort(([a], [b]) => (a === '') - (b === '') || naturalCompare(a, b)).map(([name, list]) => ({ name, items: list }));
}

/**
 * Pembagian label ke lembar-lembar. Dengan pengelompokan: label diurutkan per kelompok dan
 * (bila dipilih) tiap kelompok mulai di lembar baru. Setiap halaman diberi .group (nama kelompok).
 * "Mulai dari label ke-" hanya berlaku untuk lembar pertama.
 */
function printPages(p) {
  const items = printItems();
  const per = labelsPerSheet(p);
  const start = startSlot(p);
  const col = groupColumn();
  if (!col) return paginate(items, per, start);
  const groups = groupItems(items, col);
  const label = (name) => name || t('(kosong)');
  if (state.settings.groupNewSheet !== false) {
    const pages = [];
    for (const g of groups) {
      for (const pg of paginate(g.items, per, pages.length ? 0 : start)) {
        pg.group = label(g.name);
        pages.push(pg);
      }
    }
    return pages;
  }
  const pages = paginate(groups.flatMap((g) => g.items), per, start);
  for (const pg of pages) pg.group = [...new Set(pg.map(({ item }) => label(groupName(item, col))))].join(', ');
  return pages;
}

/** Isi pilihan "Kelompokkan per" & "Cetak kelompok" sesuai data sekarang. */
function renderGroupOptions() {
  const cols = state.table.columns;
  const col = groupColumn();
  const sel = $('#opt-group');
  sel.innerHTML = `<option value="">${escapeHtml(t('— tidak dikelompokkan —'))}</option>`
    + cols.map((c) => `<option value="${escapeHtml(c)}"${c === col ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
  $('#opt-group-extra').hidden = !col;
  if (!col) return;
  $('#opt-group-new').checked = state.settings.groupNewSheet !== false;
  const all = expandRows(state.table);
  const groups = groupItems(all, col);
  if (state.settings.groupOnly && !groups.some((g) => g.name === state.settings.groupOnly)) state.settings.groupOnly = '';
  const only = $('#opt-group-only');
  only.innerHTML = `<option value="">${escapeHtml(t('Semua kelompok'))} (${groups.length})</option>`
    + groups.map((g) => `<option value="${escapeHtml(g.name)}"${g.name === state.settings.groupOnly ? ' selected' : ''}>${escapeHtml(g.name || t('(kosong)'))} — ${g.items.length.toLocaleString('id-ID')} ${unit(g.items.length, 'label')}</option>`).join('');
}

function updateGroupSetting(patch) {
  Object.assign(state.settings, patch);
  persistSettings();
  state.page = 0;
  renderGroupOptions();
  renderPreview();
  renderStats();
  renderDataSummary();
}
$('#opt-group').addEventListener('change', (e) => updateGroupSetting({ groupBy: e.target.value, groupOnly: '' }));
$('#opt-group-new').addEventListener('change', (e) => updateGroupSetting({ groupNewSheet: e.target.checked }));
$('#opt-group-only').addEventListener('change', (e) => updateGroupSetting({ groupOnly: e.target.value }));

const startSlot = (p) => Math.min(Math.max(0, Math.round(Number(state.settings.startSlot)) || 0), Math.max(0, labelsPerSheet(p) - 1));

/** Rentang lembar yang dicetak (1-based, inklusif). */
function sheetRange(total) {
  const from = Math.min(Math.max(1, Math.round(Number(state.settings.rangeFrom)) || 1), Math.max(1, total));
  const to = Math.min(Math.max(from, Math.round(Number(state.settings.rangeTo)) || total), total);
  return { from, to, all: from === 1 && to === total };
}

const persistPresets = () => savePresets(state.presets);
const persistSettings = () => saveSettings(state.settings);

/* ---------------- Ukuran label ---------------- */

function selectPreset(id) {
  state.settings.presetId = id;
  state.page = 0;
  persistSettings();
  // tata letak isi mengikuti ukuran label (disimpan per ukuran; ukuran baru disesuaikan otomatis)
  const layout = syncTemplateLayout();
  renderAll();
  if (layout === 'adapted') toast('Tata letak isi disesuaikan otomatis dengan ukuran label ini. Tata letak ukuran sebelumnya tetap tersimpan.');
  else if (layout === 'restored') toast('Memakai tata letak yang tersimpan untuk ukuran label ini.');
}

const PRESET_GROUPS = [
  { label: 'Nomor standar: Tom & Jerry, Koala, Fox, ABC, VOS, dll. (lembar 165 × 210 mm)', test: (p) => isBuiltin(p) && p.id.startsWith('tj-') },
  { label: 'Varian merek (ukuran sedikit berbeda)', test: (p) => isBuiltin(p) && /^(koala|fox|abc)-/.test(p.id) },
  { label: 'A4 generik', test: (p) => isBuiltin(p) && p.id.startsWith('a4-') },
  { label: 'Ukuran custom', test: (p) => !isBuiltin(p) },
];

function renderPresetSelect() {
  const cur = currentPreset();
  const groups = PRESET_GROUPS.map(({ label, test }) => {
    const items = state.presets.filter(test);
    if (!items.length) return null;
    const og = document.createElement('optgroup');
    og.label = label;
    og.append(...items.map((p) => new Option(p.nama, p.id, false, p.id === cur.id)));
    return og;
  }).filter(Boolean);
  $('#preset-select').replaceChildren(...groups);
}

function renderPresetForm() {
  const p = currentPreset();
  const form = $('#preset-form');
  form.replaceChildren();
  let group;
  for (const f of FIELDS) {
    if (f.group !== group) {
      group = f.group;
      const title = document.createElement('div');
      title.className = 'form-group-title';
      title.textContent = group;
      form.append(title);
    }
    const label = document.createElement('label');
    label.className = 'field' + (f.type === 'text' ? ' field--wide' : '');
    const caption = document.createElement('span');
    caption.textContent = f.label;

    const input = document.createElement('input');
    input.dataset.key = f.key;
    input.value = p[f.key];
    if (f.type === 'text') {
      input.type = 'text';
      label.append(caption, input);
    } else if (f.type === 'check') {
      input.type = 'checkbox';
      input.checked = !!p[f.key];
      label.className = 'field field--check';
      label.append(input, caption);
    } else {
      input.type = 'number';
      input.step = f.int ? '1' : '0.1';
      if (f.int) input.min = '1';
      const wrap = document.createElement('div');
      wrap.className = 'input-unit';
      wrap.append(input);
      if (f.unit) {
        const unit = document.createElement('em');
        unit.textContent = f.unit;
        wrap.append(unit);
      }
      label.append(caption, wrap);
    }
    form.append(label);
  }
}

function renderSummary() {
  const p = currentPreset();
  $('#btn-preset-default').hidden = !isBuiltin(p);
  $('#preset-summary').innerHTML =
    `<b>${labelsPerSheet(p)}</b> label/lembar (${p.kolom} × ${p.baris}) · label <b>${fmt(p.lebar)} × ${fmt(p.tinggi)}</b> mm ` +
    `· kertas ${fmt(p.kertasLebar)} × ${fmt(p.kertasTinggi)} mm`;
  $('#meta-size').textContent = shortName(p.nama);
  renderStats();
}

const shortName = (nama) => nama.split(' — ')[0];

/** Ringkasan di header: jumlah label, lembar, ukuran. */
function renderStats() {
  const p = currentPreset();
  const labels = printItems().length;
  const sheets = labels && labelsPerSheet(p) ? printPages(p).length : 0;
  const range = sheetRange(sheets);
  $('#stats').innerHTML =
    `<span class="stat"><b>${labels.toLocaleString('id-ID')}</b> ${unit(labels, 'label')}</span>` +
    `<span class="stat"><b>${sheets.toLocaleString('id-ID')}</b> ${unit(sheets, 'lembar')}</span>` +
    (sheets && !range.all ? `<span class="stat">${t('cetak lembar')} <b>${range.from}–${range.to}</b></span>` : '') +
    `<span class="stat">${escapeHtml(shortName(p.nama))}</span>`;
}

const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

$('#preset-select').addEventListener('change', (e) => selectPreset(e.target.value));

$('#preset-form').addEventListener('input', (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  const f = FIELDS.find((x) => x.key === key);
  const p = currentPreset();
  if (f.type === 'check') {
    p[key] = e.target.checked;
  } else if (f.type === 'text') {
    p.nama = e.target.value;
    $('#preset-select').selectedOptions[0].textContent = p.nama || '(tanpa nama)';
  } else {
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (!Number.isFinite(v)) return; // biarkan pengguna selesai mengetik
    p[key] = f.int ? Math.max(1, Math.round(v)) : v;
  }
  persistPresets();
  state.page = 0;
  renderSummary();
  renderPreview();
});

$('#btn-preset-new').addEventListener('click', () => {
  const p = blankPreset();
  state.presets.push(p);
  persistPresets();
  selectPreset(p.id);
  $('#preset-details').open = true;
  toast('Ukuran baru ditambahkan. Silakan isi ukurannya.');
});

$('#btn-preset-dup').addEventListener('click', () => {
  const src = currentPreset();
  const p = { ...structuredClone(src), id: newId(), nama: `${src.nama} (salinan)` };
  state.presets.splice(state.presets.indexOf(src) + 1, 0, p);
  persistPresets();
  selectPreset(p.id);
  toast('Ukuran diduplikat.');
});

$('#btn-preset-del').addEventListener('click', () => {
  if (state.presets.length <= 1) return toast('Minimal harus ada satu ukuran.', 'error');
  const p = currentPreset();
  if (!confirm(t(`Hapus ukuran "${p.nama}"?`))) return;
  const idx = state.presets.indexOf(p);
  state.presets.splice(idx, 1);
  persistPresets();
  selectPreset(state.presets[Math.max(0, idx - 1)].id);
});

$('#btn-preset-default').addEventListener('click', () => {
  const p = currentPreset();
  const def = DEFAULT_PRESETS.find((d) => d.id === p.id);
  if (!def) return;
  if (!confirm(t(`Kembalikan "${p.nama}" ke nilai bawaan? Ukuran, margin, dan jarak yang sudah Anda ubah untuk ukuran ini akan hilang.`))) return;
  Object.assign(p, normalizePreset(def));
  persistPresets();
  renderAll();
  toast('Ukuran dikembalikan ke nilai bawaan.');
});

$('#btn-center').addEventListener('click', () => {
  const p = currentPreset();
  Object.assign(p, centerMargins(p));
  persistPresets();
  renderAll();
});

$('#btn-export').addEventListener('click', () => exportPresetsFile(state.presets));
$('#btn-import').addEventListener('click', () => $('#file-import').click());
$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const incoming = parsePresetsFile(await file.text());
    state.presets = mergePresets(state.presets, incoming);
    persistPresets();
    renderAll();
    toast(`${incoming.length} ukuran berhasil diimport.`);
  } catch (err) {
    toast(`Import gagal: ${err.message}`, 'error');
  }
});

$('#btn-reset').addEventListener('click', () => {
  if (!confirm(t('Kembalikan semua preset bawaan ke nilai awal? Perubahan pada preset bawaan akan hilang.'))) return;
  state.presets = resetBuiltins(state.presets);
  persistPresets();
  renderAll();
  toast('Preset bawaan dikembalikan.');
});

/* ---------------- Kalibrasi ---------------- */

function renderCalibration() {
  $('#cal-x').value = state.settings.offsetX;
  $('#cal-y').value = state.settings.offsetY;
  renderCalibrationMeta();
}

function renderCalibrationMeta() {
  const { offsetX, offsetY } = calibration();
  $('#meta-print').dataset.offset = offsetX || offsetY ? `offset ${fmt(offsetX)} / ${fmt(offsetY)} mm` : '';
  renderMedia();
}

for (const [id, key] of [['#cal-x', 'offsetX'], ['#cal-y', 'offsetY']]) {
  $(id).addEventListener('input', (e) => {
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (!Number.isFinite(v) && e.target.value !== '') return;
    state.settings[key] = Number.isFinite(v) ? v : 0;
    persistSettings();
    renderCalibrationMeta();
    renderPreview();
  });
}

$('#btn-cal-reset').addEventListener('click', () => {
  state.settings.offsetX = 0;
  state.settings.offsetY = 0;
  persistSettings();
  renderCalibration();
  renderPreview();
});

/* ---------------- Data ---------------- */

const refreshTable = () => {
  renderDataTable($('#data-table'), state.table, state.dataFilter, state.sort, state.dataPredicate?.fn);
  // "Cetak hanya yang tampil": muncul saat tabel sedang dicari/difilter
  const filtered = !!state.dataFilter.trim() || !!state.dataPredicate;
  const shown = $('#data-table').querySelectorAll('tr[data-id]').length;
  $('#btn-only-visible').hidden = !filtered || !shown;
  $('#btn-only-visible-text').textContent = `${t('Cetak hanya yang tampil')} (${shown.toLocaleString('id-ID')})`;
  const pred = $('#data-pred');
  pred.hidden = !state.dataPredicate;
  if (state.dataPredicate) {
    pred.innerHTML = `Menampilkan: <b>${escapeHtml(state.dataPredicate.label)}</b> <button type="button" class="link" id="data-pred-clear">Tampilkan semua</button>`;
  }
};

$('#data-pred').addEventListener('click', (e) => {
  if (!e.target.closest('#data-pred-clear')) return;
  state.dataPredicate = null;
  refreshTable();
});

/* ---------------- Cetak hanya baris tertentu (hasil cari / filter) ---------------- */

/** Centang hanya baris dengan id di `ids`; baris lain tidak dicetak. Bisa diurungkan. */
function checkOnly(ids) {
  if (!ids.size) return toast(t('Tidak ada baris yang cocok.'), 'error');
  snapshot(t('centang hasil filter'));
  for (const r of state.table.rows) r.on = ids.has(r.id);
  saveTable(state.table);
  state.page = 0;
  refreshTable();
  renderDataSummary();
  renderStats();
  if (state.tab === 'preview') renderPreview();
  toast(t(`${ids.size} baris dicentang untuk dicetak; baris lain tidak dicetak (Urungkan di tab Data untuk membatalkan).`));
}

$('#btn-only-visible').addEventListener('click', () => {
  checkOnly(new Set([...$('#data-table').querySelectorAll('tr[data-id]')].map((tr) => tr.dataset.id)));
});

/* ---------------- Urungkan (Undo) untuk data ---------------- */

const UNDO_LIMIT = 30;
function snapshot(label) {
  state.undo.push({ label, table: structuredClone(state.table) });
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
  syncUndoButton();
}

function syncUndoButton() {
  const last = state.undo[state.undo.length - 1];
  $('#btn-undo').disabled = !last;
  $('#btn-undo').title = last ? `Urungkan: ${last.label} (Ctrl+Z)` : 'Belum ada perubahan untuk diurungkan';
}

function undo() {
  const last = state.undo.pop();
  syncUndoButton();
  if (!last) return toast('Tidak ada yang bisa diurungkan.');
  state.table = last.table;
  saveTable(state.table);
  refreshTable();
  renderDataSummary();
  renderColumns();
  if (state.tab === 'preview') renderPreview();
  toast(`Diurungkan: ${last.label}.`);
}

$('#btn-undo').addEventListener('click', undo);
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  // di dalam kotak isian, biarkan Ctrl+Z bawaan browser (urungkan ketikan)
  if (e.target.closest('input, textarea, select') || document.querySelector('dialog[open]')) return;
  if (state.tab !== 'data' || !state.undo.length) return;
  e.preventDefault();
  undo();
});

/* ---------------- Peringatan data ---------------- */

const KEY_COLUMN = /^(nim|nis|nisn|nik|nip|id|kode|code|no_?peserta|no_?ujian|sku|barcode)$/;

/** Kolom kunci untuk cek data ganda: kolom barcode/QR, atau kolom bernama NIM/NIS/ID/kode. */
function keyColumn() {
  const tpl = currentTemplate();
  const cols = state.table.columns;
  if (tpl.code.type !== 'none' && tpl.code.source !== 'text' && cols.includes(tpl.code.column)) return tpl.code.column;
  return cols.find((c) => KEY_COLUMN.test(normColumn(c))) ?? null;
}

function dataWarnings() {
  const { columns, rows } = state.table;
  if (!columns.length) return [];
  const active = rows.filter((r) => r.on);
  const tpl = currentTemplate();
  const used = new Set(usedColumns(tpl, columns));
  if (tpl.code.type !== 'none' && tpl.code.source !== 'text' && columns.includes(tpl.code.column)) used.add(tpl.code.column);
  const warnings = [];
  for (const col of used) {
    const empty = active.filter((r) => !String(r.values[col] ?? '').trim()).length;
    if (empty) {
      warnings.push({
        text: `${empty.toLocaleString('id-ID')} baris dicentang dengan kolom "${col}" kosong`,
        label: `baris dengan "${col}" kosong`,
        fn: (r) => !String(r.values[col] ?? '').trim(),
      });
    }
  }
  const phCol = tpl.photo.column;
  if (phCol && columns.includes(phCol)) {
    const missing = active.filter((r) => !photoUrl(r.values[phCol])).length;
    if (missing) {
      warnings.push({
        text: `${missing.toLocaleString('id-ID')} baris dicentang belum punya foto (dicocokkan lewat "${phCol}")`,
        label: 'baris tanpa foto',
        fn: (r) => !photoUrl(r.values[phCol]),
      });
    }
  }
  const key = keyColumn();
  if (key) {
    const count = new Map();
    for (const r of active) {
      const v = String(r.values[key] ?? '').trim();
      if (v) count.set(v, (count.get(v) ?? 0) + 1);
    }
    const dups = [...count].filter(([, n]) => n > 1).map(([v]) => v);
    if (dups.length) {
      const set = new Set(dups);
      const sample = dups.slice(0, 4).join(', ') + (dups.length > 4 ? ', …' : '');
      warnings.push({
        text: `${dups.length.toLocaleString('id-ID')} nilai "${key}" ganda (${sample})`,
        label: `"${key}" ganda`,
        fn: (r) => set.has(String(r.values[key] ?? '').trim()),
      });
    }
  }
  return warnings;
}

function renderDataWarnings() {
  const list = dataWarnings();
  state.warnings = list;
  $('#data-warn').innerHTML = list.map((w, i) => `
    <div class="alert alert--warn data-warn-item">⚠️ ${escapeHtml(w.text)}
      <button type="button" class="link" data-warn="${i}">Tampilkan</button></div>`).join('');
}

$('#data-warn').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-warn]');
  if (!btn) return;
  const w = state.warnings[Number(btn.dataset.warn)];
  state.dataPredicate = { label: w.label, fn: w.fn };
  refreshTable();
});

$('#data-search').addEventListener('input', (e) => {
  state.dataFilter = e.target.value;
  refreshTable();
});

let saveTimer;
function persistTable() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveTable(state.table), 300);
}

function renderDataSummary() {
  renderBackupReminder();
  renderGroupOptions(); // daftar kelompok cetak ikut data terbaru
  const { columns, rows } = state.table;
  const on = rows.filter((r) => r.on).length;
  const labels = printItems().length;
  const n = (v) => v.toLocaleString('id-ID');
  if (columns.length) {
    const rowsWord = unit(rows.length, 'baris');
    $('#data-summary').innerHTML = `<b>${n(rows.length)}</b> ${rowsWord} · <b>${n(on)}</b> ${t('dicentang')} · <b>${n(labels)}</b> ${unit(labels, 'label')} ${t('akan dicetak')}`;
    $('#data-info').textContent = `${n(rows.length)} ${rowsWord} · ${n(on)} ${t('dicentang')} · ${n(labels)} ${unit(labels, 'label')}`;
    $('#meta-data').textContent = `${n(rows.length)} ${rowsWord}`;
  } else {
    $('#data-summary').textContent = 'Belum ada data.';
    $('#data-info').textContent = '';
    $('#meta-data').textContent = 'belum ada data';
  }
  $('#data-count').textContent = rows.length ? n(rows.length) : '';
  renderDataWarnings();
  renderStats();
}

mountDataTable($('#data-table'), () => state.table, sortTable, (structural) => {
  if (structural) refreshTable();
  persistTable();
  renderDataSummary();
}, snapshot);

function setTable(table, message, undoLabel = 'import data') {
  if (state.table.columns.length) snapshot(undoLabel);
  state.table = table;
  state.dataPredicate = null;
  saveTable(table);
  state.page = 0;
  state.previewMode = 'data';
  refreshTable();
  renderDataSummary();
  renderColumns();
  renderPreviewMode();
  showTab('data');
  toast(message);
}

function importText(text, source) {
  if (state.table.rows.length && !confirm(t('Data yang ada sekarang akan diganti. Lanjutkan?'))) return;
  try {
    const { columns, rows, delimiter } = parseTable(text);
    const sep = { ',': 'koma', ';': 'titik koma', '\t': 'tab', '|': 'garis tegak' }[delimiter] ?? delimiter;
    setTable({ columns, rows }, `${rows.length} baris diimport dari ${source} (pemisah: ${sep}).`);
  } catch (err) {
    toast(`Import gagal: ${err.message}`, 'error');
  }
}

async function importExcel(file) {
  if (state.table.rows.length && !confirm(t('Data yang ada sekarang akan diganti. Lanjutkan?'))) return;
  try {
    const { columns, rows, sheet, sheetCount } = parseWorkbook(await file.arrayBuffer());
    const from = sheetCount > 1 ? ` (sheet "${sheet}")` : '';
    setTable({ columns, rows }, `${rows.length} baris diimport dari ${file.name}${from}.`);
  } catch (err) {
    toast(`Import Excel gagal: ${err.message}`, 'error');
  }
}

for (const id of ['#btn-csv', '#btn-csv-2']) {
  $(id).addEventListener('click', () => $('#file-csv').click());
}
$('#file-csv').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (isExcelFile(file)) importExcel(file);
  else importText(await readTextFile(file), file.name);
});

$('#btn-paste').addEventListener('click', () => {
  const dlg = $('#paste-dialog');
  $('#paste-text').value = '';
  dlg.returnValue = '';
  dlg.showModal();
});
$('#paste-dialog').addEventListener('close', () => {
  const text = $('#paste-text').value;
  if ($('#paste-dialog').returnValue === 'ok' && text.trim()) importText(text, 'paste');
});

$('#btn-sample').addEventListener('click', downloadSampleCsv);
$('#btn-sample-xlsx').addEventListener('click', downloadSampleXlsx);
$('#btn-export-csv').addEventListener('click', () => {
  if (!state.table.columns.length) return toast('Belum ada data untuk diexport.', 'error');
  exportTableCsv(state.table);
});
$('#btn-export-xlsx').addEventListener('click', () => {
  if (!state.table.columns.length) return toast('Belum ada data untuk diexport.', 'error');
  exportTableXlsx(state.table);
});

/* Urutkan data dengan klik judul kolom: naik → turun. Urutan baru dipakai saat mencetak. */
const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });
function sortTable(col) {
  const dir = state.sort?.col === col && state.sort.dir === 'asc' ? 'desc' : 'asc';
  snapshot(`urutkan "${col}"`);
  state.sort = { col, dir };
  const sign = dir === 'asc' ? 1 : -1;
  state.table.rows.sort((a, b) => sign * collator.compare(String(a.values[col] ?? ''), String(b.values[col] ?? '')));
  saveTable(state.table);
  refreshTable();
  toast(`Data diurutkan menurut "${col}" (${dir === 'asc' ? 'A→Z / 1→9' : 'Z→A / 9→1'}).`);
}

$('#btn-data-clear').addEventListener('click', () => {
  if (!state.table.columns.length || !confirm(t('Hapus semua data?'))) return;
  setTable({ columns: [], rows: [] }, 'Data dikosongkan. Klik Urungkan untuk mengembalikan.', 'kosongkan data');
});

$('#btn-row-add').addEventListener('click', () => {
  if (!state.table.columns.length) return toast('Tambahkan kolom terlebih dahulu.', 'error');
  snapshot('tambah baris');
  addRow(state.table);
  saveTable(state.table);
  refreshTable();
  renderDataSummary();
  const inputs = $('#data-table').querySelectorAll('tbody tr:last-child .cell-input');
  inputs[0]?.focus();
});

$('#btn-col-add').addEventListener('click', () => {
  const name = prompt(t('Nama kolom baru (mis. nama, alamat, telepon, jumlah):'));
  if (name == null) return;
  snapshot('tambah kolom');
  addColumn(state.table, name);
  saveTable(state.table);
  renderColumns();
  refreshTable();
  renderDataSummary();
});

/* ---------------- Generator QR / Barcode ---------------- */

mountGenerator({
  getTable: () => state.table,
  /** values: Map(baris → kode). Kolom dibuat bila belum ada; bisa diurungkan. */
  fillColumn(col, values, useForLabel) {
    snapshot(`isi kolom "${col}"`);
    if (!state.table.columns.includes(col)) addColumn(state.table, col);
    for (const [row, code] of values) row.values[col] = code;
    saveTable(state.table);
    renderColumns();
    refreshTable();
    renderDataSummary();
    if (useForLabel) useCodeColumn(col);
    else if (state.tab === 'preview') renderPreview();
  },
});
$('#btn-gen-open').addEventListener('click', () => openGenerator('single'));
$('#btn-gen-open-2').addEventListener('click', () => openGenerator('fill'));

/* ---------------- Tab ---------------- */

function showTab(tab) {
  state.tab = tab;
  for (const btn of document.querySelectorAll('.tab[data-tab]')) btn.classList.toggle('tab--active', btn.dataset.tab === tab);
  $('#view-preview').hidden = tab !== 'preview';
  $('#view-data').hidden = tab !== 'data';
  $('#preview-controls').hidden = tab !== 'preview';
  if (tab === 'preview') renderPreview();
  syncLineToolbar();
}

for (const btn of document.querySelectorAll('.tab[data-tab]')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

/* ---------------- Preview ---------------- */

function prepareData(p) {
  const items = printItems();
  const pages = printPages(p);
  const order = new Map(state.table.rows.map((r, i) => [r, i + 1]));
  const renderer = createLabelRenderer(currentTemplate(), p, state.table.columns, items, { rowNo: (r) => order.get(r) ?? '' });
  return { pages, renderer };
}

/** Halaman label siap cetak. preview=true menambah kotak kosong/terpakai yang bisa diklik. */
function dataSheets(p, pages, renderer, { preview = false } = {}) {
  const { page, cal } = placement(p);
  const sheets = buildDataSheets(p, cal, page, pages, renderer.render);
  if (state.settings.printBorder) {
    for (const el of sheets.flatMap((s) => [...s.querySelectorAll('.label')])) el.classList.add('label--border');
  }
  if (preview) decorateSlots(p, cal, pages, sheets);
  return sheets;
}

function decorateSlots(p, cal, pages, sheets) {
  const per = labelsPerSheet(p);
  const start = startSlot(p);
  sheets.forEach((sheet, i) => {
    const filled = new Set(pages[i].map((x) => x.slot));
    for (let slot = 0; slot < per; slot++) {
      if (filled.has(slot)) continue;
      const used = i === 0 && slot < start;
      const el = placeLabel(sheet, p, cal, slot, `label ${used ? 'label--used' : 'label--empty'}`);
      el.textContent = used ? 'terpakai' : 'kosong';
    }
    // nama kelompok di pojok lembar (hanya di layar)
    if (pages[i].group != null) {
      const tag = document.createElement('div');
      tag.className = 'sheet-group-tag';
      tag.textContent = `${t('Kelompok')}: ${pages[i].group}`;
      sheet.append(tag);
    }
    if (i !== 0) return;
    for (const el of sheet.querySelectorAll('.label')) el.classList.add('label--slot');
    const startEl = start > 0 && sheet.querySelector(`.label[data-slot="${start}"]`);
    if (startEl) {
      startEl.classList.add('label--start');
      startEl.insertAdjacentHTML('beforeend', '<span class="start-tag">Mulai</span>');
    }
  });
}

function refreshSearchHits() {
  const s = state.search;
  if (!s.q.trim()) return;
  const current = s.hits[s.idx];
  s.hits = state.previewMode === 'data' ? findHits(s.q) : [];
  const same = current ? s.hits.findIndex((h) => h.page === current.page && h.slot === current.slot) : -1;
  s.idx = same >= 0 ? same : Math.min(s.idx, Math.max(0, s.hits.length - 1));
}

function buildSheets(p) {
  refreshSearchHits();
  if (state.previewMode === 'test') {
    const { page, cal } = placement(p);
    return [buildTestSheet(p, cal, page)];
  }
  const { pages, renderer } = prepareData(p);
  return dataSheets(p, pages, renderer, { preview: true });
}

/** Garis lembar label di atas kertas printer (hanya di preview). */
function addPaperOutline(sheet, p) {
  const page = pageFor(p);
  if (page.mode === 'label') return;
  const el = document.createElement('div');
  el.className = 'paper-outline' + (page.dy < 6 ? ' paper-outline--top' : '');
  Object.assign(el.style, {
    left: `${page.dx}mm`, top: `${page.dy}mm`, width: `${p.kertasLebar}mm`, height: `${p.kertasTinggi}mm`,
  });
  el.innerHTML = `<span>Lembar label ${fmt(p.kertasLebar)} × ${fmt(p.kertasTinggi)} mm di atas kertas ${pageSizeName(page)}</span>`;
  sheet.prepend(el);
}

function renderPreviewMode() {
  $('#preview-mode').value = state.previewMode;
}

$('#preview-mode').addEventListener('change', (e) => {
  state.previewMode = e.target.value;
  state.page = 0;
  renderPreview();
});

function renderAlerts(errors, warnings) {
  const box = $('#alerts');
  box.replaceChildren(
    ...errors.map((m) => alertEl(m, 'error')),
    ...warnings.map((m) => alertEl(m, 'warn')),
  );
}

function alertEl(message, kind) {
  const el = document.createElement('div');
  el.className = `alert alert--${kind}`;
  el.textContent = (kind === 'error' ? '⛔ ' : '⚠️ ') + message;
  return el;
}

function renderPreview() {
  const p = currentPreset();
  const { errors, warnings } = checkFit(p, calibration());

  const page = pageFor(p);
  if (p.kertasLebar > page.pageW + 0.05 || p.kertasTinggi > page.pageH + 0.05) {
    warnings.push(`Lembar label (${fmt(p.kertasLebar)} × ${fmt(p.kertasTinggi)} mm) lebih besar dari kertas printer (${pageSizeName(page)}). Periksa pengaturan "Kertas di printer".`);
  }
  renderAlerts(errors, warnings);

  const area = $('#preview');
  const sheets = errors.length ? [] : buildSheets(p);
  state.page = Math.min(state.page, Math.max(0, sheets.length - 1));
  const input = $('#pg-input');
  input.max = Math.max(1, sheets.length);
  if (!pageTyping) input.value = sheets.length ? state.page + 1 : '';
  input.disabled = sheets.length <= 1;
  $('#pg-total').textContent = `/ ${sheets.length.toLocaleString('id-ID')}`;
  $('#pg-prev').disabled = state.page <= 0;
  $('#pg-next').disabled = state.page >= sheets.length - 1;
  renderSearchInfo();
  if (!sheets.length) {
    if (errors.length) return area.replaceChildren();
    area.innerHTML = '<div class="empty">Belum ada label untuk dicetak. Import data atau centang baris di tab <b>Data</b>.</div>';
    return;
  }

  const sheet = sheets[state.page];
  sheet.classList.add('sheet--preview');
  addPaperOutline(sheet, p);
  markSearchHits(sheet);
  const landscape = isLandscape();
  // kotak tampilan: landscape = lebar & tinggi kertas ditukar
  const wPx = (landscape ? page.pageH : page.pageW) * MM_TO_PX;
  const hPx = (landscape ? page.pageW : page.pageH) * MM_TO_PX;
  const scale = state.zoom === 'fit'
    ? Math.max(0.1, Math.min((area.clientWidth - 48) / wPx, (area.clientHeight - 48) / hPx))
    : Number(state.zoom);
  sheet.style.transform = landscape
    ? `translate(${wPx * scale}px, 0) rotate(90deg) scale(${scale})`
    : `scale(${scale})`;
  state.previewScale = scale;
  const sel = getSelectedDecal();
  if (sel) for (const el of sheet.querySelectorAll(`.label-decal[data-decal="${sel}"]`)) el.classList.add('is-selected');
  const selLine = getSelectedLine();
  if (selLine != null) for (const el of sheet.querySelectorAll(`.label-line[data-line="${selLine}"]`)) el.classList.add('is-selected');
  const selFree = getSelectedFree();
  if (selFree) for (const el of sheet.querySelectorAll(`.label-free[data-free="${selFree}"]`)) el.classList.add('is-selected');
  const selShape = getSelectedShape();
  if (selShape) for (const el of sheet.querySelectorAll(`.label-shape[data-shape="${selShape}"]`)) el.classList.add('is-selected');
  if (codeSelected) for (const el of sheet.querySelectorAll('.label-code')) el.classList.add('is-selected');

  const frame = document.createElement('div');
  frame.className = 'sheet-frame';
  frame.style.width = `${wPx * scale}px`;
  frame.style.height = `${hPx * scale}px`;
  frame.append(sheet);
  area.replaceChildren(frame);
  syncLineToolbar();
}

/* ---------------- Geser gambar bebas (branding) di preview ---------------- */

let decalDrag = null;
let suppressClick = false;

/** Geseran mouse di layar (px) → geseran dalam koordinat isi label (mm), memperhitungkan zoom & rotasi. */
function screenToContent(dxPx, dyPx) {
  const k = MM_TO_PX * (state.previewScale || 1);
  const dx = dxPx / k;
  const dy = dyPx / k;
  const o = screenRotation();
  if (o === 90) return { du: dy, dv: -dx };
  if (o === 270) return { du: -dy, dv: dx };
  if (o === 180) return { du: -dx, dv: -dy };
  return { du: dx, dv: dy };
}

$('#preview').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.label-decal');
  if (!el || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const id = el.dataset.decal;
  const d = currentTemplate().decals.find((x) => x.id === id);
  if (!d) return;
  selectedSlot = el.closest('.label')?.dataset.slot ?? null;
  selectLine(null);
  selectCode(false);
  selectDecal(id);
  decalDrag = {
    id, resize: !!e.target.closest('.decal-handle'),
    sx: e.clientX, sy: e.clientY, x: d.x, y: d.y, width: d.width, ratio: d.h / d.w, moved: false,
  };
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // event sintetis tanpa pointer aktif
  }
  document.body.classList.add('is-dragging');
});

$('#preview').addEventListener('pointermove', (e) => {
  if (!decalDrag) return;
  const { du, dv } = screenToContent(e.clientX - decalDrag.sx, e.clientY - decalDrag.sy);
  const snap = (n) => Math.round(n * 2) / 2; // per 0,5 mm
  // gambar dijaga tetap di dalam label agar pegangan ubah-ukuran selalu bisa diraih
  const box = contentBox(currentTemplate(), currentPreset());
  const clamp = (v, max) => Math.min(Math.max(0, v), Math.max(0, max));
  if (decalDrag.resize) {
    const maxW = Math.min(box.w - decalDrag.x, (box.h - decalDrag.y) / decalDrag.ratio);
    decalDrag.next = { width: Math.max(2, Math.min(snap(decalDrag.width + du), maxW)) };
  } else {
    const h = decalDrag.width * decalDrag.ratio;
    decalDrag.next = {
      x: clamp(snap(decalDrag.x + du), box.w - decalDrag.width),
      y: clamp(snap(decalDrag.y + dv), box.h - h),
    };
  }
  decalDrag.moved = true;
  // perbarui semua label di lembar ini secara langsung (tanpa render ulang) agar halus
  const d = { x: decalDrag.x, y: decalDrag.y, width: decalDrag.width, ...decalDrag.next };
  for (const box of document.querySelectorAll(`#preview .label-decal[data-decal="${decalDrag.id}"]`)) {
    box.style.left = `${d.x}mm`;
    box.style.top = `${d.y}mm`;
    box.style.width = `${d.width}mm`;
    box.style.height = `${d.width * decalDrag.ratio}mm`;
  }
});

function endDecalDrag() {
  if (!decalDrag) return;
  const { id, next, moved } = decalDrag;
  decalDrag = null;
  document.body.classList.remove('is-dragging');
  if (moved) {
    suppressClick = true; // jangan anggap sebagai klik "mulai dari label ke-"
    setTimeout(() => { suppressClick = false; }, 0);
    if (next) updateDecal(id, next);
  }
}
$('#preview').addEventListener('pointerup', endDecalDrag);
$('#preview').addEventListener('pointercancel', endDecalDrag);

/* ---------------- Geser baris teks di preview (dengan snap & garis bantu) ---------------- */

const SNAP_PX = 7; // jarak tarik (px di layar) untuk menempel ke garis bantu
let lineDrag = null;
let selectedSlot = null; // label tempat baris dipilih (posisi toolbar mini)

/** Baris terpilih di label yang terakhir diklik (atau label pertama) untuk menempatkan toolbar mini. */
function selectedLineEl() {
  const i = getSelectedLine();
  if (i == null || state.tab !== 'preview') return null;
  const sel = `.label-line[data-line="${i}"]`;
  return $(`#preview .label[data-slot="${selectedSlot}"] ${sel}`) ?? $(`#preview ${sel}`);
}

document.addEventListener('lineselect', () => syncLineToolbar());

/**
 * Kotak tulisan sebuah baris dalam koordinat isi label (mm, sebelum diputar),
 * diukur dari teks yang benar-benar tampil (bukan selebar kotak teks).
 */
function lineRect(el) {
  const label = el.closest('.label');
  const range = document.createRange();
  // teks bebas: ukur tulisannya saja (tanpa pegangan putar)
  range.selectNodeContents(el.classList.contains('label-free') && el.firstChild?.nodeType === Node.TEXT_NODE ? el.firstChild : el);
  const r = range.getBoundingClientRect();
  const L = label.getBoundingClientRect();
  const k = MM_TO_PX * (state.previewScale || 1);
  const box = contentBox(currentTemplate(), currentPreset());
  const o = screenRotation();
  const x = (r.left - L.left) / k;
  const y = (r.top - L.top) / k;
  const w = r.width / k;
  const h = r.height / k;
  if (o === 90) return { u: y, v: box.h - (x + w), w: h, h: w };
  if (o === 270) return { u: box.w - (y + h), v: x, w: h, h: w };
  if (o === 180) return { u: box.w - (x + w), v: box.h - (y + h), w, h };
  return { u: x, v: y, w, h };
}

/** Snap di satu sumbu: target terdekat untuk tepi awal/tengah/akhir tulisan, atau null. */
function snapAxis(start, size, targets, threshold) {
  let best = null;
  for (const f of [0, 0.5, 1]) {
    const pos = start + size * f;
    for (const t of targets) {
      const dist = Math.abs(t.at - pos);
      if (dist <= threshold && (!best || dist < best.dist - 1e-6)) best = { dist, shift: t.at - pos, at: t.at, kind: t.kind };
    }
  }
  return best;
}

function drawGuides(content, guides) {
  for (const g of content.querySelectorAll('.snap-guide')) g.remove();
  for (const g of guides) {
    const el = document.createElement('div');
    el.className = `snap-guide snap-guide--${g.axis}${g.kind === 'center' ? ' snap-guide--center' : ''}`;
    if (g.axis === 'u') el.style.left = `${g.at}mm`;
    else el.style.top = `${g.at}mm`;
    content.append(el);
  }
}

/** Perbarui semua label di lembar ini secara langsung (tanpa render ulang) agar halus. */
function setLineOffset(i, dx, dy) {
  for (const el of document.querySelectorAll(`#preview .label-line[data-line="${i}"]`)) {
    el.style.left = `${dx}mm`;
    el.style.top = `${dy}mm`;
    el.parentElement.classList.add('label-text--moved');
  }
}

$('#preview').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.sheet--preview .label-line');
  if (!el || e.button !== 0 || e.target.closest('.label-decal')) return;
  const i = Number(el.dataset.line);
  const l = currentTemplate().lines[i];
  if (!l) return;
  e.preventDefault();
  selectedSlot = el.closest('.label')?.dataset.slot ?? null;
  selectLine(i);
  selectDecal(null);
  selectCode(false);
  const content = el.closest('.label-content');
  const cur = lineRect(el);
  const natural = { ...cur, u: cur.u - l.dx, v: cur.v - l.dy };
  const { box, text } = labelGeometry(currentTemplate(), currentPreset());
  // garis bantu: tengah & tepi isi label, tepi kotak teks, serta tepi/tengah baris lain di label yang sama
  const targets = { u: [], v: [] };
  const add = (axis, at, kind) => targets[axis].push({ at, kind });
  add('u', box.w / 2, 'center');
  add('v', box.h / 2, 'center');
  for (const at of [box.pad, box.w - box.pad, text.u, text.u + text.w]) add('u', at, 'edge');
  for (const at of [box.pad, box.h - box.pad, text.v, text.v + text.h]) add('v', at, 'edge');
  for (const other of content.querySelectorAll('.label-line')) {
    if (other === el || !other.textContent.trim()) continue;
    const r = lineRect(other);
    for (const at of [r.u, r.u + r.w / 2, r.u + r.w]) add('u', at, 'line');
    for (const at of [r.v, r.v + r.h / 2, r.v + r.h]) add('v', at, 'line');
  }
  lineDrag = { i, el, content, sx: e.clientX, sy: e.clientY, dx: l.dx, dy: l.dy, natural, box, targets, moved: false };
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // event sintetis tanpa pointer aktif
  }
});

$('#preview').addEventListener('pointermove', (e) => {
  if (!lineDrag) return;
  const d = lineDrag;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return; // masih klik biasa
  if (!d.moved) {
    d.moved = true;
    document.body.classList.add('is-dragging');
    d.el.classList.add('is-dragging-line');
  }
  const { du, dv } = screenToContent(e.clientX - d.sx, e.clientY - d.sy);
  const n = d.natural;
  let dx = d.dx + du;
  let dy = d.dy + dv;
  const guides = [];
  if (e.altKey) {
    dx = Math.round(dx * 10) / 10; // tanpa snap: per 0,1 mm
    dy = Math.round(dy * 10) / 10;
  } else {
    const thr = SNAP_PX / (MM_TO_PX * (state.previewScale || 1));
    const su = snapAxis(n.u + dx, n.w, d.targets.u, thr);
    const sv = snapAxis(n.v + dy, n.h, d.targets.v, thr);
    if (su) {
      dx += su.shift;
      guides.push({ axis: 'u', at: su.at, kind: su.kind });
    } else {
      dx = Math.abs(dx) <= thr ? 0 : Math.round(dx * 2) / 2; // posisi semula juga "menempel"; selain itu per 0,5 mm
    }
    if (sv) {
      dy += sv.shift;
      guides.push({ axis: 'v', at: sv.at, kind: sv.kind });
    } else {
      dy = Math.abs(dy) <= thr ? 0 : Math.round(dy * 2) / 2;
    }
  }
  // tulisan dijaga tetap di dalam label
  dx = Math.min(Math.max(dx, -n.u), d.box.w - n.u - n.w);
  dy = Math.min(Math.max(dy, -n.v), d.box.h - n.v - n.h);
  d.next = { dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 }; // sama dengan yang disimpan
  setLineOffset(d.i, d.next.dx, d.next.dy);
  drawGuides(d.content, guides);
  showDragInfo(e, d.next);
});

/** Keterangan kecil di dekat kursor: geseran X/Y saat ini. */
function showDragInfo(e, info) {
  let tip = $('#drag-info');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'drag-info';
    document.body.append(tip);
  }
  const f = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}`;
  tip.textContent = typeof info === 'string' ? info : `X ${f(info.dx)} · Y ${f(info.dy)} mm`;
  tip.style.left = `${e.clientX + 14}px`;
  tip.style.top = `${e.clientY + 16}px`;
  tip.hidden = false;
}

function hideDragInfo() {
  const tip = $('#drag-info');
  if (tip) tip.hidden = true;
}

function endLineDrag() {
  if (!lineDrag) return;
  const { i, next, moved, content, el } = lineDrag;
  lineDrag = null;
  document.body.classList.remove('is-dragging');
  el.classList.remove('is-dragging-line');
  drawGuides(content, []);
  hideDragInfo();
  if (moved) {
    suppressClick = true; // jangan anggap sebagai klik "mulai dari label ke-"
    setTimeout(() => { suppressClick = false; }, 0);
    if (next) updateLineOffset(i, next);
  }
}
$('#preview').addEventListener('pointerup', endLineDrag);
$('#preview').addEventListener('pointercancel', endLineDrag);

/* ---------------- Geser & ubah ukuran barcode/QR di preview ---------------- */

let codeDrag = null;
let codeSelected = false;

function selectCode(on) {
  // satu objek terpilih dalam satu waktu
  if (on && getSelectedDecal()) selectDecal(null);
  if (on && getSelectedShape()) selectShape(null);
  if (on && (getSelectedLine() != null || getSelectedFree())) selectLine(null);
  codeSelected = on;
  for (const el of document.querySelectorAll('#preview .label-code')) el.classList.toggle('is-selected', on);
  syncLineToolbar();
}

/** Garis bantu untuk barcode/QR: tengah & tepi label, tepi area teks, dan tepi/tengah baris teks. */
function snapTargets(content, box, text, skip) {
  const targets = { u: [], v: [] };
  const add = (axis, at, kind) => targets[axis].push({ at, kind });
  add('u', box.w / 2, 'center');
  add('v', box.h / 2, 'center');
  for (const at of [box.pad, box.w - box.pad, text.u, text.u + text.w]) add('u', at, 'edge');
  for (const at of [box.pad, box.h - box.pad, text.v, text.v + text.h]) add('v', at, 'edge');
  for (const other of content.querySelectorAll('.label-line')) {
    if (other === skip || !other.textContent.trim()) continue;
    const r = lineRect(other);
    for (const at of [r.u, r.u + r.w / 2, r.u + r.w]) add('u', at, 'line');
    for (const at of [r.v, r.v + r.h / 2, r.v + r.h]) add('v', at, 'line');
  }
  return targets;
}

/** Terapkan posisi/ukuran ke semua barcode/QR di lembar ini secara langsung (tanpa render ulang). */
function setCodeRect(r) {
  for (const el of document.querySelectorAll('#preview .label-code')) {
    Object.assign(el.style, { left: `${r.x}mm`, top: `${r.y}mm`, width: `${r.w}mm`, height: `${r.h}mm` });
    const bars = el.querySelector('.code-bars');
    const caption = el.querySelector('.code-caption');
    if (bars && caption) {
      const cap = barcodeCaption({ h: r.h });
      bars.style.height = `${r.h - cap.height}mm`;
      caption.style.fontSize = `${cap.font}mm`;
      caption.style.height = `${cap.height}mm`;
    }
  }
}

$('#preview').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.sheet--preview .label-code');
  if (!el || e.button !== 0 || e.target.closest('.label-decal')) return;
  const tpl = currentTemplate();
  const { box, text, code } = labelGeometry(tpl, currentPreset());
  if (!code) return;
  e.preventDefault();
  e.stopPropagation();
  selectLine(null);
  selectDecal(null);
  selectCode(true);
  const content = el.closest('.label-content');
  codeDrag = {
    el, content, box,
    resize: !!e.target.closest('.code-handle'),
    square: tpl.code.type === 'qr',
    sx: e.clientX, sy: e.clientY,
    start: { x: code.u, y: code.v, w: code.w, h: code.h },
    targets: snapTargets(content, box, text, null),
    moved: false,
  };
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // event sintetis tanpa pointer aktif
  }
});

$('#preview').addEventListener('pointermove', (e) => {
  if (!codeDrag) return;
  const d = codeDrag;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
  if (!d.moved) {
    d.moved = true;
    document.body.classList.add('is-dragging');
  }
  const { du, dv } = screenToContent(e.clientX - d.sx, e.clientY - d.sy);
  const { start: s, box } = d;
  const snapHalf = (n) => (e.altKey ? Math.round(n * 10) / 10 : Math.round(n * 2) / 2);
  const guides = [];
  let next;
  if (d.resize) {
    if (d.square) {
      const max = Math.min(box.w - s.x, box.h - s.y);
      const side = Math.min(max, Math.max(4, snapHalf(s.w + (du + dv) / 2)));
      next = { x: s.x, y: s.y, w: side, h: side };
    } else {
      next = {
        x: s.x, y: s.y,
        w: Math.min(box.w - s.x, Math.max(6, snapHalf(s.w + du))),
        h: Math.min(box.h - s.y, Math.max(3, snapHalf(s.h + dv))),
      };
    }
  } else {
    let x = s.x + du;
    let y = s.y + dv;
    const thr = SNAP_PX / (MM_TO_PX * (state.previewScale || 1));
    const su = e.altKey ? null : snapAxis(x, s.w, d.targets.u, thr);
    const sv = e.altKey ? null : snapAxis(y, s.h, d.targets.v, thr);
    if (su) {
      x += su.shift;
      guides.push({ axis: 'u', at: su.at, kind: su.kind });
    } else x = snapHalf(x);
    if (sv) {
      y += sv.shift;
      guides.push({ axis: 'v', at: sv.at, kind: sv.kind });
    } else y = snapHalf(y);
    const clamp = (v, max) => Math.min(Math.max(0, v), Math.max(0, max));
    next = { x: clamp(x, box.w - s.w), y: clamp(y, box.h - s.h), w: s.w, h: s.h };
  }
  d.next = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  setCodeRect(d.next);
  drawGuides(d.content, guides);
  const f = (v) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  showDragInfo(e, d.resize
    ? (d.square ? `${f(d.next.w)} × ${f(d.next.h)} mm` : `L ${f(d.next.w)} · T ${f(d.next.h)} mm`)
    : `X ${f(d.next.x)} · Y ${f(d.next.y)} mm`);
});

function endCodeDrag() {
  if (!codeDrag) return;
  const { next, moved, content } = codeDrag;
  codeDrag = null;
  document.body.classList.remove('is-dragging');
  drawGuides(content, []);
  hideDragInfo();
  if (moved) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    // digeser = posisi bebas; teks kembali memakai seluruh area label
    if (next) updateCode({ free: true, ...next });
  }
}
$('#preview').addEventListener('pointerup', endCodeDrag);
$('#preview').addEventListener('pointercancel', endCodeDrag);

/* ---------------- Teks bebas di preview: pilih, seret (snap), panah ---------------- */

/** Tambah teks bebas dari toolbar atas (text null = teks baru): tampil di label pertama, siap diketik. */
function addTextFromToolbar(text) {
  selectedSlot = null; // toolbar mini muncul di label pertama
  addFreeText(text, { focusPanel: false });
  if (text == null) focusToolbarText();
}

const textMenu = $('#tb-text-menu');
const renderTextMenu = () => {
  textMenu.innerHTML = quickTexts(lang).map((q) => `<button type="button" role="menuitem" data-text="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
};
renderTextMenu();
document.addEventListener('langchange', renderTextMenu);
function toggleTextMenu(open) {
  textMenu.hidden = !open;
  $('#tb-text-more').setAttribute('aria-expanded', String(open));
}
$('#tb-text-add').addEventListener('click', () => addTextFromToolbar(null));
$('#tb-text-more').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleTextMenu(textMenu.hidden);
});
textMenu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-text]');
  if (!b) return;
  toggleTextMenu(false);
  addTextFromToolbar(b.dataset.text);
});
document.addEventListener('click', (e) => {
  if (!textMenu.hidden && !e.target.closest('#tb-text')) toggleTextMenu(false);
});

/* ---------------- Import dari Google Sheets ---------------- */

$('#btn-gsheet').addEventListener('click', () => {
  $('#gs-url').value = state.settings.gsheetUrl || '';
  $('#gs-error').hidden = true;
  $('#gs-dialog').showModal();
  $('#gs-url').focus();
});
$('#gs-go').addEventListener('click', async () => {
  const link = $('#gs-url').value.trim();
  const showError = (msg) => {
    $('#gs-error').textContent = t(msg);
    $('#gs-error').hidden = false;
  };
  if (!sheetCsvUrl(link)) return showError('Bukan link Google Sheets.');
  const btn = $('#gs-go');
  btn.disabled = true;
  try {
    const text = await fetchSheetCsv(link);
    state.settings.gsheetUrl = link;
    persistSettings();
    $('#gs-dialog').close();
    importText(text, 'Google Sheets');
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ---------------- Bagikan template lewat link ---------------- */

async function renderShareLink() {
  const tpl = currentTemplate();
  const link = await templateLink(tpl, { images: $('#share-images').checked });
  $('#share-link').value = link;
  const kb = (link.length / 1024).toFixed(1);
  const local = location.protocol === 'file:';
  $('#share-note').textContent = [
    t(`Panjang link: ${kb} KB.`),
    link.length > 8000 ? t('Link panjang mungkin terpotong di aplikasi chat; kirim lewat email/dokumen, atau pakai Export JSON.') : '',
    local ? t('Aplikasi sedang dibuka dari file lokal: link ini hanya berfungsi di komputer ini. Untuk dibagikan, buka versi web (mis. di VPS) lalu bagikan dari sana.') : '',
  ].filter(Boolean).join(' ');
}
$('#tpl-share').addEventListener('click', async () => {
  if (!canShareLink()) return toast(t('Browser ini belum mendukung berbagi lewat link. Pakai Export JSON.'), 'error');
  const tpl = currentTemplate();
  $('#share-name').textContent = tpl.nama;
  $('#share-images').checked = false;
  $('#share-images-row').hidden = !tpl.decals.length;
  await renderShareLink();
  $('#share-dialog').showModal();
  $('#share-link').select();
});
$('#share-images').addEventListener('change', renderShareLink);
$('#share-copy').addEventListener('click', async () => {
  const link = $('#share-link').value;
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    $('#share-link').select();
    document.execCommand('copy');
  }
  toast(t('Link template disalin.'));
});

/** Buka template dari link (#tpl=…): tanyakan dulu, lalu tambahkan sebagai template baru. */
async function openSharedTemplate() {
  let raw;
  try {
    raw = await templateFromHash();
  } catch (err) {
    clearShareHash();
    return toast(t('Link template rusak atau tidak lengkap.'), 'error');
  }
  if (!raw) return;
  clearShareHash();
  let tpl;
  try {
    tpl = normalizeTemplate({ ...raw, id: newTemplateId() });
  } catch {
    return toast(t('Link template rusak atau tidak lengkap.'), 'error');
  }
  if (!confirm(t(`Tambahkan template "${tpl.nama}" dari link?`))) return;
  addTemplate(tpl);
  showTab('preview');
  toast(t('Template dari link ditambahkan. Import data dengan kolom yang sesuai untuk melihat hasilnya.'));
}
addEventListener('hashchange', openSharedTemplate);

/* ---------------- Galeri template ---------------- */

$('#tpl-gallery').addEventListener('click', () => {
  renderGallery($('#gallery-grid'), currentPreset(), (def, withData) => {
    if (withData) {
      if (state.table.rows.length && !confirm(t('Data yang ada sekarang akan diganti. Lanjutkan?'))) return;
      const { columns, rows } = galleryData(def);
      setTable({ columns: [...columns], rows: rows.map((cells) => makeRow(columns, cells)) }, t('Data contoh dimuat.'), 'data contoh galeri');
    }
    addTemplate(galleryTemplate(def));
    $('#gallery-dialog').close();
    showTab('preview');
    toast(t('Template dari galeri dipakai. Semua bagian bisa diubah di panel Isi Label.'));
  });
  $('#gallery-dialog').showModal();
});

/* ---------------- Atur objek: rata di label, hapus, duplikat (toolbar mini & keyboard) ---------------- */

/** Elemen objek terpilih di label yang terakhir diklik (atau label pertama). */
function selectedObjectEl(sel) {
  if (state.tab !== 'preview') return null;
  return $(`#preview .label[data-slot="${selectedSlot}"] ${sel}`) ?? $(`#preview ${sel}`);
}

/**
 * Ratakan objek terpilih terhadap area isi label (di dalam padding):
 * left/hcenter/right (horizontal), top/vcenter/bottom (vertikal).
 */
function arrangeSelected(where) {
  const tpl = currentTemplate();
  const box = contentBox(tpl, currentPreset());
  const i = getSelectedLine();
  const free = getFreeText(getSelectedFree());
  const d = getDecal(getSelectedDecal());
  const sh = getShape(getSelectedShape());
  const code = codeSelected ? labelGeometry(tpl, currentPreset()).code : null;
  let r;
  if (i != null) r = selectedLineEl() && lineRect(selectedLineEl());
  else if (free) r = selectedFreeEl() && lineRect(selectedFreeEl());
  else if (sh) r = { u: sh.x, v: sh.y, w: sh.w, h: sh.h };
  else if (d) r = { u: d.x, v: d.y, w: d.width, h: decalHeight(d) };
  else if (code) r = code;
  if (!r) return;
  let du = 0;
  let dv = 0;
  if (where === 'left') du = box.pad - r.u;
  else if (where === 'hcenter') du = (box.w - r.w) / 2 - r.u;
  else if (where === 'right') du = box.w - box.pad - r.w - r.u;
  else if (where === 'top') dv = box.pad - r.v;
  else if (where === 'vcenter') dv = (box.h - r.h) / 2 - r.v;
  else if (where === 'bottom') dv = box.h - box.pad - r.h - r.v;
  if (i != null) {
    const l = tpl.lines[i];
    updateLineOffset(i, { dx: l.dx + du, dy: l.dy + dv });
  } else if (free) updateFreeText(free.id, { x: free.x + du, y: free.y + dv });
  else if (sh) updateShape(sh.id, { x: sh.x + du, y: sh.y + dv });
  else if (d) updateDecal(d.id, { x: d.x + du, y: d.y + dv });
  else if (code) updateCode({ free: true, x: code.u + du, y: code.v + dv, w: code.w, h: code.h });
}

// Delete/Backspace = hapus, Ctrl+D = duplikat, panah = geser gambar (teks & QR punya handler sendiri)
document.addEventListener('keydown', (e) => {
  if (state.tab !== 'preview' || e.altKey || e.metaKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  const free = getFreeText(getSelectedFree());
  const d = getDecal(getSelectedDecal());
  const sh = getShape(getSelectedShape());
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (sh) removeShape(sh.id);
    else if (free) removeFreeText(free.id);
    else if (d) removeDecal(d.id);
    else if (codeSelected) {
      selectCode(false);
      updateCode({ type: 'none' });
    } else return;
    e.preventDefault();
    toast(t('Objek dihapus. Ctrl+Z untuk mengurungkan.'));
  } else if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    if (!free && !d && !sh) return;
    e.preventDefault();
    if (sh) duplicateShape(sh.id);
    else if (free) duplicateFreeText(free.id);
    else duplicateDecal(d.id);
  } else if ((d || sh) && !e.ctrlKey) {
    if (e.key === 'Escape') return sh ? selectShape(null) : selectDecal(null);
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const step = e.shiftKey ? 2 : 0.5;
    const k = MM_TO_PX * (state.previewScale || 1);
    const { du, dv } = screenToContent(dir[0] * step * k, dir[1] * step * k);
    if (sh) updateShape(sh.id, { x: sh.x + du, y: sh.y + dv });
    else updateDecal(d.id, { x: Math.round((d.x + du) * 10) / 10, y: Math.round((d.y + dv) * 10) / 10 });
  }
}, true);

/* ---------------- Toolbar: Urungkan/Ulangi desain, sisipkan gambar & QR ---------------- */

function syncHistoryButtons({ canUndo, canRedo } = historyState()) {
  $('#tb-undo').disabled = !canUndo;
  $('#tb-redo').disabled = !canRedo;
}
document.addEventListener('templatehistory', (e) => syncHistoryButtons(e.detail));
const undoDesign = () => { if (!undoTemplate()) toast(t('Tidak ada yang bisa diurungkan.')); };
const redoDesign = () => { if (!redoTemplate()) toast(t('Tidak ada yang bisa diulangi.')); };
$('#tb-undo').addEventListener('click', undoDesign);
$('#tb-redo').addEventListener('click', redoDesign);

// Ctrl+Z / Ctrl+Y (atau Ctrl+Shift+Z) di tab Preview: urungkan/ulangi perubahan desain label.
// Di dalam kotak isian, biarkan urungkan bawaan browser (ketikan).
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || state.tab !== 'preview') return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault();
    undoDesign();
  } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
    e.preventDefault();
    redoDesign();
  }
});

$('#tb-image').addEventListener('click', () => $('#dc-file').click());

$('#tb-qr').addEventListener('click', () => {
  const tpl = currentTemplate();
  if (tpl.code.type !== 'qr') document.querySelector('#tpl-code-type [data-value="qr"]').click();
  if (!currentTemplate().code.column && currentTemplate().code.source !== 'text') {
    return toast(t('Import data dulu, atau isi QR lewat Teks / rumus di bagian Barcode / QR code.'), 'error');
  }
  selectLine(null);
  selectCode(true);
  toast(t('QR code di label. Seret untuk memindahkan, tarik titik ungu di pojoknya untuk mengubah ukuran.'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !textMenu.hidden) toggleTextMenu(false);
});

let freeDrag = null;

/** Elemen teks bebas terpilih di label yang terakhir diklik (atau label pertama). */
function selectedFreeEl() {
  const id = getSelectedFree();
  if (!id || state.tab !== 'preview') return null;
  const sel = `.label-free[data-free="${id}"]`;
  return $(`#preview .label[data-slot="${selectedSlot}"] ${sel}`) ?? $(`#preview ${sel}`);
}

$('#preview').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.sheet--preview .label-free');
  if (!el || e.button !== 0 || e.target.closest('.label-decal')) return;
  const t = getFreeText(el.dataset.free);
  if (!t) return;
  e.preventDefault();
  e.stopPropagation();
  selectedSlot = el.closest('.label')?.dataset.slot ?? null;
  selectDecal(null);
  selectCode(false);
  selectFree(t.id);
  const content = el.closest('.label-content');
  const cur = lineRect(el);
  const { box, text } = labelGeometry(currentTemplate(), currentPreset());
  freeDrag = {
    id: t.id, el, content, box, sx: e.clientX, sy: e.clientY,
    start: { x: t.x, y: t.y }, rect: cur, targets: snapTargets(content, box, text, null), moved: false,
  };
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // event sintetis tanpa pointer aktif
  }
});

$('#preview').addEventListener('pointermove', (e) => {
  if (!freeDrag) return;
  const d = freeDrag;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
  if (!d.moved) {
    d.moved = true;
    document.body.classList.add('is-dragging');
  }
  const { du, dv } = screenToContent(e.clientX - d.sx, e.clientY - d.sy);
  const r = d.rect;
  let x = d.start.x + du;
  let y = d.start.y + dv;
  const guides = [];
  const thr = SNAP_PX / (MM_TO_PX * (state.previewScale || 1));
  // snap memakai kotak tulisan yang tampil (r), digeser sejauh perpindahan x/y
  const su = e.altKey ? null : snapAxis(r.u + (x - d.start.x), r.w, d.targets.u, thr);
  const sv = e.altKey ? null : snapAxis(r.v + (y - d.start.y), r.h, d.targets.v, thr);
  const step = (n) => (e.altKey ? Math.round(n * 10) / 10 : Math.round(n * 2) / 2);
  if (su) {
    x += su.shift;
    guides.push({ axis: 'u', at: su.at, kind: su.kind });
  } else x = step(x);
  if (sv) {
    y += sv.shift;
    guides.push({ axis: 'v', at: sv.at, kind: sv.kind });
  } else y = step(y);
  // tetap di dalam label
  x = Math.min(Math.max(x, d.start.x - r.u), d.start.x + (d.box.w - r.u - r.w));
  y = Math.min(Math.max(y, d.start.y - r.v), d.start.y + (d.box.h - r.v - r.h));
  d.next = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  for (const el of document.querySelectorAll(`#preview .label-free[data-free="${d.id}"]`)) {
    el.style.left = `${d.next.x}mm`;
    el.style.top = `${d.next.y}mm`;
  }
  drawGuides(d.content, guides);
  const f = (v) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  showDragInfo(e, `X ${f(d.next.x)} · Y ${f(d.next.y)} mm`);
});

function endFreeDrag() {
  if (!freeDrag) return;
  const { id, next, moved, content } = freeDrag;
  freeDrag = null;
  document.body.classList.remove('is-dragging');
  drawGuides(content, []);
  hideDragInfo();
  if (moved) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (next) updateFreeText(id, next);
  }
}
$('#preview').addEventListener('pointerup', endFreeDrag);
$('#preview').addEventListener('pointercancel', endFreeDrag);

/* ---------------- Bentuk & garis di preview: pilih, seret (snap), ubah ukuran ---------------- */

let shapeDrag = null;

$('#preview').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.sheet--preview .label-shape');
  if (!el || e.button !== 0 || e.target.closest('.label-decal')) return;
  const s = getShape(el.dataset.shape);
  if (!s) return;
  e.preventDefault();
  e.stopPropagation();
  selectedSlot = el.closest('.label')?.dataset.slot ?? null;
  selectCode(false);
  selectShape(s.id);
  const content = el.closest('.label-content');
  const { box, text } = labelGeometry(currentTemplate(), currentPreset());
  shapeDrag = {
    id: s.id, content, box, resize: !!e.target.closest('.shape-handle'),
    line: s.kind === 'line', horizontal: s.w >= s.h,
    sx: e.clientX, sy: e.clientY, start: { x: s.x, y: s.y, w: s.w, h: s.h },
    targets: snapTargets(content, box, text, null), moved: false,
  };
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // event sintetis tanpa pointer aktif
  }
});

$('#preview').addEventListener('pointermove', (e) => {
  if (!shapeDrag) return;
  const d = shapeDrag;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
  if (!d.moved) {
    d.moved = true;
    document.body.classList.add('is-dragging');
  }
  const { du, dv } = screenToContent(e.clientX - d.sx, e.clientY - d.sy);
  const { start: s, box } = d;
  const step = (n) => (e.altKey ? Math.round(n * 10) / 10 : Math.round(n * 2) / 2);
  const thr = SNAP_PX / (MM_TO_PX * (state.previewScale || 1));
  const guides = [];
  let next;
  if (d.resize) {
    // garis: hanya panjangnya; bentuk lain: lebar & tinggi bebas. Tepi kanan/bawah menempel ke garis bantu.
    let w = d.line && !d.horizontal ? s.w : Math.max(1, s.w + du);
    let h = d.line && d.horizontal ? s.h : Math.max(1, s.h + dv);
    const su = e.altKey || (d.line && !d.horizontal) ? null : snapAxis(s.x + w, 0, d.targets.u, thr);
    const sv = e.altKey || (d.line && d.horizontal) ? null : snapAxis(s.y + h, 0, d.targets.v, thr);
    if (su) {
      w += su.shift;
      guides.push({ axis: 'u', at: su.at, kind: su.kind });
    } else w = step(w);
    if (sv) {
      h += sv.shift;
      guides.push({ axis: 'v', at: sv.at, kind: sv.kind });
    } else h = step(h);
    next = { x: s.x, y: s.y, w: Math.max(1, Math.min(w, box.w - s.x)), h: Math.max(d.line ? s.h : 1, Math.min(h, box.h - s.y)) };
  } else {
    let x = s.x + du;
    let y = s.y + dv;
    const su = e.altKey ? null : snapAxis(x, s.w, d.targets.u, thr);
    const sv = e.altKey ? null : snapAxis(y, s.h, d.targets.v, thr);
    if (su) {
      x += su.shift;
      guides.push({ axis: 'u', at: su.at, kind: su.kind });
    } else x = step(x);
    if (sv) {
      y += sv.shift;
      guides.push({ axis: 'v', at: sv.at, kind: sv.kind });
    } else y = step(y);
    const clamp = (v, max) => Math.min(Math.max(0, v), Math.max(0, max));
    next = { x: clamp(x, box.w - s.w), y: clamp(y, box.h - s.h), w: s.w, h: s.h };
  }
  d.next = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  for (const el of document.querySelectorAll(`#preview .label-shape[data-shape="${d.id}"]`)) {
    Object.assign(el.style, { left: `${d.next.x}mm`, top: `${d.next.y}mm`, width: `${d.next.w}mm`, height: `${d.next.h}mm` });
    el.querySelector('svg').innerHTML = new DOMParser().parseFromString(shapeSvg({ ...getShape(d.id), ...d.next }), 'image/svg+xml').documentElement.innerHTML;
    el.querySelector('svg').setAttribute('viewBox', `0 0 ${d.next.w} ${d.next.h}`);
  }
  drawGuides(d.content, guides);
  const f = (v) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  showDragInfo(e, d.resize ? `${f(d.next.w)} × ${f(d.next.h)} mm` : `X ${f(d.next.x)} · Y ${f(d.next.y)} mm`);
});

function endShapeDrag() {
  if (!shapeDrag) return;
  const { id, next, moved, content } = shapeDrag;
  shapeDrag = null;
  document.body.classList.remove('is-dragging');
  drawGuides(content, []);
  hideDragInfo();
  if (moved) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (next) updateShape(id, next);
  }
}
$('#preview').addEventListener('pointerup', endShapeDrag);
$('#preview').addEventListener('pointercancel', endShapeDrag);

/* ---------------- Putar objek (teks bebas, gambar, bentuk) lewat pegangan putar ---------------- */

const ROT_SELECTOR = { free: 'label-free', decal: 'label-decal', shape: 'label-shape' };
let rotDrag = null;

// fase capture: didahulukan dari penangan geser objek
$('#preview').addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.sheet--preview .rot-handle');
  if (!handle || e.button !== 0) return;
  const el = handle.parentElement;
  const kind = Object.keys(ROT_SELECTOR).find((k) => el.classList.contains(ROT_SELECTOR[k]));
  const id = el.dataset.free ?? el.dataset.decal ?? el.dataset.shape;
  if (!kind || !id) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const r = el.getBoundingClientRect(); // pusat tidak berubah oleh rotasi
  rotDrag = { kind, id, cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false };
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // event sintetis tanpa pointer aktif
  }
  document.body.classList.add('is-dragging');
}, true);

$('#preview').addEventListener('pointermove', (e) => {
  if (!rotDrag) return;
  const d = rotDrag;
  d.moved = true;
  // sudut di layar (0° = pegangan di atas), dikurangi putaran isi/preview → sudut objek di label
  let deg = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90 - screenRotation();
  deg = e.shiftKey ? Math.round(deg) : Math.round(deg / 15) * 15;
  d.next = normRot(deg);
  for (const el of document.querySelectorAll(`#preview .${ROT_SELECTOR[d.kind]}[data-${d.kind}="${d.id}"]`)) {
    el.style.transform = d.next ? `rotate(${d.next}deg)` : '';
  }
  showDragInfo(e, `${d.next.toLocaleString('id-ID')}°`);
}, true);

function endRotDrag() {
  if (!rotDrag) return;
  const { kind, id, next, moved } = rotDrag;
  rotDrag = null;
  document.body.classList.remove('is-dragging');
  hideDragInfo();
  if (!moved || next == null) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  setRotation(kind, id, next);
}
$('#preview').addEventListener('pointerup', endRotDrag, true);
$('#preview').addEventListener('pointercancel', endRotDrag, true);

/** Simpan sudut putar sebuah objek. */
function setRotation(kind, id, deg) {
  const rot = normRot(deg);
  if (kind === 'free') updateFreeText(id, { rot });
  else if (kind === 'decal') updateDecal(id, { rot });
  else if (kind === 'shape') updateShape(id, { rot });
}

// tombol tambah bentuk: panel Isi Label & menu "Bentuk ▾" di toolbar
for (const b of document.querySelectorAll('.sh-add')) {
  b.addEventListener('click', () => {
    selectedSlot = null;
    selectCode(false);
    addShape(b.dataset.shape);
    showTab('preview');
  });
}
const shapeMenu = $('#tb-shape-menu');
const toggleShapeMenu = (open) => {
  shapeMenu.hidden = !open;
  $('#tb-shape-btn').setAttribute('aria-expanded', String(open));
};
$('#tb-shape-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleShapeMenu(shapeMenu.hidden);
});
shapeMenu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-shape]');
  if (!b) return;
  toggleShapeMenu(false);
  selectedSlot = null;
  selectCode(false);
  addShape(b.dataset.shape);
});
document.addEventListener('click', (e) => {
  if (!shapeMenu.hidden && !e.target.closest('#tb-shape')) toggleShapeMenu(false);
});

// Barcode/QR terpilih: panah menggeser (0,5 mm; Shift 2 mm; Ctrl 0,1 mm), Esc batal pilih.
document.addEventListener('keydown', (e) => {
  if (!codeSelected || state.tab !== 'preview' || e.altKey || e.metaKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') return selectCode(false);
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  const tpl = currentTemplate();
  const { box, code } = labelGeometry(tpl, currentPreset());
  if (!dir || !code) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const step = e.shiftKey ? 2 : e.ctrlKey ? 0.1 : 0.5;
  const k = MM_TO_PX * (state.previewScale || 1);
  const { du, dv } = screenToContent(dir[0] * step * k, dir[1] * step * k);
  const clamp = (v, max) => Math.min(Math.max(0, v), Math.max(0, max));
  updateCode({ free: true, x: clamp(code.u + du, box.w - code.w), y: clamp(code.v + dv, box.h - code.h), w: code.w, h: code.h });
}, true);

// Baris terpilih: panah menggeser 0,5 mm (Shift 2 mm, Ctrl 0,1 mm), Esc batal pilih.
// Fase capture agar didahulukan dari navigasi lembar ← →.
document.addEventListener('keydown', (e) => {
  const i = getSelectedLine();
  const free = getFreeText(getSelectedFree());
  if ((i == null && !free) || state.tab !== 'preview' || e.altKey || e.metaKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') return selectLine(null);
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  const l = currentTemplate().lines[i];
  if (!dir || (!l && !free)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const step = e.shiftKey ? 2 : e.ctrlKey ? 0.1 : 0.5;
  const k = MM_TO_PX * (state.previewScale || 1);
  const { du, dv } = screenToContent(dir[0] * step * k, dir[1] * step * k); // arah panah = arah di layar
  if (free) updateFreeText(free.id, { x: free.x + du, y: free.y + dv });
  else updateLineOffset(i, { dx: l.dx + du, dy: l.dy + dv });
}, true);

$('#preview').addEventListener('click', (e) => {
  if (suppressClick || e.target.closest('.label-decal')) return;
  if (e.target.closest('.label-line, .label-code, .label-free, .label-shape')) return; // klik objek = pilih untuk digeser
  if (getSelectedLine() != null || getSelectedFree()) selectLine(null);
  if (codeSelected) selectCode(false);
  if (getSelectedDecal()) selectDecal(null);
  if (getSelectedShape()) selectShape(null);
  const el = e.target.closest('.label--slot');
  if (!el || state.previewMode !== 'data' || state.page !== 0) return;
  state.settings.startSlot = Number(el.dataset.slot);
  persistSettings();
  renderPrintOptions();
  renderPreview();
  renderStats();
  toast(`Mulai dari label ke-${state.settings.startSlot + 1}.`);
});

$('#pg-prev').addEventListener('click', () => { state.page--; renderPreview(); });

/* Lompat ke lembar tertentu: ketik nomor lalu Enter (atau keluar dari kotak) */
let pageTyping = false; // jangan timpa angka yang sedang diketik pengguna
function goToPage(n) {
  pageTyping = false;
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return renderPreview();
  state.page = Math.max(0, v - 1);
  renderPreview();
}
$('#pg-input').addEventListener('input', () => { pageTyping = true; });
$('#pg-input').addEventListener('change', (e) => goToPage(e.target.value));
$('#pg-input').addEventListener('blur', () => {
  if (pageTyping) goToPage($('#pg-input').value);
});
$('#pg-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    goToPage(e.target.value);
    e.target.select();
  }
});
$('#pg-input').addEventListener('focus', (e) => e.target.select());

/* ---------------- Cari teks di preview ---------------- */

/** Semua label (lembar & posisi) yang isinya mengandung teks pencarian. */
function findHits(q) {
  const p = currentPreset();
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const cols = state.table.columns;
  const pages = printPages(p);
  const hits = [];
  const seen = new Map(); // baris yang sama (jumlah/salinan) dicek sekali
  pages.forEach((items, page) => {
    for (const { slot, item } of items) {
      let ok = seen.get(item);
      if (ok == null) {
        ok = cols.some((c) => String(item.values[c] ?? '').toLowerCase().includes(needle));
        seen.set(item, ok);
      }
      if (ok) hits.push({ page, slot });
    }
  });
  return hits;
}

function runSearch(q, { jump = true } = {}) {
  const s = state.search;
  s.q = q;
  s.hits = state.previewMode === 'data' ? findHits(q) : [];
  // mulai dari hasil pertama di lembar yang sedang dilihat atau sesudahnya
  const from = s.hits.findIndex((h) => h.page >= state.page);
  s.idx = from >= 0 ? from : 0;
  if (jump && s.hits.length) state.page = s.hits[s.idx].page;
  renderPreview();
}

function stepSearch(dir) {
  const s = state.search;
  if (!s.hits.length) return;
  s.idx = (s.idx + dir + s.hits.length) % s.hits.length;
  state.page = s.hits[s.idx].page;
  renderPreview();
}

function renderSearchInfo() {
  const s = state.search;
  const info = $('#pv-search-info');
  const show = state.previewMode === 'data';
  $('#pv-search-wrap').hidden = !show;
  if (!s.q.trim()) {
    info.textContent = '';
  } else if (!s.hits.length) {
    info.textContent = 'tidak ditemukan';
  } else {
    const h = s.hits[s.idx];
    info.textContent = `${s.idx + 1} / ${s.hits.length} · lembar ${h.page + 1}`;
  }
  info.classList.toggle('pv-search-info--none', !!s.q.trim() && !s.hits.length);
  $('#pv-search-prev').disabled = $('#pv-search-next').disabled = s.hits.length < 2;
  $('#pv-search-only').hidden = !s.hits.length;

  // tombol "Cetak lembar ini": menonjol bila lembar ini berisi hasil pencarian
  const btn = $('#btn-print-page');
  btn.hidden = !show;
  const hitHere = s.hits.some((h) => h.page === state.page);
  btn.classList.toggle('primary', hitHere);
  btn.classList.toggle('ghost', !hitHere);
  $('#btn-print-page-text').textContent = hitHere ? `Cetak lembar ${state.page + 1}` : 'Cetak lembar ini';
  $('#btn-print-page').title = hitHere ? `Cetak hanya lembar ${state.page + 1}` : 'Cetak hanya lembar yang sedang ditampilkan';
}

function markSearchHits(sheet) {
  const s = state.search;
  if (!s.hits.length || state.previewMode !== 'data') return;
  const current = s.hits[s.idx];
  for (const h of s.hits) {
    if (h.page !== state.page) continue;
    const el = sheet.querySelector(`.label[data-slot="${h.slot}"]:not(.label--used):not(.label--empty)`);
    if (!el) continue;
    el.classList.add('label--hit');
    if (h === current) el.classList.add('label--hit-current');
  }
}

let searchTimer;
$('#pv-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(e.target.value), 200);
});
$('#pv-search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  clearTimeout(searchTimer);
  if (state.search.q !== e.target.value) runSearch(e.target.value);
  else stepSearch(e.shiftKey ? -1 : 1);
});
$('#pv-search-prev').addEventListener('click', () => stepSearch(-1));
// cetak hanya label hasil pencarian: baris yang isinya cocok dicentang, yang lain tidak
$('#pv-search-only').addEventListener('click', () => {
  const needle = state.search.q.trim().toLowerCase();
  const cols = state.table.columns;
  const ids = new Set(state.table.rows
    .filter((r) => cols.some((c) => String(r.values[c] ?? '').toLowerCase().includes(needle)))
    .map((r) => r.id));
  checkOnly(ids);
  $('#pv-search').value = '';
  runSearch('');
  $('#pv-search-wrap').classList.remove('is-open');
});
$('#pv-search-next').addEventListener('click', () => stepSearch(1));

// Layar kecil: ikon 🔍 membuka kotak cari melayang; tertutup lagi bila kosong & tidak dipakai
const searchWrap = $('#pv-search-wrap');
function openSearch() {
  searchWrap.classList.add('is-open');
  $('#pv-search').focus();
  $('#pv-search').select();
}
$('#pv-search-toggle').addEventListener('click', () => {
  if (searchWrap.classList.contains('is-open') && !$('#pv-search').value) searchWrap.classList.remove('is-open');
  else openSearch();
});
searchWrap.addEventListener('focusout', () => {
  setTimeout(() => {
    if (!searchWrap.contains(document.activeElement) && !$('#pv-search').value) searchWrap.classList.remove('is-open');
  }, 150);
});
$('#pv-search').addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.target.value = '';
  runSearch('');
  searchWrap.classList.remove('is-open');
  e.target.blur();
});
// Ctrl+F di tab Preview: cari di label (bukan cari bawaan browser)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && state.tab === 'preview' && state.previewMode === 'data') {
    e.preventDefault();
    openSearch();
  }
});

// ← → / Home / End untuk berpindah lembar di preview
document.addEventListener('keydown', (e) => {
  if (state.tab !== 'preview' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  const keys = { ArrowLeft: -1, ArrowRight: 1, PageUp: -1, PageDown: 1, Home: -Infinity, End: Infinity };
  if (!(e.key in keys)) return;
  e.preventDefault();
  state.page = Math.max(0, state.page + keys[e.key]); // renderPreview membatasi ke lembar terakhir
  renderPreview();
});
$('#pg-next').addEventListener('click', () => { state.page++; renderPreview(); });
$('#zoom').addEventListener('change', (e) => { state.zoom = e.target.value; renderPreview(); });
window.addEventListener('resize', () => { if (state.zoom === 'fit') renderPreview(); });

/* ---------------- Cetak ---------------- */

async function confirmPrint(p) {
  if (state.settings.hidePrintGuide) return true;
  const { ok, hide } = await showPrintGuide(p, pageFor(p), { withAction: true });
  state.settings.hidePrintGuide = hide;
  persistSettings();
  return ok;
}

function canPrint(p) {
  if (checkFit(p, calibration()).errors.length) {
    toast('Perbaiki ukuran label terlebih dahulu.', 'error');
    return false;
  }
  return true;
}

/** Halaman data sesuai rentang lembar yang dipilih. */
function rangedData(p) {
  const { pages, renderer } = prepareData(p);
  if (!pages.length) {
    toast('Belum ada label untuk dicetak.', 'error');
    return null;
  }
  const range = sheetRange(pages.length);
  return { pages: pages.slice(range.from - 1, range.to), renderer, range };
}

$('#btn-print-test').addEventListener('click', async () => {
  const p = currentPreset();
  if (!canPrint(p) || !(await confirmPrint(p))) return;
  const { page, cal } = placement(p);
  printSheets([buildTestSheet(p, cal, page)], page);
});

async function printLabels() {
  const p = currentPreset();
  if (!canPrint(p)) return;
  const data = rangedData(p);
  if (!data || !(await confirmPrint(p))) return;
  printSheets(dataSheets(p, data.pages, data.renderer), pageFor(p));
}

$('#btn-print').addEventListener('click', printLabels);

/** Cetak hanya lembar yang sedang ditampilkan di preview (mis. lembar hasil pencarian). */
async function printCurrentPage() {
  const p = currentPreset();
  if (!canPrint(p)) return;
  const { pages, renderer } = prepareData(p);
  const page = pages[state.page];
  if (!page) return toast('Belum ada label untuk dicetak.', 'error');
  if (!(await confirmPrint(p))) return;
  toast(`Mencetak lembar ${state.page + 1} dari ${pages.length}.`);
  printSheets(dataSheets(p, [page], renderer), pageFor(p));
}

$('#btn-print-page').addEventListener('click', printCurrentPage);

// Ctrl+P → cetak label (bukan tampilan aplikasi)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    if (!document.querySelector('dialog[open]')) printLabels();
  }
});

async function savePdf() {
  const p = currentPreset();
  if (!canPrint(p)) return;
  const data = rangedData(p);
  if (!data) return;
  const { page, cal } = placement(p);
  const name = shortName(p.nama).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'label';
  const suffix = data.range.all ? '' : `-lembar-${data.range.from}-${data.range.to}`;
  try {
    const result = await exportPdf({
      preset: p, cal, page, tpl: currentTemplate(), pages: data.pages, renderer: data.renderer,
      border: !!state.settings.printBorder, filename: `label-${name}${suffix}.pdf`,
      embedFonts: state.settings.pdfFonts !== false,
    });
    if (state.settings.pdfFonts !== false && !result.fonts) {
      toast(t(result.fontReason === 'unsupported'
        ? 'PDF dibuat dengan font standar: browser ini tidak bisa membaca font komputer (pakai Chrome/Edge).'
        : 'PDF dibuat dengan font standar: izin akses font tidak diberikan atau fontnya tidak didukung.'));
    } else toast(`PDF dibuat: ${data.pages.length} halaman.`);
  } catch (err) {
    console.error(err);
    toast(`Gagal membuat PDF: ${err.message}`, 'error');
  }
}

$('#btn-pdf').addEventListener('click', savePdf);
$('#btn-pdf-top').addEventListener('click', savePdf);

$('#btn-guide').addEventListener('click', async () => {
  const p = currentPreset();
  const { hide } = await showPrintGuide(p, pageFor(p), { hideChecked: state.settings.hidePrintGuide });
  state.settings.hidePrintGuide = hide;
  persistSettings();
});

$('#opt-pdf-fonts').addEventListener('change', (e) => {
  state.settings.pdfFonts = e.target.checked;
  persistSettings();
});

$('#opt-border').addEventListener('change', (e) => {
  state.settings.printBorder = e.target.checked;
  persistSettings();
  renderPreview();
});

/* ---------------- Opsi cetak ---------------- */

function renderPrintOptions() {
  renderGroupOptions();
  $('#opt-pdf-fonts').checked = state.settings.pdfFonts !== false;
  const p = currentPreset();
  $('#opt-start').value = startSlot(p) + 1;
  $('#opt-start').max = labelsPerSheet(p);
  $('#opt-copies').value = Math.max(1, Math.round(Number(state.settings.copies)) || 1);
  $('#opt-from').value = state.settings.rangeFrom ?? '';
  $('#opt-to').value = state.settings.rangeTo ?? '';
}

function bindNumberSetting(id, apply) {
  $(id).addEventListener('input', (e) => {
    const raw = e.target.value.trim();
    const v = raw === '' ? null : Math.round(Number(raw));
    if (raw !== '' && !Number.isFinite(v)) return;
    apply(v);
    persistSettings();
    state.page = Math.min(state.page, 0);
    renderPreview();
    renderStats();
    renderDataSummary();
  });
}
bindNumberSetting('#opt-start', (v) => { state.settings.startSlot = Math.max(0, (v ?? 1) - 1); });
bindNumberSetting('#opt-copies', (v) => { state.settings.copies = Math.max(1, v ?? 1); });
bindNumberSetting('#opt-from', (v) => { state.settings.rangeFrom = v && v > 0 ? v : null; });
bindNumberSetting('#opt-to', (v) => { state.settings.rangeTo = v && v > 0 ? v : null; });

/* ---------------- Kertas di printer ---------------- */

$('#media-mode').innerHTML = MEDIA_MODES.map((m) => `<option value="${m.value}">${m.label}</option>`).join('');

function renderMedia() {
  const p = currentPreset();
  const m = mediaFor(p);
  const page = pageLayout(p, m);
  // tampilkan ukuran lembar label di pilihan pertama, mis. "Sesuai lembar label (165 × 210 mm)"
  $('#media-mode').options[0].textContent =
    `Sesuai lembar label (${fmt(p.kertasLebar)} × ${fmt(p.kertasTinggi)} mm) — perlu ukuran kertas custom di printer`;
  $('#media-mode').value = m.mode;
  $('#media-custom').hidden = m.mode !== 'custom';
  $('#media-w').value = m.width;
  $('#media-h').value = m.height;
  for (const [id, val] of [['#media-ax', m.alignX], ['#media-ay', m.alignY]]) {
    for (const b of $(id).querySelectorAll('[data-value]')) b.classList.toggle('active', b.dataset.value === val);
  }
  for (const b of $('#paper-orient').querySelectorAll('[data-value]')) b.classList.toggle('active', b.dataset.value === m.orientation);
  $('#media-info').innerHTML = (m.mode === 'label'
    ? `Halaman cetak = lembar label: <b>${pageSizeName(page)}</b>`
    : `Halaman cetak: <b>${pageSizeName(page)}</b> · lembar label digeser X <b>${fmt(page.dx)}</b> mm, Y <b>${fmt(page.dy)}</b> mm`)
    + (m.orientation === 'landscape' ? ' · tampilan <b>landscape</b> (hanya di layar; cetak tetap sama)' : '');
  $('#meta-print').textContent = [
    m.mode === 'label' ? '' : pageSizeName(page).split(' ')[0],
    $('#meta-print').dataset.offset ?? '',
  ].filter(Boolean).join(' · ');
}

function updateMedia(change) {
  const p = currentPreset();
  state.settings.media = { ...state.settings.media, [p.id]: { ...mediaFor(p), ...change } };
  persistSettings();
  renderMedia();
  renderPreview();
}

$('#media-mode').addEventListener('change', (e) => updateMedia({ mode: e.target.value }));
$('#paper-orient').addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (!b || b.dataset.value === mediaFor(currentPreset()).orientation) return;
  updateMedia({ orientation: b.dataset.value });
  if (b.dataset.value === 'landscape') toast('Tampilan landscape. Hasil cetak tetap sama; kertas dimasukkan ke printer seperti biasa.');
});
for (const [id, key] of [['#media-w', 'width'], ['#media-h', 'height']]) {
  $(id).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v > 0) updateMedia({ [key]: v });
  });
}
for (const [id, key] of [['#media-ax', 'alignX'], ['#media-ay', 'alignY']]) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (b) updateMedia({ [key]: b.dataset.value });
  });
}

/* ---------------- Backup ---------------- */

async function downloadBackup() {
  const data = rawEntries(); // format sama dengan backup versi lama (kunci "cetakLabel.…")
  const file = { app: 'cetak-label', backup: 1, data };
  if ($('#backup-photos').checked && photoCount()) file.photos = await exportPhotos(); // { kunci: data URL }
  const date = new Date().toISOString().slice(0, 10);
  downloadText(`backup-cetak-label-${date}.json`, JSON.stringify(file, null, file.photos ? 0 : 2), 'application/json');
  save('backupInfo', { ...load('backupInfo', {}), last: Date.now() });
  renderBackupReminder();
}

/* ---------------- Pengingat backup ---------------- */

const BACKUP_EVERY_DAYS = 7;
const BACKUP_SNOOZE_DAYS = 3;
const DAY = 86400000;

/** Pita pengingat: ada data, belum pernah/lebih dari 7 hari tidak di-backup, dan tidak sedang ditunda. */
function renderBackupReminder() {
  const info = load('backupInfo', {});
  const now = Date.now();
  const due = state.table.rows.length > 0
    && (!info.last || now - info.last > BACKUP_EVERY_DAYS * DAY)
    && !(info.snoozeUntil > now);
  $('#backup-reminder').hidden = !due;
  if (!due) return;
  const days = info.last ? Math.floor((now - info.last) / DAY) : null;
  $('#backup-reminder-when').textContent = days == null
    ? t('Belum pernah di-backup — simpan salinan agar tidak hilang bila browser dibersihkan.')
    : t(`Backup terakhir ${days} hari lalu.`);
}
$('#backup-reminder-go').addEventListener('click', downloadBackup);
$('#backup-reminder-later').addEventListener('click', () => {
  save('backupInfo', { ...load('backupInfo', {}), snoozeUntil: Date.now() + BACKUP_SNOOZE_DAYS * DAY });
  renderBackupReminder();
});

function renderBackupPhotos() {
  const n = photoCount();
  $('#backup-photos-row').hidden = !n;
  $('#backup-photos-count').textContent = `(${n.toLocaleString('id-ID')} ${t('foto')})`;
}

$('#btn-backup').addEventListener('click', downloadBackup);

/* ---------------- Reset ---------------- */

// Bagian yang bisa direset → kunci penyimpanan. Setelah dihapus, aplikasi dimuat ulang
// sehingga nilai bawaan dipakai kembali.
const RESET_KEYS = {
  data: ['data'],
  templates: ['templates'],
  presets: ['presets'],
  settings: ['settings'],
  sections: ['sections'],
};

function syncResetButton() {
  const any = [...document.querySelectorAll('[data-reset]')].some((c) => c.checked);
  $('#reset-confirm').disabled = !any;
}

$('#btn-reset-open').addEventListener('click', () => {
  const n = state.table.rows.length;
  $('#reset-info-data').textContent = n
    ? `Hapus tabel data (${n.toLocaleString('id-ID')} baris)`
    : 'Tabel data sudah kosong';
  const customPresets = state.presets.filter((p) => !isBuiltin(p)).length;
  $('#reset-info-presets').textContent = customPresets
    ? `Hapus ${customPresets} ukuran custom & kembalikan preset bawaan`
    : 'Kembalikan nilai preset bawaan';
  $('#reset-info-photos').textContent = photoCount()
    ? `Hapus ${photoCount().toLocaleString('id-ID')} foto yang tersimpan`
    : 'Belum ada foto tersimpan';
  syncResetButton();
  const dlg = $('#reset-dialog');
  dlg.returnValue = '';
  dlg.showModal();
});

$('#reset-dialog').addEventListener('change', syncResetButton);
$('#reset-all').addEventListener('click', () => {
  for (const c of document.querySelectorAll('[data-reset]')) c.checked = true;
  syncResetButton();
});
$('#reset-backup').addEventListener('click', downloadBackup);

$('#reset-dialog').addEventListener('close', async () => {
  if ($('#reset-dialog').returnValue !== 'ok') return;
  const parts = [...document.querySelectorAll('[data-reset]:checked')].map((c) => c.dataset.reset);
  if (!parts.length) return;
  const names = parts.map((k) => $(`[data-reset="${k}"]`).closest('.reset-item').querySelector('b').textContent);
  if (!confirm(t(`Yakin reset: ${names.join(', ')}?`))) return;
  try {
    for (const part of parts) for (const key of RESET_KEYS[part] ?? []) remove(key);
    await flush();
    if (parts.includes('photos')) await clearPhotos();
  } catch {
    // abaikan
  }
  location.reload();
});

$('#btn-restore').addEventListener('click', () => $('#file-restore').click());
$('#file-restore').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    if (json?.app !== 'cetak-label' || !json.data) throw new Error('Bukan file backup Cetak Label.');
    if (!confirm(t('Semua data, template, ukuran, dan pengaturan sekarang akan diganti dengan isi backup. Lanjutkan?'))) return;
    for (const [key, value] of Object.entries(json.data)) setRaw(key, value);
    await flush();
    if (json.photos) await importPhotos(json.photos);
    location.reload();
  } catch (err) {
    toast(`Gagal memulihkan: ${err.message}`, 'error');
  }
});

/* ---------------- Panel bisa dilipat ---------------- */

function mountSections() {
  const saved = load('sections', {});
  for (const sec of document.querySelectorAll('.section')) {
    const key = sec.dataset.section;
    if (key in saved) sec.open = saved[key];
    sec.addEventListener('toggle', () => {
      saved[key] = sec.open;
      save('sections', saved);
    });
  }
}

/* ---------------- Init ---------------- */

function renderAll() {
  renderPresetSelect();
  renderPresetForm();
  renderSummary();
  renderCalibration();
  renderPrintOptions();
  renderPreview();
}

if (!state.table.columns.length) state.previewMode = 'test';
mountSections();
$('#opt-border').checked = !!state.settings.printBorder;
mountLineToolbar({
  // teks yang sedang dipilih di preview: teks bebas atau baris template
  target: () => {
    const free = getFreeText(getSelectedFree());
    if (free) {
      return {
        key: `free:${free.id}`, title: 'Teks bebas', style: free, free: true, anchor: selectedFreeEl(),
        update: (patch) => updateFreeText(free.id, patch),
        setText: (text) => updateFreeText(free.id, { text }),
        remove: () => removeFreeText(free.id),
        duplicate: () => duplicateFreeText(free.id),
        arrange: (where) => arrangeSelected(where),
        rot: free.rot,
        setRot: (deg) => setRotation('free', free.id, deg),
      };
    }
    const i = getSelectedLine();
    const l = i == null ? null : currentTemplate().lines[i];
    if (l) {
      return {
        key: `line:${i}`, title: `Baris ${i + 1}`, style: l, free: false, anchor: selectedLineEl(),
        update: (patch) => updateLineStyle(i, patch),
        reset: () => updateLineOffset(i, { dx: 0, dy: 0 }),
        arrange: (where) => arrangeSelected(where),
      };
    }
    const sh = getShape(getSelectedShape());
    if (sh) {
      const titles = { line: 'Garis', rect: 'Kotak', ellipse: 'Lingkaran / elips' };
      return {
        key: `shape:${sh.id}`, title: titles[sh.kind], object: true,
        anchor: selectedObjectEl(`.label-shape[data-shape="${sh.id}"]`),
        shape: sh,
        updateShape: (patch) => updateShape(sh.id, patch),
        remove: () => removeShape(sh.id),
        duplicate: () => duplicateShape(sh.id),
        arrange: (where) => arrangeSelected(where),
        rot: sh.rot,
        setRot: (deg) => setRotation('shape', sh.id, deg),
        layer: sh.layer,
        setLayer: (layer) => updateShape(sh.id, { layer }),
      };
    }
    const d = getDecal(getSelectedDecal());
    if (d) {
      return {
        key: `decal:${d.id}`, title: 'Gambar', object: true, anchor: selectedObjectEl(`.label-decal[data-decal="${d.id}"]`),
        remove: () => removeDecal(d.id),
        duplicate: () => duplicateDecal(d.id),
        arrange: (where) => arrangeSelected(where),
        rot: d.rot,
        setRot: (deg) => setRotation('decal', d.id, deg),
        layer: d.layer,
        setLayer: (layer) => updateDecal(d.id, { layer }),
      };
    }
    if (codeSelected && labelGeometry(currentTemplate(), currentPreset()).code) {
      return {
        key: 'code', title: currentTemplate().code.type === 'qr' ? 'QR code' : 'Barcode', object: true,
        anchor: selectedObjectEl('.label-code'),
        remove: () => {
          selectCode(false);
          updateCode({ type: 'none' });
        },
        arrange: (where) => arrangeSelected(where),
      };
    }
    return null;
  },
  getTemplate: currentTemplate,
  close: () => selectLine(null),
});

mountTemplateEditor({
  getPresets: () => state.presets,
  getColumns: () => state.table.columns,
  getRows: () => state.table.rows,
  getPreset: currentPreset,
  getSettings: () => state.settings,
  saveSettings: persistSettings,
  onChange: () => {
    // perubahan template langsung terlihat: tampilkan label data, bukan halaman tes
    if (state.previewMode === 'test' && state.table.columns.length) {
      state.previewMode = 'data';
      renderPreviewMode();
    }
    if (state.tab === 'preview') renderPreview();
    renderDataWarnings();
  },
});
renderPreviewMode();
refreshTable();
renderDataSummary();
renderAll();

// Pasang sebagai aplikasi (PWA): tombol muncul bila browser menawarkan pemasangan
let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#btn-install').hidden = false;
});
$('#btn-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  $('#btn-install').hidden = true;
});
addEventListener('appinstalled', () => {
  $('#btn-install').hidden = true;
  toast(t('Cetak Label terpasang sebagai aplikasi.'));
});

// Tema warna: Deluxe (bawaan) ⇄ Ceria
$('#btn-theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'ceria' ? 'deluxe' : 'ceria';
  document.documentElement.dataset.theme = next;
  save('theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'ceria' ? '#5b21b6' : '#0b1222');
  toast(t(next === 'ceria' ? 'Tema Ceria dipakai.' : 'Tema Deluxe dipakai.'));
});

// Bahasa antarmuka (Indonesia / English); isi label & data tidak ikut diterjemahkan
initI18n();
openSharedTemplate(); // aplikasi dibuka dari link berisi template
$('#lang-switch').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (b) setLang(b.dataset.lang);
});
// ringkasan angka memakai bentuk tunggal/jamak → dirender ulang saat ganti bahasa
document.addEventListener('langchange', () => {
  renderStats();
  renderDataSummary();
});
renderBackupReminder();
renderBackupPhotos();
// jumlah foto bisa berubah (tambah/hapus foto): perbarui saat bagian Backup dibuka
$('#btn-backup').closest('details').addEventListener('toggle', renderBackupPhotos);
loadPhotos().then((n) => {
  renderBackupPhotos();
  if (!n) return;
  renderPhotoControls();
  renderDataWarnings();
  renderPreview();
});
