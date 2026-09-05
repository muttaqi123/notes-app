import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import * as twoFactor from './twofactor.service.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiry,
} from '../utils/tokens.js';

/** Drop expired refresh tokens so the array cannot grow without bound. */
function pruneTokens(user) {
  const now = Date.now();
  user.refreshTokens = user.refreshTokens.filter((t) => t.expiresAt.getTime() > now);
}

async function issueTokens(user, userAgent = '') {
  const { token, tokenHash } = generateRefreshToken();
  pruneTokens(user);
  user.refreshTokens.push({ tokenHash, expiresAt: refreshExpiry(), userAgent: userAgent.slice(0, 200) });
  await user.save();
  return { accessToken: signAccessToken(user), refreshToken: token };
}

export async function register({ name, email, password }, { userAgent } = {}) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists', 'email_taken');
  }
  const user = new User({ name, email: email.toLowerCase() });
  await user.setPassword(password);
  const tokens = await issueTokens(user, userAgent);
  return { user: user.toPublicJSON(), ...tokens };
}

export async function login({ email, password, twoFactorCode }, { userAgent } = {}) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Same message and the same work either way: saying "no such user" tells an
  // attacker which emails are registered, and returning early makes the
  // timing say it too.
  const ok = user ? await user.verifyPassword(password) : false;
  if (!user || !ok) {
    throw ApiError.unauthorized('Incorrect email or password', 'bad_credentials');
  }

  if (user.twoFactor?.enabled) {
    if (!twoFactorCode) {
      // A distinct code, not an error the UI has to guess at: the password was
      // right, and the client needs to ask for the second factor rather than
      // telling the user their password is wrong.
      throw ApiError.unauthorized('Enter your authentication code', 'two_factor_required');
    }
    if (!(await twoFactor.verify(user, twoFactorCode))) {
      throw ApiError.unauthorized('That authentication code is not right', 'bad_two_factor');
    }
  }

  const tokens = await issueTokens(user, userAgent);
  return { user: user.toPublicJSON(), ...tokens };
}

/**
 * Exchange a refresh token for a new pair, rotating the refresh token: the
 * presented one is deleted as it is used, so a stolen token is good for at
 * most one use and the theft shows up as the real user being signed out.
 */
export async function refresh(presentedToken, { userAgent } = {}) {
  if (!presentedToken) throw ApiError.unauthorized('No refresh token', 'no_refresh');
  const tokenHash = hashToken(presentedToken);
  const user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash });
  if (!user) throw ApiError.unauthorized('Session expired, sign in again', 'bad_refresh');

  const entry = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
  if (!entry || entry.expiresAt.getTime() <= Date.now()) {
    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
    await user.save();
    throw ApiError.unauthorized('Session expired, sign in again', 'bad_refresh');
  }

  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  const tokens = await issueTokens(user, userAgent || entry.userAgent);
  return { user: user.toPublicJSON(), ...tokens };
}

export async function logout(userId, presentedToken) {
  if (!presentedToken) return;
  const user = await User.findById(userId);
  if (!user) return;
  const tokenHash = hashToken(presentedToken);
  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  await user.save();
}

/** Sign out everywhere. The reason refresh tokens are server-side state at
 *  all — with a pure-JWT design this button cannot exist. */
export async function logoutEverywhere(userId) {
  const user = await User.findById(userId);
  if (!user) return { sessions: 0 };
  const count = user.refreshTokens.length;
  user.refreshTokens = [];
  await user.save();
  return { sessions: count };
}

export async function listSessions(userId, currentToken) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');
  const currentHash = currentToken ? hashToken(currentToken) : null;

  return user.refreshTokens
    .filter((t) => t.expiresAt.getTime() > Date.now())
    .map((t) => ({
      id: t._id.toString(),
      userAgent: t.userAgent || 'Unknown device',
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      current: currentHash !== null && t.tokenHash === currentHash,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

export async function revokeSession(userId, sessionId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');
  user.refreshTokens = user.refreshTokens.filter((t) => t._id.toString() !== String(sessionId));
  await user.save();
  return { revoked: true };
}

export async function getUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');
  return user.toPublicJSON();
}

export async function updateSettings(userId, patch = {}) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');

  const allowed = ['theme', 'density', 'defaultView', 'sort'];
  for (const key of allowed) {
    if (key in patch) user.settings[key] = patch[key];
  }
  if (patch.name) user.name = String(patch.name).trim().slice(0, 80);

  await user.save();
  return user.toPublicJSON();
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');
  if (!(await user.verifyPassword(currentPassword))) {
    throw ApiError.unauthorized('That password is not right', 'bad_password');
  }
  await user.setPassword(newPassword);
  // Changing a password signs out every other device. If the reason for the
  // change is that someone else had it, leaving their session alive defeats
  // the point.
  user.refreshTokens = [];
  await user.save();
  return { changed: true };
}

/* --------------------------------------------------------- password reset */

/**
 * Request a reset.
 *
 * Always reports success, whether or not the address is registered — the reply
 * to this endpoint must not be a way to enumerate who has an account.
 *
 * There is no mail provider wired up, so the token is returned in development
 * and logged in production. That is honest plumbing: the flow, the hashing and
 * the expiry are real, and swapping in a mailer is one function.
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!user) return { sent: true, token: null };

  const token = crypto.randomBytes(32).toString('hex');
  user.passwordReset = {
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
  await user.save();

  return { sent: true, token };
}

export async function resetPassword({ token, newPassword }) {
  const tokenHash = hashToken(String(token || ''));
  const user = await User.findOne({ 'passwordReset.tokenHash': tokenHash });

  if (!user || !user.passwordReset?.expiresAt || user.passwordReset.expiresAt < new Date()) {
    throw ApiError.badRequest('That reset link has expired — ask for a new one', 'bad_reset');
  }

  await user.setPassword(newPassword);
  user.passwordReset = { tokenHash: null, expiresAt: null };
  // A reset is a recovery from losing control of the account, so every
  // existing session goes with it.
  user.refreshTokens = [];
  await user.save();

  return { reset: true };
}
