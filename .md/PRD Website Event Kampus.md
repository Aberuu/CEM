# PRD: Website Event Kampus

Tugas PTI: Pembuatan Web | Kelompok Kerupuk Basah - 3 | Versi 0.1

**Anggota kelompok**

1. AgapheAbel\_672024084
2. RezaDwiSaputra\_672026080
3. ErnestLimbong\_672026071
4. WellprinaGrace\_672026085

**Topik:** Website event kampus **Teknologi:** HTML dan CSS saja (tanpa JavaScript, tanpa framework, tanpa backend) **Bahasa antarmuka:** Indonesia (tombol BA/EN tetap ada sesuai desain, dibuat dengan CSS)

> Catatan format laporan: halaman 1 adalah cover (judul, topik, nama kelompok, anggota dan NIM). Halaman 2 dan seterusnya adalah isi. Halaman terakhir berisi link repo GitHub. Setiap perkembangan dilaporkan tiap minggu.

## 1. Ringkasan

Website statis untuk menampilkan event kampus: seminar, lomba, workshop, pentas seni, dan kegiatan UKM. Pengunjung bisa melihat event unggulan, membuka daftar event, melihat detail, lalu mendaftar lewat link eksternal (Google Form atau WhatsApp). Isi website adalah event kampus. Tampilan memakai gaya referensi "Sabrina Residences": gradien langit biru, garis grid vertikal, judul serif besar, navbar pill, dan animasi muncul kata demi kata.

## 2. Tujuan dan Ukuran Keberhasilan

- Mahasiswa menemukan event yang relevan dalam kurang dari 30 detik.
- Semua halaman tampil rapi dari lebar 360 px sampai desktop 1440 px ke atas, tanpa scroll horizontal.
- Teks selalu terbaca jelas di atas background (kontras cukup).
- Menambah event baru cukup menyalin satu blok kartu HTML.
- Memenuhi penilaian dosen: desain dan code, pemahaman fitur, presentasi 15 menit.
- Kode di-push ke GitHub untuk nilai plus (+10).

## 3. Batasan Teknis

- Hanya HTML dan CSS. Fitur yang biasanya butuh JavaScript diganti trik CSS (lihat bagian 5).
- Tanpa backend dan database. Pendaftaran memakai tautan eksternal.
- Font dari Google Fonts: Playfair Display (400, 500), Archivo (400, 500), Manrope (400, 500).
- Ikon memakai SVG inline (logo, rumah, panah, hamburger). Tidak memakai library.
- Hosting gratis: GitHub Pages.

**Perlu dikonfirmasi ke dosen:** dokumen tugas menulis format web "HTML + CSS + JS". Keputusan kelompok adalah HTML dan CSS saja. Pastikan ini diperbolehkan agar tidak mengurangi nilai.

## 4. Target Pengguna

| Pengguna | Kebutuhan utama |
| --- | --- |
| Mahasiswa | Lihat event, cek tanggal dan lokasi, daftar cepat |
| Panitia / UKM | Menambah event dengan menyalin blok HTML |
| Dosen / tamu | Lihat info event, lokasi, kontak |
| Dosen penguji | Menilai desain, kode, dan fitur |

## 5. Fitur

### 5.1 Fitur wajib (MVP)

| No | Fitur | Cara membuatnya dengan HTML + CSS |
| --- | --- | --- |
| 1 | Hero beranda | Judul, tagline, tombol "Lihat Event", gambar hero, grid line animasi |
| 2 | Navbar pill | Flexbox/grid, hover CSS, ID LinkedIn tampil di navbar atau footer |
| 3 | Menu hamburger (layar 860 px ke bawah) | Checkbox tersembunyi plus label, dropdown tampil dengan selector `:checked` |
| 4 | Event unggulan dan terbaru | Tiga kartu poster, hover zoom, scroll horizontal snap di layar sempit |
| 5 | Daftar event | Grid kartu: poster, judul, tanggal, lokasi, kategori, status |
| 6 | Filter kategori | Radio button tersembunyi plus `:has()` untuk menyembunyikan kartu lain |
| 7 | Detail event | Satu file HTML per event: deskripsi, rundown, lokasi, biaya, kontak |
| 8 | Tombol daftar | Tautan eksternal ke Google Form, `rel="noopener"` |
| 9 | Kalender event | Tabel HTML bulanan, tanggal event diberi warna |
| 10 | Tambah ke kalender | Tautan unduh file `.ics` statis dan tautan Google Calendar |
| 11 | Bagikan | Tautan `wa.me` dengan teks siap kirim |
| 12 | Tombol bahasa BA/EN | Dua radio button, teks bahasa lain disembunyikan dengan CSS |
| 13 | Tentang dan Kontak | Profil penyelenggara, media sosial, peta lokasi (iframe), ID LinkedIn |
| 14 | Animasi muncul | `@keyframes` (kata demi kata, fade down navbar, kartu naik), diatur dengan `animation-delay` |

