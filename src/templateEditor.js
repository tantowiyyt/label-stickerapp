import {
  ALIGNS, VALIGNS, ORIENTATIONS, DEFAULT_TEMPLATE, templateLines, syncLines, applyQuickStyle,
  unknownPlaceholders, loadTemplates, saveTemplates, newTemplateId, groupKey, fillGroupColors, newDecalId, decalHeight,
  exportTemplatesFile, parseTemplatesFile,
} from './template.js';
import { $, toast } from './util.js';
import { fontOptionsHtml, askCustomFont, cssFamily } from './fonts.js';
import { addPhotos, clearPhotos, photoCount, photoUrl } from './photos.js';
import { contentBox } from './renderer.js';
import { BARCODE_FORMATS, isBarcode } from './code.js';

/* ---------- Ikon (gaya tombol perataan seperti di Word) ---------- */

const svg = (body) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${body}</svg>`;

const ICONS = {
  left: svg('<path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/>'),
  center: svg('<path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/>'),
  right: svg('<path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/>'),
  top: svg('<path d="M2 2h12"/><path d="M5 5h6M5 8h6" stroke-width="2.2"/>'),
  middle: svg('<path d="M2 8h12" stroke-dasharray="1.5 1.5"/><path d="M5 5.5h6M5 10.5h6" stroke-width="2.2"/>'),
  bottom: svg('<path d="M2 14h12"/><path d="M5 8h6M5 11h6" stroke-width="2.2"/>'),
  o0: svg('<rect x="4" y="1.5" width="8" height="13" rx="1"/><path d="M6 5h4M6 7.5h4"/>'),
  o90: svg('<rect x="4" y="1.5" width="8" height="13" rx="1"/><path d="M9.5 4.5v7M7 4.5v7"/>'),
  o270: svg('<rect x="4" y="1.5" width="8" height="13" rx="1"/><path d="M6.5 4.5v7M9 4.5v7"/><path d="M5.8 12.5h4.4" stroke-width="1"/>'),
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

function renderLines() {
  const tpl = syncLines(currentTemplate());
  const texts = templateLines(tpl);
  $('#tpl-lines').innerHTML = tpl.lines.map((l, i) => `
    <div class="line-row" data-i="${i}">
      <div class="line-head"><span class="line-no">${i + 1}</span><code class="line-text">${escapeHtml(texts[i]) || '<i>(kosong)</i>'}</code></div>
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
      </div>
    </div>`).join('');
}

function syncControls() {
  const tpl = currentTemplate();
  setActive($('#tpl-align'), tpl.align);
  setActive($('#tpl-valign'), tpl.valign);
  setActive($('#tpl-orient'), tpl.orientation);
  syncCodeControls(tpl);
  syncImageControls(tpl);
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
        <span class="grp-name" title="${escapeHtml(g.label)}">${escapeHtml(g.label)}</span>
        <span class="grp-count">${g.count.toLocaleString('id-ID')}</span>
      </label>`).join('')
    : '<div class="grp-empty">Kolom ini kosong di data.</div>';
}

/* ---------- Logo / gambar ---------- */

const MAX_IMG_PX = 600; // cukup tajam untuk logo ukuran label; menjaga localStorage tetap kecil

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

function syncImageControls(tpl) {
  const im = tpl.image;
  const thumb = $('#tpl-img-thumb');
  thumb.style.backgroundImage = im.src ? `url("${im.src}")` : '';
  thumb.classList.toggle('logo-thumb--set', !!im.src);
  $('#tpl-img-del').hidden = !im.src;
  $('#tpl-img-pick').textContent = im.src ? 'Ganti gambar…' : 'Pilih gambar…';
  $('#tpl-img-opts').hidden = !im.src;
  setActive($('#tpl-img-pos'), im.position);
  $('#tpl-img-size').value = im.size;
  $('#tpl-img-size-label').textContent = im.position === 'top' || im.position === 'bottom' ? 'Tinggi area' : 'Lebar area';
}

/* ---------- Gambar bebas (branding) ---------- */

let selectedDecal = null;
export const getSelectedDecal = () => selectedDecal;

