import { normalizeTemplate, newTemplateId, newTextId } from './template.js';
import { createLabelRenderer } from './renderer.js';
import { MM_TO_PX } from './layout.js';
import { lang, t } from './i18n.js';

// Galeri template siap pakai. Setiap desain punya isi dalam bahasa Indonesia & English
// (mengikuti bahasa antarmuka), daftar kolom yang dipakai, dan beberapa baris data contoh.

const L = (props = {}) => ({ size: 11, ...props });
const free = (text, x, y, props = {}) => ({ id: newTextId(), text, x, y, size: 8, ...props });

export const GALLERY = [
  {
    id: 'ujian',
    nama: { id: 'Kartu ujian + QR', en: 'Exam card + QR' },
    desc: { id: 'Nama, NIM, kelas, ruang, dan nomor kursi; QR berisi NIM.', en: 'Name, student ID, class, room and seat number; QR holds the ID.' },
    columns: ['nama', 'nim', 'kelas', 'ruang', 'no_kursi'],
    rows: [
      ['Siti Aminah Rahmawati', '2201100', 'TI-1', 'Ruang 1', '1'],
      ['Muhammad Rizky Ananda Pratama', '2201101', 'TI-2', 'Ruang 2', '2'],
      ['Budi Santoso', '2201102', 'TI-1', 'Ruang 1', '3'],
    ],
    tpl: (en) => ({
      text: en
        ? '**{{nama|upper}}**\nID: {{nim}}\nClass: {{kelas}} · {{ruang}}\nSeat: **{{no_kursi}}**'
        : '**{{nama|upper}}**\nNIM: {{nim}}\nKelas: {{kelas}} · {{ruang}}\nNo. Kursi: **{{no_kursi}}**',
      lines: [L({ size: 13, overflow: 'wrap', maxRows: 2 }), L({ size: 10 }), L({ size: 10 }), L({ size: 12 })],
      align: 'left',
      code: { type: 'qr', source: 'column', column: 'nim', position: 'right', size: 14 },
    }),
  },
  {
    id: 'undangan',
    nama: { id: 'Label undangan', en: 'Invitation label' },
    desc: { id: '"Kepada Yth." di pojok, nama tebal, alamat hingga 2 baris, "Di Tempat".', en: '"To:" in the corner, bold name, address up to 2 lines.' },
    columns: ['nama', 'alamat'],
    rows: [
      ['Bapak Drs. H. Ahmad Fauzi, M.Pd.', 'Jl. Merdeka No. 10, Bandung'],
      ['Ibu Siti Aminah', 'Jl. Sudirman Kav. 5, Jakarta Selatan'],
      ['Sdr. Budi Santoso', 'Perum Griya Asri Blok C-12, Indramayu'],
    ],
    tpl: (en) => ({
      text: en ? '**{{nama}}**\n{{alamat}}' : '**{{nama}}**\n{{alamat}}\nDi Tempat',
      lines: [L({ size: 12, overflow: 'wrap', maxRows: 2 }), L({ size: 9, overflow: 'wrap', maxRows: 2 }), L({ size: 9, italic: true })],
      align: 'left',
      valign: 'middle',
      padding: 3,
      texts: [free(en ? 'To:' : 'Kepada Yth.', 3, 1.5, { italic: true })],
    }),
  },
  {
    id: 'kirim',
    nama: { id: 'Alamat pengiriman', en: 'Shipping address' },
    desc: { id: 'Label paket: penerima, alamat lengkap, dan nomor telepon.', en: 'Parcel label: recipient, full address and phone number.' },
    columns: ['nama', 'alamat', 'telepon'],
    rows: [
      ['Toko Maju Jaya', 'Pasar Baru Blok C-12, Surabaya, Jawa Timur 60174', '0812-3456-7890'],
      ['Siti Aminah', 'Jl. Sudirman Kav. 5, Jakarta Selatan 12190', '0813-1111-2222'],
      ['Budi Santoso', 'Jl. Merdeka No. 10, Bandung 40111', '0857-9876-5432'],
    ],
    tpl: (en) => ({
      text: en ? 'RECIPIENT:\n**{{nama}}**\n{{alamat}}\nPhone: {{telepon}}' : 'PENERIMA:\n**{{nama}}**\n{{alamat}}\nTelp: {{telepon}}',
      lines: [L({ size: 7, color: '#475569' }), L({ size: 12 }), L({ size: 9, overflow: 'wrap', maxRows: 3 }), L({ size: 9 })],
      align: 'left',
      valign: 'top',
      padding: 2.5,
    }),
  },
  {
    id: 'harga',
    nama: { id: 'Label harga + barcode', en: 'Price tag + barcode' },
    desc: { id: 'Nama produk, harga dalam rupiah, dan barcode Code 128.', en: 'Product name, price and a Code 128 barcode.' },
    columns: ['produk', 'harga', 'kode'],
    rows: [
      ['Kopi Bubuk Robusta 250 g', '45000', 'KP-0001'],
      ['Teh Melati Celup isi 25', '12500', 'TH-0002'],
      ['Gula Aren Cair 500 ml', '38000', 'GA-0003'],
    ],
    tpl: () => ({
      text: '**{{produk}}**\n**{{harga|rupiah}}**',
      lines: [L({ size: 10, overflow: 'wrap', maxRows: 2 }), L({ size: 16, color: '#b91c1c' })],
      code: { type: 'code128', source: 'column', column: 'kode', position: 'bottom', size: 10, showText: true },
    }),
  },
  {
    id: 'nametag',
    nama: { id: 'Name tag acara', en: 'Event name tag' },
    desc: { id: 'Nama besar, instansi, dan strip warna per peran (peserta, panitia, …).', en: 'Large name, organization and a color strip per role.' },
    columns: ['nama', 'instansi', 'peran'],
    rows: [
      ['Siti Aminah', 'Politeknik Negeri Indramayu', 'Peserta'],
      ['Budi Santoso', 'Universitas Padjadjaran', 'Panitia'],
      ['Ahmad Fauzi', 'Dinas Pendidikan', 'Pembicara'],
    ],
    tpl: () => ({
      text: '**{{nama|title}}**\n{{instansi}}\n*{{peran|upper}}*',
      lines: [L({ size: 18 }), L({ size: 9, overflow: 'wrap', maxRows: 2 }), L({ size: 8, color: '#475569' })],
      colorRule: { column: 'peran', target: 'band', band: 4, colors: {} },
    }),
  },
  {
    id: 'arsip',
    nama: { id: 'Label arsip / map', en: 'File folder label' },
    desc: { id: 'Judul arsip huruf besar, nomor, dan tahun.', en: 'Uppercase title, number and year.' },
    columns: ['judul', 'nomor', 'tahun'],
    rows: [
      ['Surat Keputusan Direktur', '001/SK/2026', '2026'],
      ['Laporan Keuangan Semester Ganjil', '014/LK/2025', '2025'],
      ['Data Mahasiswa Baru', '027/DM/2026', '2026'],
    ],
    tpl: (en) => ({
      text: en ? '**{{judul|upper}}**\nNo. {{nomor}} · Year {{tahun}}' : '**{{judul|upper}}**\nNo. {{nomor}} · Tahun {{tahun}}',
      lines: [L({ size: 12, overflow: 'wrap', maxRows: 2 }), L({ size: 9, color: '#475569' })],
    }),
  },
  {
    id: 'inventaris',
    nama: { id: 'Label inventaris + QR', en: 'Asset tag + QR' },
    desc: { id: 'QR di kiri berisi kode barang, lalu nama barang, kode, dan lokasi.', en: 'QR on the left with the asset code, then name, code and location.' },
    columns: ['barang', 'kode', 'lokasi'],
    rows: [
      ['Laptop Lenovo ThinkPad', 'INV-2026-001', 'Lab Komputer 1'],
      ['Proyektor Epson EB-X51', 'INV-2026-002', 'Ruang Rapat'],
      ['Printer Epson L5190', 'INV-2026-003', 'Tata Usaha'],
    ],
    tpl: (en) => ({
      text: en ? '**{{barang}}**\nCode: {{kode}}\nLocation: {{lokasi}}' : '**{{barang}}**\nKode: {{kode}}\nLokasi: {{lokasi}}',
      lines: [L({ size: 11, overflow: 'wrap', maxRows: 2 }), L({ size: 8 }), L({ size: 8 })],
      align: 'left',
      code: { type: 'qr', source: 'column', column: 'kode', position: 'left', size: 14 },
    }),
  },
];

