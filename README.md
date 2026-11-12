# CBT Project - Project Planning & App Config

Project ini adalah fondasi aplikasi **Computer Based Test (CBT)** berbasis web. Struktur dan isinya disusun dari modul **Part 1 Project Planning & App Config**: analisis kebutuhan CBT, perancangan database, SQL schema, dan konfigurasi aplikasi melalui file `.env`.

## Fitur yang Sudah Berfungsi

- Login menggunakan email dan password.
- Role user: `admin`, `teacher/guru`, dan `student/siswa`.
- Siswa dapat melihat ujian aktif.
- Siswa dapat memulai ujian.
- Sistem menampilkan soal dan pilihan jawaban.
- Siswa dapat mengirim jawaban.
- Sistem menghitung nilai otomatis.
- Siswa dapat melihat riwayat nilai.
- Admin/guru dapat melihat hasil pengerjaan siswa.
- Konfigurasi aplikasi menggunakan file `.env`.
- Database menggunakan MySQL.

## Struktur Folder

```text
cbt-project-vscode/
├── database/
│   ├── schema.sql
│   └── sample-data.md
├── docs/
│   ├── analisis-kebutuhan.md
│   └── database-design.md
├── public/
│   ├── assets/
│   │   └── app.css
│   ├── dashboard.html
│   ├── exam.html
│   ├── index.html
│   └── login.html
├── scripts/
│   ├── seed.js
│   └── setup-db.js
├── src/
│   ├── config/
│   │   └── db.js
│   ├── middleware/
│   │   └── auth.js
│   └── routes/
│       ├── auth.js
│       ├── exams.js
│       └── admin.js
├── .env.example
├── .gitignore
├── package.json
└── server.js
```

## Kebutuhan Software

Pastikan komputer sudah memiliki:

1. Visual Studio Code.
2. Node.js versi 18 atau lebih baru.
3. MySQL Server. Bisa memakai XAMPP, Laragon, MAMP, atau MySQL standalone.
4. Browser.

## Cara Menjalankan di Visual Studio Code

###. Install Dependency

Buka terminal VS Code, lalu jalankan:

```bash
npm install
```

###. Buat File `.env`

Salin file `.env.example` menjadi `.env`.

Di Windows PowerShell:

```powershell
copy .env.example .env
```

Di macOS/Linux:

```bash
cp .env.example .env
```

Pastikan konfigurasi database sesuai dengan MySQL lokal. Contoh default:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=cbt_database
DB_USERNAME=root
DB_PASSWORD=
```

Jika MySQL memiliki password, isi bagian `DB_PASSWORD`.

Aktifkan Database

###Buat Database dan Data Contoh

Jalankan perintah:

```bash
npm run setup
```

Perintah ini akan:

- membuat database `cbt_db`,
- membuat semua tabel,
- mengisi role,
- mengisi user demo,
- mengisi mata pelajaran, ujian, soal, dan pilihan jawaban contoh.


```bash
npm run dev
```
## Akun Demo

| Role | Email | Password |
|---|---|---|
| Admin | admin@cbt.test | password123 |
| Guru | guru@cbt.test | password123 |
| Siswa | siswa@cbt.test | password123 |

## Alur Uji Coba Mahasiswa

1. Login sebagai siswa: `siswa@cbt.test`.
2. Buka dashboard.
3. Klik tombol **Kerjakan Ujian**.
4. Pilih jawaban untuk setiap soal.
5. Klik **Kirim Jawaban**.
6. Sistem menampilkan nilai otomatis.
7. Login sebagai guru atau admin untuk melihat hasil pengerjaan siswa.

## Perintah NPM

```bash
npm run setup     # membuat database dan mengisi data contoh
npm run dev       # menjalankan server dengan nodemon
npm start         # menjalankan server biasa
```

## Catatan Penting

- Password user disimpan dalam bentuk hash menggunakan `bcryptjs`.
- Token login dibuat menggunakan `jsonwebtoken`.
- Database dirancang berdasarkan kebutuhan CBT: user, role, mata pelajaran, ujian, soal, pilihan jawaban, sesi pengerjaan, jawaban siswa, dan nilai.

## Otp menggunakan mailtrap.io. nnti coba pake gmail
