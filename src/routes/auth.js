const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email dan password wajib diisi.' });
    }

    const [rows] = await pool.execute(
      `SELECT users.id, users.name, users.email, users.password, users.class_name, users.is_active, roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE users.email = ?
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    const user = rows[0];

    // 1. Cek dulu apakah password yang dimasukkan benar
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    // 2. Jika password benar tapi akun belum aktif (is_active = 0)
    if (!user.is_active || user.is_active === 0) {
      return res.status(403).json({ message: 'Akun anda masih menunggu verifikasi dari admin.' });
    }

    // 3. Jika lolos semua pengecekan, buat token dan izinkan login
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET || 'local_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.json({
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        class_name: user.class_name
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// JALUR BARU: Memproses Kode 6-Digit dari User
router.post('/verify', async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Email dan kode verifikasi wajib diisi.' });
    }

    // Cari user berdasarkan email
    const [rows] = await pool.execute('SELECT id, verification_code FROM users WHERE email = ? LIMIT 1', [email]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Email tidak terdaftar.' });
    }

    const user = rows[0];

    // Cocokkan kode yang diinput user dengan kode di database
    if (user.verification_code !== code) {
      return res.status(400).json({ message: 'Kode verifikasi yang anda masukkan salah.' });
    }

    // PERBAIKAN DI SINI: Ubah status jadi 1, TAPI KODE TIDAK DIHAPUS (Tidak diset NULL)
    await pool.execute('UPDATE users SET is_active = 1 WHERE id = ?', [user.id]);

    res.json({ message: 'Akun berhasil diverifikasi! Sekarang Anda sudah bisa login.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;