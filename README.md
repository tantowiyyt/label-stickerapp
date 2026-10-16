# Cetak Label

Aplikasi web untuk mencetak **label stiker** (Tom & Jerry, Koala, Fox, ABC, label A4, dan sejenisnya) dengan posisi presisi dalam milimeter. Berjalan **offline** di browser: tanpa server, tanpa login, tanpa internet setelah dibuild.

Cocok untuk kartu ujian, label nama undangan, label alamat, label produk, dan sejenisnya.

**Fitur utama**

- 40+ preset ukuran label (nomor standar lintas merek, varian merek, A4, label bulat) yang semuanya bisa diedit
- Import data dari **CSV / Excel** atau paste langsung dari Excel
- Editor isi label: placeholder `{{kolom}}`, gaya per baris, font, perataan, orientasi 0°/90°/270°, **auto-fit** tanpa memotong teks
- **Barcode** (Code 128/39, EAN, UPC, ITF) & **QR code**, plus generator kode
- Logo, **gambar branding yang bisa digeser**, **foto per orang**, warna per kelompok (mis. program studi)
- Preview per lembar persis seperti hasil cetak, cari teks, lompat ke lembar, cetak satu lembar
- Kalibrasi printer, halaman tes dengan penggaris, pengaturan kertas di printer (A4), **export PDF** vektor

---

## Daftar isi

