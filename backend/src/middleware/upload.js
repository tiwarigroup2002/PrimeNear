const fs = require('fs');
const multer = require('multer');
const multerS3 = require('multer-s3');
const crypto = require('crypto');
const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3');
const config = require('../config');
const ApiError = require('../utils/ApiError');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/x-matroska'];

// ── S3 client ────────────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

/**
 * S3 storage for images under <folder>/.
 * Files are stored as: <folder>/<timestamp>-<randomhex><ext>
 */
function imageUpload(folder, { maxSizeMb = 5 } = {}) {
  return multer({
    storage: multerS3({
      s3,
      bucket: config.s3.bucket,
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        cb(null, `${folder}/${filename}`);
      },
    }),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
      return cb(ApiError.badRequest('Only image files (jpg, png, webp, gif, svg) are allowed'));
    },
  });
}

/**
 * S3 storage for product photos (field "images") and videos (field "videos").
 * Both stored under products/ folder in S3.
 */
function productMediaUpload({ maxImages = 6, maxVideos = 2, imageMb = 10, videoMb = 60 } = {}) {
  const upload = multer({
    storage: multerS3({
      s3,
      bucket: config.s3.bucket,
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (_req, file, cb) => {
        const fallback = file.fieldname === 'videos' ? '.mp4' : '.jpg';
        const ext = path.extname(file.originalname).toLowerCase() || fallback;
        const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        cb(null, `products/${filename}`);
      },
    }),
    limits: { fileSize: videoMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.fieldname === 'images' && IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
      if (file.fieldname === 'videos' && VIDEO_TYPES.includes(file.mimetype)) return cb(null, true);
      return cb(
        ApiError.badRequest(
          file.fieldname === 'videos'
            ? 'Only video files (mp4, webm, mov, 3gp) are allowed'
            : 'Only image files (jpg, png, webp, gif, svg) are allowed',
        ),
      );
    },
  }).fields([
    { name: 'images', maxCount: maxImages },
    { name: 'videos', maxCount: maxVideos },
  ]);

  return (req, res, next) =>
    upload(req, res, (err) => {
      if (err) return next(err);
      // Validate per-image size limit (multer-s3 uses overall limit; check images separately)
      const big = (req.files?.images || []).find((f) => f.size > imageMb * 1024 * 1024);
      if (big) return next(ApiError.badRequest(`Each photo must be under ${imageMb} MB`));
      return next();
    });
}

/** In-memory upload for CSV files (bulk operations). */
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.csv$/i.test(file.originalname) ||
      ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype);
    return ok ? cb(null, true) : cb(ApiError.badRequest('Please upload a .csv file'));
  },
});

/**
 * Returns the full public S3 URL for a stored file.
 * req.file.location (set by multer-s3) already contains this,
 * but this helper is kept for any place that reconstructs URLs manually.
 */
function fileUrl(folder, filename) {
  return `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${folder}/${filename}`;
}

module.exports = { imageUpload, productMediaUpload, csvUpload, fileUrl, s3Client: s3 };
