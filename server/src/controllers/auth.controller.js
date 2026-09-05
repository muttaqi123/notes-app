import * as authService from '../services/auth.service.js';
import * as twoFactor from '../services/twofactor.service.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const REFRESH_COOKIE = 'refresh_token';

/**
 * The refresh token rides in an httpOnly cookie, so no JavaScript on the page
 * can read it — an XSS bug then cannot walk away with a 30-day session. The
 * short-lived access token is held in memory by the client instead of in
 * localStorage, for the same reason.
 *
 * This is the only file in the server that knows cookies exist.
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

const agent = (req) => req.get('user-agent') || '';

export async function register(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.register(req.body, {
      userAgent: agent(req),
    });
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  } catch (err) { next(err); }
}

export async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.login(req.body, {
      userAgent: agent(req),
    });
    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) { next(err); }
}

export async function refresh(req, res, next) {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    const { user, accessToken, refreshToken } = await authService.refresh(presented, {
      userAgent: agent(req),
    });
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

export async function logoutEverywhere(req, res, next) {
  try {
    const result = await authService.logoutEverywhere(req.userId);
    clearRefreshCookie(res);
    res.json(result);
  } catch (err) { next(err); }
}

export async function me(req, res, next) {
  try {
    res.json({ user: await authService.getUser(req.userId) });
  } catch (err) { next(err); }
}

export async function updateSettings(req, res, next) {
  try {
    res.json({ user: await authService.updateSettings(req.userId, req.body) });
  } catch (err) { next(err); }
}

export async function changePassword(req, res, next) {
  try {
    const result = await authService.changePassword(req.userId, req.body);
    // Every session was just revoked, including this one — the client has to
    // sign in again, so the cookie must not linger and look valid.
    clearRefreshCookie(res);
    res.json(result);
  } catch (err) { next(err); }
}

export async function sessions(req, res, next) {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE];
    res.json({ sessions: await authService.listSessions(req.userId, presented) });
  } catch (err) { next(err); }
}

export async function revokeSession(req, res, next) {
  try {
    res.json(await authService.revokeSession(req.userId, req.params.sessionId));
  } catch (err) { next(err); }
}

/* --------------------------------------------------------- password reset */

export async function forgotPassword(req, res, next) {
  try {
    const { token } = await authService.requestPasswordReset(req.body.email);

    if (token) {
      // No mail provider is wired up. In development the token comes back in
      // the response so the flow is usable end to end; in production it is
      // logged and nothing is returned, because returning it would hand an
      // account to anyone who can guess an email address.
      logger.info({ email: req.body.email }, '[auth] password reset requested');
      if (!env.isProd) return res.json({ sent: true, devToken: token });
    }

    // The same answer either way: this endpoint must not reveal who has an
    // account here.
    return res.json({ sent: true });
  } catch (err) { return next(err); }
}

export async function resetPassword(req, res, next) {
  try {
    res.json(await authService.resetPassword(req.body));
  } catch (err) { next(err); }
}

/* ------------------------------------------------------------ two factor */

export async function twoFactorStatus(req, res, next) {
  try {
    res.json(await twoFactor.status(req.userId));
  } catch (err) { next(err); }
}

export async function twoFactorSetup(req, res, next) {
  try {
    res.json(await twoFactor.beginSetup(req.userId));
  } catch (err) { next(err); }
}

export async function twoFactorConfirm(req, res, next) {
  try {
    res.json(await twoFactor.confirmSetup(req.userId, req.body.code));
  } catch (err) { next(err); }
}

export async function twoFactorDisable(req, res, next) {
  try {
    res.json(await twoFactor.disable(req.userId, req.body.password));
  } catch (err) { next(err); }
}
