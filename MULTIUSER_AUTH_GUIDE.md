
# Multiuser Authentication (Edukasi)

Project ini sebenarnya sudah mendukung Multiuser Authentication:

## Role
- Admin
- Teacher/Dosen
- Student/Mahasiswa

## File Penting
- src/routes/auth.js
- src/middleware/auth.js
- database/schema.sql

## Konsep yang Dipelajari
1. JWT Authentication
2. Role Based Access Control (RBAC)
3. Middleware Authenticate
4. Middleware Authorize
5. Login berbasis database MySQL

## Contoh Penggunaan
authorize('admin')
authorize('teacher')
authorize('student')

## Tugas Pengembangan Mahasiswa
- Tambah registrasi user
- Reset password
- Manajemen user
- Audit log login
- Multi-role dashboard
