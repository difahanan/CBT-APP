const bcrypt = require('bcryptjs');
const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const nodemailer = require('nodemailer'); // TAMBAHAN 1: Import nodemailer

const router = express.Router();

// TAMBAHAN 2: Setup Konfigurasi Transporter Email Mailtrap
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD
  }
});

// GET: Ringkasan data untuk dashboard admin/guru
router.get('/summary', authenticate, authorize('admin', 'teacher'), async (req, res, next) => {
  try {
    const [[userCount]] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
    const [[examCount]] = await pool.query('SELECT COUNT(*) AS total_exams FROM exams');
    const [[attemptCount]] = await pool.query('SELECT COUNT(*) AS total_attempts FROM exam_attempts');

    res.json({
      total_users: userCount.total_users,
      total_exams: examCount.total_exams,
      total_attempts: attemptCount.total_attempts
    });
  } catch (error) {
    next(error);
  }
});

// GET: Daftar seluruh user beserta status verifikasi & kode demo untuk tabel admin
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT users.id, users.name, users.email, users.class_name, users.is_active, users.verification_code, roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       ORDER BY users.id ASC`
    );

    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
});

// GET: Daftar seluruh ujian
router.get('/exams', authenticate, authorize('admin', 'teacher'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT exams.id, exams.title, exams.description, exams.duration_minutes, exams.is_active,
              exams.start_time, exams.end_time, exams.subject_id,
              subjects.name AS subject_name, users.name AS teacher_name
       FROM exams
       JOIN subjects ON subjects.id = exams.subject_id
       JOIN users ON users.id = exams.teacher_id
       ORDER BY exams.id DESC`
    );

    res.json({ exams: rows });
  } catch (error) {
    next(error);
  }
});

