import { labelsPerSheet, slotPosition } from './layout.js';
import { fmt } from './util.js';

// Membangun elemen DOM satu halaman cetak. Elemen yang sama dipakai untuk preview
// dan cetak, jadi preview persis sama dengan hasil cetak.
//
// page = { pageW, pageH } dari media.js (bisa A4 walau lembar labelnya lebih kecil).
// cal  = offset total = kalibrasi printer + posisi lembar label di atas kertas printer.

export function createSheet(page) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.style.width = `${page.pageW}mm`;
  sheet.style.height = `${page.pageH}mm`;
  return sheet;
}

export function placeLabel(sheet, p, cal, slot, className = 'label') {
  const pos = slotPosition(p, slot, cal);
  const el = document.createElement('div');
  el.className = className + (p.bulat ? ' label--round' : '');
  el.dataset.slot = slot;
  el.style.left = `${pos.x}mm`;
  el.style.top = `${pos.y}mm`;
  el.style.width = `${p.lebar}mm`;
  el.style.height = `${p.tinggi}mm`;
  sheet.append(el);
  return el;
}

/**
 * Halaman berisi data. pages = hasil paginate(): Array<Array<{ slot, item }>>.
 * renderLabel(el, item) mengisi isi satu label.
 */
export function buildDataSheets(p, cal, page, pages, renderLabel) {
  return pages.map((items) => {
    const sheet = createSheet(page);
    for (const { slot, item } of items) renderLabel(placeLabel(sheet, p, cal, slot), item);
    return sheet;
  });
}

/** Penggaris 40 mm horizontal & vertikal (garis tiap 5 mm) untuk cek skala cetak 100%. */
function rulerSvg() {
  const L = 40;
  let ticks = '';
  for (let i = 0; i <= L; i += 5) {
    const len = i % 10 === 0 ? 2.5 : 1.5;
    ticks += `<path d="M${i} 0v${len}M0 ${i}h${len}"/>`;
  }
  return `<svg class="test-ruler" width="${L + 6}mm" height="${L + 6}mm" viewBox="0 0 ${L + 6} ${L + 6}">
    <g fill="none" stroke="#000" stroke-width="0.25"><path d="M0 0H${L}M0 0V${L}"/>${ticks}</g>
    <g font-family="Arial, sans-serif" font-size="2.2" fill="#000">
      <text x="${L}" y="5.2" text-anchor="end">40 mm</text>
      <text x="5.2" y="${L}" transform="rotate(-90 5.2 ${L})">40 mm</text>
    </g>
  </svg>`;
}

/** Halaman tes: kotak setiap label + nomor posisi, untuk dicocokkan dengan kertas asli. */
export function buildTestSheet(p, cal, page) {
  const sheet = createSheet(page);
  const n = labelsPerSheet(p);
  const numSize = Math.min(p.tinggi * 0.4, p.lebar * 0.35, 14);
  const infoSize = Math.max(1.6, Math.min(p.tinggi * 0.11, p.lebar * 0.07, 3));

  for (let slot = 0; slot < n; slot++) {
    const el = placeLabel(sheet, p, cal, slot, 'label label--test');
    const { kolom, baris } = slotPosition(p, slot, cal);

    const info = document.createElement('div');
    info.className = 'test-info';
    info.style.fontSize = `${infoSize}mm`;
    info.textContent = `kol ${kolom + 1} · baris ${baris + 1} · ${fmt(p.lebar)}×${fmt(p.tinggi)} mm`;

    const num = document.createElement('div');
    num.className = 'test-num';
    num.style.fontSize = `${numSize}mm`;
    num.textContent = slot + 1;

    el.append(info, num);
  }

  // Penggaris di pojok kiri-atas label 1 (boleh melewati batas label; ini hanya halaman tes).
  const first = slotPosition(p, 0, cal);
  const ruler = document.createElement('div');
  ruler.className = 'test-ruler-wrap';
  ruler.style.left = `${first.x + 1.5}mm`;
  ruler.style.top = `${first.y + 1.5}mm`;
  ruler.innerHTML = rulerSvg();
  sheet.append(ruler);
  return sheet;
}
