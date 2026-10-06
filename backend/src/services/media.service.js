const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../config/logger');

let sharp = null;
try {
  sharp = require('sharp');
} catch {
  logger.warn('sharp is not installed - uploaded images are stored without compression');
}

let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) ffmpegPath = null;
} catch {
  ffmpegPath = null;
}

const MAX_IMAGE_SIDE = 1600;

/**
 * Shrinks a product photo in place: max 1600px on the long side, quality 80.
 * GIF / SVG are left alone. Keeps the original if compression would make it bigger.
 */
async function compressImage(filePath) {
  if (!sharp) return;
  const ext = path.extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return;
  try {
    const before = fs.statSync(filePath).size;
    let pipeline = sharp(filePath, { failOn: 'none' }).rotate().resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true });
    if (ext === '.png') pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 80 });
    else if (ext === '.webp') pipeline = pipeline.webp({ quality: 80 });
    else pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
    const buf = await pipeline.toBuffer();
    if (buf.length < before) fs.writeFileSync(filePath, buf);
  } catch (err) {
    logger.warn(`Image compression skipped for ${path.basename(filePath)}: ${err.message}`);
  }
}

/**
 * Re-encodes a product video to H.264 / AAC, max 720p, in the background.
 * The file keeps its name (and URL); it is replaced only when the new one is smaller.
 */
function compressVideoInBackground(filePath) {
  if (!ffmpegPath) return;
  const tmp = `${filePath}.tmp.mp4`;
  const args = ['-y', '-i', filePath, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp];
  const proc = spawn(ffmpegPath, args, { stdio: 'ignore', windowsHide: true });
  proc.on('error', (err) => logger.warn(`Video compression failed: ${err.message}`));
  proc.on('close', (code) => {
    try {
      if (code === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size < fs.statSync(filePath).size) fs.renameSync(tmp, filePath);
      else if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (err) {
      logger.warn(`Video compression could not replace the file: ${err.message}`);
    }
  });
}

/** Express middleware: compresses uploaded images (waits) and videos (background). */
async function compressUploads(req, _res, next) {
  const files = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
  if (req.file) files.push(req.file);
  for (const f of files) {
    if (f.mimetype.startsWith('image/')) await compressImage(f.path);
    else if (f.mimetype.startsWith('video/')) compressVideoInBackground(f.path);
  }
  next();
}

module.exports = { compressImage, compressVideoInBackground, compressUploads, videoCompressionAvailable: () => Boolean(ffmpegPath) };
