const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const config = require('../config');
const ApiError = require('../utils/ApiError');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

/** Disk storage for images under uploads/<folder>. */
function imageUpload(folder, { maxSizeMb = 5 } = {}) {
  const dir = path.join(config.uploadDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
      return cb(ApiError.badRequest('Only image files (jpg, png, webp, gif, svg) are allowed'));
    },
  });
}

/** In-memory upload for CSV files (bulk operations). */
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.csv$/i.test(file.originalname) || ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype);
    return ok ? cb(null, true) : cb(ApiError.badRequest('Please upload a .csv file'));
  },
});

/** Public URL path for a stored file. */
function fileUrl(folder, filename) {
  return `/uploads/${folder}/${filename}`;
}

module.exports = { imageUpload, csvUpload, fileUrl };
