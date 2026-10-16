// Perhitungan posisi label pada lembar kertas. Semua satuan dalam milimeter.

export const MM_TO_PX = 96 / 25.4;

export function labelsPerSheet(p) {
  return Math.max(0, p.kolom * p.baris);
}

/** Lebar total susunan label (dari tepi kiri label pertama sampai tepi kanan label terakhir). */
export function gridWidth(p) {
  return p.kolom * p.lebar + Math.max(0, p.kolom - 1) * p.jarakH;
}

export function gridHeight(p) {
  return p.baris * p.tinggi + Math.max(0, p.baris - 1) * p.jarakV;
}

/**
 * Posisi kiri-atas label pada slot tertentu (0 = kiri atas, urut ke kanan lalu ke bawah).
 *   x = marginKiri + kolom * (lebarLabel + jarakH) + offsetX
 *   y = marginAtas + baris * (tinggiLabel + jarakV) + offsetY
 */
export function slotPosition(p, slot, cal = { offsetX: 0, offsetY: 0 }) {
  const kolom = slot % p.kolom;
  const baris = Math.floor(slot / p.kolom);
  return {
    kolom,
    baris,
    x: p.marginKiri + kolom * (p.lebar + p.jarakH) + cal.offsetX,
    y: p.marginAtas + baris * (p.tinggi + p.jarakV) + cal.offsetY,
  };
}

/** Cek apakah susunan label muat di kertas. Mengembalikan pesan error (fatal) dan peringatan. */
export function checkFit(p, cal) {
  const errors = [];
  const warnings = [];
  if (!(p.lebar > 0 && p.tinggi > 0)) errors.push('Lebar dan tinggi label harus lebih dari 0 mm.');
  if (!(p.kolom >= 1 && p.baris >= 1)) errors.push('Jumlah kolom dan baris minimal 1.');
  if (!(p.kertasLebar > 0 && p.kertasTinggi > 0)) errors.push('Ukuran kertas harus lebih dari 0 mm.');
  if (errors.length) return { errors, warnings };

  const tol = 0.05;
  const kiri = p.marginKiri + cal.offsetX;
  const atas = p.marginAtas + cal.offsetY;
  const kanan = kiri + gridWidth(p);
  const bawah = atas + gridHeight(p);
  const f = (n) => (Math.round(n * 100) / 100).toLocaleString('id-ID');

  if (kanan > p.kertasLebar + tol) {
    warnings.push(`Susunan label melebihi lebar kertas sebesar ${f(kanan - p.kertasLebar)} mm (tepi kanan label ${f(kanan)} mm, lebar kertas ${f(p.kertasLebar)} mm).`);
  }
  if (bawah > p.kertasTinggi + tol) {
    warnings.push(`Susunan label melebihi tinggi kertas sebesar ${f(bawah - p.kertasTinggi)} mm (tepi bawah label ${f(bawah)} mm, tinggi kertas ${f(p.kertasTinggi)} mm).`);
  }
  if (kiri < -tol) warnings.push(`Label keluar dari tepi kiri kertas sebesar ${f(-kiri)} mm.`);
  if (atas < -tol) warnings.push(`Label keluar dari tepi atas kertas sebesar ${f(-atas)} mm.`);
  return { errors, warnings };
}

/**
 * Bagi daftar item ke halaman-halaman. Halaman pertama dimulai dari startSlot
 * (untuk memakai lembar yang sebagian sudah terpakai).
 * Hasil: Array<Array<{ slot, item }>>
 */
export function paginate(items, perSheet, startSlot = 0) {
  if (perSheet < 1) return [];
  const pages = [];
  let page = [];
  let slot = Math.min(Math.max(0, startSlot), perSheet - 1);
  for (const item of items) {
    page.push({ slot, item });
    slot++;
    if (slot >= perSheet) {
      pages.push(page);
      page = [];
      slot = 0;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}
