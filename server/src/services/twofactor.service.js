import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
// otplib is CommonJS, so the named export has to come off the default import
// rather than being destructured in the import statement itself.
import otplib from 'otplib';
import qrcode from 'qrcode';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Time-based one-time passwords (RFC 6238) — the same thing Google
 * Authenticator and 1Password speak.
 *
 * The shape of the flow matters more than the algorithm:
 *
 *   setup    generates a secret and shows a QR code. 2FA is NOT yet on.
 *   confirm  the user types a code from their app. Only now is it on.
 *   disable  requires the password again, because turning off a protection
 *            must be at least as hard as the protection itself.
 *
 * Splitting setup from confirm is the whole point: a user who scans the QR
 * code, then loses their phone before confirming, is not locked out of their
 * own account — the secret was never trusted.
 */

const { authenticator } = otplib;

// One step of drift either side, so a phone clock a few seconds out still works.
authenticator.options = { window: 1 };

const BACKUP_CODE_COUNT = 10;

function generateBackupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    // Grouped for readability when someone writes them on paper, which is
    // exactly what recovery codes are for.
    `${crypto.randomBytes(2).toString('hex')}-${crypto.randomBytes(2).toString('hex')}`
  );
}

export async function beginSetup(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');
  if (user.twoFactor?.enabled) {
    throw ApiError.conflict('Two-factor authentication is already on', 'already_enabled');
  }

  const secret = authenticator.generateSecret();
  user.twoFactor.secret = secret;
  user.twoFactor.enabled = false;
  await user.save();

  const uri = authenticator.keyuri(user.email, 'Keep Notes', secret);
  const qr = await qrcode.toDataURL(uri, { margin: 1, width: 240 });

  // The secret is returned once, for people who type it in by hand rather
  // than scanning. After confirmation it is never sent again.
  return { qr, secret, uri };
}

export async function confirmSetup(userId, code) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');
  if (!user.twoFactor?.secret) {
    throw ApiError.badRequest('Start the setup first', 'no_setup');
  }

  if (!authenticator.check(String(code || '').trim(), user.twoFactor.secret)) {
    throw ApiError.badRequest('That code is not right — check the clock on your phone', 'bad_code');
  }

  const codes = generateBackupCodes();
  user.twoFactor.enabled = true;
  user.twoFactor.backupCodes = await Promise.all(
    codes.map(async (c) => ({ codeHash: await bcrypt.hash(c, 10), usedAt: null }))
  );
  await user.save();

  // Shown exactly once. Storing them in a readable form would defeat the
  // point of hashing them.
  return { backupCodes: codes };
}

export async function disable(userId, password) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');

  if (!(await user.verifyPassword(String(password || '')))) {
    throw ApiError.unauthorized('That password is not right', 'bad_password');
  }

  user.twoFactor.enabled = false;
  user.twoFactor.secret = null;
  user.twoFactor.backupCodes = [];
  await user.save();
  return { enabled: false };
}

/**
 * Verify a code at sign-in. Accepts either a TOTP code or an unused backup
 * code, and burns the backup code as it is used.
 */
export async function verify(user, code) {
  const candidate = String(code || '').trim();
  if (!candidate) return false;

  if (authenticator.check(candidate, user.twoFactor.secret)) return true;

  for (const entry of user.twoFactor.backupCodes || []) {
    if (entry.usedAt) continue;
    if (await bcrypt.compare(candidate, entry.codeHash)) {
      entry.usedAt = new Date();
      await user.save();
      return true;
    }
  }

  return false;
}

export async function status(userId) {
  const user = await User.findById(userId).select('twoFactor');
  const codes = user?.twoFactor?.backupCodes || [];
  return {
    enabled: Boolean(user?.twoFactor?.enabled),
    backupCodesRemaining: codes.filter((c) => !c.usedAt).length,
  };
}
