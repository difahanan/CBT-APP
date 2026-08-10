const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { upload, getMediaType, cloudinary } = require('../middleware/upload');

const router = express.Router();

// Helper: hapus file dari Cloudinary (best-effort, tidak boleh bikin request gagal
// kalau hapusnya gagal - misal karena network Cloudinary lagi bermasalah)
async function removeCloudinaryFile(publicId, mediaType) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: mediaType === 'video' ? 'video' : 'image'
    });
  } catch (err) {
    console.error('Gagal hapus file Cloudinary:', err.message);
  }
}

function isExamCurrentlyActive(exam) {
  const now = new Date();
  const startsOk = !exam.start_time || new Date(exam.start_time) <= now;
  const endsOk = !exam.end_time || new Date(exam.end_time) >= now;
  return Boolean(exam.is_active) && startsOk && endsOk;
}

// "Rekap Hasil": olah data mentah jadi statistik ringkas, tidak perlu query DB terpisah
function buildResultsSummary(rows) {
  const submitted = rows.filter((r) => r.status === 'submitted' && r.score !== null);
  const scores = submitted.map((r) => Number(r.score));

  return {
    total_attempts: rows.length,
    total_participants: new Set(rows.map((r) => r.student_email)).size,
    submitted_count: submitted.length,
    average_score: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null,
    highest_score: scores.length ? Math.max(...scores) : null,
    lowest_score: scores.length ? Math.min(...scores) : null
  };
}

