# Catatan Progres

Riwayat pengembangan aplikasi **Cetak Label**. Tanggal memakai format YYYY-MM-DD.

## Status saat ini (2026-10-16)

Semua tahap dari rencana awal sudah selesai, ditambah banyak fitur lanjutan. Aplikasi sudah dipakai untuk mencetak kartu ujian (±475 baris data: nama, NIM, kelas, no. kursi, prodi) di printer **Epson L5190** dengan pengaturan **Kertas di printer: A4, lembar label di tengah-atas** (sudah dicek pas di kertas asli, sisa selisih dikoreksi dengan Offset X/Y).

Repository: <https://github.com/tantowiyyt/label-stickerapp> (branch `main`).

## Riwayat

### 2026-10-16

**Tahap 1: Preset, preview, halaman tes**
- Preset ukuran lembar T&J (±165 × 210 mm) dan A4; tambah/edit/hapus/duplikat, export/import JSON.
- Preview lembar dalam mm, peringatan bila susunan melebihi kertas.
- Kalibrasi Offset X/Y, Halaman Tes (kotak + nomor posisi), cetak via `window.print()` + `@page`.

**Tahap 2: Import data**
- Import CSV (deteksi pemisah, ANSI/UTF-8), paste dari Excel, contoh CSV.
- Tab Data: centang, edit sel, tambah/hapus baris & kolom, kolom `jumlah`.

**Tahap 3: Editor isi label**
- Template `{{kolom}}` dengan markup `**tebal**` / `*miring*`, gaya per baris (B/I/AA, pt, warna, rata).
- Gaya cepat, rata horizontal/vertikal (tombol ikon), orientasi isi 0°/90°/270°.
- Auto-fit: perkecil sampai 6 pt dulu, baru wrap; opsi ukuran font seragam.
- Pilihan font (global & per baris) dengan deteksi font terpasang.

**Tampilan**
- Panel langkah bernomor yang bisa dilipat, header bergradasi, warna per langkah, ikon.

**Tahap 4: Cetak lanjutan**
- Mulai dari label ke- (klik kotak di preview), salinan per label, rentang lembar.
- Barcode Code 128 & QR code, export PDF vektor (jsPDF).
- **Kertas di printer**: A4 tengah-atas (default), A4 kanan-atas, A4 kiri-atas, sesuai lembar, custom. Mengatasi hasil cetak Epson L5190 yang turun ±43 mm.
- Halaman tes dengan penggaris 40 mm; pengingat pengaturan dialog cetak; Ctrl+P mencetak label.
- Backup & pulihkan semua; Reset data per bagian.

**Fitur tambahan**
- Warna per kelompok (mis. program studi): teks, latar, atau strip atas.
- Preset lintas merek: nomor standar No. 100–129 (termasuk label bulat 114–118), varian Koala/Fox/ABC, 8 ukuran A4; migrasi otomatis untuk preset yang belum diedit.
- Import Excel (.xlsx/.xls), contoh Excel, export CSV/Excel.
- Urutkan data per kolom, pencarian di tab Data, peringatan data (kosong, ganda, tanpa foto), Urungkan (Ctrl+Z).
- Placeholder `{{no}}`, `{{tanggal}}`, format `|upper` / `|lower` / `|title`, sembunyikan baris kosong.
- Logo dengan area sendiri; **gambar bebas (branding)** yang bisa digeser & diubah ukurannya di preview; **foto per orang** dari nama file (IndexedDB).
- Preview: lompat ke lembar, cari teks di label (penanda oranye), **Cetak lembar ini**, navigasi ← →.
- Format barcode Code 39, EAN-13, EAN-8, UPC-A, ITF; isi kode dari teks/rumus; **Generator QR/Barcode** (download PNG/SVG, isi kolom kode otomatis: nomor urut / acak unik).

**Perbaikan bug penting**
- Atribut `hidden` kalah oleh `button { display: inline-flex }` → aturan global `[hidden] { display: none !important }`.
- Tab di dialog generator ikut memicu pergantian tab Preview/Data → selektor dibatasi `.tab[data-tab]`.
- Kotak nomor lembar tidak ikut berubah setelah pencarian.

**Lain-lain**
- README ditulis ulang mengikuti alur kerja aplikasi.
- Repository git dibuat dan di-push ke GitHub.

### 2026-10-25

**Geser tulisan di preview**
- Setiap baris teks bisa ditarik langsung di preview (berlaku untuk semua label, ikut cetak & PDF, mendukung orientasi 90°/270°).
- Supaya rapi: snap ke tengah & tepi label, tepi area teks, dan tepi/tengah baris lain dengan garis bantu merah muda; selain itu per 0,5 mm; Alt = geser bebas per 0,1 mm.
- Kotak baris selebar tulisannya, keterangan `X · Y mm` di dekat kursor, tombol panah untuk geser halus (Shift 2 mm, Ctrl 0,1 mm), Esc batal pilih.
- Panel *Gaya per baris* menampilkan geseran tiap baris dengan tombol *Kembalikan* dan *Kembalikan semua baris ke posisi otomatis*.
- Klik pada tulisan di preview kini hanya memilih baris (tidak mengubah "mulai dari label ke-"); klik bagian kosong label untuk itu.

