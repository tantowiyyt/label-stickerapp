# Cetak Label

Aplikasi web untuk mencetak label stiker (Tom & Jerry / T&J dan sejenisnya). Berjalan offline di browser, tanpa server dan tanpa login. Semua data (ukuran label, kalibrasi, template) disimpan di `localStorage` browser.

## Menjalankan

Butuh [Node.js](https://nodejs.org) (sekali saja, untuk instalasi dan build).

```bash
npm install        # sekali saja
npm run dev        # mode pengembangan → buka alamat yang muncul (mis. http://localhost:5173)
npm run build      # membuat dist/index.html
```

Hasil `npm run build` adalah **satu file** `dist/index.html` yang berisi semua kode. File itu bisa dibuka langsung dengan klik dua kali (Chrome/Edge disarankan), disalin ke flashdisk, atau dipindah ke komputer lain. Setelah dibuild, aplikasi tidak butuh internet maupun Node.js.

> Data `localStorage` terikat pada lokasi file. Jika file dipindah ke folder lain, data lama tidak ikut terbawa. Pakai **Export JSON** untuk memindahkan daftar ukuran.

## Struktur kode

| File | Isi |
|---|---|
| `src/presets.js` | Preset ukuran label bawaan, validasi, export/import JSON |
| `src/importer.js` | Baca CSV / paste Excel (PapaParse) dan file Excel (SheetJS), contoh file, export CSV |
| `src/data.js`, `src/dataTable.js` | Model tabel data (kolom jumlah, centang) & tabel yang bisa diedit |
| `src/template.js` | Model template: placeholder `{{kolom}}`, markup `**tebal**`/`*miring*`, gaya per baris, gaya cepat, export/import |
| `src/templateEditor.js` | Panel editor template (gaya per baris, perataan, orientasi) |
| `src/fonts.js` | Daftar font, deteksi font terpasang, pilihan font custom |
| `src/fit.js` | Auto-fit ukuran font (diukur dengan canvas) |
| `src/renderer.js` | Menggambar isi label, termasuk rotasi 90°/270° |
| `src/layout.js` | Rumus posisi label, cek muat di kertas, pembagian halaman |
| `src/sheet.js` | Membangun DOM lembar & label (dipakai bersama oleh preview dan cetak) |
| `src/media.js` | "Kertas di printer": ukuran halaman cetak & posisi lembar label di atasnya |
| `src/code.js` | Barcode Code128 & QR code (sebagai data vektor) |
| `src/pdf.js` | Export PDF vektor dengan jsPDF |
| `src/print.js` | Cetak via `window.print()` + `@page`, dialog petunjuk printer |
| `src/settings.js`, `src/storage.js` | Pengaturan & penyimpanan localStorage |
| `src/main.js` | Penghubung antarmuka |

Rumus posisi (semua dalam mm):

```
x = marginKiri + kolom × (lebarLabel + jarakH) + offsetX
y = marginAtas + baris × (tinggiLabel + jarakV) + offsetY
```

## Preset ukuran

Nomor label di Indonesia **berlaku lintas merek**: No. 103 di Tom & Jerry, Koala, Fox, ABC, Flexy, VOS, Diamond, dll. sama-sama 32 × 64 mm, 12 label per lembar. Preset bawaan dikelompokkan di dropdown:

- **Nomor standar** (lembar ±165 × 210 mm): No. 100–129, termasuk label **bulat** No. 114–118. Jumlah per lembar mengikuti data kemasan/penjual; yang bertanda **"perkiraan"** disusun otomatis (label sebanyak mungkin dengan jarak 2 mm × 1 mm, rumus yang sama cocok dengan semua nomor yang jumlahnya diketahui).
- **Varian merek** yang ukurannya sedikit berbeda: Koala No. 121 (38 × 76 mm), Fox No. 100 (38 × 100 mm), ABC No. 100, 101, 102, 103, 121.
- **A4 generik**: 1, 8, 10, 14, 21, 24, 40, dan 65 label per lembar.

Label bulat (centang *Label bulat* di form ukuran) ditampilkan dan dicetak sebagai lingkaran; isinya otomatis dijaga di dalam lingkaran.

Preset bawaan yang belum pernah Anda edit diperbarui otomatis bila datanya dikoreksi di versi baru; yang sudah diedit tidak diubah (gunakan *Kembalikan ukuran ini ke bawaan* bila ingin nilai terbaru).

**Margin dan jarak antar label semuanya perkiraan awal** (susunan diletakkan di tengah kertas). Ukur lembar label asli Anda, lalu sesuaikan nilainya. Preset bawaan yang baru ditambahkan di versi baru otomatis muncul tanpa mengubah ukuran yang sudah Anda edit.

- **Margin kiri**: dari tepi kiri kertas ke tepi kiri label kolom pertama.
- **Margin atas**: dari tepi atas kertas ke tepi atas label baris pertama.
- **Jarak horizontal**: celah antara label kolom 1 dan kolom 2.
- **Jarak vertikal**: celah antara label baris 1 dan baris 2.

Tip: untuk jarak antar label, ukur dari tepi kiri label 1 ke tepi kiri label terakhir di baris yang sama, lalu bagi dengan jumlah kolom − 1. Hasilnya adalah `lebar + jarakH`. Cara ini lebih teliti daripada mengukur celah kecil secara langsung.

## Import data

- **Import CSV / Excel**: file `.csv`, `.xlsx`, `.xls` (juga `.xlsm`, `.ods`). Baris pertama = nama kolom. Untuk CSV, pemisah koma, titik koma, atau tab dideteksi otomatis; CSV dari Excel (ANSI maupun UTF-8) bisa dibaca. Untuk Excel, dipakai sheet pertama yang berisi data; nilai diambil seperti yang tampil di Excel (nol di depan pada sel bertipe Teks tetap ada, tanggal sesuai format sel).
- **Paste dari Excel**: blok sel di Excel (termasuk baris judul), Ctrl+C, lalu Ctrl+V di kotak paste.
- **Contoh CSV / Contoh Excel** untuk melihat format.
- Di tab **Data**: klik judul kolom untuk **mengurutkan** (klik lagi untuk urutan terbalik). Urutan ini dipakai saat mencetak. **Export CSV** / **Export Excel** menyimpan data hasil edit (di Excel semua sel disimpan sebagai teks, jadi NIM panjang dan nol di depan tetap utuh).

### Template CSV

Gunakan file [`template/template-data-label.csv`](template/template-data-label.csv) (isinya sama dengan tombol *Download contoh CSV*):

```
nama;alamat;telepon;jumlah
Budi Santoso;Jl. Merdeka No. 10, Bandung;0812-3456-7890;2
```

| Kolom | Wajib? | Keterangan |
|---|---|---|
| `nama` | – | Contoh. Nama kolom bebas; nantinya dipakai sebagai placeholder `{{nama}}` |
| `alamat` | – | Boleh berisi koma |
| `telepon` | – | Lihat catatan nol di depan di bawah |
| `jumlah` | opsional | Berapa kali baris dicetak. Kosong = 1, 0 = tidak dicetak |

Cara pakai: buka file di Excel → hapus 3 baris contoh (baris judul jangan dihapus) → isi data → **File → Save As → CSV (Comma delimited) / CSV UTF-8** → import di aplikasi. Kolom boleh ditambah (mis. `kode`, `kota`) atau dihapus sesuai kebutuhan; yang penting baris pertama berisi nama kolom.

> **Nol di depan nomor telepon hilang?** Excel mengubah `08123456789` menjadi `8123456789`. Tulis dengan tanda hubung (`0812-3456-7890`), atau format kolom sebagai **Text** sebelum mengetik.
- Kolom `jumlah` (atau `jml`/`qty`) bersifat opsional: setiap baris dicetak sebanyak angka tersebut. Kosong = 1, 0 = tidak dicetak.
- Di tab **Data**, baris bisa dicentang/tidak, diedit langsung, dihapus, atau ditambah manual. Data tersimpan otomatis di browser.
- **Urungkan** (tombol di tab Data, atau Ctrl+Z di luar kotak isian): membatalkan hapus baris, edit sel, centang, urutkan, import, dan kosongkan data (hingga 30 langkah).
- **Peringatan data** di atas tabel: baris dicentang yang kolomnya kosong padahal dipakai di label, nilai NIM/NIS/ID/kode (atau kolom barcode) yang ganda, dan baris tanpa foto. Klik **Tampilkan** untuk menyaring baris tersebut.

## Isi label (template)

```
**{{nama}}**
NIM: {{nim}}
Kelas: {{kelas}}
No. Kursi: **{{no_kursi}}**
```

- `{{kolom}}` diganti isi kolom data. Nama kolom tidak peka huruf besar/kecil dan spasi: `{{no_kursi}}` cocok dengan kolom `No Kursi`. Klik nama kolom di panel untuk menyisipkannya.
- `**teks**` = tebal, `*teks*` = miring.
- **Format huruf**: `{{nama|upper}}` HURUF BESAR, `{{nama|lower}}` huruf kecil, `{{nama|title}}` Kapital Tiap Kata.
- **Placeholder khusus**: `{{no}}` nomor urut baris di data, `{{tanggal}}` tanggal hari ini (dipakai bila tidak ada kolom bernama sama).
- **Sembunyikan baris yang datanya kosong**: baris template yang semua placeholdernya kosong tidak dicetak (mis. `Alamat 2: {{alamat2}}`).
- **Gaya per baris**: tebal, miring, HURUF BESAR, ukuran font (pt), warna, dan rata kiri/tengah/kanan. Rata per baris menimpa rata global; klik tombol yang aktif lagi untuk kembali ikut global.
- **Font**: pilih font global di *Tata letak isi*, atau font khusus per baris di *Gaya per baris* (default: ikut font global). Yang dipakai adalah font yang terpasang di komputer; font yang tidak terpasang ditandai "(tidak terpasang)" dan dicetak dengan Arial. Pilih *Font lain (ketik nama)…* untuk font lain yang sudah Anda install (mis. Poppins). Untuk nama panjang, font ramping seperti **Arial Narrow** atau **Bahnschrift Condensed** membuat teks tetap besar.
- **Logo / gambar**: pilih file PNG/JPG/SVG (mis. logo kampus), letakkan di kiri/kanan/atas/bawah, dan atur lebar/tinggi areanya. Gambar diperkecil otomatis (maks. 600 px) dan disimpan di template. Logo ikut berputar pada orientasi landscape, dan tercetak juga di PDF.
- **Gambar bebas (branding)**: *+ Tambah gambar…* untuk logo sponsor, watermark, atau ornamen. **Seret gambar langsung di preview** untuk memindahkannya dan tarik **pojok kanan bawah** (titik ungu) untuk mengubah ukuran; perubahan berlaku untuk semua label. Saat diseret, gambar dijaga tetap di dalam label (per 0,5 mm). Posisi X/Y dan lebar juga bisa diketik (mm), plus lapisan **Depan / Belakang** teks dan **transparansi** (mis. Belakang + 20% untuk watermark). Gambar ikut berputar pada orientasi landscape dan tercetak sama di print maupun PDF. Gambar biasa tidak mengurangi ruang teks (berbeda dengan *Logo / gambar* yang punya area sendiri).
- **Foto per orang**: pilih *Cocokkan dengan kolom* (mis. `nim`), lalu **Tambah foto…** atau **Pilih folder…**. Nama file menjadi kunci: `20230001.jpg` dipakai untuk baris dengan NIM 20230001 (huruf besar/kecil & ekstensi diabaikan). Bentuk bingkai 3×4, 2×3, 4×6, atau 1×1 (foto dipotong rapi di tengah). Foto disimpan di IndexedDB browser, diperkecil otomatis (maks. 480 px), **tidak ikut file backup**. Kotak "tanpa foto" hanya tampil di preview; tab Data menampilkan peringatan jumlah baris yang belum punya foto.
- **Gaya cepat**: *Judul tebal* (baris 1 tebal & lebih besar), *Semua tebal*, *Normal*.
- **Orientasi isi**: Portrait 0°, Landscape 90°, Landscape terbalik 270°. Yang diputar hanya isi label, susunan label di kertas tetap.
- **Auto-fit**: ukuran font di pengaturan adalah ukuran maksimum. Baris yang terlalu panjang diperkecil sampai muat (minimal 6 pt). Baru jika di 6 pt masih tidak muat, baris itu dipindah ke baris berikutnya (wrap). Jika total tinggi tidak muat, semua baris diperkecil bersama.
- **Ukuran font sama untuk semua label**: setiap baris memakai ukuran terkecil hasil auto-fit dari seluruh data yang akan dicetak, supaya hasilnya seragam. Satu nama yang sangat panjang akan membuat nama di semua label ikut kecil.
- Template tersimpan otomatis; *Simpan baru* untuk membuat salinan dengan nama lain; *Export/Import JSON* untuk memindahkan ke komputer lain.

## Warna per kelompok (mis. program studi)

Di *Isi Label → Warna per kelompok*, pilih kolom pengelompokan (mis. `prodi`). Semua nilai unik kolom itu muncul beserta jumlah barisnya dan otomatis diberi warna berbeda; klik kotak warna untuk menggantinya. Pilih yang diwarnai:

- **Teks**: teks berwarna hitam diganti warna kelompok.
- **Latar**: seluruh label diberi warna latar; teks hitam otomatis menjadi putih bila latarnya gelap.
- **Strip atas**: pita warna di tepi atas isi label (tebal bisa diatur, ikut berputar bila orientasi landscape).

Nilai dianggap sama tanpa memperhatikan huruf besar/kecil dan spasi berlebih. Baris yang diberi warna sendiri di *Gaya per baris* tidak berubah. Warna tersimpan di template. Untuk mode Latar, pastikan printer mencetak warna latar (aplikasi sudah memaksanya; bila tetap putih, centang *Background graphics* di dialog cetak).

## Barcode / QR code

Di *Isi Label → Barcode / QR code*: pilih **Barcode** (Code128) atau **QR code**, kolom sumbernya (mis. `nim`), posisi (bawah/atas/kiri/kanan), dan ukurannya. Teks label otomatis menyesuaikan sisa ruang. Isi yang tidak bisa dijadikan barcode (mis. huruf non-ASCII) ditandai merah di preview dan tidak dicetak.

## Opsi cetak (panel ④ Printer & Cetak)

- **Kertas di printer**: lihat bagian berikut.
- **Mulai dari label ke-**: untuk lembar yang sebagian sudah terpakai. Bisa juga dengan **mengklik kotak label di preview lembar 1**; kotak sebelum posisi itu ditandai "terpakai".
- **Salinan per label**: setiap label dicetak N kali (dikalikan dengan kolom `jumlah`).
- **Cetak lembar dari … sampai …**: untuk mencetak ulang sebagian lembar saja. Kosong = semua.
- **Export PDF**: PDF vektor dengan pengaturan yang sama (posisi, rotasi, barcode/QR, kertas printer). PDF memakai font standar Helvetica/Times/Courier; untuk font lain gunakan *Cetak Label → Save as PDF*.
- **Ctrl+P** langsung mencetak label (bukan tampilan aplikasi). Di preview, **← / →** (atau PageUp/PageDown, Home/End) untuk berpindah lembar.
- **Lompat ke lembar**: ketik nomor lembar di kotak *Lembar … / 99* di atas preview lalu tekan Enter.
- **Cari teks di label**: ketik di kotak *Cari teks di label…* (mis. nama atau NIM). Aplikasi membuka lembar hasil pertama (mulai dari lembar yang sedang dilihat) dan menandai label yang cocok dengan warna oranye; hasil yang aktif lebih tebal. **Enter** / **›** = hasil berikutnya, **Shift+Enter** / **‹** = sebelumnya. Tanda ini hanya di layar, tidak ikut tercetak.
- **Cetak lembar ini**: tombol di samping kotak pencarian mencetak hanya lembar yang sedang ditampilkan. Setelah pencarian berhasil, tombol menyala menjadi *Cetak lembar N* (lembar hasil pencarian). Cocok untuk mencetak ulang satu lembar yang rusak/salah.
- **Backup & pulihkan semua**: satu file JSON berisi data, template, ukuran, dan kalibrasi.
- **Reset data…** (di *Backup, pulihkan & reset*): pilih bagian yang dikembalikan ke kondisi awal: data, template, ukuran label, pengaturan printer & cetak, tampilan panel. Ada tombol *Download backup* di dialog yang sama.

## Kertas di printer

Beberapa printer (mis. **Epson L5190**) tidak punya ukuran kertas 165 × 210 mm, sehingga Chrome mencetak di halaman A4. Printer lalu menaruh kertas label **di tengah secara horizontal, tetapi mulai dari ujung atas**, sehingga hasil cetak turun ±43 mm. Atur di *Kertas di printer* (disimpan per ukuran label):

| Pilihan | Ukuran halaman (`@page`) | Posisi lembar label |
|---|---|---|
| Sesuai ukuran lembar label | ukuran lembar label | – |
| **A4, tengah-atas (default)** | 210 × 297 mm | X = (210 − lebar lembar) / 2, Y = 0 |
| A4, kanan-atas | 210 × 297 mm | X = 210 − lebar lembar, Y = 0 (Epson seri L: kertas dirapatkan ke pemandu kanan) |
| A4, kiri-atas | 210 × 297 mm | X = 0, Y = 0 |
| Custom | lebar & tinggi sendiri | kiri/tengah/kanan, atas/tengah |

Offset kalibrasi ditambahkan di atas posisi ini. Preview menampilkan kertas printer dengan garis oranye putus-putus di posisi lembar label. Di dialog cetak, pilih **Paper size** sesuai pilihan ini (mis. A4), **Margins: None**, **Scale: 100**, dan matikan **Headers and footers**.

Halaman tes memuat **penggaris 40 mm** horizontal & vertikal di label 1: ukur dengan penggaris, keduanya harus tepat 40 mm (bila tidak, skala cetak bukan 100%).

## Cara kalibrasi

1. Pilih ukuran label, lalu isi ukuran hasil pengukuran Anda dengan penggaris.
2. Klik **Cetak Halaman Tes**. Di dialog cetak browser:
   - Ukuran kertas sama dengan ukuran lembar label (buat *custom paper size* di driver printer bila belum ada)
   - Scale **100%** / *Actual size*
   - Margin **None**
   - Header & footer **mati**
3. Cetak dulu di **kertas HVS biasa**. Tumpuk hasilnya di atas lembar label asli, lalu terawang ke arah cahaya.
4. Ukur penggaris 40 mm di label no. 1 (horizontal & vertikal). Keduanya harus tepat 40 mm. Jika tidak, skala cetak belum 100%.
5. Bandingkan posisi kotak dengan label asli:
   - **Semua kotak bergeser ke arah yang sama** → printer yang meleset. Isi **Offset X/Y** di panel *Kalibrasi Printer* (X positif = geser ke kanan, Y positif = geser ke bawah). Offset berlaku untuk semua ukuran label.
   - **Pergeseran makin besar ke arah kanan/bawah** → *jarak antar label* atau *lebar/tinggi label* kurang tepat. Perbaiki di form ukuran.
6. Ulangi sampai kotak tepat menutupi label, baru cetak di kertas label asli.

Catatan: kebanyakan printer tidak bisa mencetak sampai ke tepi kertas (biasanya 3–5 mm). Isi label yang terlalu dekat dengan tepi kertas bisa terpotong.

## Tahap pengembangan

- [x] Tahap 1: preset ukuran, preview, kalibrasi, cetak halaman tes
- [x] Tahap 2: import data (CSV/paste dari Excel)
- [x] Tahap 3: editor template (gaya per baris, orientasi, perataan, auto-fit)
- [x] Tahap 4: mulai dari label ke-, salinan, barcode/QR, export PDF, kertas di printer, rentang lembar, backup
