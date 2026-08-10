// const express = require('express');
// const router = express.Router();
// const db = require('../config/db'); 
// const verifyToken = require('../middleware/auth'); // Pastikan hanya admin/guru yang bisa akses

// // GET: Ambil semua kelompok soal (Mata Pelajaran)
// router.get('/', verifyToken, async (req, res) => {
//     try {
//         const [subjects] = await db.query('SELECT * FROM subjects');
//         res.json(subjects);
//     } catch (error) {
//         res.status(500).json({ message: 'Error mengambil data', error: error.message });
//     }
// });

// // POST: Tambah kelompok soal baru
// router.post('/', verifyToken, async (req, res) => {
//     const { name, description } = req.body;
//     try {
//         const [result] = await db.query(
//             'INSERT INTO subjects (name, description) VALUES (?, ?)', 
//             [name, description]
//         );
//         res.status(201).json({ message: 'Kelompok soal berhasil dibuat', id: result.insertId });
//     } catch (error) {
//         res.status(500).json({ message: 'Error menambah data', error: error.message });
//     }
// });

// module.exports = router;