export function selectDecal(id) {
  selectedDecal = id;
  for (const el of document.querySelectorAll('.dc-item')) el.classList.toggle('is-selected', el.dataset.id === id);
  for (const el of document.querySelectorAll('.label-decal')) el.classList.toggle('is-selected', el.dataset.decal === id);
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
  setActive($('#tpl-code-pos'), c.position);
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
  $('#tpl-code-size').value = c.size;
  $('#tpl-code-text').checked = c.showText;
  $('#tpl-code-text-row').hidden = !barcode;
  const vertical = c.position === 'top' || c.position === 'bottom';
  $('#tpl-code-size-label').textContent = c.type === 'qr' ? 'Ukuran (sisi)' : vertical ? 'Tinggi' : 'Lebar';

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
  syncControls();
}

function selectTemplate(id) {
  currentId = id;
  const s = ctx.getSettings();
  s.templateId = id;
  ctx.saveSettings();
  renderTemplateEditor();
  ctx.onChange();
}

/* ---------- Event ---------- */

export function mountTemplateEditor(context) {
  ctx = context;
  currentId = ctx.getSettings().templateId ?? DEFAULT_TEMPLATE.id;
  if (!templates.some((t) => t.id === currentId)) currentId = templates[0].id;

  $('#tpl-align').innerHTML = segButtons(ALIGNS);
  $('#tpl-valign').innerHTML = segButtons(VALIGNS);
  $('#tpl-orient').innerHTML = segButtons(ORIENTATIONS, (v) => `o${v}`);

  $('#tpl-select').addEventListener('change', (e) => selectTemplate(e.target.value));

  $('#tpl-name').addEventListener('input', (e) => {
    currentTemplate().nama = e.target.value;
    $('#tpl-select').selectedOptions[0].textContent = e.target.value || '(tanpa nama)';
    $('#meta-tpl').textContent = e.target.value;
    saveTemplates(templates);
  });

  $('#tpl-save-as').addEventListener('click', () => {
    const src = currentTemplate();
    const nama = prompt('Nama template baru:', `${src.nama} (salinan)`);
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
    if (!confirm(`Hapus template "${tpl.nama}"?`)) return;
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
  lines.addEventListener('click', (e) => {
    const row = e.target.closest('.line-row');
    const btn = e.target.closest('button');
    if (!row || !btn) return;
    const l = currentTemplate().lines[row.dataset.i];
    if (btn.dataset.prop) l[btn.dataset.prop] = !l[btn.dataset.prop];
    else if (btn.dataset.align) l.align = l.align === btn.dataset.align ? null : btn.dataset.align;
    changed({ lines: true });
  });
  lines.addEventListener('change', (e) => {
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
  bindSeg('#tpl-code-pos', (t, v) => { t.code.position = v; });
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
    currentTemplate().code.size = v;
    changed();
  });
  $('#tpl-code-text').addEventListener('change', (e) => {
    currentTemplate().code.showText = e.target.checked;
    changed();
  });

  $('#tpl-img-pick').addEventListener('click', () => $('#tpl-img-file').click());
  $('#tpl-img-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { src, w, h } = await loadImageFile(file);
      Object.assign(currentTemplate().image, { src, w, h });
      changed();
      toast('Gambar ditambahkan ke label.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#tpl-img-del').addEventListener('click', () => {
    Object.assign(currentTemplate().image, { src: '', w: 0, h: 0 });
    changed();
  });
  bindSeg('#tpl-img-pos', (t, v) => { t.image.position = v; });
  $('#tpl-img-size').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v) || v <= 0) return;
    currentTemplate().image.size = v;
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
    if (e.target.closest('.dc-del')) {
      tpl.decals = tpl.decals.filter((x) => x.id !== id);
      if (selectedDecal === id) selectedDecal = null;
      changed();
      return;
    }
    if (e.target.closest('.dc-center')) return updateDecal(id, centerDecal(d));
    const layerBtn = e.target.closest('.dc-layer [data-value]');
    if (layerBtn) return updateDecal(id, { layer: layerBtn.dataset.value });
    selectDecal(id);
  });
  dcList.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    const item = e.target.closest('.dc-item');
    if (!k || !item) return;
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
    if (!confirm(`Hapus semua ${photoCount()} foto yang tersimpan di browser ini?`)) return;
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