**Barcode/QR posisi bebas**
- Barcode/QR bisa diseret di preview (otomatis jadi posisi *Bebas*) dan diubah ukurannya lewat titik ungu di pojok; snap & garis bantu seperti teks; tombol panah untuk geser halus.
- Posisi bebas tidak mengurangi ruang teks; tombol *Bebas* di pilihan Posisi, ukuran bisa diketik (sisi QR / tinggi barcode).

**PWA (install & offline)**
- `public/manifest.webmanifest`, `public/sw.js` (halaman network-first, aset cache-first), ikon 192/512; didaftarkan di `boot.js` hanya untuk build lewat http(s). Tombol **Pasang** di header (beforeinstallprompt). Uji: SW aktif, muat ulang dalam kondisi offline tetap membuka aplikasi beserta datanya.

**Pengingat backup & foto di backup**
- Pita pengingat di atas preview bila ada data dan belum/≥ 7 hari tidak di-backup (*Nanti* = tunda 3 hari); `backupInfo` di penyimpanan.
- Opsi *Sertakan foto per orang* di backup (`photos`: data URL); dipulihkan otomatis.

**Format data di placeholder**
- `|tanggal`, `|tgl`, `|angka`, `|rupiah`, `|atau:teks` (alias `date`, `number`, `default`); format boleh berantai; argumen mempertahankan huruf besar/kecil. Tanggal Excel (nomor seri) didukung.

**Penyimpanan IndexedDB**
- `storage.js` kini menyimpan ke IndexedDB (salinan di memori, ditulis di latar belakang); `boot.js` memuatnya sebelum aplikasi dimulai. Batas ±5 MB localStorage hilang (uji: 5.000 baris ≈ 9 MB tersimpan & tetap ada setelah reload).
- Migrasi otomatis dari localStorage; cadangan ke localStorage bila IndexedDB tidak tersedia; `navigator.storage.persist()`. Backup/pulihkan/reset memakai API penyimpanan (format file backup tetap).

**Cetak per kelompok**
- *Kelompokkan per* kolom (urutan alami), *Lembar baru untuk tiap kelompok*, *Cetak kelompok* tertentu; penanda kelompok di preview; jumlah lembar di header memakai pembagian sebenarnya.

**Atur objek**
- Toolbar mini juga untuk gambar & QR (mode objek). Menu *Posisi* (rata kiri/tengah/kanan, atas/tengah/bawah) untuk semua objek; Duplikat (Ctrl+D), Hapus (Delete), Di depan/belakang teks untuk gambar; panah menggeser gambar. Satu objek terpilih dalam satu waktu.

**Toolbar preview dirapikan (gaya Google Docs/Word)**
- Dua kelompok "pil": kiri alat edit (↶ ↷ │ Teks ▾ · Gambar · QR), kanan tampilan (Label data ▾ │ ‹ lembar › │ cari │ cetak lembar). Tombol tanpa bingkai, tinggi seragam, ikon panah SVG.
- Layar ≤ 1366 px: kotak cari melayang di bawah ikon 🔍 (Ctrl+F, Esc menutup) sehingga toolbar tidak bergeser; tombol "Cetak lembar N" menyala biru bila lembar berisi hasil cari.

**Toolbar: Urungkan/Ulangi desain, Sisipkan Gambar & QR**
- Riwayat perubahan template (50 langkah, perubahan rapat digabung) dengan tombol ↶ ↷ dan Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z di tab Preview.
- Tombol *Gambar* (gambar bebas) dan *QR* (pasang QR, langsung terpilih) di toolbar atas.
- Toolbar tetap satu baris 1280–1920 px: label tombol jadi ikon < 1600 px, ‹ › cari hanya saat mencari, kotak cari jadi ikon ≤ 1366 px.

**Bahasa Inggris (ID | EN)**
- Tombol **ID | EN** di header; bawaan mengikuti bahasa browser, pilihan tersimpan. Ganti bahasa tanpa memuat ulang.
- `src/i18n.js` menerjemahkan teks antarmuka (termasuk konten dinamis lewat MutationObserver) memakai kamus `src/i18n-en.js`; dialog `confirm/prompt/alert` lewat `t()`.
- Isi label, data, nama kolom, nama template, cetak & PDF tidak diterjemahkan (`translate="no"`). Teks cepat punya versi English.
- Dirapikan: tombol ID | EN serasi dengan tombol header; bentuk tunggal/jamak English (1 sheet / 2 sheets, 1 row / 12 rows) lewat `unit()`; nama aplikasi "Cetak Label" tetap sebagai merek.

