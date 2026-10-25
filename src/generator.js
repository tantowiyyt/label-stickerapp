import { t } from './i18n.js';
import { encode, codeSvg, codePngBlob, codeSvgFile, BARCODE_FORMATS, isBarcode } from './code.js';
import { $, toast, downloadBlob, downloadText } from './util.js';

// Generator QR / Barcode:
//  1. "Buat satu kode": ketik teks → lihat → download PNG / SVG.
//  2. "Isi kolom kode otomatis": nomor urut (PST-0001, …) atau kode acak unik untuk setiap baris data.

const FORMATS = [['qr', 'QR code'], ...Object.entries(BARCODE_FORMATS).map(([k, f]) => [k, f.label])];
const RAND_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa O/0/I/1 yang mudah tertukar

let ctx; // { getTable(), fillColumn(name, values, onlyChecked, useForLabel) }

/* ---------- 1. Satu kode ---------- */

function currentSingle() {
  const type = $('#gen-format').value;
  const value = $('#gen-text').value.trim();
  return { type, value, enc: encode(type, value) };
}

function renderSingle() {
  const { type, enc } = currentSingle();
  const barcode = isBarcode(type);
  $('#gen-hint').textContent = barcode ? `${BARCODE_FORMATS[type].label}: ${BARCODE_FORMATS[type].hint}.` : 'QR code: teks apa saja, termasuk URL, nomor WA, atau teks panjang.';
  $('#gen-caption').closest('label').hidden = !barcode;
  const ok = enc && !enc.error;
  $('#gen-error').textContent = !enc ? 'Isi masih kosong.' : enc.error ?? '';
  $('#gen-png').disabled = $('#gen-svg').disabled = !ok;
  const box = $('#gen-preview');
  if (!ok) {
    box.innerHTML = '';
    return;
  }
  // pratinjau: QR persegi, barcode melebar
  const aspect = enc.type === 'qr' ? 'width:180px;height:180px' : 'width:100%;height:110px';
  box.innerHTML = `<div style="${aspect}">${codeSvg(enc)}</div>`;
}

const safeName = (t) => t.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'kode';

async function downloadSingle(kind) {
  const { type, value, enc } = currentSingle();
  if (!enc || enc.error) return;
  const caption = $('#gen-caption').checked;
  const name = `${type}-${safeName(value)}`;
  if (kind === 'png') downloadBlob(`${name}.png`, await codePngBlob(enc, value, { caption }));
  else downloadText(`${name}.svg`, codeSvgFile(enc, value, { caption }), 'image/svg+xml');
}

/* ---------- 2. Isi kolom otomatis ---------- */

function fillOptions() {
  return {
    mode: $('#gen-mode .active')?.dataset.value ?? 'seq',
    prefix: $('#gen-prefix').value,
    suffix: $('#gen-suffix').value,
    start: Math.max(0, Math.round(Number($('#gen-start').value)) || 0),
    digits: Math.min(12, Math.max(1, Math.round(Number($('#gen-digits').value)) || 1)),
    rlen: Math.min(24, Math.max(4, Math.round(Number($('#gen-rlen').value)) || 8)),
  };
}

function randomCode(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => RAND_CHARS[b % RAND_CHARS.length]).join('');
}

/** Buat n kode sesuai pengaturan; kode acak dijamin tidak ada yang sama. */
export function makeCodes(n, o, existing = new Set()) {
  const out = [];
  if (o.mode === 'seq') {
    for (let i = 0; i < n; i++) out.push(`${o.prefix}${String(o.start + i).padStart(o.digits, '0')}${o.suffix}`);
    return out;
  }
  const seen = new Set(existing);
  while (out.length < n) {
    const code = `${o.prefix}${randomCode(o.rlen)}${o.suffix}`;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

function targetRows() {
  const rows = ctx.getTable().rows;
  return $('#gen-only-on').checked ? rows.filter((r) => r.on) : rows;
}

function renderFill() {
  const o = fillOptions();
  for (const el of document.querySelectorAll('.gen-seq')) el.hidden = o.mode !== 'seq';
  for (const el of document.querySelectorAll('.gen-rand')) el.hidden = o.mode !== 'rand';
  const n = targetRows().length;
  const col = $('#gen-col').value.trim();
  const exists = ctx.getTable().columns.includes(col);
  const samples = makeCodes(Math.min(3, Math.max(1, n)), o);
  $('#gen-sample').innerHTML = !ctx.getTable().columns.length
    ? 'Import data terlebih dahulu.'
    : `Contoh: <b>${samples.join('</b>, <b>')}</b>${n > 3 ? ', …' : ''} · ${n.toLocaleString('id-ID')} baris` +
      (exists ? ` · <span style="color:var(--danger)">kolom "${col}" sudah ada, isinya akan ditimpa</span>` : '');
  $('#gen-fill').disabled = !n || !col;
}

function applyFill() {
  const col = $('#gen-col').value.trim();
  const rows = targetRows();
  if (!col || !rows.length) return;
  const table = ctx.getTable();
  if (table.columns.includes(col) && !confirm(t(`Kolom "${col}" sudah ada. Timpa isinya untuk ${rows.length} baris?`))) return;
  const o = fillOptions();
  // kode acak tidak boleh sama dengan kode yang sudah ada di baris lain
  const others = new Set(table.rows.filter((r) => !rows.includes(r)).map((r) => String(r.values[col] ?? '')).filter(Boolean));
  const codes = makeCodes(rows.length, o, others);
  ctx.fillColumn(col, new Map(rows.map((r, i) => [r, codes[i]])), $('#gen-use').checked);
  $('#gen-dialog').close();
  toast(`${rows.length.toLocaleString('id-ID')} kode dibuat di kolom "${col}".`);
}

/* ---------- Pasang ---------- */

function showTab(tab) {
  for (const b of document.querySelectorAll('[data-gen-tab]')) b.classList.toggle('tab--active', b.dataset.genTab === tab);
  for (const p of document.querySelectorAll('[data-gen-pane]')) p.hidden = p.dataset.genPane !== tab;
  if (tab === 'fill') renderFill();
  else renderSingle();
}

export function openGenerator(tab = 'single') {
  showTab(tab);
  $('#gen-dialog').showModal();
}

export function mountGenerator(context) {
  ctx = context;
  $('#gen-format').innerHTML = FORMATS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  for (const b of document.querySelectorAll('[data-gen-tab]')) b.addEventListener('click', () => showTab(b.dataset.genTab));
  $('#gen-text').addEventListener('input', renderSingle);
  $('#gen-format').addEventListener('change', renderSingle);
  $('#gen-png').addEventListener('click', () => downloadSingle('png'));
  $('#gen-svg').addEventListener('click', () => downloadSingle('svg'));

  $('#gen-mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    for (const x of $('#gen-mode').querySelectorAll('[data-value]')) x.classList.toggle('active', x === b);
    renderFill();
  });
  for (const id of ['#gen-col', '#gen-prefix', '#gen-suffix', '#gen-start', '#gen-digits', '#gen-rlen']) {
    $(id).addEventListener('input', renderFill);
  }
  $('#gen-only-on').addEventListener('change', renderFill);
  $('#gen-fill').addEventListener('click', applyFill);
}