### 5.2 Fitur yang disesuaikan karena tanpa JavaScript

| Fitur referensi | Penyesuaian |
| --- | --- |
| Video tidak boleh berhenti (cek tiap 1 detik) | Pakai atribut `autoplay muted loop playsinline`. Pemulihan otomatis tidak bisa tanpa JS. |
| Bar progres video yang bisa diklik | Bar dianimasikan CSS mengikuti durasi video. Klik untuk lompat bagian video tidak dibuat. |
| Animasi saat scroll (IntersectionObserver) | Pakai `animation-timeline: view()`. Jika browser belum mendukung, animasi jalan saat halaman dimuat. |
| Pencarian ketik langsung | Tidak dibuat. Diganti filter kategori dan status. |
| Dark mode manual | Otomatis mengikuti perangkat lewat `prefers-color-scheme`. |

### 5.3 Di luar cakupan

Login, pembayaran online, tiket digital, dashboard admin, notifikasi, pencarian ketik, dan semua yang butuh JavaScript atau backend.

## 6. Arah Desain

Isi website: event kampus. Gaya visual: mengikuti referensi.

**Warna**

- Background halaman: gradien vertikal 180 derajat `#1150ef` 0%, `#135af3` 30%, `#3c7af6` 52%, `#76a2fa` 64%, `#86acfb` 70%, `#b9cffd` 84%, `#ffffff` 100%.
- Efek awan: tiga `radial-gradient` putih kebiruan transparan di atas gradien.
- Empat garis grid vertikal 1 px, `rgba(255,255,255,.28)`, di posisi kiri 4.8%, 35.45%, 64.7%, 95.2%. Tumbuh dari atas dengan `scaleY` 0 ke 1 selama 1.6 detik.
- Teks utama putih di area biru atas. Teks `#0d0d0d` di area putih bawah.

**Aturan kontras (perbaikan dari masalah sebelumnya)**

- Teks putih hanya di atas area biru (bagian atas gradien).
- Setelah gradien memudar ke putih, semua teks wajib gelap `#0d0d0d`.
- Kartu dan bagian yang berada di area terang memakai background solid, bukan transparan.
- Cek kontras minimal 4.5 : 1 untuk teks isi.

**Tipografi**

- Judul besar: Playfair Display 400, huruf kapital, line-height 0.87.
- Teks umum: Archivo. Keterangan kecil: Manrope.
- Ukuran memakai `clamp()` agar halus dari 375 px sampai 1440 px.

**Komponen inti**

Navbar pill (HOME putih, lainnya transparan blur), tombol bahasa BA/EN, tombol Masuk berbingkai, kartu event dengan rasio 0.79, lencana kategori, lencana status, chip filter, tombol "Lihat Event" dengan ikon panah.

**Animasi**

Navbar turun bertahap (0.1 sampai 0.65 detik). Judul muncul kata demi kata (blur 10 px ke tajam). Gambar hero naik dari bawah dalam 4.2 detik. Kartu naik bertahap 0.2 / 0.35 / 0.5 detik.

**Responsif**

Layar di atas 860 px: navbar pill penuh. Layar 860 px ke bawah: navbar disembunyikan, tombol hamburger 44 x 44 muncul, dropdown dengan tautan 48 px. Tagline pindah di bawah judul. Galeri kartu menjadi baris geser dengan snap. Tidak boleh ada scroll horizontal.

## 7. Struktur Halaman

| File | Isi |
| --- | --- |
| `index.html` | Beranda: hero, event terbaru, ajakan |
| `events.html` | Daftar event dan filter kategori |
| `event-seminar-ai.html` (dan sejenisnya) | Detail satu event, satu file per event |
| `calendar.html` | Kalender bulanan |
| `about.html` | Tentang, kontak, ID LinkedIn, peta |

Navbar: HOME, EVENT, KALENDER, TENTANG. Footer: kontak, media sosial, ID LinkedIn.

## 8. Struktur Folder

```
/
├── index.html
├── events.html
├── calendar.html
├── about.html
├── event-seminar-ai.html
├── css/
│   ├── base.css        (reset, font, warna dasar)
│   ├── layout.css      (navbar, hero, grid, footer)
│   ├── components.css  (kartu, tombol, lencana, filter)
│   └── animation.css   (semua @keyframes)
├── assets/
│   ├── img/
│   ├── video/
│   └── ics/
└── README.md
```

Aturan kode: komentar singkat berbahasa Indonesia, nama class jelas, warna dan ukuran lewat CSS variables di `:root`.

## 9. Alur Pengguna Utama

1. Buka beranda, lihat hero dan event terbaru.
2. Masuk ke Daftar Event, pilih kategori.
3. Klik kartu, buka detail event.
4. Tekan Daftar atau Tambah ke Kalender.
5. Bagikan ke teman lewat WhatsApp.

## 10. Kebutuhan Non-Fungsional

