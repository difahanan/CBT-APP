# Panduan Praktikum Mahasiswa Menggunakan Visual Studio Code

## Tujuan Praktikum

Mahasiswa mampu membuat fondasi aplikasi CBT yang memiliki:

1. analisis kebutuhan sistem,
2. rancangan database,
3. konfigurasi `.env`,
4. server Node.js dan Express,
5. koneksi MySQL,
6. fitur login,
7. fitur pengerjaan ujian,
8. fitur penilaian otomatis.

## Langkah Praktikum

### Langkah 1 — Buka Project

1. Ekstrak file ZIP.
2. Buka Visual Studio Code.
3. Klik `File > Open Folder`.
4. Pilih folder `cbt-project-vscode`.

### Langkah 2 — Install Dependency

Buka terminal di VS Code:

```bash
npm install
```

### Langkah 3 — Siapkan File Environment

Salin file `.env.example` menjadi `.env`.

```bash
cp .env.example .env
```

Untuk Windows PowerShell:

```powershell
copy .env.example .env
```

### Langkah 4 — Jalankan MySQL

Gunakan XAMPP, Laragon, MAMP, atau MySQL Server. Pastikan konfigurasi di `.env` sesuai dengan username dan password MySQL.

### Langkah 5 — Setup Database

```bash
npm run setup
```

Perintah ini menjalankan:

- `scripts/setup-db.js` untuk membuat database dan tabel,
- `scripts/seed.js` untuk mengisi data contoh.

### Langkah 6 — Jalankan Server

```bash
npm run dev
```

Lalu buka:

```text
http://localhost:3000
```

## Tugas Mahasiswa

1. Jalankan aplikasi sampai berhasil login.
2. Login sebagai siswa, lalu kerjakan ujian.
3. Login sebagai guru, lalu lihat hasil ujian siswa.
4. Buka file `database/schema.sql`, lalu jelaskan fungsi setiap tabel.
5. Buka file `.env`, lalu jelaskan mengapa password dan secret key tidak ditulis langsung di kode.
6. Tambahkan satu soal baru melalui `scripts/seed.js` atau langsung dari database, lalu uji ulang aplikasi.

## Pertanyaan Refleksi

1. Mengapa CBT membutuhkan tabel `exam_attempts`?
2. Mengapa jawaban siswa dipisahkan dari tabel soal?
3. Mengapa password user harus di-hash?
4. Apa risiko jika file `.env` diunggah ke GitHub?
5. Apa perbedaan kebutuhan fungsional dan nonfungsional dalam aplikasi CBT?
