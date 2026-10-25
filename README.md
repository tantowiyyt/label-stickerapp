# Cetak Label

Aplikasi web untuk mencetak **label stiker** (Tom & Jerry, Koala, Fox, ABC, label A4, dan sejenisnya) dengan posisi presisi dalam milimeter. Berjalan **offline** di browser: tanpa server, tanpa login, tanpa internet setelah dibuild.

Cocok untuk kartu ujian, label nama undangan, label alamat, label produk, dan sejenisnya.

**Fitur utama**

- 40+ preset ukuran label (nomor standar lintas merek, varian merek, A4, label bulat) yang semuanya bisa diedit
- Import data dari **CSV / Excel** atau paste langsung dari Excel
- Editor isi label: placeholder `{{kolom}}`, gaya per baris, font, perataan, orientasi 0°/90°/270°, **auto-fit** tanpa memotong teks
- **Barcode** (Code 128/39, EAN, UPC, ITF) & **QR code**, plus generator kode
- **Gambar bebas** (logo, branding, watermark) yang bisa digeser, **foto per orang**, warna per kelompok (mis. program studi)
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
| `**teks**` / `*teks*` | Tebal / miring — atau blok kata di kotak *Isi label* lalu tekan **Ctrl+B / Ctrl+I** (atau tombol **B / I** di atasnya); tekan lagi untuk melepas |
| `{{nama\|upper}}` · `\|lower` · `\|title` | HURUF BESAR · huruf kecil · Kapital Tiap Kata |
| `{{tgl_lahir\|tanggal}}` · `\|tgl` | 12 Januari 2005 · 12/01/2005. Membaca 2005-01-12, 12/01/2005, 12 Jan 2005, dan tanggal dari Excel |
| `{{biaya\|angka}}` · `\|rupiah` | 1.250.000 · Rp 1.250.000 (membaca 1250000, 1.250.000, 1,250,000.5, Rp 75.000) |
| `{{gelar\|atau:-}}` | Teks pengganti bila nilainya kosong (mis. `-` atau `Belum ada`) |
| `{{nama\|title\|atau:Tanpa Nama}}` | Format boleh berantai, dijalankan dari kiri ke kanan |
| `{{no}}` | Nomor urut baris di data |
| `{{tanggal}}` | Tanggal hari ini, mis. 16/10/2026 |

Klik nama kolom (chip) di panel untuk menyisipkan placeholder. Placeholder yang kolomnya tidak ada di data ditandai dengan peringatan.

**Galeri template** (tombol ▦ di sebelah pilihan template): desain siap pakai — kartu ujian + QR, label undangan (*Kepada Yth.*), alamat pengiriman, label harga + barcode, name tag acara (strip warna per peran), label arsip/map, dan label inventaris + QR. Pratinjau memakai ukuran label yang sedang dipilih. **Pakai template** menambah template baru; **+ data contoh** sekaligus mengisi tabel data dengan contoh. Isi template mengikuti bahasa antarmuka (ID/EN).

**Pengaturan**

- **Gaya cepat**: *Judul tebal*, *Semua tebal*, *Normal*.
- **Gaya per baris**: tebal, miring, HURUF BESAR, ukuran (pt), warna, rata kiri/tengah/kanan (menimpa rata global; klik lagi untuk kembali ikut global), dan font.
- **Jika teks terlalu panjang** (per baris, di *Gaya per baris* atau toolbar mini), mis. untuk nama yang sangat panjang:
  - **Perkecil font** (bawaan): diperkecil sampai muat 1 baris (min. 6 pt), baru turun baris.
  - **Maks. 2 baris** / **Maks. 3 baris**: turun ke baris berikutnya; diperkecil hanya bila 2/3 baris belum cukup.
  - **Turun baris (bebas)**: ukuran tetap, turun baris sebanyak yang perlu (bila tinggi label tidak cukup, semua baris diperkecil bersama).
  - **Potong …**: ukuran tetap 1 baris, kelebihannya diganti "…" (juga di PDF).
