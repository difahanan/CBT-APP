# Data Contoh

Data contoh tidak ditulis langsung dalam file SQL karena password harus dibuat dalam bentuk hash.

Jalankan:

```bash
npm run setup
```

Script `scripts/seed.js` akan membuat:

- role: admin, teacher, student,
- akun demo admin,
- akun demo guru,
- akun demo siswa,
- mata pelajaran contoh,
- satu ujian aktif,
- lima soal pilihan ganda,
- pilihan jawaban dan kunci jawaban.

Akun demo:

| Role | Email | Password |
|---|---|---|
| Admin | admin@cbt.test | password123 |
| Guru | guru@cbt.test | password123 |
| Siswa | siswa@cbt.test | password123 |
