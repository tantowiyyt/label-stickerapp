// "Kertas di printer": ukuran halaman yang dikirim ke printer bisa berbeda dari
// lembar label. Contoh Epson L5190: printer tidak punya ukuran 165 × 210 mm, jadi
// Chrome mencetak halaman A4 dan lembar label diletakkan di tengah-atas (default).

export const MEDIA_MODES = [
  { value: 'label', label: 'Sesuai ukuran lembar label' },
  { value: 'a4-center', label: 'A4, lembar label di tengah-atas (default)' },
  { value: 'a4-right', label: 'A4, lembar label di kanan-atas (Epson seri L: kertas rapat ke pemandu kanan)' },
  { value: 'a4-left', label: 'A4, lembar label di kiri-atas' },
  { value: 'custom', label: 'Custom (ukuran & posisi sendiri)' },
];

const A4 = { width: 210, height: 297 };
const ALIGN_X = ['left', 'center', 'right'];
const ALIGN_Y = ['top', 'middle'];

export const DEFAULT_MEDIA = { mode: 'a4-center', width: A4.width, height: A4.height, alignX: 'center', alignY: 'top' };

export function normalizeMedia(raw = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    mode: MEDIA_MODES.some((m) => m.value === raw.mode) ? raw.mode : DEFAULT_MEDIA.mode,
    width: num(raw.width, A4.width),
    height: num(raw.height, A4.height),
    alignX: ALIGN_X.includes(raw.alignX) ? raw.alignX : 'center',
    alignY: ALIGN_Y.includes(raw.alignY) ? raw.alignY : 'top',
  };
}

/**
 * Ukuran halaman cetak dan posisi lembar label di atasnya (mm).
 * dx/dy ditambahkan ke posisi semua label (selain offset kalibrasi).
 */
export function pageLayout(p, media) {
  const m = normalizeMedia(media);
  if (m.mode === 'label') return { pageW: p.kertasLebar, pageH: p.kertasTinggi, dx: 0, dy: 0, mode: m.mode };
  if (m.mode === 'a4-center') {
    return { pageW: A4.width, pageH: A4.height, dx: (A4.width - p.kertasLebar) / 2, dy: 0, mode: m.mode };
  }
  if (m.mode === 'a4-right') {
    return { pageW: A4.width, pageH: A4.height, dx: A4.width - p.kertasLebar, dy: 0, mode: m.mode };
  }
  if (m.mode === 'a4-left') return { pageW: A4.width, pageH: A4.height, dx: 0, dy: 0, mode: m.mode };
  const freeX = m.width - p.kertasLebar;
  const freeY = m.height - p.kertasTinggi;
  return {
    pageW: m.width,
    pageH: m.height,
    dx: m.alignX === 'left' ? 0 : m.alignX === 'right' ? freeX : freeX / 2,
    dy: m.alignY === 'top' ? 0 : freeY / 2,
    mode: m.mode,
  };
}

/** Nama ukuran halaman untuk petunjuk printer. */
export function pageSizeName(page) {
  const isA4 = Math.abs(page.pageW - 210) < 0.5 && Math.abs(page.pageH - 297) < 0.5;
  const mm = `${fmtMm(page.pageW)} × ${fmtMm(page.pageH)} mm`;
  return isA4 ? `A4 (${mm})` : mm;
}

const fmtMm = (n) => (Math.round(n * 10) / 10).toLocaleString('id-ID');