- **Teks bebas (di luar data)**: teks tambahan seperti *Kepada Yth.*, *Bapak/Ibu*, *Di Tempat* yang bisa diletakkan di mana saja, seperti *Text Box* di Word. Klik **+ Tambah teks** atau salah satu tombol teks cepat (juga ada di toolbar atas: tombol **T+ Teks**, dan ▾ untuk teks cepat), lalu seret di preview (menempel ke tengah/tepi label dan baris lain). Klik teksnya untuk mengubah **isi**, font, ukuran, tebal/miring, warna, dan rata lewat toolbar mini; atau ketik di panel (X/Y/ukuran). Boleh berisi `{{kolom}}`, mis. `Kepada Yth. {{nama}}`. Teks bebas tidak diperkecil otomatis, jadi atur ukurannya agar muat. Ikut tercetak, masuk PDF, dan posisinya disimpan per ukuran label.
- **Toolbar format seperti MS Word**: klik tulisan di preview, toolbar mini muncul di atasnya untuk mengganti **font**, **ukuran** (ketik, atau A− / A+), **tebal**, **miring**, **HURUF BESAR**, **warna** (6 warna cepat atau pilih sendiri), dan **rata** kiri/tengah/kanan. Perubahan berlaku untuk baris itu di semua label (sama dengan *Gaya per baris*). Pintasan: **Ctrl+B** tebal, **Ctrl+I** miring, **Ctrl+[ / Ctrl+]** perkecil/perbesar, **Esc** tutup.
- **Geser tulisan di preview**: tarik baris teks mana pun langsung di preview; semua label ikut berubah. Agar rapi, tulisan **menempel otomatis** (garis bantu merah muda) ke tengah label, tepi label/area teks, dan tepi atau tengah baris lain; di luar itu bergeser per 0,5 mm dan kembali "menempel" ke posisi semula. Tahan **Alt** saat menarik untuk menggeser bebas (per 0,1 mm). Klik baris lalu pakai tombol panah untuk menggeser halus. Geseran tampil di *Gaya per baris* (mis. `X +2 · Y −1,5 mm`) dengan tombol **Kembalikan**; *Kembalikan semua baris ke posisi otomatis* untuk mengulang. Baris lain tidak ikut berpindah, auto-fit tetap berlaku, dan geseran ikut tercetak & masuk PDF.
- **Tata letak isi**: font global, rata horizontal & vertikal, **orientasi isi** (Portrait 0°, Landscape 90°, Landscape terbalik 270°; yang diputar hanya isi label, susunan label di kertas tetap), dan padding. Orientasi isi juga ada di **status bar di bawah preview** (ikon huruf A yang berputar, di sebelah *Kertas* dan *Zoom*, seperti status bar MS Word).
- **Font**: font yang terpasang di komputer. Font yang tidak terpasang ditandai dan dicetak dengan Arial. *Font lain (ketik nama)…* untuk font yang Anda install sendiri. Untuk nama panjang, font ramping seperti **Arial Narrow** atau **Bahnschrift Condensed** membuat teks tetap besar.
- **Auto-fit**: ukuran font adalah ukuran maksimum. Baris yang terlalu panjang diperkecil sampai muat (minimal 6 pt); baru jika di 6 pt masih tidak muat, baris itu di-wrap. Jika total tinggi tidak muat, semua baris diperkecil bersama. Teks tidak pernah dipotong diam-diam.
- **Ukuran font sama untuk semua label**: setiap baris memakai ukuran terkecil hasil auto-fit dari seluruh data, agar seragam.
- **Sembunyikan baris yang datanya kosong**: baris template yang semua placeholdernya kosong tidak dicetak.
- **Tata letak per ukuran label**: orientasi isi, padding, ukuran font, posisi tulisan, posisi/ukuran barcode/QR, foto, serta gambar & teks bebas disimpan **per ukuran label**; teks, font, warna, dan kolom tetap sama untuk semua ukuran. Kembali ke ukuran yang pernah dipakai = tata letaknya dipulihkan persis. Ukuran yang belum pernah dipakai disesuaikan otomatis: orientasi isi dipilih agar tulisan mengikuti sisi panjang label (mis. 101 tegak 50×100 → 103 mendatar 64×32), posisi & ukuran diskalakan, dan ukuran font hanya ikut membesar (auto-fit tetap memperkecil bila perlu).
- Template tersimpan otomatis. *Simpan baru* membuat salinan; *Export/Import JSON* untuk memindahkan ke komputer lain.

