# Panduan Pengembang Junior (Junior Developer Guide)

Dokumen ini menjelaskan cara kerja kode JavaScript di **Portal Event Kampus** dan bagian mana saja yang perlu Anda ubah saat menambah fitur, mengubah kategori, atau menghubungkan Google Calendar asli.

---

## 1. Alur Data & Arsitektur Kode

Seluruh JavaScript memakai **Vanilla JS klasik** (`<script defer>`) di bawah namespace global `window.PortalKampus` tanpa bundler (Vite/Webpack) dan tanpa backend. Dengan pola ini, halaman HTML tetap bisa dibuka langsung dari file (`file://`) maupun lewat Live Server dan GitHub Pages.

Alur datanya:

1. **Google Calendar (Sumber Utama)** -> Admin membuat atau mengedit event di Google Calendar (bisa dibantu lewat `admin.html`).
2. **`js/calendar-service.js`** -> Mengambil jadwal dari Google Calendar API v3 (`fetch()`). Jika `calendarId` atau `apiKey` belum diisi, atau internet mati, sistem otomatis menampilkan data cadangan di `js/fallback-events.js`.
3. **Parsing Tag Deskripsi** -> Teks tambahan seperti `Kategori:`, `Poster:`, `Daftar:`, `Biaya:`, `Kontak:`, dan `Rundown:` di kolom deskripsi Google Calendar dipisahkan secara otomatis menjadi data terstruktur.
4. **Skrip Per Halaman (`js/page-*.js`)** -> Merender kartu event, kalender bulanan, detail event dinamis (`event-detail.html`), dan generator form di `admin.html`.

---

## 2. Peta File JavaScript (`js/`)

| File | Tugas Utama | Kapan Perlu Diedit |
| --- | --- | --- |
| `js/config.js` | Pengaturan terpusat (`calendarId`, `apiKey`, `oauthClientId`, rentang jam `timeline`, kategori, kamus bahasa) | Paling sering (setup API/OAuth, ubah jam timeline, tambah kategori) |
| `js/fallback-events.js` | Data 6 event contoh lokal saat API belum terhubung atau offline | Saat ingin memperbarui data cadangan offline |
| `js/ics-helper.js` | Membuat tautan Google Calendar (`TEMPLATE`), unduhan `.ics`, dan link WhatsApp | Jarang diubah, kecuali format isi `.ics` berubah |
| `js/calendar-service.js` | Fetch Google Calendar API v3, login Google OAuth 2.0, Create/Edit/Delete event, deteksi Overlap, parsing tag deskripsi | Saat menambah tag metadata baru atau mengubah logika tulis ke Google Calendar |
| `js/ui-common.js` | Menyimpan pilihan bahasa `ID/EN` (`localStorage`), tutup menu `Escape`, template kartu event, state Loading/Empty/Error | Saat ingin mengubah HTML tampilan kartu event secara serentak |
| `js/timeline-view.js` | Komponen kalender Minggu/Hari ala Google Calendar (mini kalender, legend kategori, drag-to-create, drag-to-move, drag-to-resize, deteksi Overlap) | Saat mengubah rentang jam, kelipatan snap drag (`CONFIG.timeline`), atau tata letak blok jadwal |
| `js/page-home.js` | Mengisi 3 kartu Event Unggulan di `index.html` | Saat mengubah jumlah event unggulan di Beranda |
| `js/page-events.js` | Pencarian teks, filter kategori, dan filter status di `events.html` | Saat menambah jenis filter baru (misal filter lokasi) |
| `js/page-calendar.js` | Kalender bulanan, Timeline Minggu/Hari, Daftar Agenda, dan panel tanggal di `calendar.html` | Saat mengubah mode tampilan halaman Kalender |
| `js/page-detail.js` | Halaman detail dinamis `event-detail.html?id=...` beserta form/link daftar | Saat menambah bagian informasi baru di halaman detail |
| `js/page-admin.js` | Kalender interaktif admin (Quick Modal, Draft Lokal, Undo, OAuth CRUD Google Calendar), form lengkap, peringatan Overlap, & pratinjau kartu | Saat menambah kolom isian baru untuk admin |

---

## 3. Cara Mengubah Bagian Kode yang Paling Sering Dibutuhkan

### A. Menghubungkan Google Calendar API & OAuth 2.0 Admin

