import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
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

async function issueTokens(user) {
  const { token, tokenHash } = generateRefreshToken();
  pruneTokens(user);
  user.refreshTokens.push({ tokenHash, expiresAt: refreshExpiry() });
  await user.save();
  return { accessToken: signAccessToken(user), refreshToken: token };
}

export async function register({ name, email, password }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists', 'email_taken');
  }
  const user = new User({ name, email: email.toLowerCase() });
  await user.setPassword(password);
  const tokens = await issueTokens(user);
  return { user: user.toPublicJSON(), ...tokens };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Same message and the same work either way: saying "no such user" tells an
  // attacker which emails are registered, and returning early makes the
  // timing say it too.
  const ok = user ? await user.verifyPassword(password) : false;
  if (!user || !ok) {
    throw ApiError.unauthorized('Incorrect email or password', 'bad_credentials');
  }
  const tokens = await issueTokens(user);
  return { user: user.toPublicJSON(), ...tokens };
}

/**
 * Exchange a refresh token for a new pair, rotating the refresh token: the
 * presented one is deleted as it is used, so a stolen token is good for at
 * most one use and the theft shows up as the real user being signed out.
 */
export async function refresh(presentedToken) {
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
  const tokens = await issueTokens(user);
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

export async function getUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'no_user');
  return user.toPublicJSON();
}