## Gambar, foto, barcode & warna

### Gambar bebas (logo, branding)

Untuk logo kampus/sponsor, watermark, atau ornamen. Gambar diperkecil otomatis (maks. 600 px) dan disimpan di template.

- *+ Tambah gambar…*, lalu **seret gambar langsung di preview**; tarik **titik ungu di pojok kanan bawah** untuk mengubah ukuran. Berlaku untuk semua label.
- Saat diseret, gambar dijaga tetap di dalam label (per 0,5 mm). Posisi X/Y dan lebar juga bisa diketik (mm).
- Lapisan **Depan / Belakang** teks dan **transparansi** (mis. Belakang + 20% untuk watermark).
- **Teks di samping gambar**: teks pindah ke ruang kosong terbesar di sebelah gambar (seperti *Wrap Text → Square* di Word), cocok untuk logo di kiri/kanan. Matikan agar gambar melayang di atas teks.
- Fitur lama *Logo / gambar* sudah digabung ke sini: logo dari template lama otomatis menjadi gambar bebas di sisi yang sama dengan *Teks di samping gambar* aktif.

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
- **Posisi bebas**: seret barcode/QR langsung di preview untuk memindahkannya (posisi otomatis menjadi **Bebas**), dan tarik **titik ungu** di pojok kanan bawah untuk mengubah ukurannya (QR tetap persegi). Saat digeser, barcode/QR menempel ke tengah/tepi label dan ke baris teks (garis bantu merah muda); tahan **Alt** untuk geser bebas. Klik lalu tombol panah untuk menggeser halus. Dalam posisi bebas, **teks otomatis pindah ke samping barcode/QR** (ruang kosong terbesar di kiri/kanan/atas/bawahnya, seperti *Wrap Text → Square* di Word), jadi nama panjang tetap terbungkus rapi di sebelahnya. Matikan *Teks di samping barcode/QR* bila ingin QR melayang di atas teks. Pilih Bawah/Atas/Kiri/Kanan untuk kembali ke tata letak otomatis.

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

### Kertas portrait / landscape

Tombol ikon *Kertas* **Portrait / Landscape** di status bar bawah preview (disimpan per ukuran label). **Landscape** memutar seluruh halaman preview 90° ke kanan (searah jarum jam), termasuk isi setiap label (seperti memutar kertasnya). Menggeser teks/barcode tetap bisa dan arahnya mengikuti layar. Hasil cetak dan PDF **tidak berubah**: kertas tetap dimasukkan ke printer seperti biasa dan di dialog cetak tetap pilih **Portrait**.

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
- **Export PDF**: PDF vektor dengan pengaturan yang sama (posisi, rotasi, gambar, barcode/QR, kertas printer). Dengan **Pakai font asli komputer di PDF** (aktif bawaan), font yang sama dengan layar (mis. Arial, Times New Roman, Calibri) disematkan ke PDF; Chrome/Edge meminta izin akses font sekali. Hanya font TrueType (.ttf) yang bisa disematkan; font .otf/.ttc, browser lain, atau bila izin ditolak → PDF memakai Helvetica/Times/Courier (ada pemberitahuan). Alternatif: *Cetak Label → Save as PDF*.

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

## Atur objek (rata, duplikat, hapus)

Klik objek di preview (baris teks, teks bebas, gambar, atau QR/barcode); toolbar mini muncul di atasnya.

- **Posisi ▾** — ratakan objek terhadap area isi label: *rata kiri / tengah horizontal / rata kanan* dan *rata atas / tengah vertikal / rata bawah* (di dalam padding). Berlaku untuk semua label.
- **Duplikat** (Ctrl+D) untuk teks bebas & gambar; **Hapus** (tombol Delete) untuk teks bebas, gambar, dan QR — bisa diurungkan dengan Ctrl+Z.
- Gambar: **Di depan / Di belakang teks** dari menu Posisi, dan bisa digeser dengan tombol panah (Shift = 2 mm).

## Bentuk & garis

