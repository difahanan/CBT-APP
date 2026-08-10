const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Kredensial Cloudinary diambil dari .env - JANGAN hardcode di sini
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Tipe file yang diizinkan (whitelist, bukan blacklist) - lebih aman
const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video'
};

// CloudinaryStorage otomatis upload file ke Cloudinary begitu multer terima file,
// bukan disimpan ke disk server dulu -> tidak akan hilang saat server redeploy/restart
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'cbt-app/questions',
    resource_type: ALLOWED_MIME_TYPES[file.mimetype] === 'video' ? 'video' : 'image'
    // Nama file acak dari Cloudinary sendiri (public_id auto-generate), tidak perlu diatur manual
  })
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    return cb(new Error('Tipe file tidak didukung. Hanya gambar (JPEG/PNG/GIF/WEBP) atau video (MP4/WEBM).'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024 // maksimal 15MB per file
  }
});

function getMediaType(mimetype) {
  return ALLOWED_MIME_TYPES[mimetype] || null;
}

module.exports = { upload, getMediaType, cloudinary };