// CREATE: Guru/Admin buat ujian baru (Bagian 3 diagram: "Tambah/Edit Ujian")
router.post('/', authenticate, authorize('teacher', 'admin'), async (req, res, next) => {
  try {
    const { subject_id, title, description, duration_minutes, start_time, end_time } = req.body;

    if (!subject_id || !title || !duration_minutes) {
      return res.status(400).json({ message: 'Mata pelajaran, judul, dan durasi wajib diisi.' });
    }

    const [[subject]] = await pool.query('SELECT id FROM subjects WHERE id = ?', [subject_id]);
    if (!subject) {
      return res.status(400).json({ message: 'Mata pelajaran tidak ditemukan.' });
    }

    const teacherId = req.user.role === 'teacher' ? req.user.id : req.user.id; // pembuat ujian = user yang login

    const [result] = await pool.query(
      `INSERT INTO exams (subject_id, teacher_id, title, description, duration_minutes, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [subject_id, teacherId, title, description || null, duration_minutes, start_time || null, end_time || null]
    );

    res.status(201).json({ message: 'Ujian berhasil dibuat.', id: result.insertId });
  } catch (error) {
    next(error);
  }
});

// UPDATE: edit ujian (judul, deskripsi, durasi, JADWAL, status aktif) — "Tambah/Edit Ujian" di diagram
router.put('/:id', authenticate, authorize('teacher', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, duration_minutes, start_time, end_time, is_active } = req.body;

    const [[exam]] = await pool.query('SELECT id, teacher_id FROM exams WHERE id = ?', [id]);
    if (!exam) {
      return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    }
    if (req.user.role !== 'admin' && exam.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'Anda bukan pengampu ujian ini.' });
    }

    if (start_time && end_time && new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({ message: 'Waktu selesai harus setelah waktu mulai.' });
    }

    await pool.query(
      `UPDATE exams SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         duration_minutes = COALESCE(?, duration_minutes),
         start_time = ?,
         end_time = ?,
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        title ?? null,
        description ?? null,
        duration_minutes ?? null,
        start_time || null,
        end_time || null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id
      ]
    );

    res.json({ message: 'Ujian berhasil diperbarui.' });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT exams.id, exams.title, exams.description, exams.duration_minutes, exams.start_time, exams.end_time,
              exams.is_active, subjects.name AS subject_name, users.name AS teacher_name,
              attempts.status AS attempt_status, attempts.score
       FROM exams
       JOIN subjects ON subjects.id = exams.subject_id
       JOIN users ON users.id = exams.teacher_id
       LEFT JOIN exam_attempts attempts
         ON attempts.id = (
           SELECT ea.id FROM exam_attempts ea
           WHERE ea.exam_id = exams.id AND ea.user_id = ?
           ORDER BY ea.id DESC
           LIMIT 1
         )
       WHERE exams.is_active = 1
       ORDER BY exams.id DESC`,
      [req.user.id]
    );

    res.json({ exams: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/:examId/start', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const examId = Number(req.params.examId);

    const [examRows] = await pool.execute(
      'SELECT * FROM exams WHERE id = ? LIMIT 1',
      [examId]
    );

    if (examRows.length === 0) {
      return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    }

    const exam = examRows[0];

    if (!isExamCurrentlyActive(exam)) {
      return res.status(400).json({ message: 'Ujian tidak aktif atau berada di luar jadwal.' });
    }

    const [existingRows] = await pool.execute(
      'SELECT * FROM exam_attempts WHERE exam_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
      [examId, req.user.id]
    );

    if (existingRows.length > 0) {
      const attempt = existingRows[0];
      if (attempt.status !== 'submitted') {
        return res.json({ message: 'Sesi ujian dilanjutkan.', attempt });
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO exam_attempts (exam_id, user_id, started_at, status) VALUES (?, ?, NOW(), ?)',
      [examId, req.user.id, 'in_progress']
    );

    res.status(201).json({
      message: 'Sesi ujian dimulai.',
      attempt: { id: result.insertId, exam_id: examId, user_id: req.user.id, status: 'in_progress' }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:examId/questions', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const examId = Number(req.params.examId);

    const [examRows] = await pool.execute(
      `SELECT exams.id, exams.title, exams.description, exams.duration_minutes, subjects.name AS subject_name
       FROM exams
       JOIN subjects ON subjects.id = exams.subject_id
       WHERE exams.id = ? AND exams.is_active = 1
       LIMIT 1`,
      [examId]
    );

    if (examRows.length === 0) {
      return res.status(404).json({ message: 'Ujian tidak ditemukan atau tidak aktif.' });
    }

    const [attemptRows] = await pool.execute(
      'SELECT * FROM exam_attempts WHERE exam_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
      [examId, req.user.id]
    );

    if (attemptRows.length === 0) {
      return res.status(400).json({ message: 'Mulai ujian terlebih dahulu.' });
    }

    if (attemptRows[0].status === 'submitted') {
      return res.status(400).json({ message: 'Ujian ini sudah selesai dikerjakan.' });
    }

    const [questionRows] = await pool.execute(
      `SELECT id, question_text, media_url, media_type, point, question_order
       FROM questions
       WHERE exam_id = ?
       ORDER BY question_order ASC, id ASC`,
      [examId]
    );

    const [optionRows] = await pool.execute(
      `SELECT options.id, options.question_id, options.option_label, options.option_text
       FROM options
       JOIN questions ON questions.id = options.question_id
       WHERE questions.exam_id = ?
       ORDER BY options.question_id ASC, options.option_label ASC`,
      [examId]
    );

    const optionsByQuestion = optionRows.reduce((acc, option) => {
      acc[option.question_id] = acc[option.question_id] || [];
      acc[option.question_id].push(option);
      return acc;
    }, {});

    const questions = questionRows.map((question) => ({
      ...question,
      options: optionsByQuestion[question.id] || []
    }));

    // Ambil jawaban yang sudah ter-autosave sebelumnya, supaya kalau siswa refresh
    // halaman, pilihan yang sudah dibuat tidak hilang dari tampilan
    const [savedAnswerRows] = await pool.execute(
      'SELECT question_id, option_id FROM student_answers WHERE attempt_id = ?',
      [attemptRows[0].id]
    );

    res.json({
      exam: examRows[0],
      attempt: attemptRows[0],
      questions,
      saved_answers: savedAnswerRows
    });
  } catch (error) {
    next(error);
  }
});

// AUTOSAVE: simpan 1 jawaban begitu siswa memilih opsi (langkah "Simpan Jawaban" di diagram,
// terpisah dari "Selesai/Submit"). Kalau browser/koneksi bermasalah, jawaban yang sudah
// terpilih tidak hilang karena sudah tersimpan di database, bukan cuma di memori browser.
router.post('/:examId/answer', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const examId = Number(req.params.examId);
    const { question_id, option_id } = req.body;

    if (!question_id || !option_id) {
      return res.status(400).json({ message: 'question_id dan option_id wajib diisi.' });
    }

    const [attemptRows] = await pool.execute(
      'SELECT * FROM exam_attempts WHERE exam_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
      [examId, req.user.id]
    );
    if (attemptRows.length === 0) {
      return res.status(400).json({ message: 'Sesi ujian belum dimulai.' });
    }

    const attempt = attemptRows[0];
    if (attempt.status === 'submitted') {
      return res.status(400).json({ message: 'Ujian ini sudah dikirim, tidak bisa mengubah jawaban.' });
    }

    // Validasi soal & opsi memang bagian dari ujian ini (anti manipulasi lewat request manual)
    const [[question]] = await pool.query(
      'SELECT id FROM questions WHERE id = ? AND exam_id = ?',
      [question_id, examId]
    );
    if (!question) {
      return res.status(400).json({ message: 'Soal tidak ditemukan pada ujian ini.' });
    }

    const [[option]] = await pool.query(
      'SELECT id, is_correct FROM options WHERE id = ? AND question_id = ?',
      [option_id, question_id]
    );
    if (!option) {
      return res.status(400).json({ message: 'Opsi jawaban tidak valid untuk soal ini.' });
    }

    await pool.query(
      `INSERT INTO student_answers (attempt_id, question_id, option_id, is_correct)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), is_correct = VALUES(is_correct)`,
      [attempt.id, question_id, option_id, option.is_correct]
    );

    res.json({ message: 'Jawaban tersimpan.' });
  } catch (error) {
    next(error);
  }
});

router.post('/:examId/submit', authenticate, authorize('student'), async (req, res, next) => {
  const connection = await pool.getConnection();

  try {
    const examId = Number(req.params.examId);
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

    if (answers.length === 0) {
      return res.status(400).json({ message: 'Jawaban belum diisi.' });
    }

    await connection.beginTransaction();

    const [attemptRows] = await connection.execute(
      'SELECT * FROM exam_attempts WHERE exam_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
      [examId, req.user.id]
    );

    if (attemptRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Sesi ujian belum dibuat.' });
    }

    const attempt = attemptRows[0];

    if (attempt.status === 'submitted') {
      await connection.rollback();
      return res.status(400).json({ message: 'Ujian ini sudah dikirim sebelumnya.' });
    }

    const [questionRows] = await connection.execute(
      'SELECT id, point FROM questions WHERE exam_id = ?',
      [examId]
    );

    if (questionRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Ujian belum memiliki soal.' });
    }

    const questionIds = questionRows.map((q) => q.id);
    const totalPoint = questionRows.reduce((sum, q) => sum + Number(q.point), 0);

    const [correctRows] = await connection.query(
      `SELECT question_id, id AS correct_option_id
       FROM options
       WHERE is_correct = 1 AND question_id IN (?)`,
      [questionIds]
    );

    const correctMap = new Map(correctRows.map((row) => [Number(row.question_id), Number(row.correct_option_id)]));
    const answerMap = new Map(answers.map((a) => [Number(a.question_id), Number(a.option_id)]));

    let earnedPoint = 0;

    for (const question of questionRows) {
      const questionId = Number(question.id);
      const selectedOptionId = answerMap.get(questionId) || null;
      const correctOptionId = correctMap.get(questionId);
      const isCorrect = selectedOptionId && selectedOptionId === correctOptionId ? 1 : 0;

      if (isCorrect) {
        earnedPoint += Number(question.point);
      }

      await connection.execute(
        `INSERT INTO student_answers (attempt_id, question_id, option_id, is_correct)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), is_correct = VALUES(is_correct)`,
        [attempt.id, questionId, selectedOptionId, isCorrect]
      );
    }

    const score = totalPoint > 0 ? Number(((earnedPoint / totalPoint) * 100).toFixed(2)) : 0;

    await connection.execute(
      `UPDATE exam_attempts
       SET finished_at = NOW(), score = ?, status = 'submitted'
       WHERE id = ?`,
      [score, attempt.id]
    );

    await connection.commit();

    res.json({
      message: 'Jawaban berhasil dikirim.',
      score,
      total_questions: questionRows.length,
      correct_answers: correctRows.filter((row) => answerMap.get(Number(row.question_id)) === Number(row.correct_option_id)).length
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.get('/my-results', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT attempts.id, attempts.score, attempts.status, attempts.started_at, attempts.finished_at,
              exams.title, subjects.name AS subject_name
       FROM exam_attempts attempts
       JOIN exams ON exams.id = attempts.exam_id
       JOIN subjects ON subjects.id = exams.subject_id
       WHERE attempts.user_id = ?
       ORDER BY attempts.id DESC`,
      [req.user.id]
    );

    res.json({ results: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/:examId/results', authenticate, authorize('admin', 'teacher'), async (req, res, next) => {
  try {
    const examId = Number(req.params.examId);

    const [rows] = await pool.execute(
      `SELECT attempts.id, attempts.score, attempts.status, attempts.started_at, attempts.finished_at,
              users.name AS student_name, users.email AS student_email, users.class_name,
              exams.title AS exam_title
       FROM exam_attempts attempts
       JOIN users ON users.id = attempts.user_id
       JOIN exams ON exams.id = attempts.exam_id
       WHERE attempts.exam_id = ?
       ORDER BY attempts.id DESC`,
      [examId]
    );

    res.json({ results: rows, summary: buildResultsSummary(rows) });
  } catch (error) {
    next(error);
  }
});

