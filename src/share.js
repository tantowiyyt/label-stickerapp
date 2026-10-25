// Berbagi lewat link & import dari Google Sheets.
//
// Template di link: JSON template dikompresi (deflate) lalu disandikan base64url di bagian
// "#tpl=…" alamat. Bagian setelah "#" tidak pernah dikirim ke server, dan link hanya berisi
// desain (bukan data peserta). Saat dibuka, isinya dianggap data tak tepercaya: dibatasi
// ukurannya dan selalu divalidasi lewat normalizeTemplate oleh pemanggil.

const HASH_KEY = 'tpl=';
const MAX_DECODED = 4 * 1024 * 1024; // 4 MB JSON

const toB64Url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export const canShareLink = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/**
 * Link berisi template. images=false: gambar bebas tidak disertakan (link jauh lebih pendek).
 * Tata letak per ukuran label tidak disertakan; penerima menyesuaikan dengan ukurannya sendiri.
 */
export async function templateLink(tpl, { images = false } = {}) {
  const { id, layouts, layoutFor, ...rest } = tpl;
  const data = { ...rest, decals: images ? rest.decals : [] };
  const json = new TextEncoder().encode(JSON.stringify({ app: 'cetak-label', template: data }));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  const base = location.href.split('#')[0];
  return `${base}#${HASH_KEY}${toB64Url(packed)}`;
}

/** Template mentah dari "#tpl=…" di alamat sekarang, atau null. Melempar error bila rusak. */
export async function templateFromHash() {
  const hash = location.hash.slice(1);
  if (!hash.startsWith(HASH_KEY)) return null;
  const packed = fromB64Url(hash.slice(HASH_KEY.length));
  const bytes = await pipe(packed, new DecompressionStream('deflate-raw'));
  if (bytes.length > MAX_DECODED) throw new Error('Isi link terlalu besar.');
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (data?.app !== 'cetak-label' || !data.template) throw new Error('Link bukan template Cetak Label.');
  return data.template;
}

/** Hapus "#tpl=…" dari alamat (tanpa memuat ulang). */
export function clearShareHash() {
  history.replaceState(null, '', location.href.split('#')[0]);
}

/**
 * Alamat CSV dari link Google Sheets:
 *  - https://docs.google.com/spreadsheets/d/<ID>/edit#gid=123  → export CSV sheet tersebut
 *  - https://docs.google.com/spreadsheets/d/e/<ID>/pubhtml     → versi "Publikasikan ke web" (CSV)
 * Hasil null bila bukan link Google Sheets.
 */
export function sheetCsvUrl(link) {
  let u;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.hostname !== 'docs.google.com') return null;
  const gid = u.searchParams.get('gid') ?? new URLSearchParams(u.hash.slice(1)).get('gid') ?? '0';
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv&gid=${encodeURIComponent(gid)}`;
  const doc = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
  if (doc) return `https://docs.google.com/spreadsheets/d/${doc[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  return null;
}

/** Ambil isi CSV sebuah Google Sheet yang dibagikan "Siapa saja yang memiliki link". */
export async function fetchSheetCsv(link) {
  const url = sheetCsvUrl(link);
  if (!url) throw new Error('Bukan link Google Sheets.');
  let res;
  try {
    res = await fetch(url, { credentials: 'omit' });
  } catch {
    throw new Error(location.protocol === 'file:'
      ? 'Tidak bisa mengambil dari file lokal. Buka versi web, atau di Google Sheets pilih File → Download → CSV lalu Import CSV.'
      : 'Tidak bisa terhubung ke Google Sheets. Periksa internet dan pastikan sheet dibagikan "Siapa saja yang memiliki link".');
  }
  const text = await res.text();
  if (!res.ok || /^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('Sheet tidak bisa dibuka. Bagikan sebagai "Siapa saja yang memiliki link" (Viewer), lalu coba lagi.');
  }
  return text;
}
