import { $ } from './util.js';
import { fontOptionsHtml, askCustomFont, cssFamily } from './fonts.js';
import { OVERFLOW_OPTIONS, overflowValue } from './template.js';

// Toolbar mini ala MS Word: muncul di atas teks yang dipilih di preview (baris template
// atau teks bebas) untuk mengganti font, ukuran, tebal/miring, warna, dan rata.
//
// ctx.target() → null, atau objek:
//   { key, title, style, update(patch), reset?(), remove?(), anchor: Element,
//     free: bool (teks bebas: ada kotak isian teks, tanpa pilihan "Jika panjang"),
//     setText?(v) }

const svg = (body) =>
  `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${body}</svg>`;
const ALIGN_ICONS = {
  left: svg('<path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/>'),
  center: svg('<path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/>'),
  right: svg('<path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/>'),
};
const ALIGN_TITLES = { left: 'Rata kiri', center: 'Rata tengah', right: 'Rata kanan' };
const SWATCHES = ['#000000', '#1d4ed8', '#dc2626', '#15803d', '#7c3aed', '#ea580c'];

let ctx; // { target(), getTemplate(), close() }
let bar;
let lastFontKey = '';
let lastKey = '';

export function mountLineToolbar(context) {
  ctx = context;
  bar = document.createElement('div');
  bar.id = 'line-toolbar';
  bar.className = 'line-toolbar';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Format teks');
  bar.innerHTML = `
    <span class="lt-no"></span>
    <input type="text" class="lt-text" placeholder="Ketik teks…" aria-label="Isi teks bebas" title="Isi teks (boleh berisi {{kolom}})">
    <select class="lt-font" title="Font"></select>
    <div class="lt-size" title="Ukuran font. Ctrl+[ / Ctrl+]">
      <button type="button" class="lt-btn" data-act="smaller" aria-label="Perkecil">A<small>−</small></button>
      <input type="number" class="lt-size-input" min="4" max="96" step="0.5" aria-label="Ukuran font (pt)">
      <button type="button" class="lt-btn" data-act="bigger" aria-label="Perbesar">A<small>+</small></button>
    </div>
    <span class="lt-sep"></span>
    <button type="button" class="lt-btn" data-prop="bold" title="Tebal (Ctrl+B)"><b>B</b></button>
    <button type="button" class="lt-btn" data-prop="italic" title="Miring (Ctrl+I)"><i>I</i></button>
    <button type="button" class="lt-btn" data-prop="upper" title="HURUF BESAR SEMUA">AA</button>
    <span class="lt-sep"></span>
    <label class="lt-color" title="Warna teks"><span class="lt-color-a">A</span><span class="lt-color-bar"></span><input type="color" class="lt-color-input"></label>
    <div class="lt-swatches">${SWATCHES.map((c) => `<button type="button" class="lt-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
    <span class="lt-sep"></span>
    ${Object.keys(ALIGN_ICONS).map((a) => `<button type="button" class="lt-btn" data-align="${a}" title="${ALIGN_TITLES[a]}">${ALIGN_ICONS[a]}</button>`).join('')}
    <span class="lt-sep lt-overflow-sep"></span>
    <select class="lt-overflow" title="Jika teks terlalu panjang untuk label">
      ${OVERFLOW_OPTIONS.map((o) => `<option value="${o.value}" title="${o.title}">↵ ${o.label}</option>`).join('')}
    </select>
    <span class="lt-sep lt-arrange-sep"></span>
    <div class="lt-arrange">
      <button type="button" class="lt-btn lt-arrange-btn" data-act="arrange-menu" aria-haspopup="menu" aria-expanded="false" title="Posisi di label (rata kiri/tengah/kanan, atas/tengah/bawah)">${svg('<path d="M8 2v12"/><rect x="3" y="4" width="10" height="3" rx=".8"/><rect x="4.5" y="9" width="7" height="3" rx=".8"/>')}<span>Posisi</span>${svg('<path d="M4.5 6.5 8 10l3.5-3.5"/>')}</button>
      <div class="lt-menu" role="menu" hidden>
        <button type="button" role="menuitem" data-arrange="left">${svg('<path d="M2.5 2v12"/><rect x="5" y="4" width="8" height="3" rx=".8"/><rect x="5" y="9" width="5" height="3" rx=".8"/>')}<span>Rata kiri label</span></button>
        <button type="button" role="menuitem" data-arrange="hcenter">${svg('<path d="M8 2v12"/><rect x="3" y="4" width="10" height="3" rx=".8"/><rect x="4.5" y="9" width="7" height="3" rx=".8"/>')}<span>Tengah horizontal</span></button>
        <button type="button" role="menuitem" data-arrange="right">${svg('<path d="M13.5 2v12"/><rect x="3" y="4" width="8" height="3" rx=".8"/><rect x="6" y="9" width="5" height="3" rx=".8"/>')}<span>Rata kanan label</span></button>
        <span class="lt-menu-sep"></span>
        <button type="button" role="menuitem" data-arrange="top">${svg('<path d="M2 2.5h12"/><rect x="4" y="5" width="3" height="8" rx=".8"/><rect x="9" y="5" width="3" height="5" rx=".8"/>')}<span>Rata atas label</span></button>
        <button type="button" role="menuitem" data-arrange="vcenter">${svg('<path d="M2 8h12"/><rect x="4" y="3" width="3" height="10" rx=".8"/><rect x="9" y="4.5" width="3" height="7" rx=".8"/>')}<span>Tengah vertikal</span></button>
        <button type="button" role="menuitem" data-arrange="bottom">${svg('<path d="M2 13.5h12"/><rect x="4" y="3" width="3" height="8" rx=".8"/><rect x="9" y="6" width="3" height="5" rx=".8"/>')}<span>Rata bawah label</span></button>
        <span class="lt-menu-sep lt-layer-item"></span>
        <button type="button" role="menuitem" class="lt-layer-item" data-layer="front">${svg('<rect x="5" y="5" width="8" height="8" rx="1" fill="currentColor" stroke="none"/><rect x="2.5" y="2.5" width="8" height="8" rx="1"/>')}<span>Di depan teks</span></button>
        <button type="button" role="menuitem" class="lt-layer-item" data-layer="back">${svg('<rect x="2.5" y="2.5" width="8" height="8" rx="1" fill="currentColor" stroke="none"/><rect x="5" y="5" width="8" height="8" rx="1"/>')}<span>Di belakang teks</span></button>
      </div>
    </div>
    <button type="button" class="lt-btn lt-dup" data-act="duplicate" title="Duplikat (Ctrl+D)">${svg('<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M11 5V3.5a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1V10a1 1 0 0 0 1 1H5"/>')}</button>
    <button type="button" class="lt-btn lt-reset" data-act="reset" title="Kembalikan posisi baris ini">↺</button>
    <button type="button" class="lt-btn lt-del" data-act="remove" title="Hapus (Delete)">${svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5M7 7v4M9 7v4"/>')}</button>
    <button type="button" class="lt-btn lt-close" data-act="close" title="Tutup (Esc)">✕</button>`;
  document.body.append(bar);

  // jangan sampai klik di toolbar membatalkan pilihan
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());

  const menu = bar.querySelector('.lt-menu');
  const menuBtn = bar.querySelector('.lt-arrange-btn');
  const toggleMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.lt-arrange')) toggleMenu(false); });

  bar.addEventListener('click', (e) => {
    const t = ctx.target();
    const btn = e.target.closest('button');
    if (!btn || !t) return;
    if (btn.dataset.act === 'arrange-menu') return toggleMenu(menu.hidden);
    if (btn.dataset.arrange || btn.dataset.layer) {
      toggleMenu(false);
      if (btn.dataset.arrange) t.arrange?.(btn.dataset.arrange);
      else t.setLayer?.(btn.dataset.layer);
      return;
    }
    if (btn.dataset.act === 'duplicate') return t.duplicate?.();
    const s = t.style;
    if (btn.dataset.prop) t.update({ [btn.dataset.prop]: !s[btn.dataset.prop] });
    // baris template: klik rata yang aktif = kembali ikut rata global
    else if (btn.dataset.align) t.update({ align: !t.free && s.align === btn.dataset.align ? null : btn.dataset.align });
    else if (btn.dataset.color) t.update({ color: btn.dataset.color });
    else if (btn.dataset.act === 'smaller') t.update({ size: stepSize(s.size, -1) });
    else if (btn.dataset.act === 'bigger') t.update({ size: stepSize(s.size, 1) });
    else if (btn.dataset.act === 'reset') t.reset?.();
    else if (btn.dataset.act === 'remove') t.remove?.();
    else if (btn.dataset.act === 'close') ctx.close();
  });

  bar.querySelector('.lt-text').addEventListener('input', (e) => ctx.target()?.setText?.(e.target.value));
  bar.querySelector('.lt-font').addEventListener('change', (e) => {
    const t = ctx.target();
    if (!t) return;
    let font = e.target.value;
    if (font === '__custom') font = askCustomFont() ?? t.style.font ?? '';
    lastFontKey = '';
    t.update({ font: font || null });
  });
  bar.querySelector('.lt-size-input').addEventListener('input', (e) => {
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (Number.isFinite(v) && v >= 4 && v <= 96) ctx.target()?.update({ size: v });
  });
  bar.querySelector('.lt-color-input').addEventListener('input', (e) => ctx.target()?.update({ color: e.target.value }));
  bar.querySelector('.lt-overflow').addEventListener('change', (e) => {
    const o = OVERFLOW_OPTIONS.find((x) => x.value === e.target.value);
    if (o) ctx.target()?.update({ overflow: o.overflow, maxRows: o.maxRows });
  });

  // Pintasan seperti di Word saat teks dipilih
  document.addEventListener('keydown', (e) => {
    const t = ctx.target();
    if (!t || bar.hidden || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.target.closest('input:not(.lt-size-input), textarea, select') || document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    const s = t.style;
    let patch = null;
    if (t.object) return;
    if (k === 'b') patch = { bold: !s.bold };
    else if (k === 'i') patch = { italic: !s.italic };
    else if (k === ']') patch = { size: stepSize(s.size, 1) };
    else if (k === '[') patch = { size: stepSize(s.size, -1) };
    if (!patch) return;
    e.preventDefault();
    t.update(patch);
  });

  const reposition = () => syncLineToolbar();
  window.addEventListener('resize', reposition);
  $('#preview').addEventListener('scroll', reposition, { passive: true });
}

/** Ukuran berikutnya seperti tombol "Perbesar/Perkecil font" di Word. */
const SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72, 96];
function stepSize(size, dir) {
  if (dir > 0) return SIZES.find((s) => s > size) ?? 96;
  return [...SIZES].reverse().find((s) => s < size) ?? 4;
}

/** Fokuskan kotak isi teks di toolbar (teks bebas baru dari toolbar atas). */
export function focusToolbarText() {
  syncLineToolbar();
  const input = bar?.querySelector('.lt-text');
  if (input && !bar.hidden && !input.hidden) {
    input.focus();
    input.select();
  }
}

/** Tampilkan/sembunyikan toolbar dan isi nilainya sesuai teks yang dipilih. */
export function syncLineToolbar() {
  if (!bar) return;
  const t = ctx.target();
  if (!t?.anchor) {
    bar.hidden = true;
    lastKey = '';
    return;
  }
  const tpl = ctx.getTemplate();
  const s = t.style ?? {};
  bar.hidden = false;
  bar.classList.toggle('line-toolbar--free', !!t.free);
  // gambar & QR: hanya alat atur (posisi, duplikat, lapisan, hapus), tanpa format teks
  bar.classList.toggle('line-toolbar--object', !!t.object);
  bar.querySelector('.lt-dup').hidden = !t.duplicate;
  for (const el of bar.querySelectorAll('.lt-layer-item')) el.hidden = !t.setLayer;
  for (const b of bar.querySelectorAll('[data-layer]')) b.classList.toggle('active', b.dataset.layer === t.layer);
  if (lastKey !== t.key) {
    // objek lain dipilih: tutup menu Posisi
    bar.querySelector('.lt-menu').hidden = true;
    bar.querySelector('.lt-arrange-btn').setAttribute('aria-expanded', 'false');
  }
  bar.querySelector('.lt-no').textContent = t.title;

  if (t.object) return place(t.anchor, t.key);
  const text = bar.querySelector('.lt-text');
  text.hidden = !t.free;
  if (t.free && (document.activeElement !== text || lastKey !== t.key)) text.value = s.text;

  const font = bar.querySelector('.lt-font');
  const fontKey = `${t.key}|${tpl.font}|${s.font ?? ''}`;
  if (fontKey !== lastFontKey && document.activeElement !== font) {
    font.innerHTML = fontOptionsHtml(s.font || '', `Font global (${tpl.font})`);
    font.style.fontFamily = cssFamily(s.font || tpl.font);
    lastFontKey = fontKey;
  }
  const size = bar.querySelector('.lt-size-input');
  if (document.activeElement !== size) size.value = s.size;
  for (const b of bar.querySelectorAll('[data-prop]')) b.classList.toggle('active', !!s[b.dataset.prop]);
  for (const b of bar.querySelectorAll('[data-align]')) b.classList.toggle('active', s.align === b.dataset.align);
  for (const b of bar.querySelectorAll('[data-color]')) b.classList.toggle('active', b.dataset.color.toLowerCase() === s.color.toLowerCase());
  bar.querySelector('.lt-color-input').value = s.color;
  bar.querySelector('.lt-color-bar').style.background = s.color;
  bar.querySelector('.lt-overflow').hidden = bar.querySelector('.lt-overflow-sep').hidden = !!t.free;
  if (!t.free) bar.querySelector('.lt-overflow').value = overflowValue(s);
  bar.querySelector('.lt-reset').hidden = t.free || (!s.dx && !s.dy);
  place(t.anchor, t.key);
}

/** Letakkan toolbar di atas objek (atau di bawahnya bila tidak cukup ruang), tetap di dalam layar. */
function place(anchor, key) {
  bar.querySelector('.lt-del').hidden = !ctx.target()?.remove;
  lastKey = key;
  const r = anchor.getBoundingClientRect();
  const area = $('#preview').getBoundingClientRect();
  const bw = bar.offsetWidth;
  const bh = bar.offsetHeight;
  let top = r.top - bh - 10;
  if (top < area.top + 4) top = r.bottom + 10;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), window.innerWidth - bw - 8);
  bar.style.top = `${Math.round(top)}px`;
  bar.style.left = `${Math.round(left)}px`;
  // teks tergulung keluar area preview: sembunyikan sementara
  bar.classList.toggle('line-toolbar--off', r.bottom < area.top || r.top > area.bottom);
}
