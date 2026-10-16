// Foto per orang (mis. pas foto mahasiswa). Disimpan di IndexedDB browser karena
// ratusan foto tidak muat di localStorage. Foto dicocokkan dengan data lewat nama file:
// "20230001.jpg" ↔ baris dengan NIM 20230001 (kolom pencocok dipilih di template).

const DB_NAME = 'cetakLabel';
const STORE = 'photos';
const MAX_PX = 480; // cukup tajam untuk foto ±2–3 cm di label

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Penyimpanan foto dibatalkan (ruang penyimpanan penuh?).'));
  }));
}

/** Kunci pencocokan: tanpa spasi berlebih, huruf kecil. */
export const photoKey = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
/** Nama file → kunci (tanpa ekstensi): "20230001.JPG" → "20230001". */
const fileKey = (name) => photoKey(name.replace(/\.[^.]+$/, ''));

const urls = new Map(); // kunci → object URL

/** Muat semua foto tersimpan (dipanggil sekali saat aplikasi dibuka). */
export async function loadPhotos() {
  try {
    const entries = await tx('readonly', (store) => {
      const out = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        out.push([cur.key, cur.value]);
        cur.continue();
      };
      return out;
    });
    for (const [key, blob] of entries) urls.set(key, URL.createObjectURL(blob));
  } catch (err) {
    console.warn('Foto tidak bisa dimuat:', err);
  }
  return urls.size;
}

export const photoCount = () => urls.size;
export const photoUrl = (value) => urls.get(photoKey(value)) ?? null;

async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; // foto PNG transparan → latar putih
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
}

/**
 * Simpan banyak foto sekaligus (foto dengan nama sama ditimpa).
 * onProgress(selesai, total). Hasil: { added, skipped }.
 */
export async function addPhotos(files, onProgress = () => {}) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  let added = 0;
  for (let i = 0; i < images.length; i++) {
    const file = images[i];
    const key = fileKey(file.name);
    try {
      const blob = await shrink(file);
      await tx('readwrite', (store) => store.put(blob, key));
      const old = urls.get(key);
      if (old) URL.revokeObjectURL(old);
      urls.set(key, URL.createObjectURL(blob));
      added++;
    } catch (err) {
      console.warn('Foto dilewati:', file.name, err);
    }
    onProgress(i + 1, images.length);
  }
  return { added, skipped: files.length - added };
}

export async function clearPhotos() {
  await tx('readwrite', (store) => store.clear());
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

/**
 * Siapkan foto untuk PDF: dipotong ke rasio bingkai (seperti object-fit: cover),
 * diputar sesuai orientasi isi, hasil data URL JPEG.
 */
export function photoForPdf(url, aspect, deg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      let sw = iw;
      let sh = iw / aspect;
      if (sh > ih) {
        sh = ih;
        sw = ih * aspect;
      }
      const rot = deg === 90 || deg === 270;
      const c = document.createElement('canvas');
      c.width = Math.round(rot ? sh : sw);
      c.height = Math.round(rot ? sw : sh);
      const g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2);
      if (deg === 90) g.rotate(Math.PI / 2);
      if (deg === 270) g.rotate(-Math.PI / 2);
      g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, -sw / 2, -sh / 2, sw, sh);
      resolve(c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error('Foto tidak bisa dibaca.'));
    img.src = url;
  });
}