Menu **Bentuk ▾** di toolbar atas (atau tombol di panel *Isi Label → Bentuk & garis*): garis datar, garis tegak, kotak, kotak sudut bulat, lingkaran/elips, dan bingkai label.

- Seret di preview (menempel ke tengah/tepi label dan baris teks), tarik **titik biru** di pojok untuk mengubah ukuran — untuk garis hanya panjangnya.
- Klik bentuk untuk toolbar mini: warna & tebal garis, putus-putus, warna isi / tanpa isi, sudut bulat, posisi (rata), depan/belakang teks, duplikat (Ctrl+D), hapus (Delete).
- Ikut tercetak dan masuk PDF sebagai vektor; posisinya disimpan per ukuran label.

## Putar objek

Teks bebas, gambar, dan bentuk bisa diputar ke sudut berapa pun:

- Tarik **titik ungu di atas objek** yang dipilih (menempel tiap 15°; tahan **Shift** untuk sudut bebas), atau
- ketik sudutnya di toolbar mini (derajat, searah jarum jam) / tombol **↻ 90°**.
- Ikut tercetak dan masuk PDF (teks & bentuk tetap vektor).

## Cetak hanya yang tampil

- Tab **Data**: saat mencari, tombol **Cetak hanya yang tampil (N)** mencentang baris yang tampil saja; baris lain tidak dicetak.
- **Preview**: setelah mencari, tombol filter di kotak cari melakukan hal yang sama untuk label hasil pencarian.
- Bisa dibatalkan dengan **Urungkan** di tab Data.

## Cetak per kelompok

Di *Printer & Cetak → Opsi cetak*, pilih **Kelompokkan per** sebuah kolom (mis. `kelas` atau `ruang`):

- Label diurutkan per kelompok dengan urutan alami (Ruang 1, Ruang 2, … Ruang 10); urutan di dalam kelompok tetap.
- **Lembar baru untuk tiap kelompok** (aktif bawaan): setiap kelompok mulai di lembar baru sehingga mudah dipisahkan. Di preview tiap lembar diberi penanda *Kelompok: …* (tidak ikut tercetak).
- **Cetak kelompok**: cetak satu kelompok saja (mis. hanya Ruang 2); jumlah label & lembar di header ikut menyesuaikan.

## Penyimpanan, backup & reset

- Data, template, ukuran label, pengaturan, dan foto per orang disimpan di **IndexedDB** browser (kapasitas ratusan MB, cukup untuk ribuan baris + gambar); aplikasi meminta browser agar data ini tidak dihapus otomatis. Semuanya tetap ada setelah browser ditutup.
- Data dari versi lama (localStorage, maks. ±5 MB) dipindahkan otomatis saat aplikasi pertama kali dibuka. Bila IndexedDB tidak tersedia, aplikasi kembali memakai localStorage.
- Penyimpanan browser terikat pada lokasi file: bila `dist/index.html` dipindah ke folder lain, data lama tidak ikut.
- **Backup & pulihkan** (panel ④): satu file JSON berisi data, template, ukuran, dan pengaturan. Centang **Sertakan foto per orang** agar foto ikut tersimpan (file jadi lebih besar). Gunakan untuk pindah komputer.
- **Pengingat backup**: bila ada data dan belum pernah / lebih dari 7 hari tidak di-backup, muncul pita kuning di atas preview dengan tombol *Download backup* (atau *Nanti* untuk menunda 3 hari).
- **Reset data…**: pilih bagian yang dikembalikan ke kondisi awal (data, template, ukuran label, foto, pengaturan printer & cetak, tampilan panel). Ada tombol *Download backup* di dialog yang sama.
- Ukuran label dan template juga bisa diexport/import terpisah (JSON).

## Toolbar preview

Seperti toolbar Google Docs/Word: dua kelompok tombol tanpa bingkai.