const pick = (v) => (lang === 'en' ? v.en : v.id);

/** Template baru (siap disimpan) dari sebuah desain galeri. */
export function galleryTemplate(def) {
  const raw = def.tpl(lang === 'en');
  return normalizeTemplate({
    font: 'Arial',
    align: 'center',
    valign: 'middle',
    padding: 2,
    ...raw,
    id: newTemplateId(),
    nama: pick(def.nama),
    code: { type: 'none', source: 'column', column: '', text: '', position: 'bottom', size: 12, showText: true, ...(raw.code ?? {}) },
  });
}

/** Data contoh sebuah desain: { columns, rows: string[][] }. */
export const galleryData = (def) => ({ columns: def.columns, rows: def.rows });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Isi grid galeri. preset = ukuran label sekarang (pratinjau memakai ukuran ini).
 * onUse(def, withData) dipanggil saat tombol "Pakai" ditekan.
 */
export function renderGallery(grid, preset, onUse) {
  // kartu pertama = unggulan (bento): pada dialog lebar tampil 2× lebih besar
  const fit = (w, h) => Math.min(w / (preset.lebar * MM_TO_PX), h / (preset.tinggi * MM_TO_PX));
  const wide = grid.clientWidth >= 760;
  grid.replaceChildren(...GALLERY.map((def, index) => {
    const featured = index === 0;
    const scale = featured && wide ? fit(480, 270) : fit(236, 132);
    const card = document.createElement('article');
    card.className = 'gal-card' + (featured ? ' gal-card--featured' : '');
    card.innerHTML = `
      <div class="gal-preview" translate="no"><div class="gal-stage"></div></div>
      <div class="gal-body">
        ${featured ? `<span class="gal-badge">${esc(t('Unggulan'))}</span>` : ''}
        <h3>${esc(pick(def.nama))}</h3>
        <p>${esc(pick(def.desc))}</p>
        <div class="gal-cols" translate="no">${def.columns.map((c) => `<code>{{${esc(c)}}}</code>`).join(' ')}</div>
        <div class="gal-actions">
          <button type="button" class="primary" data-use="tpl">${esc(t('Pakai template'))}</button>
          <button type="button" class="ghost" data-use="data" title="${esc(t('Pakai template dan isi tabel data dengan contoh'))}">${esc(t('+ data contoh'))}</button>
        </div>
      </div>`;
    // pratinjau: label sungguhan (renderer yang sama dengan cetak) dengan baris contoh pertama
    const tpl = galleryTemplate(def);
    const row = { values: Object.fromEntries(def.columns.map((c, i) => [c, def.rows[0][i]])) };
    const renderer = createLabelRenderer(tpl, preset, def.columns, [row], { rowNo: () => 1 });
    const label = document.createElement('div');
    label.className = 'label gal-label' + (preset.bulat ? ' label--round' : '');
    Object.assign(label.style, { width: `${preset.lebar}mm`, height: `${preset.tinggi}mm`, transform: `scale(${scale})` });
    renderer.render(label, row);
    const stage = card.querySelector('.gal-stage');
    Object.assign(stage.style, { width: `${preset.lebar * MM_TO_PX * scale}px`, height: `${preset.tinggi * MM_TO_PX * scale}px` });
    stage.append(label);
    card.querySelector('[data-use="tpl"]').addEventListener('click', () => onUse(def, false));
    card.querySelector('[data-use="data"]').addEventListener('click', () => onUse(def, true));
    return card;
  }));
}
