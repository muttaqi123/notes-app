import * as authService from '../services/auth.service.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE = 'refresh_token';

/**
 * The refresh token rides in an httpOnly cookie, so no JavaScript on the page
 * can read it — an XSS bug then cannot walk away with a 30-day session. The
 * short-lived access token is held in memory by the client instead of in
 * localStorage, for the same reason.
 */
function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    maxAge: env.refreshTtlDays * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export async function register(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.register(req.body);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  } catch (err) { next(err); }
}

export async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.login(req.body);
    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) { next(err); }
}

export async function refresh(req, res, next) {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    const { user, accessToken, refreshToken } = await authService.refresh(presented);
    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    await authService.logout(req.userId, presented);
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (err) { next(err); }
}

export async function me(req, res, next) {
  try {
    res.json({ user: await authService.getUser(req.userId) });
  } catch (err) { next(err); }
}