- **Kiri — edit:** **↶ Urungkan / ↷ Ulangi** perubahan desain label (geser, font, ukuran, warna, QR, gambar, teks bebas, orientasi, …) hingga 50 langkah — perubahan beruntun yang rapat (mengetik, menekan panah) dihitung satu langkah; lalu **T+ Teks** (▾ teks cepat), **Gambar** (sisipkan logo/gambar bebas), **QR** (pasang QR code, kolom dipilih otomatis).
- **Kanan — tampilan:** isi preview (*Label data / Halaman tes*), ‹ nomor lembar ›, **cari** (Ctrl+F; Enter / ‹ › untuk hasil berikutnya/sebelumnya, Esc menutup), dan **Cetak lembar ini** (berwarna biru “Cetak lembar N” bila lembar ini berisi hasil pencarian).
- Di layar kecil tombol menjadi ikon saja (keterangan muncul saat mouse diarahkan) dan kotak cari muncul **melayang** di bawah ikon 🔍, jadi toolbar tidak bergeser.

## Bahasa / Language

Tombol **ID | EN** di kanan atas mengganti bahasa antarmuka (Indonesia / English) tanpa memuat ulang; pilihan tersimpan di browser. Saat pertama dibuka, bahasa mengikuti browser (Indonesia bila browser berbahasa Indonesia, selain itu English).

- Yang diterjemahkan: semua menu, tombol, petunjuk, notifikasi, dan dialog.
- Yang **tidak** diterjemahkan: isi label (teks, data, teks bebas), nama kolom, nama template, dan hasil cetak/PDF.
- Teks cepat di *Teks bebas* ikut bahasa: *Kepada Yth., Di Tempat, …* (ID) atau *To:, Dear, Attn:, …* (EN).

*The **ID | EN** switch in the top right changes the interface language. Label content, data, column and template names are never translated.*

## Pintasan keyboard

| Tombol | Fungsi |
|---|---|
| **Ctrl+P** | Cetak label (bukan tampilan aplikasi) |
| **← / →**, PageUp / PageDown | Lembar sebelumnya / berikutnya di preview |
| **Home / End** | Lembar pertama / terakhir |
| **Ctrl+F** (tab Preview) | Cari teks di label |
| **Delete** / **Ctrl+D** (objek terpilih di preview) | Hapus / duplikat teks bebas, gambar, atau QR |
| **Enter** / **Shift+Enter** (di kotak cari) | Hasil pencarian berikutnya / sebelumnya; **Esc** menutup pencarian |
| **Ctrl+Z** (tab Data, di luar kotak isian) | Urungkan perubahan data |
| **Ctrl+Z / Ctrl+Y** (tab Preview, di luar kotak isian) | Urungkan / ulangi perubahan desain label (juga tombol ↶ ↷ di toolbar) |
| **Ctrl+B / Ctrl+I / Ctrl+[ / Ctrl+]** (baris teks terpilih di preview) | Tebal / miring / perkecil / perbesar font |
| **← ↑ ↓ →** (baris teks terpilih di preview) | Geser baris 0,5 mm · **Shift** 2 mm · **Ctrl** 0,1 mm; **Esc** batal pilih |

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

## Dipasang di web / VPS (PWA)

Hasil build (`dist/`) berisi `index.html` (seluruh aplikasi), `sw.js`, `manifest.webmanifest`, dan ikon. Cukup disajikan sebagai file statis (mis. Nginx, Cloudflare Pages) lewat **HTTPS**:

- Aplikasi bisa **di-install** (tombol **Pasang** di header, atau ikon pasang di address bar Chrome/Edge) dan dibuka seperti aplikasi biasa.
- Setelah sekali dibuka online, aplikasi **tetap bisa dibuka tanpa internet** (service worker). Saat online, versi terbaru diambil otomatis.
- Data setiap pengguna tetap di browser masing-masing; server tidak menyimpan data peserta.
- `dist/index.html` juga tetap bisa dibuka langsung dari folder (tanpa server); service worker hanya aktif lewat http(s).

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
| `src/i18n.js`, `src/i18n-en.js` | Bahasa antarmuka. Teks ditulis dalam bahasa Indonesia di kode/HTML; kamus `EN` (teks persis) dan `EN_PATTERNS` (teks berisi angka/nama) menerjemahkannya. Teks baru di antarmuka cukup ditambahkan ke kamus; elemen ber-`translate="no"` dilewati |
| `src/renderer.js` | Geometri isi label (teks, foto, kode, strip, gambar & teks bebas) dan gambar label ke DOM |
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
