import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    env.accessSecret,
    { expiresIn: env.accessTtl }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.accessSecret);
}

/**
 * The refresh token is a random string, not a JWT — nothing in it needs to be
 * read without a database round trip, and a random opaque string cannot be
 * forged by anyone who learns a signing secret. Only its SHA-256 hash is
 * stored, so the database never holds a usable token.
 */
export function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry() {
  return new Date(Date.now() + env.refreshTtlDays * 24 * 60 * 60 * 1000);
}
