import crypto from 'crypto';

/**
 * Securely hashes a plaintext password using Node.js scrypt.
 * Format: <salt_hex>:<hash_hex>
 */
export function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a stored hash.
 * Supports transparent fallback and migration for legacy plaintext passwords.
 */
export function verifyPassword(password, storedPassword) {
  if (!password || !storedPassword) return false;

  // Legacy plaintext fallback check
  if (!storedPassword.includes(':')) {
    return password === storedPassword;
  }

  try {
    const [salt, originalHash] = storedPassword.split(':');
    if (!salt || !originalHash) return false;

    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const origBuf = Buffer.from(originalHash, 'hex');

    if (hashBuf.length !== origBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, origBuf);
  } catch (err) {
    console.error('Password verification error:', err);
    return false;
  }
}
