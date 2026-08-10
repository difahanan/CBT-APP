require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

async function upsertRole(name, description, requiresEmailVerification = true) {
  const [result] = await pool.execute(
    `INSERT INTO roles (name, description, requires_email_verification)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       description = VALUES(description),
       requires_email_verification = VALUES(requires_email_verification)`,
    [name, description, requiresEmailVerification ? 1 : 0]
  );
  return result.insertId;
}

async function upsertUser({ roleId, name, email, password, className = null }) {
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.execute(
    `INSERT INTO users (role_id, name, email, password, class_name, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       role_id = VALUES(role_id),
       name = VALUES(name),
       password = VALUES(password),
       class_name = VALUES(class_name),
       is_active = 1`,
    [roleId, name, email, hash, className]
  );
  return result.insertId;
}

async function insertSubject(name, description, teacherId) {
  const [existing] = await pool.execute('SELECT id FROM subjects WHERE name = ? LIMIT 1', [name]);
  if (existing.length > 0) return existing[0].id;

  const [result] = await pool.execute(
    'INSERT INTO subjects (name, description, teacher_id) VALUES (?, ?, ?)',
    [name, description, teacherId]
  );
  return result.insertId;
}

async function insertExam(subjectId, teacherId) {
  const [existing] = await pool.execute('SELECT id FROM exams WHERE title = ? LIMIT 1', ['Ujian Dasar CBT']);
  if (existing.length > 0) return existing[0].id;

  const [result] = await pool.execute(
    `INSERT INTO exams (subject_id, teacher_id, title, description, duration_minutes, start_time, end_time, is_active)
     VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 1)`,
    [
      subjectId,
      teacherId,
      'Ujian Dasar CBT',
      'Ujian contoh untuk menguji fitur login, daftar ujian, pengerjaan soal, dan penilaian otomatis.',
      20
    ]
  );
  return result.insertId;
}

async function insertQuestionWithOptions(examId, order, questionText, options, correctLabel) {
  const [questionResult] = await pool.execute(
    'INSERT INTO questions (exam_id, question_text, point, question_order) VALUES (?, ?, ?, ?)',
    [examId, questionText, 1, order]
  );

  const questionId = questionResult.insertId;

  for (const item of options) {
    await pool.execute(
      'INSERT INTO options (question_id, option_label, option_text, is_correct) VALUES (?, ?, ?, ?)',
      [questionId, item.label, item.text, item.label === correctLabel ? 1 : 0]
    );
  }
}

async function main() {
  const adminRoleId = await upsertRole('admin', 'Mengelola sistem dan seluruh data CBT.', false);
  const teacherRoleId = await upsertRole('teacher', 'Membuat ujian, soal, dan melihat hasil.', true);
  const studentRoleId = await upsertRole('student', 'Mengerjakan ujian dan melihat nilai.', true);

  await upsertUser({
    roleId: adminRoleId,
    name: 'Admin CBT',
    email: 'admin@cbt.test',
    password: 'password123'
  });

  const teacherId = await upsertUser({
    roleId: teacherRoleId,
    name: 'Guru Demo',
    email: 'guru@cbt.test',
    password: 'password123'
  });

  await upsertUser({
    roleId: studentRoleId,
    name: 'Siswa Demo',
    email: 'siswa@cbt.test',
    password: 'password123',
    className: 'Kelas A'
  });

  const subjectId = await insertSubject(
    'Dasar Pemrograman Web',
    'Mata pelajaran contoh untuk aplikasi CBT.',
    teacherId
  );

  const examId = await insertExam(subjectId, teacherId);

  const [questionCountRows] = await pool.execute('SELECT COUNT(*) AS total FROM questions WHERE exam_id = ?', [examId]);
  if (questionCountRows[0].total > 0) {
    console.log('Data soal contoh sudah ada. Seed dilewati agar tidak duplikat.');
    await pool.end();
    return;
  }

  await insertQuestionWithOptions(
    examId,
    1,
    'Apa kepanjangan dari CBT?',
    [
      { label: 'A', text: 'Computer Based Test' },
      { label: 'B', text: 'Computer Basic Training' },
      { label: 'C', text: 'Central Based Table' },
      { label: 'D', text: 'Control Based Tool' }
    ],
    'A'
  );

  await insertQuestionWithOptions(
    examId,
    2,
    'Apa fungsi utama database dalam aplikasi CBT?',
    [
      { label: 'A', text: 'Mengubah warna tampilan aplikasi' },
      { label: 'B', text: 'Menyimpan data user, soal, ujian, jawaban, dan nilai' },
      { label: 'C', text: 'Menghapus semua data saat aplikasi ditutup' },
      { label: 'D', text: 'Menggantikan browser' }
    ],
    'B'
  );

  await insertQuestionWithOptions(
    examId,
    3,
    'Mengapa file .env tidak disarankan diunggah ke GitHub?',
    [
      { label: 'A', text: 'Karena ukuran file selalu terlalu besar' },
      { label: 'B', text: 'Karena berisi konfigurasi sensitif seperti password dan secret key' },
      { label: 'C', text: 'Karena tidak bisa dibaca oleh Node.js' },
      { label: 'D', text: 'Karena hanya bisa dipakai di Microsoft Word' }
    ],
    'B'
  );

  await insertQuestionWithOptions(
    examId,
    4,
    'Tabel apa yang menyimpan sesi pengerjaan ujian siswa?',
    [
      { label: 'A', text: 'roles' },
      { label: 'B', text: 'subjects' },
      { label: 'C', text: 'exam_attempts' },
      { label: 'D', text: 'options' }
    ],
    'C'
  );

  await insertQuestionWithOptions(
    examId,
    5,
    'Role yang bertugas membuat soal dan ujian adalah ...',
    [
      { label: 'A', text: 'Student/Siswa' },
      { label: 'B', text: 'Teacher/Guru' },
      { label: 'C', text: 'Guest' },
      { label: 'D', text: 'Browser' }
    ],
    'B'
  );

  await pool.end();
  console.log('Seed data berhasil dibuat.');
}

main().catch(async (error) => {
  console.error('Gagal seed database:', error.message);
  await pool.end();
  process.exit(1);
});