File `js/config.js` masuk `.gitignore` agar kredensial tidak bocor ke GitHub. Untuk menjalankan secara lokal, salin `js/config.example.js` menjadi `js/config.js`, lalu ubah bagian `googleCalendar`:

```js
googleCalendar: {
  calendarId: 'contoh123@group.calendar.google.com',
  apiKey: 'AIzaSy...API_KEY_ANDA',
  oauthClientId: '123456-abc.apps.googleusercontent.com',
  timeZone: 'Asia/Jakarta',
  maxResults: 100,
  cacheMinutes: 5
}
```

Untuk hosting **Vercel**, jangan commit `js/config.js`. Cukup isi 4 variabel pada *Project Settings -> Environment Variables* (`GCAL_CALENDAR_ID`, `GCAL_API_KEY`, `GCAL_OAUTH_CLIENT_ID`, `ADMIN_EMAILS`), dan `scripts/build-vercel.mjs` akan menghasilkan `dist/js/config.js` otomatis saat build.

Pastikan pada Google Calendar & Google Cloud Console:
1. Kalender berstatus **Make available to public** (*See all event details*) di menu *Settings & sharing* agar pengunjung publik bisa membaca jadwal via `apiKey`.
2. API Key di Google Cloud Console mengaktifkan **Google Calendar API** dan dibatasi ke domain website Anda.
3. Untuk mengaktifkan tombol **Masuk dengan Google (Admin)** (Create/Edit/Delete langsung dari `admin.html`), buat **OAuth 2.0 Web Client ID** di Google Cloud Console, tambahkan origin `http://localhost` / `http://127.0.0.1` / `https://<domain-github-pages>`, lalu masukkan email admin di *OAuth consent screen -> Test users*. Catatan: login Google OAuth tidak bekerja pada protokol `file://`.

### B. Menambah Kategori Event Baru

Cukup tambahkan satu objek baru ke array `categories` di `js/config.js`:

```js
{
  id: 'olahraga',
  labelId: 'Olahraga',
  labelEn: 'Sports',
  defaultPoster: 'assets/img/fti-campus-640.jpg',
  defaultPosterAlt: 'Turnamen olahraga mahasiswa kampus'
}
```

Tombol filter di `events.html` dan pilihan kategori di `admin.html` otomatis muncul mengikuti isi array tersebut.

### C. Menambah Tag Baru di Deskripsi Google Calendar

Saat ini `parseDescriptionTags()` di `js/calendar-service.js` membaca tag:
`Kategori:`, `Status:`, `Poster:`, `Daftar:`, `Biaya:`, `Kontak:`, dan `Rundown:`.

Untuk menambah tag baru (misalnya `Kuota:`):
1. Tambahkan properti `kuota: ''` di objek `tags` pada `parseDescriptionTags()` di `js/calendar-service.js`.
2. Tambahkan `Kuota` ke regex pencocokan di fungsi yang sama, lalu simpan ke `tags.kuota`.
3. Teruskan `kuota: tags.kuota` di `mapGoogleItemToEvent()`.
4. Tampilkan di `js/page-detail.js` (halaman detail) dan tambahkan inputnya di `admin.html` + `js/page-admin.js`.

### D. Mengubah Desain Kartu Event

Semua kartu event di Beranda (`index.html`), Daftar Event (`events.html`), dan Pratinjau (`admin.html`) memakai satu fungsi yang sama: `renderEventCard()` di `js/ui-common.js`. Mengubah struktur HTML di fungsi ini akan otomatis memperbarui seluruh halaman.

---

## 4. Aturan Penting Saat Mengedit Kode

1. **Selalu pakai `svc.escapeHtml(...)`** saat memasukkan teks dari Google Calendar atau kotak pencarian ke dalam `innerHTML` agar aman dari injeksi HTML/XSS.
2. **Selalu pakai `svc.sanitizeUrl(...)`** untuk link eksternal (`Poster:`, `Daftar:`) yang dibaca dari deskripsi.
3. **Pertahankan 3 state data** (`loading`, `empty`, `error`) lewat `ui.renderStatusState()` agar halaman tetap informatif ketika koneksi lambat atau jadwal kosong.
4. **Cek ukuran layar 390px dan mode gelap sistem** setiap kali mengubah CSS di `css/components.css`.
