const crypto = require('crypto');
const config = require('../config');

const ALGO = 'aes-256-gcm';
const key = crypto.createHash('sha256').update(config.encryptionKey).digest();

/** Encrypts a string. Output format: iv:authTag:cipherText (hex). */
function encrypt(plain) {
  if (plain === undefined || plain === null || plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(payload) {
  if (!payload || typeof payload !== 'string' || payload.split(':').length !== 3) return payload;
  try {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function mask(value, visible = 4) {
  if (!value) return value;
  const str = String(value);
  return str.length <= visible ? str : `${'X'.repeat(str.length - visible)}${str.slice(-visible)}`;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { encrypt, decrypt, mask, randomToken, sha256 };
