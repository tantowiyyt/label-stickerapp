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
import { loadTable, saveTable, expandRows, addRow, addColumn } from './data.js';
import {
  parseTable, parseWorkbook, isExcelFile, readTextFile, downloadSampleCsv, downloadSampleXlsx, exportTableCsv, exportTableXlsx,
} from './importer.js';
import { mountDataTable, renderDataTable } from './dataTable.js';
import { createLabelRenderer, contentBox } from './renderer.js';
import {
  mountTemplateEditor, renderColumns, renderPhotoControls, currentTemplate, updateDecal, selectDecal, getSelectedDecal,
} from './templateEditor.js';
import { loadPhotos, clearPhotos, photoCount, photoUrl } from './photos.js';
import { usedColumns, normColumn } from './template.js';
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

/** Ukuran halaman cetak + offset total (kalibrasi + posisi lembar label di kertas printer). */
function placement(p) {
  const page = pageFor(p);
  const cal = calibration();
  return { page, cal: { offsetX: cal.offsetX + page.dx, offsetY: cal.offsetY + page.dy } };
}

/** Label yang akan dicetak: baris dicentang × kolom jumlah × salinan per label. */
function printItems() {
  const copies = Math.max(1, Math.round(Number(state.settings.copies)) || 1);
  const rows = expandRows(state.table);
  return copies === 1 ? rows : rows.flatMap((r) => Array(copies).fill(r));
}

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
  renderAll();
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
  const per = labelsPerSheet(p);
  const sheets = per && labels ? Math.ceil((startSlot(p) + labels) / per) : 0;
  const range = sheetRange(sheets);
  $('#stats').innerHTML =
    `<span class="stat"><b>${labels.toLocaleString('id-ID')}</b> label</span>` +
    `<span class="stat"><b>${sheets.toLocaleString('id-ID')}</b> lembar</span>` +
    (sheets && !range.all ? `<span class="stat">cetak lembar <b>${range.from}–${range.to}</b></span>` : '') +
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
  if (!confirm(`Hapus ukuran "${p.nama}"?`)) return;
  const idx = state.presets.indexOf(p);
  state.presets.splice(idx, 1);
  persistPresets();
  selectPreset(state.presets[Math.max(0, idx - 1)].id);
});

$('#btn-preset-default').addEventListener('click', () => {
  const p = currentPreset();
  const def = DEFAULT_PRESETS.find((d) => d.id === p.id);
  if (!def) return;
  if (!confirm(`Kembalikan "${p.nama}" ke nilai bawaan? Ukuran, margin, dan jarak yang sudah Anda ubah untuk ukuran ini akan hilang.`)) return;
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
  if (!confirm('Kembalikan semua preset bawaan ke nilai awal? Perubahan pada preset bawaan akan hilang.')) return;
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
  if (tpl.code.type !== 'none' && cols.includes(tpl.code.column)) return tpl.code.column;
  return cols.find((c) => KEY_COLUMN.test(normColumn(c))) ?? null;
}

function dataWarnings() {
  const { columns, rows } = state.table;
  if (!columns.length) return [];
  const active = rows.filter((r) => r.on);
  const tpl = currentTemplate();
  const used = new Set(usedColumns(tpl, columns));
  if (tpl.code.type !== 'none' && columns.includes(tpl.code.column)) used.add(tpl.code.column);
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
  const { columns, rows } = state.table;
  const on = rows.filter((r) => r.on).length;
  const labels = printItems().length;
  const n = (v) => v.toLocaleString('id-ID');
  if (columns.length) {
    $('#data-summary').innerHTML = `<b>${n(rows.length)}</b> baris · <b>${n(on)}</b> dicentang · <b>${n(labels)}</b> label akan dicetak`;
    $('#data-info').textContent = `${n(rows.length)} baris · ${n(on)} dicentang · ${n(labels)} label`;
    $('#meta-data').textContent = `${n(rows.length)} baris`;
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
  if (state.table.rows.length && !confirm('Data yang ada sekarang akan diganti. Lanjutkan?')) return;
  try {
    const { columns, rows, delimiter } = parseTable(text);
    const sep = { ',': 'koma', ';': 'titik koma', '\t': 'tab', '|': 'garis tegak' }[delimiter] ?? delimiter;
    setTable({ columns, rows }, `${rows.length} baris diimport dari ${source} (pemisah: ${sep}).`);
  } catch (err) {
    toast(`Import gagal: ${err.message}`, 'error');
  }
}

async function importExcel(file) {
  if (state.table.rows.length && !confirm('Data yang ada sekarang akan diganti. Lanjutkan?')) return;
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
  if (!state.table.columns.length || !confirm('Hapus semua data?')) return;
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
  const name = prompt('Nama kolom baru (mis. nama, alamat, telepon, jumlah):');
  if (name == null) return;
  snapshot('tambah kolom');
  addColumn(state.table, name);
  saveTable(state.table);
  renderColumns();
  refreshTable();
  renderDataSummary();
});

/* ---------------- Tab ---------------- */

function showTab(tab) {
  state.tab = tab;
  for (const btn of document.querySelectorAll('.tab')) btn.classList.toggle('tab--active', btn.dataset.tab === tab);
  $('#view-preview').hidden = tab !== 'preview';
  $('#view-data').hidden = tab !== 'data';
  $('#preview-controls').hidden = tab !== 'preview';
  if (tab === 'preview') renderPreview();
}

for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}