// ==========================================================
// GURU: CRUD SOAL (BANK SOAL) — Bagian 3 & 6 diagram
// ==========================================================

// READ: daftar soal milik satu ujian, bisa difilter per "kelompok soal"
// lewat query string ?difficulty=Mudah / Sedang / Sulit
router.get('/:examId/manage-questions', authenticate, authorize('teacher', 'admin'), async (req, res, next) => {
  try {
    const examId = Number(req.params.examId);
    const { difficulty } = req.query;

    const [[exam]] = await pool.query('SELECT id, teacher_id FROM exams WHERE id = ?', [examId]);
    if (!exam) return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    if (req.user.role !== 'admin' && exam.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'Anda bukan pengampu ujian ini.' });
    }

    let query = `SELECT id, question_text, difficulty_level, media_url, media_type, point, question_order
                 FROM questions WHERE exam_id = ?`;
    const params = [examId];

    if (difficulty) {
      query += ' AND difficulty_level = ?';
      params.push(difficulty);
    }
    query += ' ORDER BY question_order ASC, id ASC';

    const [questions] = await pool.query(query, params);
    if (questions.length === 0) return res.json({ questions: [] });

    const questionIds = questions.map((q) => q.id);
    const [options] = await pool.query(
      `SELECT id, question_id, option_label, option_text, is_correct
       FROM options WHERE question_id IN (?) ORDER BY option_label ASC`,
      [questionIds]
    );

    const data = questions.map((q) => ({
      ...q,
      options: options.filter((o) => o.question_id === q.id)
    }));

    res.json({ questions: data });
  } catch (error) {
    next(error);
  }
});