1. [Mulai cepat](#mulai-cepat)
2. [Alur kerja](#alur-kerja)
3. [Data](#data)
4. [Isi label](#isi-label)
5. [Gambar, foto, barcode & warna](#gambar-foto-barcode--warna)
6. [Ukuran label](#ukuran-label)
7. [Mencetak](#mencetak)
8. [Kalibrasi printer](#kalibrasi-printer)
9. [Penyimpanan, backup & reset](#penyimpanan-backup--reset)
10. [Pintasan keyboard](#pintasan-keyboard)
11. [Masalah umum](#masalah-umum)
12. [Pengembangan](#pengembangan)

---

## Mulai cepat

Butuh [Node.js](https://nodejs.org) 20.19+ atau 22.12+ (hanya untuk instalasi dan build).

```bash
npm install      # sekali saja (perlu internet)
npm run dev      # mode pengembangan → buka alamat yang muncul, mis. http://localhost:5173
npm run build    # membuat dist/index.html
```

Hasil `npm run build` adalah **satu file** `dist/index.html` berisi seluruh aplikasi (±1,5 MB). File itu bisa dibuka langsung dengan klik dua kali (disarankan **Chrome** atau **Edge**), disalin ke flashdisk, atau dipindah ke komputer lain. Setelah dibuild, aplikasi tidak butuh internet maupun Node.js.

## Alur kerja

Panel kiri berisi empat langkah bernomor:

| Langkah | Isi |
|---|---|
| **① Data** | Import CSV/Excel atau paste dari Excel |
| **② Isi Label** | Susun teks label, gaya, gambar, barcode/QR, warna |
| **③ Ukuran Label** | Pilih preset lembar label, sesuaikan ukuran/margin/jarak |
| **④ Printer & Cetak** | Kertas di printer, kalibrasi, opsi cetak, PDF, backup |

Area kanan berisi tab **Preview** (lembar persis seperti hasil cetak) dan **Data** (tabel yang bisa diedit). Tombol **Cetak Label**, **Halaman Tes**, dan **PDF** selalu ada di kanan atas.

## Data

### Import

- **Import CSV / Excel**: file `.csv`, `.xlsx`, `.xls` (juga `.xlsm`, `.ods`). Baris pertama = nama kolom.
  - CSV: pemisah koma, titik koma, atau tab dideteksi otomatis. CSV dari Excel (ANSI maupun UTF-8) bisa dibaca.
  - Excel: dipakai sheet pertama yang berisi data. Nilai diambil seperti yang tampil di Excel (sel bertipe Teks tetap punya nol di depan, tanggal sesuai format sel).
- **Paste dari Excel**: blok sel (termasuk baris judul), Ctrl+C, lalu Ctrl+V di kotak paste.
- **Contoh CSV / Contoh Excel**: file contoh untuk melihat format. Contoh yang sama ada di [`template/template-data-label.csv`](template/template-data-label.csv).

```
nama;alamat;telepon;jumlah
Budi Santoso;Jl. Merdeka No. 10, Bandung;0812-3456-7890;2
```

Nama kolom **bebas** dan dipakai sebagai placeholder (`{{nama}}`, `{{alamat}}`, …). Satu-satunya kolom khusus adalah **`jumlah`** (atau `jml` / `qty`): setiap baris dicetak sebanyak angka tersebut. Kosong = 1, 0 = tidak dicetak.

### Tab Data

- **Centang** baris yang akan dicetak, **edit** sel langsung, **hapus** atau **tambah** baris/kolom.
- **Urutkan**: klik judul kolom (klik lagi untuk urutan terbalik). Urutan ini dipakai saat mencetak.
- **Cari** baris; tombol centang-semua hanya berlaku untuk baris yang tampil.
- **Urungkan** (atau Ctrl+Z di luar kotak isian): membatalkan hapus/edit/centang/urutkan/import/kosongkan, hingga 30 langkah.
- **Peringatan data** di atas tabel: kolom yang dipakai di label tapi kosong, NIM/NIS/ID/kode ganda, dan baris tanpa foto. Klik **Tampilkan** untuk menyaring baris tersebut.
- **Export CSV / Export Excel**: simpan data hasil edit. Di Excel semua sel disimpan sebagai teks, jadi NIM panjang dan nol di depan tetap utuh.

## Isi label

Contoh template (kartu ujian):

```
**{{nama}}**
NIM: {{nim}}
Kelas: {{kelas}}
No. Kursi: **{{no_kursi}}**
```

| Sintaks | Hasil |
|---|---|
| `{{kolom}}` | Isi kolom data. Tidak peka huruf besar/kecil & spasi: `{{no_kursi}}` cocok dengan kolom `No Kursi` |
| `**teks**` / `*teks*` | Tebal / miring |
| `{{nama\|upper}}` · `\|lower` · `\|title` | HURUF BESAR · huruf kecil · Kapital Tiap Kata |
| `{{no}}` | Nomor urut baris di data |
| `{{tanggal}}` | Tanggal hari ini, mis. 16/10/2026 |

Klik nama kolom (chip) di panel untuk menyisipkan placeholder. Placeholder yang kolomnya tidak ada di data ditandai dengan peringatan.

**Pengaturan**

- **Gaya cepat**: *Judul tebal*, *Semua tebal*, *Normal*.
- **Gaya per baris**: tebal, miring, HURUF BESAR, ukuran (pt), warna, rata kiri/tengah/kanan (menimpa rata global; klik lagi untuk kembali ikut global), dan font.
- **Tata letak isi**: font global, rata horizontal & vertikal, **orientasi isi** (Portrait 0°, Landscape 90°, Landscape terbalik 270°; yang diputar hanya isi label, susunan label di kertas tetap), dan padding.
- **Font**: font yang terpasang di komputer. Font yang tidak terpasang ditandai dan dicetak dengan Arial. *Font lain (ketik nama)…* untuk font yang Anda install sendiri. Untuk nama panjang, font ramping seperti **Arial Narrow** atau **Bahnschrift Condensed** membuat teks tetap besar.
- **Auto-fit**: ukuran font adalah ukuran maksimum. Baris yang terlalu panjang diperkecil sampai muat (minimal 6 pt); baru jika di 6 pt masih tidak muat, baris itu di-wrap. Jika total tinggi tidak muat, semua baris diperkecil bersama. Teks tidak pernah dipotong diam-diam.
- **Ukuran font sama untuk semua label**: setiap baris memakai ukuran terkecil hasil auto-fit dari seluruh data, agar seragam.
- **Sembunyikan baris yang datanya kosong**: baris template yang semua placeholdernya kosong tidak dicetak.
- Template tersimpan otomatis. *Simpan baru* membuat salinan; *Export/Import JSON* untuk memindahkan ke komputer lain.

## Gambar, foto, barcode & warna

### Logo / gambar

Gambar dengan **area sendiri** di kiri/kanan/atas/bawah isi label (mis. logo kampus); teks menyesuaikan sisa ruang. Diperkecil otomatis (maks. 600 px) dan disimpan di template.

### Gambar bebas (branding)

Untuk logo sponsor, watermark, atau ornamen yang **melayang** di atas/belakang teks tanpa mengurangi ruang teks.

- *+ Tambah gambar…*, lalu **seret gambar langsung di preview**; tarik **titik ungu di pojok kanan bawah** untuk mengubah ukuran. Berlaku untuk semua label.
- Saat diseret, gambar dijaga tetap di dalam label (per 0,5 mm). Posisi X/Y dan lebar juga bisa diketik (mm).
- Lapisan **Depan / Belakang** teks dan **transparansi** (mis. Belakang + 20% untuk watermark).

### Foto per orang

Pas foto berbeda untuk setiap baris, dicocokkan lewat **nama file**.

1. Pilih *Cocokkan dengan kolom* (mis. `nim`).
2. **Tambah foto…** (banyak file) atau **Pilih folder…**. File `20230001.jpg` dipakai untuk baris dengan NIM 20230001 (huruf besar/kecil & ekstensi diabaikan).
3. Atur posisi, lebar area, dan bentuk bingkai (3×4, 2×3, 4×6, 1×1). Foto dipotong rapi di tengah.

Foto disimpan di **IndexedDB** browser (diperkecil maks. 480 px) dan **tidak ikut file backup**. Kotak "tanpa foto" hanya tampil di preview.

### Barcode / QR code

- **Format**: QR code, Code 128 (paling umum), Code 39, EAN-13, EAN-8, UPC-A, ITF. Untuk EAN/UPC cukup isi 12/7/11 digit; checksum dihitung otomatis.
- **Isi kode**: *Dari kolom* (mis. `nim`) atau *Teks / rumus*, mis. `https://kampus.ac.id/cek?nim={{nim}}` atau teks tetap.
- Posisi dan ukuran bisa diatur; teks label menyesuaikan sisa ruang. Isi yang tidak valid untuk formatnya ditandai merah di preview dan tidak dicetak.

**Generator QR / Barcode** (tombol di bagian Barcode / QR code, atau *Generator kode* di tab Data):

- **Buat satu kode**: ketik teks/URL apa saja, pilih format, lalu **Download PNG** atau **SVG** (vektor).
- **Isi kolom kode otomatis**: kode unik untuk setiap baris, berupa **nomor urut** (`PST-0001`, `PST-0002`, …) atau **acak unik** (tanpa karakter yang mudah tertukar seperti O/0, I/1). Disimpan di kolom baru (bisa diurungkan) dan langsung bisa dipakai di label.

### Warna per kelompok

Beri warna berbeda per nilai sebuah kolom, mis. per **program studi**. Pilih kolomnya, lalu warnai **Teks**, **Latar** (teks hitam otomatis menjadi putih di latar gelap), atau **Strip atas**. Setiap nilai otomatis diberi warna; klik kotak warna untuk menggantinya.

## Ukuran label

Nomor label di Indonesia **berlaku lintas merek**: No. 103 di Tom & Jerry, Koala, Fox, ABC, Flexy, VOS, Diamond, dll. sama-sama 32 × 64 mm, 12 label per lembar.

- **Nomor standar** (lembar ±165 × 210 mm): No. 100–129, termasuk label **bulat** No. 114–118. Jumlah per lembar mengikuti data kemasan/penjual; yang bertanda **"perkiraan"** disusun otomatis.
- **Varian merek** yang ukurannya sedikit berbeda: Koala No. 121, Fox No. 100, ABC No. 100–103 & 121.
- **A4 generik**: 1, 8, 10, 14, 21, 24, 40, dan 65 label per lembar.
- **Ukuran custom**: tambah, duplikat, hapus, dan export/import JSON.

> **Margin dan jarak antar label pada preset adalah perkiraan awal.** Ukur lembar label asli Anda dan sesuaikan di *Atur ukuran, margin & jarak*:
>
> - **Margin kiri / atas**: dari tepi kertas ke tepi label kolom/baris pertama.
> - **Jarak horizontal / vertikal**: celah antar label.
>
> Tip: ukur dari tepi kiri label pertama ke tepi kiri label terakhir di baris yang sama, lalu bagi dengan (jumlah kolom − 1). Hasilnya `lebar + jarakH`, lebih teliti daripada mengukur celah kecil.

*Tengahkan di kertas* menghitung margin agar susunan label di tengah. *Kembalikan ukuran ini ke bawaan* mengembalikan satu preset. Preset bawaan yang belum pernah diedit diperbarui otomatis bila datanya dikoreksi di versi baru.

## Mencetak

### Kertas di printer

Beberapa printer (mis. **Epson L5190**) tidak punya ukuran kertas 165 × 210 mm, sehingga Chrome mencetak halaman A4. Tanpa pengaturan ini, hasil cetak bisa bergeser (mis. turun ±43 mm). Pilihannya (disimpan per ukuran label):

| Pilihan | Ukuran halaman (`@page`) | Posisi lembar label |
|---|---|---|
| **A4, tengah-atas (default)** | 210 × 297 mm | X = (210 − lebar lembar) / 2, Y = 0 |
| A4, kanan-atas | 210 × 297 mm | X = 210 − lebar lembar, Y = 0 (kertas dirapatkan ke pemandu kanan) |
| A4, kiri-atas | 210 × 297 mm | X = 0, Y = 0 |
| Sesuai ukuran lembar label | ukuran lembar label | – (butuh ukuran kertas custom di printer) |
| Custom | lebar & tinggi sendiri | kiri/tengah/kanan, atas/tengah |

Preview menampilkan kertas printer dengan garis oranye putus-putus di posisi lembar label.

### Dialog cetak browser

Sebelum dialog cetak terbuka, aplikasi menampilkan pengingat. Atur:

- **Paper size**: sesuai *Kertas di printer* (mis. **A4**)
- **Margins**: **None**
- **Scale**: **100** / *Actual size* (jangan *Fit to page*)
- **Headers and footers**: **mati**

Di Chrome/Edge, opsi ini ada di *More settings*. Hanya halaman label yang tercetak; tampilan aplikasi tidak ikut.

### Opsi cetak & preview

- **Mulai dari label ke-**: untuk lembar yang sebagian sudah terpakai. Bisa juga dengan **mengklik kotak label di preview lembar 1**.
- **Salinan per label**: setiap label dicetak N kali (dikalikan kolom `jumlah`).
- **Cetak lembar dari … sampai …**: cetak sebagian lembar saja.
- **Cetak garis tepi label**: untuk uji coba.
- **Lompat ke lembar**: ketik nomor di kotak *Lembar … / N* lalu Enter.
- **Cari teks di label**: membuka lembar berisi hasil pencarian dan menandai labelnya (tanda hanya di layar). Enter / › = berikutnya, Shift+Enter / ‹ = sebelumnya.
- **Cetak lembar ini**: cetak hanya lembar yang sedang ditampilkan; setelah pencarian berhasil, tombol menjadi *Cetak lembar N*.
- **Export PDF**: PDF vektor dengan pengaturan yang sama (posisi, rotasi, gambar, barcode/QR, kertas printer). PDF memakai font standar Helvetica/Times/Courier; untuk font lain gunakan *Cetak Label → Save as PDF*.

## Kalibrasi printer

1. Pilih ukuran label dan isi ukuran hasil pengukuran Anda.
2. Atur **Kertas di printer** (untuk printer tanpa ukuran 165 × 210 mm: *A4, tengah-atas*).
3. Klik **Halaman Tes** dan cetak di **kertas HVS biasa** dengan pengaturan dialog cetak di atas.
4. Ukur **penggaris 40 mm** (horizontal & vertikal) di label no. 1. Keduanya harus tepat 40 mm; jika tidak, skala cetak belum 100%.
5. Tumpuk hasilnya di atas lembar label asli dan terawang ke arah cahaya:
   - **Semua kotak bergeser ke arah yang sama** → isi **Offset X/Y** di *Kalibrasi printer* (X positif = ke kanan, Y positif = ke bawah). Offset berlaku untuk semua ukuran label.
   - **Pergeseran makin besar ke kanan/bawah** → *jarak antar label* atau *lebar/tinggi label* kurang tepat. Perbaiki di form ukuran.
   - **Bergeser puluhan mm** → periksa pilihan *Kertas di printer* (mis. coba *A4, kanan-atas*).
6. Ulangi sampai kotak tepat menutupi label, baru cetak di kertas label asli.

Kebanyakan printer tidak bisa mencetak sampai tepi kertas (biasanya 3–5 mm), jadi hindari isi yang terlalu dekat dengan tepi lembar.

## Penyimpanan, backup & reset

- Data, template, ukuran label, dan pengaturan disimpan di **localStorage** browser; foto per orang di **IndexedDB**. Semuanya tetap ada setelah browser ditutup.
- Penyimpanan browser terikat pada lokasi file: bila `dist/index.html` dipindah ke folder lain, data lama tidak ikut.
- **Backup & pulihkan** (panel ④): satu file JSON berisi data, template, ukuran, dan pengaturan (tanpa foto). Gunakan untuk pindah komputer.
- **Reset data…**: pilih bagian yang dikembalikan ke kondisi awal (data, template, ukuran label, foto, pengaturan printer & cetak, tampilan panel). Ada tombol *Download backup* di dialog yang sama.
- Ukuran label dan template juga bisa diexport/import terpisah (JSON).

## Pintasan keyboard

| Tombol | Fungsi |
|---|---|
| **Ctrl+P** | Cetak label (bukan tampilan aplikasi) |
| **← / →**, PageUp / PageDown | Lembar sebelumnya / berikutnya di preview |
| **Home / End** | Lembar pertama / terakhir |
| **Enter** / **Shift+Enter** (di kotak cari) | Hasil pencarian berikutnya / sebelumnya |
| **Ctrl+Z** (tab Data, di luar kotak isian) | Urungkan perubahan data |

## Masalah umum

| Masalah | Solusi |
|---|---|
| Hasil cetak turun / bergeser jauh | Atur *Kertas di printer* (default *A4, tengah-atas*; Epson seri L kadang perlu *A4, kanan-atas*), lalu sisanya dengan Offset X/Y |
| Ukuran 165 × 210 mm tidak ada di daftar Paper size | Pakai *A4, tengah-atas*, atau buat ukuran kertas di Windows: `printui /s /t2` → tab **Forms** → *Create a new form* |
| Penggaris 40 mm tidak tepat 40 mm | Pastikan Scale **100** / *Actual size*, bukan *Fit to page* |
| Nol di depan nomor hilang (`0812…` → `812…`) | Di Excel, format kolom sebagai **Text** sebelum mengetik, atau tulis dengan tanda hubung |
| Warna latar tidak tercetak | Centang *Background graphics* di *More settings* dialog cetak |
| Font tidak sesuai di komputer lain | Font harus terpasang di komputer tersebut; font yang tidak ada dicetak dengan Arial |
| Foto hilang setelah pindah komputer | Foto tidak ikut backup; masukkan ulang folder foto |

## Pengembangan

**Teknologi**: Vite + JavaScript (tanpa framework), [PapaParse](https://www.papaparse.com) (CSV), [SheetJS](https://sheetjs.com) (Excel), [JsBarcode](https://github.com/lindell/JsBarcode) & [qrcode](https://github.com/soldair/node-qrcode) (barcode/QR), [jsPDF](https://github.com/parallax/jsPDF) (PDF), dan [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) (build satu file).

> SheetJS dipasang dari CDN resminya (`cdn.sheetjs.com`) karena versi di registry npm sudah usang. `npm install` membutuhkan akses ke alamat tersebut.

Semua ukuran memakai satuan **mm**. Posisi label dihitung dengan:

```
x = marginKiri + kolom × (lebarLabel + jarakH) + offsetX + geserKertasX
y = marginAtas + baris × (tinggiLabel + jarakV) + offsetY + geserKertasY
```

Preview, cetak, dan PDF memakai geometri dan hasil auto-fit yang sama, sehingga hasilnya identik.

| File | Isi |
|---|---|
| `src/main.js` | Penghubung antarmuka: panel, preview, cetak, opsi, backup/reset |
| `src/presets.js` | Preset ukuran label bawaan, migrasi preset, export/import JSON |
| `src/layout.js` | Rumus posisi label, cek muat di kertas, pembagian halaman |
| `src/media.js` | Kertas di printer: ukuran halaman cetak & posisi lembar label |
| `src/sheet.js` | DOM lembar & label (dipakai bersama preview dan cetak), halaman tes |
| `src/template.js` | Model template: placeholder & format, gaya baris, gambar, kode, warna kelompok |
| `src/templateEditor.js` | Panel editor isi label |
| `src/renderer.js` | Geometri isi label (teks, logo, foto, kode, strip) dan gambar label ke DOM |
| `src/fit.js` | Auto-fit ukuran font (diukur dengan canvas) |
| `src/fonts.js` | Daftar & deteksi font terpasang |
| `src/code.js` | Barcode & QR sebagai data vektor, file PNG/SVG |
| `src/generator.js` | Dialog generator QR/barcode & kode otomatis |
| `src/photos.js` | Foto per orang (IndexedDB) |
| `src/pdf.js` | Export PDF vektor (jsPDF) |
| `src/print.js` | Cetak via `window.print()` + `@page`, pengingat pengaturan printer |
| `src/importer.js` | Import CSV/Excel/paste, contoh file, export CSV/Excel |
| `src/data.js`, `src/dataTable.js` | Model tabel data & tabel yang bisa diedit |
| `src/settings.js`, `src/storage.js`, `src/util.js` | Pengaturan, localStorage, utilitas |