**Logo / gambar digabung ke Gambar bebas**
- Bagian *Logo / gambar* dihapus; *Gambar bebas (logo, branding)* menggantikannya.
- Gambar bebas punya opsi **Teks di samping gambar** (seperti Wrap Text → Square).
- Migrasi otomatis: logo lama (termasuk dari template yang diimport) menjadi gambar bebas di sisi yang sama dengan opsi itu aktif, sehingga tampilannya tetap.

**Teks bebas (di luar data)**
- Kotak teks bebas seperti Text Box di Word (mis. "Kepada Yth.", "Di Tempat"): tombol *+ Tambah teks* dan teks cepat, seret di preview dengan snap, panah untuk geser halus.
- Tombol **T+ Teks** di toolbar atas (langsung siap diketik di toolbar mini) dengan menu ▾ teks cepat.
- Toolbar atas tetap satu baris di 1280–1920 px: teks tombol dipadatkan di layar kecil, tombol ‹ › hasil cari hanya tampil saat mencari (≤ 1300 px).
- Toolbar mini kini umum untuk baris template & teks bebas: untuk teks bebas ada kotak isi teks dan tombol hapus. Boleh berisi `{{kolom}}`. Ikut cetak & PDF, posisi/ukuran disimpan per ukuran label.

**Teks di samping QR posisi bebas**
- QR/barcode posisi bebas tidak lagi menimpa teks: area teks memakai ruang kosong terbesar di sampingnya (seperti Wrap Text → Square), sehingga "Maks. 2/3 baris" membungkus nama di sebelah QR. Opsi *Teks di samping barcode/QR* (aktif bawaan).

**Status bar preview & orientasi isi**
- Status bar di bawah preview (seperti MS Word): *Isi* 0° / 90° / 270° (ikon huruf A yang berputar, sinkron dengan *Tata letak isi*), *Kertas* Portrait/Landscape, dan *Zoom*.
- Toolbar atas tinggal navigasi & cetak sehingga muat satu baris di layar laptop (label "Lembar" dan teks tombol *Cetak lembar ini* disembunyikan di layar kecil; tooltip tetap ada).

**Tata letak mengikuti ukuran label**
- Tata letak isi (orientasi, padding, ukuran font, geseran baris, barcode/QR, logo, foto, gambar bebas) disimpan per ukuran label di template (`layouts`, `layoutFor`); isi template tetap sama.
- Ganti ukuran label: tata letak tersimpan dipulihkan, atau disesuaikan otomatis bila belum pernah dipakai (orientasi mengikuti sisi panjang label, posisi diskalakan). Modul baru `src/layoutAdapt.js`.
- Template lama: tata letaknya dianggap milik ukuran label yang sedang dipilih saat aplikasi dibuka.

**Pilihan untuk teks yang terlalu panjang** (per baris)
- *Perkecil font* (bawaan, perilaku lama), *Maks. 2 baris*, *Maks. 3 baris*, *Turun baris (bebas)*, *Potong …*.
- Tersedia di panel *Gaya per baris* dan toolbar mini; berlaku di preview, cetak, dan PDF (PDF memotong teks dengan "…" juga).

**Toolbar format ala MS Word**
- Klik tulisan di preview → toolbar mini mengambang di atasnya: font, ukuran (A− / A+ / ketik), tebal, miring, HURUF BESAR, warna (6 warna cepat + pemilih warna), rata kiri/tengah/kanan, kembalikan posisi, tutup.
- Berlaku per baris template di semua label; sinkron dengan panel *Gaya per baris*. Pintasan Ctrl+B, Ctrl+I, Ctrl+[ / Ctrl+], Esc.
- Modul baru `src/lineToolbar.js`.

**Tampilan landscape**
- Tombol ikon *Portrait / Landscape* di toolbar preview (per ukuran label): seluruh halaman preview diputar 90° ke kanan beserta isi labelnya. Cetak & PDF tidak berubah, jadi pengaturan Epson L5190 (A4 tengah-atas) dan kalibrasi tetap.
- Geser teks/barcode di tampilan landscape mengikuti arah layar.
- Toolbar preview dirapikan: dua kelompok (navigasi | cetak lembar, orientasi, zoom) yang tidak terpecah, tinggi kontrol seragam.

## Keterbatasan yang diketahui

- Foto per orang ikut file backup hanya bila *Sertakan foto per orang* dicentang.
- PDF hanya memakai font standar (Helvetica/Times/Courier); font lain → *Cetak Label → Save as PDF*.
- Penyimpanan browser terikat pada lokasi file `dist/index.html`; pindah folder = data tidak terbawa (pakai Backup).
- Jumlah label per lembar untuk preset bertanda "perkiraan" belum dicek dengan kemasan asli.
- `dist/` tidak ikut di repository; perlu `npm install` + `npm run build` (SheetJS diunduh dari `cdn.sheetjs.com`).

## Ide selanjutnya

- Cetak hanya label hasil pencarian (tanpa label lain di lembarnya).
- Foto per orang ikut file backup (opsional, karena ukurannya besar).
- Rilis `dist/index.html` siap pakai di GitHub Releases.
- Tema gelap.
