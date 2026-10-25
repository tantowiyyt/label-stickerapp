// Penyimpanan data aplikasi. Isi disimpan di IndexedDB (kapasitas ratusan MB; localStorage
// hanya ±5 MB dan bisa penuh oleh data ribuan baris + gambar). Agar sisa kode tetap sinkron,
// semua isi dimuat ke memori saat aplikasi dibuka (initStorage, lihat boot.js), lalu setiap
// perubahan ditulis ke IndexedDB di latar belakang.
//
// Kunci tetap berawalan "cetakLabel." (sama dengan format file backup lama).
// Bila IndexedDB tidak tersedia, otomatis kembali memakai localStorage.

const PREFIX = 'cetakLabel.';
const DB_NAME = 'cetak-label';
const STORE = 'kv';
const WRITE_DELAY = 250; // ms; perubahan beruntun (mis. menggeser) digabung

const cache = new Map(); // kunci lengkap → string JSON
const pending = new Map(); // kunci lengkap → string JSON | null (hapus)
let db = null;
let timer = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

function localKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
  } catch {
    // localStorage diblokir
  }
  return keys;
}

/** Muat semua isi ke memori. Dipanggil sekali sebelum aplikasi dimulai. */
export async function initStorage() {
  try {
    db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [keys, values] = await Promise.all([
      new Promise((res, rej) => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
      new Promise((res, rej) => { const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    ]);
    keys.forEach((k, i) => cache.set(String(k), values[i]));

    // pindahan dari versi lama (localStorage) → IndexedDB, sekali saja
    const legacy = localKeys();
    if (!cache.size && legacy.length) {
      const wtx = db.transaction(STORE, 'readwrite');
      for (const k of legacy) {
        const v = localStorage.getItem(k);
        cache.set(k, v);
        wtx.objectStore(STORE).put(v, k);
      }
      await done(wtx);
      for (const k of legacy) localStorage.removeItem(k); // kosongkan agar tidak ada dua salinan
    }
  } catch (err) {
    console.warn('IndexedDB tidak tersedia, memakai localStorage:', err);
    db = null;
    for (const k of localKeys()) cache.set(k, localStorage.getItem(k));
  }
  // minta browser tidak menghapus data ini saat ruang penyimpanan menipis
  navigator.storage?.persist?.().catch(() => {});
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

/** Tulis perubahan yang tertunda sekarang juga (dipakai sebelum memuat ulang halaman). */
export async function flush() {
  clearTimeout(timer);
  timer = null;
  if (!pending.size) return;
  const batch = [...pending];
  pending.clear();
  if (!db) {
    for (const [k, v] of batch) {
      try {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch (err) {
        console.warn('Gagal menyimpan:', err);
      }
    }
    return;
  }
  try {
    const tx = db.transaction(STORE, 'readwrite');
    for (const [k, v] of batch) {
      if (v == null) tx.objectStore(STORE).delete(k);
      else tx.objectStore(STORE).put(v, k);
    }
    await done(tx);
  } catch (err) {
    console.warn('Gagal menyimpan ke IndexedDB:', err);
  }
}

function queue(fullKey, raw) {
  if (raw == null) cache.delete(fullKey);
  else cache.set(fullKey, raw);
  pending.set(fullKey, raw);
  clearTimeout(timer);
  timer = setTimeout(flush, WRITE_DELAY);
}

export function load(key, fallback) {
  const raw = cache.get(PREFIX + key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  queue(PREFIX + key, JSON.stringify(value));
}

export function remove(key) {
  queue(PREFIX + key, null);
}

/** Semua isi mentah { "cetakLabel.xxx": "<json>" } untuk file backup. */
export function rawEntries() {
  return Object.fromEntries(cache);
}

/** Pulihkan satu isi mentah dari file backup. */
export function setRaw(fullKey, raw) {
  if (fullKey.startsWith(PREFIX) && typeof raw === 'string') queue(fullKey, raw);
}

/** Perkiraan ukuran data tersimpan (byte). */
export function usedBytes() {
  let n = 0;
  for (const [k, v] of cache) n += (k.length + (v?.length ?? 0)) * 2;
  return n;
}