- **Performa:** gambar dikompres, `loading="lazy"`, video hero singkat dan ringan.
- **Aksesibilitas:** HTML semantik (`header`, `nav`, `main`, `section`, `footer`), `alt` pada gambar, fokus keyboard terlihat, `aria-label` pada tombol ikon.
- **Kompatibilitas:** dua versi terakhir Chrome, Edge, Firefox, Safari, dan browser ponsel.
- **SEO dasar:** `title` dan meta description tiap halaman, tag Open Graph.
- **Ketahanan:** gambar diberi `alt` dan warna latar cadangan agar halaman tidak terlihat rusak jika gambar gagal dimuat.

## 11. Rencana Pengembangan dan Laporan Mingguan

Setiap perkembangan dilaporkan tiap minggu. Jadwal berikut disesuaikan dengan tanggal dari dosen.

| Minggu | Isi | Bukti laporan |
| --- | --- | --- |
| 1 | PRD, pembagian tema, wireframe, setup repo GitHub | Dokumen PRD, link repo |
| 2 | Kerangka HTML semua halaman, `base.css`, font dan warna | Screenshot kerangka |
| 3 | Navbar, hamburger, hero, animasi muat | Screenshot desktop dan ponsel |
| 4 | Kartu event, daftar event, filter kategori | Screenshot halaman Event |
| 5 | Detail event, kalender, tombol daftar, `.ics`, WhatsApp | Screenshot alur utama |
| 6 | Responsif, kontras, tombol bahasa, uji browser | Daftar hasil uji |
| 7 | Perapian, README, laporan akhir, latihan presentasi | Laporan lengkap |

## 12. Pembagian Tugas

| Anggota | Tanggung jawab (usulan, bisa diubah) |
| --- | --- |
| AgapheAbel\_672024084 | Struktur HTML, navbar dan hamburger, repo GitHub |
| RezaDwiSaputra\_672026080 | Hero, animasi, video |
| ErnestLimbong\_672026071 | Daftar event, filter, detail event |
| WellprinaGrace\_672026085 | Kalender, about dan kontak, laporan |

Semua anggota wajib memahami seluruh fitur karena penilaian dilakukan secara kelompok dan individu.

## 13. Pemetaan Penilaian

| Kriteria dosen | Yang disiapkan |
| --- | --- |
| Desain dan code | Desain sesuai referensi, kode rapi, CSS variables, komentar Indonesia |
| Pemahaman fitur | Tiap anggota bisa menjelaskan cara kerja trik CSS (checkbox hamburger, filter `:has()`, `@keyframes`) |
| Presentasi 15 menit | Naskah dan demo dilatih, durasi dicek. Kelebihan waktu dikurangi 5 poin per menit. |
| Nilai plus GitHub (+10) | Repo publik, commit dari semua anggota, link di halaman terakhir laporan |
| ID LinkedIn | Tampil di website (footer dan halaman Tentang) |

## 14. Kriteria Penerimaan

- Semua halaman terbuka tanpa error dan tanpa JavaScript.
- Teks terbaca jelas di semua area background, tidak ada teks yang menyatu dengan latar.
- Navbar dan hamburger berfungsi di desktop, tablet, dan ponsel.
- Filter kategori bekerja dan menampilkan semua kartu saat filter "Semua" dipilih.
- File `.ics` terbuka benar di Google Calendar.
- Tidak ada scroll horizontal dari lebar 360 px sampai 1440 px.
- ID LinkedIn tampil di website.
- Laporan: cover di halaman 1, isi di halaman berikutnya, link GitHub di halaman terakhir.

## 15. Risiko dan Mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Dosen mewajibkan JavaScript | Konfirmasi di awal. Jika wajib, tambah JS tipis untuk video, bar progres, dan scroll reveal. |
| `:has()` atau `animation-timeline` belum didukung browser lama | Sediakan tampilan cadangan: semua kartu tampil, animasi jalan saat muat |
| Video hero berat dan lambat | Kompres video, pakai gambar `poster`, durasi singkat |
| Teks tidak terbaca di area transisi gradien | Aturan kontras bagian 6, uji manual di tiap section |
| Kelebihan waktu presentasi | Latihan dengan timer, maksimal 15 menit |
| Banyak event membuat file detail menumpuk | Template HTML siap salin dan penamaan file yang konsisten |

## 16. Pertanyaan Terbuka

1. Tema apa yang dibagikan dosen untuk kelompok ini? Jika berbeda dari referensi, desain disesuaikan.
2. Apakah HTML dan CSS saja diizinkan, atau JavaScript tetap wajib?
3. Event milik satu kampus atau portal banyak UKM?
4. Tanggal pengumpulan laporan mingguan dan tanggal presentasi?
5. Link LinkedIn siapa yang dipasang: satu ketua atau semua anggota?
6. Logo dan warna kampus sudah ada, atau memakai warna biru dari referensi?

## Halaman Terakhir: Repository GitHub

Link repo: *(isi setelah repo dibuat)* https://github.com/****/****
