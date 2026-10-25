import { load, save } from './storage.js';
import { EN, EN_PATTERNS } from './i18n-en.js';

// Bahasa antarmuka: Indonesia (sumber, ditulis langsung di kode/HTML) atau English.
//
// Cara kerja: teks antarmuka tetap ditulis dalam bahasa Indonesia. Saat bahasa English
// dipilih, setiap teks (node teks + atribut title/placeholder/aria-label) dicocokkan ke
// kamus EN / pola EN_PATTERNS lalu diganti. MutationObserver ikut menerjemahkan konten
// yang muncul belakangan (toast, panel dinamis). Teks aslinya disimpan sehingga bisa
// kembali ke Indonesia tanpa memuat ulang.
//
// Isi label & data pengguna TIDAK diterjemahkan: elemen ber-atribut translate="no"
// (preview, area cetak, nama kolom, teks template, …) dilewati.

export const LANGS = ['id', 'en'];
const ATTRS = ['title', 'placeholder', 'aria-label'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);

export let lang = LANGS.includes(load('lang', null)) ? load('lang', null)
  : (navigator.language || '').toLowerCase().startsWith('id') ? 'id' : 'en';

const textOrig = new WeakMap(); // node teks → { src, out }
const attrOrig = new WeakMap(); // elemen → { [atribut]: { src, out } }
const tracked = new Set(); // node/elemen yang pernah diterjemahkan (untuk kembali ke Indonesia)

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Terjemahan satu teks Indonesia → English (null bila tidak ada di kamus). */
function translate(s) {
  const key = norm(s);
  if (!key || !/[A-Za-z]/.test(key)) return null;
  let out = EN[key];
  if (out == null) {
    for (const [re, rep] of EN_PATTERNS) {
      if (re.test(key)) {
        out = key.replace(re, rep);
        break;
      }
    }
  }
  if (out == null) return null;
  // pertahankan spasi di awal/akhir (teks di antara <b>…</b> dsb.)
  return (/^\s/.test(s) ? ' ' : '') + out + (/\s$/.test(s) ? ' ' : '');
}

// Bahasa Indonesia tidak membedakan tunggal/jamak, jadi kata satuan di ringkasan angka
// ("1 sheet" / "2 sheets") dipilih langsung saat render, bukan lewat kamus.
const EN_UNITS = { label: ['label', 'labels'], lembar: ['sheet', 'sheets'], baris: ['row', 'rows'] };

/** Kata satuan untuk angka n, mis. unit(1, 'lembar') → "sheet" (EN) / "lembar" (ID). */
export function unit(n, word) {
  const en = EN_UNITS[word];
  return lang === 'en' && en ? en[n === 1 ? 0 : 1] : word;
}

/** Untuk teks di kode yang tidak lewat DOM (confirm, prompt, alert) atau dirender ulang saat ganti bahasa. */
export function t(s) {
  return lang === 'en' ? translate(s) ?? s : s;
}

const skipped = (el) => !el || el.closest?.('[translate="no"]') || SKIP_TAGS.has(el.tagName);

function doText(node) {
  if (skipped(node.parentElement)) return;
  const cur = node.nodeValue;
  const rec = textOrig.get(node);
  if (rec && cur === rec.out) return; // sudah diterjemahkan
  const out = translate(cur);
  if (out == null || out === cur) return;
  textOrig.set(node, { src: cur, out });
  tracked.add(node);
  node.nodeValue = out;
}

function doAttr(el, name) {
  const cur = el.getAttribute(name);
  if (cur == null || skipped(el)) return;
  const recs = attrOrig.get(el) ?? {};
  if (recs[name] && cur === recs[name].out) return;
  const out = translate(cur);
  if (out == null || out === cur) return;
  recs[name] = { src: cur, out };
  attrOrig.set(el, recs);
  tracked.add(el);
  el.setAttribute(name, out);
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root);
  if (root.nodeType !== Node.ELEMENT_NODE || skipped(root)) return;
  for (const a of ATTRS) if (root.hasAttribute(a)) doAttr(root, a);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && skipped(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n);
    else for (const a of ATTRS) if (n.hasAttribute(a)) doAttr(n, a);
  }
}

/** Kembalikan semua teks yang pernah diterjemahkan ke bahasa Indonesia. */
function restore() {
  for (const n of tracked) {
    if (n.nodeType === Node.TEXT_NODE) {
      const rec = textOrig.get(n);
      if (rec && n.nodeValue === rec.out) n.nodeValue = rec.src;
      textOrig.delete(n);
    } else {
      const recs = attrOrig.get(n) ?? {};
      for (const [a, rec] of Object.entries(recs)) if (n.getAttribute(a) === rec.out) n.setAttribute(a, rec.src);
      attrOrig.delete(n);
    }
  }
  tracked.clear();
}

let observer = null;

function observe() {
  observer ??= new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') {
        if (r.target.nodeType === Node.ELEMENT_NODE && skipped(r.target)) continue;
        for (const n of r.addedNodes) walk(n);
      } else if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttr(r.target, r.attributeName);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

function apply() {
  document.documentElement.lang = lang;
  document.title = 'Cetak Label'; // nama aplikasi (merek) tidak diterjemahkan
  for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('active', b.dataset.lang === lang);
  if (lang === 'en') {
    walk(document.body);
    observe();
  } else {
    observer?.disconnect();
    observer = null;
    restore();
  }
}

export function initI18n() {
  apply();
}

/** Ganti bahasa; event 'langchange' memberi tahu bagian yang perlu dirender ulang. */
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  save('lang', lang);
  apply();
  document.dispatchEvent(new CustomEvent('langchange'));
}