/* ---------------- Preview ---------------- */

function prepareData(p) {
  const items = printItems();
  const pages = paginate(items, labelsPerSheet(p), startSlot(p));
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
  const wPx = page.pageW * MM_TO_PX;
  const hPx = page.pageH * MM_TO_PX;
  const scale = state.zoom === 'fit'
    ? Math.max(0.1, Math.min((area.clientWidth - 48) / wPx, (area.clientHeight - 48) / hPx))
    : Number(state.zoom);
  sheet.style.transform = `scale(${scale})`;
  state.previewScale = scale;
  const sel = getSelectedDecal();
  if (sel) for (const el of sheet.querySelectorAll(`.label-decal[data-decal="${sel}"]`)) el.classList.add('is-selected');

  const frame = document.createElement('div');
  frame.className = 'sheet-frame';
  frame.style.width = `${wPx * scale}px`;
  frame.style.height = `${hPx * scale}px`;
  frame.append(sheet);
  area.replaceChildren(frame);
}

/* ---------------- Geser gambar bebas (branding) di preview ---------------- */

let decalDrag = null;
let suppressClick = false;

/** Geseran mouse di layar (px) → geseran dalam koordinat isi label (mm), memperhitungkan zoom & rotasi. */
function screenToContent(dxPx, dyPx) {
  const k = MM_TO_PX * (state.previewScale || 1);
  const dx = dxPx / k;
  const dy = dyPx / k;
  const o = currentTemplate().orientation;
  if (o === 90) return { du: dy, dv: -dx };
  if (o === 270) return { du: -dy, dv: dx };
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

$('#preview').addEventListener('click', (e) => {
  if (suppressClick || e.target.closest('.label-decal')) return;
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
  const pages = paginate(printItems(), labelsPerSheet(p), startSlot(p));
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

  // tombol "Cetak lembar ini": menonjol bila lembar ini berisi hasil pencarian
  const btn = $('#btn-print-page');
  btn.hidden = !show;
  const hitHere = s.hits.some((h) => h.page === state.page);
  btn.classList.toggle('primary', hitHere);
  btn.classList.toggle('ghost', !hitHere);
  $('#btn-print-page-text').textContent = hitHere ? `Cetak lembar ${state.page + 1}` : 'Cetak lembar ini';
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
$('#pv-search-next').addEventListener('click', () => stepSearch(1));

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
    await exportPdf({
      preset: p, cal, page, tpl: currentTemplate(), pages: data.pages, renderer: data.renderer,
      border: !!state.settings.printBorder, filename: `label-${name}${suffix}.pdf`,
    });
    toast(`PDF dibuat: ${data.pages.length} halaman.`);
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

$('#opt-border').addEventListener('change', (e) => {
  state.settings.printBorder = e.target.checked;
  persistSettings();
  renderPreview();
});

/* ---------------- Opsi cetak ---------------- */

function renderPrintOptions() {
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
  $('#media-info').innerHTML = m.mode === 'label'
    ? `Halaman cetak = lembar label: <b>${pageSizeName(page)}</b>`
    : `Halaman cetak: <b>${pageSizeName(page)}</b> · lembar label digeser X <b>${fmt(page.dx)}</b> mm, Y <b>${fmt(page.dy)}</b> mm`;
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

function downloadBackup() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('cetakLabel.')) data[key] = localStorage.getItem(key);
  }
  const date = new Date().toISOString().slice(0, 10);
  downloadText(`backup-cetak-label-${date}.json`, JSON.stringify({ app: 'cetak-label', backup: 1, data }, null, 2), 'application/json');
}

$('#btn-backup').addEventListener('click', downloadBackup);

/* ---------------- Reset ---------------- */

// Bagian yang bisa direset → kunci localStorage. Setelah dihapus, aplikasi dimuat ulang
// sehingga nilai bawaan dipakai kembali.
const RESET_KEYS = {
  data: ['cetakLabel.data'],
  templates: ['cetakLabel.templates'],
  presets: ['cetakLabel.presets'],
  settings: ['cetakLabel.settings'],
  sections: ['cetakLabel.sections'],
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
  if (!confirm(`Yakin reset: ${names.join(', ')}?`)) return;
  try {
    for (const part of parts) for (const key of RESET_KEYS[part] ?? []) localStorage.removeItem(key);
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
    if (!confirm('Semua data, template, ukuran, dan pengaturan sekarang akan diganti dengan isi backup. Lanjutkan?')) return;
    for (const [key, value] of Object.entries(json.data)) {
      if (key.startsWith('cetakLabel.') && typeof value === 'string') localStorage.setItem(key, value);
    }
    location.reload();
  } catch (err) {
    toast(`Gagal memulihkan: ${err.message}`, 'error');
  }
});

/* ---------------- Panel bisa dilipat ---------------- */

function mountSections() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('cetakLabel.sections') || '{}');
  } catch {
    // abaikan
  }
  for (const sec of document.querySelectorAll('.section')) {
    const key = sec.dataset.section;
    if (key in saved) sec.open = saved[key];
    sec.addEventListener('toggle', () => {
      saved[key] = sec.open;
      try {
        localStorage.setItem('cetakLabel.sections', JSON.stringify(saved));
      } catch {
        // abaikan
      }
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
mountTemplateEditor({
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
loadPhotos().then((n) => {
  if (!n) return;
  renderPhotoControls();
  renderDataWarnings();
  renderPreview();
});
