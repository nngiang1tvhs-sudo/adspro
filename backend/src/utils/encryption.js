const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

const getKey = (salt) => {
  const password = process.env.ENCRYPTION_KEY || 'default_dev_key_change_in_prod';
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
};

/**
 * Mã hóa chuỗi text
 */
const encrypt = (text) => {
  if (!text) return null;
  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKey(salt);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
  } catch (err) {
    console.error('Encrypt error:', err.message);
    throw new Error('Lỗi mã hóa dữ liệu');
  }
};

/**
 * Giải mã chuỗi đã mã hóa
 */
const decrypt = (encryptedText) => {
  if (!encryptedText) return null;
  try {
    const data = Buffer.from(encryptedText, 'base64');
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = getKey(salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('Decrypt error:', err.message);
    throw new Error('Lỗi giải mã dữ liệu');
  }
};

/**
 * Mã hóa toàn bộ giá trị trong object credentials
 */
const encryptCredentials = (credentials) => {
  const encrypted = {};
  for (const [key, value] of Object.entries(credentials || {})) {
    if (value !== null && value !== undefined && value !== '') {
      encrypted[key] = encrypt(String(value));
    }
  }
  return encrypted;
};

/**
 * Giải mã toàn bộ giá trị trong object credentials
 */
const decryptCredentials = (encryptedCredentials) => {
  const decrypted = {};
  for (const [key, value] of Object.entries(encryptedCredentials || {})) {
    if (value) {
      try {
        decrypted[key] = decrypt(value);
      } catch (err) {
        console.error(`Failed to decrypt ${key}:`, err.message);
        decrypted[key] = null;
      }
    }
  }
  return decrypted;
};

module.exports = { encrypt, decrypt, encryptCredentials, decryptCredentials };