// POST: Admin membuat akun baru (Otomatis generate kode OTP & kirim email Mailtrap)
router.post('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, email, password, role = 'student', class_name = '' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Data wajib diisi' });
    }

    // Ambil ID + flag verifikasi berdasarkan nama role yang dikirim (data-driven,
    // bukan hardcoded if role === 'admin' -> menjawab keputusan "admin skip verifikasi")
    const [[r]] = await pool.query(
      'SELECT id, requires_email_verification FROM roles WHERE name=?',
      [role]
    );
    if (!r) return res.status(400).json({ message: 'Role tidak valid' });

    const needsVerification = Boolean(r.requires_email_verification);

    // Hash password demi keamanan
    const hash = await bcrypt.hash(password, 10);

    // Kode OTP hanya relevan kalau role ini butuh verifikasi
    const kodeDemo = needsVerification
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : null;

    // is_active langsung 1 kalau role tidak butuh verifikasi (mis. admin),
    // is_active 0 kalau masih menunggu OTP (guru/siswa)
    await pool.query(
      'INSERT INTO users(name, email, password, role_id, class_name, is_active, verification_code) VALUES(?,?,?,?,?,?,?)',
      [name, email, hash, r.id, class_name, needsVerification ? 0 : 1, kodeDemo]
    );

    // Role yang tidak butuh verifikasi tidak perlu dikirimi email OTP sama sekali
    if (!needsVerification) {
      return res.json({
        message: `User (${role}) berhasil ditambahkan dan langsung aktif tanpa verifikasi email.`
      });
    }

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
      to: email,
      subject: 'Verifikasi Email (Demo Latihan) - CBT App',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #1a73e8;">Verifikasi Email (Demo Latihan)</h2>
          <p>Halo ${name}, admin telah mendaftarkan akun Anda.</p>
          <p>Masukkan email dan kode 6 digit berikut pada aplikasi untuk memverifikasi akun Anda:</p>
          <div style="background-color: #f1f3f4; padding: 15px; display: inline-block; border-radius: 5px;">
            <h1 style="margin: 0; color: #333; letter-spacing: 4px;">${kodeDemo}</h1>
          </div>
          <p>Kembali ke halaman login CBT jika sudah selesai.</p>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[Mailtrap] Email verifikasi sukses dikirim ke ${email}. Kode: ${kodeDemo}`);
    } catch (mailError) {
      console.error("[Mailtrap Error] Gagal mengirim email:", mailError.message);
    }

    res.json({ message: 'User berhasil ditambahkan dan kode verifikasi telah dibuat' });
  } catch (error) {
    next(error);
  }
});

// PUT: Edit data user, termasuk ubah role ("Edit User" + "Atur Role" di diagram)
router.put('/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, class_name = '' } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ message: 'Nama, email, dan role wajib diisi.' });
    }

    const [[existingUser]] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    if (!existingUser) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    const [[r]] = await pool.query('SELECT id FROM roles WHERE name = ?', [role]);
    if (!r) return res.status(400).json({ message: 'Role tidak valid.' });

    // Safety: admin tidak boleh menurunkan role akun miliknya sendiri -> mencegah lockout
    if (Number(id) === req.user.id && role !== 'admin') {
      return res.status(400).json({
        message: 'Anda tidak bisa mengubah role akun Anda sendiri dari admin ke role lain.'
      });
    }

    await pool.query(
      'UPDATE users SET name = ?, email = ?, role_id = ?, class_name = ? WHERE id = ?',
      [name, email, r.id, class_name, id]
    );

    res.json({ message: 'User berhasil diperbarui.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email sudah dipakai user lain.' });
    }
    next(error);
  }
});

// DELETE: Hapus user, dengan safety check agar tidak lockout sistem
router.delete('/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Safety 1: tidak boleh hapus akun sendiri
    if (Number(id) === req.user.id) {
      return res.status(400).json({ message: 'Anda tidak bisa menghapus akun Anda sendiri.' });
    }

    const [[target]] = await pool.query(
      `SELECT users.id, roles.name AS role
       FROM users JOIN roles ON roles.id = users.role_id
       WHERE users.id = ?`,
      [id]
    );
    if (!target) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    // Safety 2: tidak boleh hapus admin terakhir
    if (target.role === 'admin') {
      const [[adminCount]] = await pool.query(
        `SELECT COUNT(*) AS total FROM users
         JOIN roles ON roles.id = users.role_id
         WHERE roles.name = 'admin'`
      );
      if (adminCount.total <= 1) {
        return res.status(400).json({ message: 'Tidak bisa menghapus admin terakhir yang tersisa.' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User berhasil dihapus.' });
  } catch (error) {
    // Guru yang sudah punya exams (FK ON DELETE RESTRICT) akan gagal dihapus -> beri pesan jelas
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({
        message: 'User ini tidak bisa dihapus karena masih memiliki data terkait (mis. ujian yang dibuat). Hapus/pindahkan data itu dulu.'
      });
    }
    next(error);
  }
});

// ==========================================================
// MATA PELAJARAN (Subjects) — dibutuhkan agar Guru bisa buat
// ujian untuk mata pelajaran selain yang sudah ada di seed
// ==========================================================

router.get('/subjects', authenticate, authorize('admin', 'teacher'), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, description FROM subjects ORDER BY name ASC');
    res.json({ subjects: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/subjects', authenticate, authorize('admin', 'teacher'), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Nama mata pelajaran wajib diisi.' });
    }

    // Cegah duplikat nama mata pelajaran (case-insensitive), pakai yang lama kalau sudah ada
    const [[existing]] = await pool.query(
      'SELECT id FROM subjects WHERE LOWER(name) = LOWER(?)',
      [name.trim()]
    );
    if (existing) {
      return res.status(200).json({ message: 'Mata pelajaran sudah ada, memakai data yang lama.', id: existing.id });
    }

    const [result] = await pool.query(
      'INSERT INTO subjects (name, description, teacher_id) VALUES (?, ?, ?)',
      [name.trim(), description || null, req.user.role === 'teacher' ? req.user.id : null]
    );

    res.status(201).json({ message: 'Mata pelajaran berhasil dibuat.', id: result.insertId });
  } catch (error) {
    next(error);
  }
});

// ==========================================================
// LAPORAN — ringkasan statistik SEMUA ujian dalam 1 tabel
// (beda dari "Rekap Hasil" yang cuma untuk 1 ujian tertentu)
// ==========================================================
router.get('/report', authenticate, authorize('admin', 'teacher'), async (req, res, next) => {
  try {
    let query = `
      SELECT exams.id, exams.title, subjects.name AS subject_name, users.name AS teacher_name,
             COUNT(DISTINCT attempts.user_id) AS total_participants,
             COUNT(attempts.id) AS total_attempts,
             SUM(CASE WHEN attempts.status = 'submitted' THEN 1 ELSE 0 END) AS submitted_count,
             ROUND(AVG(CASE WHEN attempts.status = 'submitted' THEN attempts.score END), 2) AS average_score,
             MAX(CASE WHEN attempts.status = 'submitted' THEN attempts.score END) AS highest_score,
             MIN(CASE WHEN attempts.status = 'submitted' THEN attempts.score END) AS lowest_score
      FROM exams
      JOIN subjects ON subjects.id = exams.subject_id
      JOIN users ON users.id = exams.teacher_id
      LEFT JOIN exam_attempts attempts ON attempts.exam_id = exams.id
    `;
    const params = [];

    // Guru cuma lihat laporan ujian miliknya sendiri, admin lihat semua
    if (req.user.role === 'teacher') {
      query += ' WHERE exams.teacher_id = ?';
      params.push(req.user.id);
    }
    query += ' GROUP BY exams.id ORDER BY exams.id DESC';

    const [rows] = await pool.query(query, params);
    res.json({ report: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;