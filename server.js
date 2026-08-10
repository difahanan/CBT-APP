require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer'); // TAMBAHAN 1: Import library nodemailer

const authRoutes = require('./src/routes/auth');
const examRoutes = require('./src/routes/exams');
const adminRoutes = require('./src/routes/admin');

const app = express();
// Render (dan kebanyakan hosting) kasih tahu port lewat env var "PORT" secara otomatis,
// beda dari APP_PORT yang cuma kita pakai untuk development lokal. Prioritaskan PORT
// dulu supaya tidak gagal deploy, APP_PORT/3000 tetap jadi fallback untuk lokal.
const port = Number(process.env.PORT || process.env.APP_PORT || 3000);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- TAMBAHAN 2: Setup Konfigurasi Email ---
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD
  }
});

// Cek koneksi email saat server pertama kali berjalan
transporter.verify((error, success) => {
  if (error) {
    console.log('Setup Email Belum Selesai (Cek .env):', error.message);
  } else {
    console.log('Server email siap untuk mengirim pesan.');
  }
});
// -------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    app: process.env.APP_NAME || 'CBT_APP',
    status: 'ok',
    message: 'CBT API berjalan dengan baik.'
  });
});

// --- TAMBAHAN 3: Endpoint untuk mengirim email kode 6-Digit ---
// Endpoint ini meniru proses "Tambah Akun Guru / Siswa" yang ada di gambar
app.post('/api/send-verification', async (req, res) => {
  const { email, nama } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email tidak boleh kosong.' });
  }

  // Generate 6 digit angka acak (misal: 882039)
  const kodeDemo = Math.floor(100000 + Math.random() * 900000).toString();

  const mailOptions = {
    from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
    to: email,
    subject: 'Verifikasi Email (Demo Latihan) - CBT App',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #1a73e8;">Verifikasi Email (Demo Latihan)</h2>
        <p>Halo ${nama || 'User'}, admin telah mendaftarkan akun Anda.</p>
        <p>Masukkan email dan kode 6 digit berikut untuk memverifikasi akun:</p>
        <div style="background-color: #f1f3f4; padding: 15px; display: inline-block; border-radius: 5px;">
          <h1 style="margin: 0; color: #333; letter-spacing: 4px;">${kodeDemo}</h1>
        </div>
        <p>Silakan kembali ke halaman login CBT jika sudah selesai.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    // Response JSON disesuaikan agar mirip dengan notifikasi sukses di gambar frontend kamu
    res.json({
      success: true,
      message: `User berhasil ditambahkan. Kode verifikasi demo: ${kodeDemo}`,
      kode: kodeDemo 
    });
  } catch (error) {
    console.error("Gagal mengirim email:", error);
    res.status(500).json({ success: false, message: 'Gagal mengirim email verifikasi.' });
  }
});
// -------------------------------------------------------------

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint tidak ditemukan.' });
});

app.use((err, req, res, next) => {
  console.error(err);

  // Error khusus dari multer (upload file) - kasih pesan yang jelas, bukan pesan default bahasa Inggris
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Ukuran file terlalu besar. Maksimal 15MB.' });
    }
    return res.status(400).json({ message: `Gagal upload file: ${err.message}` });
  }

  res.status(err.status || 500).json({
    message: err.message || 'Terjadi kesalahan pada server.'
  });
});

app.listen(port, () => {
  console.log(`CBT app berjalan di http://localhost:${port}`);
});

// SAFETY NET: tangkap error fatal yang lolos dari try/catch biasa (mis. koneksi
// internet putus mendadak saat upload ke Cloudinary -> ECONNRESET). Tanpa ini,
// Node.js akan mematikan SELURUH server hanya karena 1 request gagal jaringan.
//
// Catatan jujur: ini "jaring pengaman" darurat, bukan solusi permanen untuk
// masalah jaringan itu sendiri. Kalau errornya sering muncul, itu tandanya
// koneksi ke Cloudinary memang tidak stabil (biasanya membaik sendiri setelah
// di-deploy ke hosting, karena internet server hosting jauh lebih stabil
// dibanding koneksi rumah/kampus).
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION - server tetap jalan]', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION - server tetap jalan]', err.message);
});