// CREATE: tambah soal baru + opsi jawaban A-E + kunci jawaban + media gambar/video (transaction)
router.post('/:examId/manage-questions', authenticate, authorize('teacher', 'admin'), upload.single('media'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const examId = Number(req.params.examId);
    const { question_text, difficulty_level = 'Sedang', point = 1 } = req.body;

    // Karena request ini multipart/form-data (bukan JSON biasa), field "options"
    // datang sebagai STRING JSON, harus di-parse manual dulu
    let options;
    try {
      options = JSON.parse(req.body.options);
    } catch (parseError) {
      if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
      return res.status(400).json({ message: 'Format data opsi jawaban tidak valid.' });
    }

    if (!question_text || !Array.isArray(options) || options.length < 2) {
      if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
      return res.status(400).json({ message: 'Teks soal dan minimal 2 opsi jawaban wajib diisi.' });
    }
    if (!['Mudah', 'Sedang', 'Sulit'].includes(difficulty_level)) {
      if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
      return res.status(400).json({ message: 'Tingkat kesulitan tidak valid.' });
    }
    const correctCount = options.filter((o) => o.is_correct).length;
    if (correctCount !== 1) {
      if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
      return res.status(400).json({ message: 'Harus ada tepat satu opsi jawaban yang benar (kunci jawaban).' });
    }

    await connection.beginTransaction();

    const [[exam]] = await connection.query('SELECT id, teacher_id FROM exams WHERE id = ?', [examId]);
    if (!exam) {
      await connection.rollback();
      if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
      return res.status(404).json({ message: 'Ujian tidak ditemukan.' });
    }
    if (req.user.role !== 'admin' && exam.teacher_id !== req.user.id) {
      await connection.rollback();
      if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
      return res.status(403).json({ message: 'Anda bukan pengampu ujian ini.' });
    }

    const [[{ maxOrder }]] = await connection.query(
      'SELECT COALESCE(MAX(question_order), 0) AS maxOrder FROM questions WHERE exam_id = ?',
      [examId]
    );
    const nextOrder = Number(maxOrder) + 1; // paksa jadi Number, mysql2 kadang balikin string dari MAX()

    // Dengan CloudinaryStorage: req.file.path = URL lengkap Cloudinary (bukan path lokal),
    // req.file.filename = public_id (dibutuhkan nanti kalau mau hapus file dari Cloudinary)
    const mediaUrl = req.file ? req.file.path : null;
    const mediaType = req.file ? getMediaType(req.file.mimetype) : null;
    const mediaPublicId = req.file ? req.file.filename : null;

    const [qResult] = await connection.query(
      `INSERT INTO questions (exam_id, question_text, difficulty_level, media_url, media_type, media_public_id, point, question_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [examId, question_text, difficulty_level, mediaUrl, mediaType, mediaPublicId, point, nextOrder]
    );
    const questionId = qResult.insertId;

    for (const opt of options) {
      await connection.query(
        `INSERT INTO options (question_id, option_label, option_text, is_correct)
         VALUES (?, ?, ?, ?)`,
        [questionId, opt.option_label, opt.option_text, opt.is_correct ? 1 : 0]
      );
    }

    await connection.commit();
    res.status(201).json({ message: 'Soal berhasil ditambahkan ke bank soal.', id: questionId });
  } catch (error) {
    await connection.rollback();
    if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ada label opsi jawaban (A-E) yang duplikat pada satu soal.' });
    }
    next(error);
  } finally {
    connection.release();
  }
});

// UPDATE: edit soal, termasuk ganti opsi jawaban, kunci jawaban, dan media (transaction)
router.put('/manage-questions/:id', authenticate, authorize('teacher', 'admin'), upload.single('media'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { question_text, difficulty_level, point, remove_media } = req.body;

    // multipart/form-data -> "options" datang sebagai string JSON (kalau dikirim)
    let options = null;
    if (req.body.options) {
      try {
        options = JSON.parse(req.body.options);
      } catch (parseError) {
        if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
        return res.status(400).json({ message: 'Format data opsi jawaban tidak valid.' });
      }
    }

    if (options) {
      const correctCount = options.filter((o) => o.is_correct).length;
      if (correctCount !== 1) {
        if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
        return res.status(400).json({ message: 'Harus ada tepat satu opsi jawaban yang benar.' });
      }
    }

    await connection.beginTransaction();

    const [[question]] = await connection.query(
      `SELECT questions.id, questions.media_url, questions.media_type, questions.media_public_id, exams.teacher_id
       FROM questions JOIN exams ON exams.id = questions.exam_id
       WHERE questions.id = ?`,
      [id]
    );
    if (!question) {
      await connection.rollback();
      if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
      return res.status(404).json({ message: 'Soal tidak ditemukan.' });
    }
    if (req.user.role !== 'admin' && question.teacher_id !== req.user.id) {
      await connection.rollback();
      if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
      return res.status(403).json({ message: 'Anda bukan pengampu soal ini.' });
    }

    // Tentukan media baru: file baru diupload > diminta dihapus > tetap yang lama
    let newMediaUrl = question.media_url;
    let newMediaType = question.media_type;
    let newMediaPublicId = question.media_public_id;
    let oldPublicIdToDelete = null;
    let oldMediaTypeToDelete = null;

    if (req.file) {
      newMediaUrl = req.file.path; // URL Cloudinary
      newMediaType = getMediaType(req.file.mimetype);
      newMediaPublicId = req.file.filename; // public_id Cloudinary
      if (question.media_public_id) {
        oldPublicIdToDelete = question.media_public_id;
        oldMediaTypeToDelete = question.media_type;
      }
    } else if (remove_media === 'true') {
      newMediaUrl = null;
      newMediaType = null;
      newMediaPublicId = null;
      if (question.media_public_id) {
        oldPublicIdToDelete = question.media_public_id;
        oldMediaTypeToDelete = question.media_type;
      }
    }

    await connection.query(
      `UPDATE questions SET
         question_text = COALESCE(?, question_text),
         difficulty_level = COALESCE(?, difficulty_level),
         point = COALESCE(?, point),
         media_url = ?,
         media_type = ?,
         media_public_id = ?
       WHERE id = ?`,
      [question_text ?? null, difficulty_level ?? null, point ?? null, newMediaUrl, newMediaType, newMediaPublicId, id]
    );

    if (Array.isArray(options) && options.length > 0) {
      await connection.query('DELETE FROM options WHERE question_id = ?', [id]);
      for (const opt of options) {
        await connection.query(
          `INSERT INTO options (question_id, option_label, option_text, is_correct)
           VALUES (?, ?, ?, ?)`,
          [id, opt.option_label, opt.option_text, opt.is_correct ? 1 : 0]
        );
      }
    }

    await connection.commit();

    // Hapus file lama dari Cloudinary SETELAH transaction sukses, biar tidak kehapus kalau ternyata rollback
    if (oldPublicIdToDelete) {
      await removeCloudinaryFile(oldPublicIdToDelete, oldMediaTypeToDelete);
    }

    res.json({ message: 'Soal berhasil diperbarui.' });
  } catch (error) {
    await connection.rollback();
    if (req.file) await removeCloudinaryFile(req.file.filename, getMediaType(req.file.mimetype));
    next(error);
  } finally {
    connection.release();
  }
});

// DELETE: hapus soal (opsi ikut terhapus otomatis via ON DELETE CASCADE)
router.delete('/manage-questions/:id', authenticate, authorize('teacher', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[question]] = await pool.query(
      `SELECT questions.id, questions.media_public_id, questions.media_type, exams.teacher_id
       FROM questions JOIN exams ON exams.id = questions.exam_id
       WHERE questions.id = ?`,
      [id]
    );
    if (!question) {
      return res.status(404).json({ message: 'Soal tidak ditemukan.' });
    }
    if (req.user.role !== 'admin' && question.teacher_id !== req.user.id) {
      return res.status(403).json({ message: 'Anda bukan pengampu soal ini.' });
    }

    await pool.query('DELETE FROM questions WHERE id = ?', [id]);

    // Bersihkan file di Cloudinary juga, jangan sampai jadi sampah menumpuk & makan kuota gratis
    if (question.media_public_id) {
      await removeCloudinaryFile(question.media_public_id, question.media_type);
    }

    res.json({ message: 'Soal berhasil dihapus.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;