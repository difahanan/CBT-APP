# Analisis Kebutuhan Aplikasi CBT

## 1. Deskripsi Sistem

Aplikasi CBT adalah aplikasi ujian online yang digunakan untuk mengelola user, soal, ujian, jawaban, dan nilai.

Dalam aplikasi ini, admin mengelola data pengguna, guru/dosen membuat ujian dan soal, siswa/mahasiswa mengerjakan ujian, lalu sistem menyimpan jawaban dan menghitung nilai otomatis.

## 2. Aktor

- Admin
- Guru/Dosen
- Siswa/Mahasiswa
- Sistem

## 3. Kebutuhan Fungsional

- User dapat login.
- Admin dapat mengelola user.
- Guru dapat membuat ujian.
- Guru dapat membuat soal.
- Siswa dapat mengikuti ujian.
- Sistem dapat menyimpan jawaban.
- Sistem dapat menghitung nilai otomatis.
- Admin/guru dapat melihat hasil ujian.
- Siswa dapat melihat nilai setelah ujian selesai.

## 4. Kebutuhan Nonfungsional

- Sistem mudah digunakan.
- Sistem aman.
- Password harus terenkripsi.
- Sistem menggunakan file `.env`.
- Sistem dapat berjalan di komputer lokal.
- Sistem dapat dibuka melalui browser.
- Tampilan responsif untuk laptop dan perangkat mobile.

## 5. Aturan Bisnis

- Siswa hanya dapat mengikuti ujian yang aktif.
- Ujian memiliki batas waktu.
- Siswa hanya boleh mengerjakan satu kali untuk setiap ujian.
- Jawaban siswa disimpan ke database.
- Nilai dihitung otomatis berdasarkan pilihan jawaban yang benar.
- Guru dan admin dapat melihat hasil pengerjaan siswa.
