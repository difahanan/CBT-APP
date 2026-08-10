// const express = require('express');
// const router = express.Router();
// const db = require('../config/db');
// const verifyToken = require('../middleware/auth');

// // CREATE: Tambah Soal & Pilihan Jawaban A-E (Sesuai ERD)
// router.post('/', verifyToken, async (req, res) => {
//     // options harus berupa array objek: [{label: 'A', text: '...'}, {label: 'B', text: '...'}, ...]
//     const { exam_id, question_text, difficulty_level, answer_key, options } = req.body;
    
//     try {
//         await db.query('BEGIN'); // Mulai transaksi

//         // Insert Soal
//         const [questionResult] = await db.query(
//             'INSERT INTO questions (exam_id, question_text, difficulty_level, answer_key) VALUES (?, ?, ?, ?)', 
//             [exam_id, question_text, difficulty_level, answer_key]
//         );
//         const question_id = questionResult.insertId;

//         // Insert Pilihan A-E
//         if (options && options.length > 0) {
//             const optionValues = options.map(opt => [question_id, opt.label, opt.text]);
//             await db.query('INSERT INTO options (question_id, option_label, option_text) VALUES ?', [optionValues]);
//         }

//         await db.query('COMMIT'); // Simpan permanen
//         res.status(201).json({ message: 'Soal berhasil disimpan ke Bank Soal!' });

//     } catch (error) {
//         await db.query('ROLLBACK'); // Batalkan jika error
//         res.status(500).json({ message: 'Gagal menyimpan soal', error: error.message });
//     }
// });

// // READ: Ambil semua soal beserta pilihan jawabannya untuk satu Ujian
// router.get('/exam/:exam_id', verifyToken, async (req, res) => {
//     try {
//         const [rows] = await db.query(`
//             SELECT q.id, q.question_text, q.difficulty_level, q.answer_key, 
//                    o.id as option_id, o.option_label, o.option_text
//             FROM questions q
//             LEFT JOIN options o ON q.id = o.question_id
//             WHERE q.exam_id = ?
//         `, [req.params.exam_id]);
        
//         // Menggabungkan baris database menjadi format JSON yang rapi
//         const questions = [];
//         rows.forEach(row => {
//             let q = questions.find(q => q.id === row.id);
//             if (!q) {
//                 q = { id: row.id, question_text: row.question_text, answer_key: row.answer_key, options: [] };
//                 questions.push(q);
//             }
//             if (row.option_id) {
//                 q.options.push({ id: row.option_id, label: row.option_label, text: row.option_text });
//             }
//         });

//         res.json(questions);
//     } catch (error) {
//         res.status(500).json({ message: 'Gagal mengambil soal', error: error.message });
//     }
// });

// // UPDATE: Edit teks soal atau kunci jawaban
// router.put('/:id', verifyToken, async (req, res) => {
//     const { question_text, answer_key } = req.body;
//     try {
//         await db.query(
//             'UPDATE questions SET question_text = ?, answer_key = ? WHERE id = ?',
//             [question_text, answer_key, req.params.id]
//         );
//         res.json({ message: 'Soal berhasil diperbarui' });
//     } catch (error) {
//         res.status(500).json({ message: 'Gagal update soal', error: error.message });
//     }
// });

// // DELETE: Hapus soal
// router.delete('/:id', verifyToken, async (req, res) => {
//     try {
//         // Hapus options dulu (karena berelasi), baru hapus questions
//         await db.query('DELETE FROM options WHERE question_id = ?', [req.params.id]);
//         await db.query('DELETE FROM questions WHERE id = ?', [req.params.id]);
//         res.json({ message: 'Soal berhasil dihapus' });
//     } catch (error) {
//         res.status(200).json{message : ' Gagal menghapus'}
//         res.status(500).json({ message: 'Gagal menghapus soal', error: error.message });
//     }
// });

// module.exports = router;